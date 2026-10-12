import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_PORT,
  PLUGIN_CONFIG_KEY,
  getSettingsServerUrl,
  loadMergedSlice,
  normalizePort,
  renderSettingsPage,
  savePluginConfig,
  startSettingsServer,
  stopSettingsServer,
} from '../src/server.ts';
import { resolveConfig, DEFAULT_CONFIG } from '../src/config.ts';

/** 创建一次性的临时项目根目录，避免测试污染真实仓库配置。 */
function createTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-notifier-test-'));
}

/** 写入基础配置文件的辅助函数。 */
function writeBaseConfig(rootDir: string, slice: Record<string, any>): void {
  fs.writeFileSync(
    path.join(rootDir, 'plugins.config.json'),
    JSON.stringify({ plugins: { [PLUGIN_CONFIG_KEY]: slice } }, null, 2),
    'utf8'
  );
}

/** 读取基础配置中本插件的切片；文件不存在时返回 undefined。 */
function readBaseSlice(rootDir: string): any {
  const file = path.join(rootDir, 'plugins.config.json');
  if (!fs.existsSync(file)) return undefined;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  return doc.plugins?.[PLUGIN_CONFIG_KEY];
}

/** 读取本地覆盖中本插件的切片；文件不存在时返回 undefined。 */
function readLocalSlice(rootDir: string): any {
  const file = path.join(rootDir, 'plugins.config.local.json');
  if (!fs.existsSync(file)) return undefined;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  return doc.plugins?.[PLUGIN_CONFIG_KEY];
}

/** 发起一次请求并解析 JSON 响应。 */
async function requestJson(
  url: string,
  init?: RequestInit
): Promise<{ status: number; body: any }> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

test('server: normalizePort 规整非法端口并保留 0（系统分配）', () => {
  assert.equal(normalizePort(3088), 3088);
  assert.equal(normalizePort(0), 0, '0 必须保留，表示交由系统分配空闲端口');
  assert.equal(normalizePort(3.9), 3);
  assert.equal(normalizePort(-1), DEFAULT_PORT);
  assert.equal(normalizePort(70000), DEFAULT_PORT);
  assert.equal(normalizePort('abc'), DEFAULT_PORT);
  assert.equal(normalizePort(NaN), DEFAULT_PORT);
  assert.equal(normalizePort(undefined), DEFAULT_PORT);
});

