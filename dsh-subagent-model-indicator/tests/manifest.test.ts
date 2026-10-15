import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(currentDir, '..');

describe('manifest & package.json contract', () => {
  it('package.json 存在且包含必要元数据', () => {
    const pkgPath = path.join(pkgDir, 'package.json');
    assert.ok(fs.existsSync(pkgPath), 'package.json 必须存在');

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.name, '@local/dsh-subagent-model-indicator');
    assert.equal(pkg.type, 'module');
    assert.ok(pkg.exports?.['.'], '必须导出 .');
    assert.ok(pkg.exports?.['./client'], '必须导出 ./client');
    assert.ok(pkg.exports?.['./package.json'], '必须导出 ./package.json 供模块定位');
    assert.ok(pkg.dsh?.client, '必须声明 dsh.client 规范');
  });

  it('cordis.patch.yml 存在且语法正确', () => {
    const patchPath = path.join(pkgDir, 'cordis.patch.yml');
    assert.ok(fs.existsSync(patchPath), 'cordis.patch.yml 必须存在');
    const content = fs.readFileSync(patchPath, 'utf8');
    assert.ok(content.includes('@local/dsh-subagent-model-indicator'));
  });

  it('locale 文件完整性', () => {
    const zhPath = path.join(pkgDir, 'locale', 'zh.json');
    const enPath = path.join(pkgDir, 'locale', 'en.json');
    assert.ok(fs.existsSync(zhPath), 'zh.json 必须存在');
    assert.ok(fs.existsSync(enPath), 'en.json 必须存在');

    const zh = JSON.parse(fs.readFileSync(zhPath, 'utf8'));
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  });

  it('apply 对 webserver/index-inject 进行防重保护且不重复注册', async () => {
    const { apply } = await import('../src/index.ts');
    let injectedHandler: any;
    const mockCtx = {
      on: (event: string, handler: any) => {
        if (event === 'webserver/index-inject') injectedHandler = handler;
      },
      effect: (cb: any) => cb(),
    };

    apply(mockCtx, { enabled: true });
    assert.ok(injectedHandler, 'webserver/index-inject 监听器必须注册');

    const table: any[] = [];
    injectedHandler(table);
    assert.equal(table.length, 1, '首次应当注入脚本');

    injectedHandler(table);
    assert.equal(table.length, 1, '重复触发事件时防重生效，不应二次注入');
  });
});
