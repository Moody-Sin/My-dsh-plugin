import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

import { handleApiRequest, handleFetchRequest, SECRET_MASK } from '../src/api.ts';

/**
 * 端到端集成测试：用真实的 node:http 服务器 + 真实临时配置目录，
 * 验证「设置 UI ↔ REST API ↔ 磁盘文件」这条完整链路。
 *
 * 这里刻意**不再**只断言构建产物存在 —— 那种「文件在不在」的检查锁不住任何行为，
 * 而这套 API 的鉴权与分层写入恰恰是最需要回归防线的地方：
 *  - 曾经的 `webServer` 前缀路由让接口完全绕过 DSH 鉴权；
 *  - 曾经的表单把 local 密钥整体回写进随 Git 提交的 base 文件。
 * 两者都不是纯函数层能测出来的。
 */
describe('设置 API 端到端集成', () => {
  let projectRoot: string;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-e2e-api-'));
    fs.writeFileSync(
      path.join(projectRoot, 'plugins.config.json'),
      JSON.stringify({ plugins: { notifier: { enabled: true, sound: { enabled: true } } } }, null, 2),
    );
    // local 层刻意放一个密钥，用于验证它不会被带进 base
    fs.writeFileSync(
      path.join(projectRoot, 'plugins.config.local.json'),
      JSON.stringify(
        { plugins: { notifier: { webhook: { enabled: true, secret: 'super-secret-value' } } } },
        null,
        2,
      ),
    );

    const ctx = { projectRoot, logger: console };

    server = http.createServer((req, res) => {
      void handleApiRequest(req, res, ctx).then((handled) => {
        if (!handled && !res.writableEnded) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as any;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  const readBase = () =>
    JSON.parse(fs.readFileSync(path.join(projectRoot, 'plugins.config.json'), 'utf8'));
  const readLocal = () =>
    JSON.parse(fs.readFileSync(path.join(projectRoot, 'plugins.config.local.json'), 'utf8'));

  it('GET /api/local-plugins/config 返回分层配置，且密钥已被脱敏', async () => {
    const res = await fetch(`${baseUrl}/api/local-plugins/config`);
    assert.equal(res.status, 200);

    const data: any = await res.json();
    assert.ok(data.base, '必须返回 base 层');
    assert.ok(data.local, '必须返回 local 层');
    assert.ok(data.merged, '必须返回 merged 合并层');

    // 密钥绝不可以明文出现在任何一层
    const raw = JSON.stringify(data);
    assert.ok(
      !raw.includes('super-secret-value'),
      '响应中不得出现明文密钥，官方表单有 redactSecrets，自研 UI 必须自行脱敏',
    );
    assert.equal(data.local.plugins.notifier.webhook.secret, SECRET_MASK);
    assert.equal(data.merged.plugins.notifier.webhook.secret, SECRET_MASK);

    // 非敏感字段照常返回
    assert.equal(data.merged.plugins.notifier.sound.enabled, true, 'local 未覆盖的字段应继承 base');
  });

  it('POST 掩码密钥时不覆盖磁盘上的真实值（避免把密钥写成一串圆点）', async () => {
    const getRes = await fetch(`${baseUrl}/api/local-plugins/config`);
    const data: any = await getRes.json();

    const postRes = await fetch(`${baseUrl}/api/local-plugins/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'local', config: data.local }),
    });
    assert.equal(postRes.status, 200);

    assert.equal(
      readLocal().plugins.notifier.webhook.secret,
      'super-secret-value',
      '前端回传掩码表示「未修改」，服务端必须沿用磁盘上的真实密钥',
    );
  });

  it('保存 base 层时绝不把 local 的密钥带进随 Git 提交的文件', async () => {
    // 这正是修复前的真实缺陷：表单状态是 merged，选中 base 后整体写回，
    // 于是 local 里的 secret 明文出现在 plugins.config.json 中。
    const postRes = await fetch(`${baseUrl}/api/local-plugins/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: 'base',
        config: { plugins: { notifier: { sound: { enabled: false } } } },
      }),
    });
    assert.equal(postRes.status, 200);

    const base = readBase();
    assert.equal(base.plugins.notifier.sound.enabled, false, 'base 层应被更新');
    assert.equal(
      base.plugins.notifier.webhook?.secret,
      undefined,
      'base 文件中严禁出现 local 层的密钥',
    );
    assert.ok(
      !JSON.stringify(base).includes('super-secret-value'),
      'base 文件整体不得含明文密钥',
    );

    // local 层不受影响
    assert.equal(readLocal().plugins.notifier.webhook.secret, 'super-secret-value');
  });

  it('POST 非 JSON 请求体时返回 500 而不是让进程崩溃', async () => {
    const res = await fetch(`${baseUrl}/api/local-plugins/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json-at-all',
    });
    assert.equal(res.status, 500);
    const data: any = await res.json();
    assert.equal(data.ok, false);
    assert.ok(data.error, '必须回传可诊断的错误信息');
  });

  it('未匹配的路由返回 404（保证 API 不会吞掉其它请求）', async () => {
    const res = await fetch(`${baseUrl}/api/unknown-route`);
    assert.equal(res.status, 404);
  });

  it('handleFetchRequest 与 node:http 路径行为一致（鉴权通道走的就是它）', async () => {
    // DSH 浏览器端经 connection.fetch 分发，适配层必须与直连行为等价
    const request = new Request('http://127.0.0.1/api/local-plugins/config', { method: 'GET' });
    const response = await handleFetchRequest(request, { projectRoot, logger: console });

    assert.equal(response.status, 200);
    const data: any = await response.json();
    assert.ok(!JSON.stringify(data).includes('super-secret-value'));
    assert.equal(data.local.plugins.notifier.webhook.secret, SECRET_MASK);
  });
});