test('server: GET / 返回内联样式的单页应用且不引用任何外部资源', async () => {
  const handle = await startSettingsServer({ port: 0, rootDir: createTempRoot() });
  try {
    const response = await fetch(`${handle.url}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /DSH/);

    // 零依赖的硬约束：页面不得引用任何外部样式表、脚本或图片。
    assert.ok(!/<link[^>]+stylesheet/i.test(html), '不得引用外部样式表');
    assert.ok(!/<script[^>]+src=/i.test(html), '不得引用外部脚本');
    assert.ok(!/<img[^>]+src=["']https?:/i.test(html), '不得引用外部图片');

    // 五大卡片与一键测试区必须都在。
    for (const marker of ['/api/config', '/api/test', 'prefers-color-scheme']) {
      assert.ok(html.includes(marker), `页面必须包含 ${marker}`);
    }
    assert.ok(/data-test="desktop"/.test(html), '必须存在测试弹窗按钮');
    assert.ok(/data-test="sound"/.test(html), '必须存在测试提示音按钮');
    assert.ok(/data-test="webhook"/.test(html), '必须存在测试 Webhook 按钮');
    assert.ok(/data-action="save"/.test(html), '必须存在保存配置按钮');
    assert.ok(/saveSecretsLocally/.test(html), '必须存在机密凭据本地隔离复选框');
  } finally {
    await handle.close();
  }
});

test('server: 渲染的 HTML 与初始配置严格对应且正确转义', () => {
  const config = resolveConfig({
    locale: 'en',
    webhook: { enabled: true, provider: 'telegram', url: 'https://example.com/hook?a=1&b=2', secret: 's3cr3t' },
    events: { minDurationSeconds: 42 },
  });

  const html = renderSettingsPage(config, 'zh');

  assert.match(html, /value="https:\/\/example\.com\/hook\?a=1&amp;b=2"/, 'URL 必须转义 & 后写入 value');
  assert.match(html, /value="42"/, '耗时阈值必须回填');
  assert.ok(html.includes('<option value="telegram" selected>'), 'telegram 必须处于选中态');
  // 初始配置以 JSON 注入脚本，必须转义 `<` 防止提前闭合 script 块。
  assert.ok(!/<\/script>/i.test(html.split('<script>')[1].split('</script>')[0]), '注入的配置不得包含未转义的 script 闭合标签');
});

test('server: GET /api/config 返回归一化配置与原始切片', async () => {
  const rootDir = createTempRoot();
  writeBaseConfig(rootDir, { webhook: { enabled: true, provider: 'feishu', url: 'https://example.com/x' } });

  const handle = await startSettingsServer({ port: 0, rootDir });
  try {
    const { status, body } = await requestJson(`${handle.url}/api/config`);

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.config.webhook.provider, 'feishu');
    assert.equal(body.config.webhook.enabled, true);
    // 未显式配置的字段必须被补齐为默认值，前端才有一份完整表单。
    assert.equal(body.config.sound.enabled, DEFAULT_CONFIG.sound.enabled);
    assert.equal(body.config.events.minDurationSeconds, DEFAULT_CONFIG.events.minDurationSeconds);
    assert.equal(body.raw.webhook.url, 'https://example.com/x');
    assert.ok(body.files.base.endsWith('plugins.config.json'));
  } finally {
    await handle.close();
  }
});

test('server: POST /api/test 分派 desktop 与 sound 渠道', async () => {
  const rootDir = createTempRoot();
  const calls: string[] = [];

  const handle = await startSettingsServer({
    port: 0,
    rootDir,
    desktopFn: async (title, message) => {
      calls.push(`desktop:${title}:${message}`);
      return true;
    },
    soundFn: async (kind) => {
      calls.push(`sound:${kind}`);
      return true;
    },
  });

  try {
    const desktop = await requestJson(`${handle.url}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'desktop' }),
    });
    assert.equal(desktop.status, 200);
    assert.equal(desktop.body.success, true);
    assert.ok(typeof desktop.body.latencyMs === 'number', '必须回报发送耗时');
    assert.match(calls[0], /^desktop:DeepSeek Harness - 测试通知:/);

    const sound = await requestJson(`${handle.url}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'sound' }),
    });
    assert.equal(sound.body.success, true);
    assert.equal(calls[1], 'sound:default');
  } finally {
    await handle.close();
  }
});

test('server: POST /api/test 渠道失败时返回 success=false 而非抛错', async () => {
  const handle = await startSettingsServer({
    port: 0,
    rootDir: createTempRoot(),
    desktopFn: async () => false,
    soundFn: async () => false,
  });

  try {
    const desktop = await requestJson(`${handle.url}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'desktop' }),
    });
    // 渠道本身失败属于业务结果而非服务端异常：HTTP 仍为 502，body 明确 success=false。
    assert.equal(desktop.body.success, false);
    assert.match(desktop.body.message, /失败/);

    const unknown = await requestJson(`${handle.url}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'nope' }),
    });
    assert.equal(unknown.body.success, false);
    assert.match(unknown.body.message, /未知的测试类型/);
  } finally {
    await handle.close();
  }
});

test('server: POST /api/test 的 webhook 使用前端临时配置，无需先保存', async () => {
  const rootDir = createTempRoot();
  let received: any;

  const handle = await startSettingsServer({
    port: 0,
    rootDir,
    webhookFn: async (config, payload) => {
      received = { config, payload };
      return true;
    },
  });

  try {
    const { body } = await requestJson(`${handle.url}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'webhook',
        webhook: { enabled: false, provider: 'discord', url: 'https://discord.com/api/webhooks/1/token', secret: '' },
      }),
    });

    assert.equal(body.success, true);
    assert.equal(received.config.provider, 'discord');
    assert.equal(received.config.url, 'https://discord.com/api/webhooks/1/token');
    // 前端把渠道开关关掉时点「测试」也必须真的发出去，否则用户无从判断配置对错。
    assert.equal(received.config.enabled, true, '测试请求必须强制启用目标渠道');
    assert.equal(received.payload.event, 'settings/test');
    // 全程不落盘：临时配置不得写进任何配置文件。
    assert.equal(readBaseSlice(rootDir), undefined);
  } finally {
    await handle.close();
  }
});

test('server: POST /api/test 的 webhook 缺少 URL 时明确报错', async () => {
  const handle = await startSettingsServer({
    port: 0,
    rootDir: createTempRoot(),
    webhookFn: async () => {
      throw new Error('不应被调用');
    },
  });

  try {
    const { body } = await requestJson(`${handle.url}/api/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'webhook', webhook: { provider: 'generic', url: '   ' } }),
    });

    assert.equal(body.success, false);
    assert.match(body.message, /Webhook 地址为空/);
  } finally {
    await handle.close();
  }
});

test('server: POST /api/config 保存配置并在勾选时隔离机密字段', async () => {
  const rootDir = createTempRoot();
  writeBaseConfig(rootDir, { locale: 'auto' });

  const handle = await startSettingsServer({ port: 0, rootDir });
  try {
    const payload = {
      saveSecretsLocally: true,
      config: {
        locale: 'en',
        desktop: { enabled: false },
        sound: { enabled: true },
        events: { onTurnEnd: false, onQuestion: true, onApproval: true, onError: true, minDurationSeconds: 12 },
        webhook: { enabled: true, provider: 'feishu', url: 'https://open.feishu.cn/hook/abc', secret: 'TOP-SECRET' },
      },
    };

    const { status, body } = await requestJson(`${handle.url}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.secretsIsolated, true);

    const base = readBaseSlice(rootDir);
    assert.equal(base.locale, 'en');
    assert.equal(base.events.minDurationSeconds, 12);
    assert.equal(base.webhook.url, 'https://open.feishu.cn/hook/abc');
    assert.ok(!('secret' in base.webhook), '勾选隔离后基础配置不得残留任何凭据');

    const local = readLocalSlice(rootDir);
    assert.equal(local.webhook.secret, 'TOP-SECRET', '凭据必须写入本地私有覆盖');
    // 非机密字段不得被复制进本地覆盖，否则它会以最高权威盖住后续的基础配置改动。
    assert.ok(!('url' in local.webhook), '非机密字段不得写入本地覆盖');
    assert.equal(local.locale, undefined);
  } finally {
    await handle.close();
  }
});

test('server: POST /api/config 未勾选隔离时凭据落基础配置且清除本地残留', async () => {
  const rootDir = createTempRoot();
  writeBaseConfig(rootDir, { locale: 'auto' });
  // 预置一份本地覆盖：保存后它不得再盖住新写入的值。
  fs.writeFileSync(
    path.join(rootDir, 'plugins.config.local.json'),
    JSON.stringify({ plugins: { [PLUGIN_CONFIG_KEY]: { locale: 'zh', webhook: { secret: 'OLD' } } } }, null, 2),
    'utf8'
  );

  const handle = await startSettingsServer({ port: 0, rootDir });
  try {
    const { body } = await requestJson(`${handle.url}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saveSecretsLocally: false,
        config: {
          locale: 'en',
          desktop: { enabled: true },
          sound: { enabled: true },
          events: { onTurnEnd: true, onQuestion: true, onApproval: true, onError: true, minDurationSeconds: 5 },
          webhook: { enabled: true, provider: 'generic', url: 'https://example.com/h', secret: 'NEW-SECRET' },
        },
      }),
    });

    assert.equal(body.success, true);
    assert.equal(body.secretsIsolated, false);

    const base = readBaseSlice(rootDir);
    assert.equal(base.locale, 'en');
    assert.equal(base.webhook.secret, 'NEW-SECRET', '未勾选隔离时凭据应正常落基础配置，而不是被静默丢弃');

    const local = readLocalSlice(rootDir);
    assert.equal(local, undefined, '本地覆盖中的受管字段必须被清除，否则会盖住刚保存的新值');

    // 关键回归：合并结果必须真的是刚保存的值，而不是被旧本地覆盖压掉。
    const merged = loadMergedSlice(rootDir);
    assert.equal(merged.locale, 'en');
    assert.equal(merged.webhook.secret, 'NEW-SECRET');
  } finally {
    await handle.close();
  }
});

test('server: 保存配置不会抹掉表单未暴露的字段（如 server.port）', async () => {
  const rootDir = createTempRoot();
  writeBaseConfig(rootDir, { locale: 'auto', server: { enabled: true, port: 3099 } });

  const handle = await startSettingsServer({ port: 0, rootDir });
  try {
    await requestJson(`${handle.url}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          locale: 'zh',
          desktop: { enabled: true },
          sound: { enabled: true },
          events: { onTurnEnd: true, onQuestion: true, onApproval: true, onError: true, minDurationSeconds: 5 },
          webhook: { enabled: false, provider: 'generic', url: '' },
        },
      }),
    });

    const base = readBaseSlice(rootDir);
    assert.equal(base.locale, 'zh');
    assert.deepEqual(base.server, { enabled: true, port: 3099 }, '表单未暴露的 server 字段必须在保存后原样保留');
  } finally {
    await handle.close();
  }
});

test('server: 非法配置值经 resolveConfig 归一化后才落盘', async () => {
  const rootDir = createTempRoot();
  writeBaseConfig(rootDir, {});

  const handle = await startSettingsServer({ port: 0, rootDir });
  try {
    await requestJson(`${handle.url}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          locale: 'fr',
          events: { minDurationSeconds: -9 },
          webhook: { provider: 'not-a-provider', url: 123 },
        },
      }),
    });

    const base = readBaseSlice(rootDir);
    assert.equal(base.locale, 'auto', '非法语言必须回落 auto');
    assert.equal(base.events.minDurationSeconds, 0, '负数阈值必须规整为 0');
    assert.equal(base.webhook.provider, 'generic', '非法提供商必须回落 generic');
    assert.equal(base.webhook.url, '', '非字符串 URL 必须回落空串');
  } finally {
    await handle.close();
  }
});

test('server: savePluginConfig 只改动本插件切片，不覆盖兄弟插件', () => {
  const rootDir = createTempRoot();
  fs.writeFileSync(
    path.join(rootDir, 'plugins.config.json'),
    JSON.stringify({ plugins: { notifier: { locale: 'auto' }, other: { keep: 'me' } } }, null, 2),
    'utf8'
  );

  savePluginConfig(rootDir, { locale: 'en' }, false);

  const doc = JSON.parse(fs.readFileSync(path.join(rootDir, 'plugins.config.json'), 'utf8'));
  assert.deepEqual(doc.plugins.other, { keep: 'me' }, '兄弟插件配置必须原样保留');
  assert.equal(doc.plugins[PLUGIN_CONFIG_KEY].locale, 'en');
});

test('server: 端口被占用时自动向后探测可用端口', async () => {
  const blocker = http.createServer(() => undefined);
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
  const occupied = (blocker.address() as any).port;

  let handle: Awaited<ReturnType<typeof startSettingsServer>> | undefined;
  try {
    handle = await startSettingsServer({ port: occupied, rootDir: createTempRoot() });

    assert.notEqual(handle.port, occupied, '必须避开被占用的端口');
    assert.ok(handle.port > occupied, '应向后探测而非随机选取');

    // 探测出的端口必须真的可访问。
    const response = await fetch(`${handle.url}/api/config`);
    assert.equal(response.status, 200);
  } finally {
    await handle?.close();
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});

test('server: strictPort 下端口被占用必须直接失败', async () => {
  const blocker = http.createServer(() => undefined);
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', () => resolve()));
  const occupied = (blocker.address() as any).port;

  try {
    await assert.rejects(
      () => startSettingsServer({ port: occupied, strictPort: true, rootDir: createTempRoot() }),
      (error: any) => error?.code === 'EADDRINUSE'
    );
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});

test('server: stopSettingsServer 释放端口且可重复调用', async () => {
  const handle = await startSettingsServer({ port: 0, rootDir: createTempRoot() });
  const { port } = handle;

  assert.equal(getSettingsServerUrl(), handle.url, '活跃实例必须可被查询到');

  await stopSettingsServer();
  assert.equal(getSettingsServerUrl(), undefined, '停止后不得再暴露 URL');

  // 端口真正释放的判据：能立刻在同端口重新绑定。
  const reclaimer = http.createServer(() => undefined);
  await new Promise<void>((resolve, reject) => {
    reclaimer.once('error', reject);
    reclaimer.listen(port, '127.0.0.1', () => resolve());
  });
  await new Promise<void>((resolve) => reclaimer.close(() => resolve()));

  // 重复调用必须平稳返回，不得抛错。
  await stopSettingsServer();
  await stopSettingsServer();
});

test('server: 重复启动会自动关停上一个实例，不泄漏端口', async () => {
  const first = await startSettingsServer({ port: 0, rootDir: createTempRoot() });
  const second = await startSettingsServer({ port: 0, rootDir: createTempRoot() });

  try {
    assert.equal(getSettingsServerUrl(), second.url);
    // 首个实例必须已被关停：其端口应可被重新绑定。
    const reclaimer = http.createServer(() => undefined);
    await new Promise<void>((resolve, reject) => {
      reclaimer.once('error', reject);
      reclaimer.listen(first.port, '127.0.0.1', () => resolve());
    });
    await new Promise<void>((resolve) => reclaimer.close(() => resolve()));
  } finally {
    await second.close();
  }
});

test('server: 未知路由返回 404，非法 JSON 返回 400 且不崩溃', async () => {
  const handle = await startSettingsServer({ port: 0, rootDir: createTempRoot() });
  try {
    const missing = await requestJson(`${handle.url}/api/nope`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.success, false);

    const badJson = await fetch(`${handle.url}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    assert.equal(badJson.status, 400, '非法 JSON 属客户端错误，必须回 400 而非 500');

    // 服务必须在上述异常后继续正常服务。
    const alive = await requestJson(`${handle.url}/api/config`);
    assert.equal(alive.status, 200);
  } finally {
    await handle.close();
  }
});

test('server: 超大请求体被拒绝，避免内存被打爆', async () => {
  const handle = await startSettingsServer({ port: 0, rootDir: createTempRoot() });
  try {
    const response = await fetch(`${handle.url}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { pad: 'x'.repeat(70 * 1024) } }),
    });
    assert.equal(response.status, 413);
  } finally {
    await handle.close();
  }
});
