import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  Config,
  deepMerge,
  getPluginConfig,
  loadUmbrellaConfig,
} from '../src/config.ts';

const BASE_FILENAME = 'plugins.config.json';
const LOCAL_FILENAME = 'plugins.config.local.json';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'umbrella-config-'));
}

function writeJson(dir: string, filename: string, data: unknown): void {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf8');
}

function writeRaw(dir: string, filename: string, raw: string): void {
  fs.writeFileSync(path.join(dir, filename), raw, 'utf8');
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('deepMerge: 递归合并纯对象且不修改入参', () => {
  const target = {
    webhook: { enabled: false, url: '', provider: 'generic' },
    desktop: { minDurationSeconds: 5 },
    tags: ['a', 'b'],
  };
  const source = {
    webhook: { enabled: true, secret: 's3cr3t' },
    tags: ['c'],
  };

  const merged = deepMerge(target, source);

  assert.equal(merged.webhook.enabled, true, 'source 标量必须覆盖 target');
  assert.equal(merged.webhook.secret, 's3cr3t');
  assert.equal(merged.webhook.provider, 'generic', '未被覆盖的同层键必须保留');
  assert.equal(merged.desktop.minDurationSeconds, 5, '未被覆盖的兄弟对象必须保留');
  assert.deepEqual(merged.tags, ['c'], '数组按整体替换处理，不做逐项合并');

  assert.equal(target.webhook.enabled, false, 'deepMerge 不得修改 target 入参');
  assert.equal('secret' in target.webhook, false, 'deepMerge 不得向 target 写入新键');
});

test('loadUmbrellaConfig: 深层合并基础配置与本地覆盖，本地层优先', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  writeJson(dir, BASE_FILENAME, {
    plugins: {
      notifier: {
        enabled: true,
        desktop: { enabled: true, minDurationSeconds: 5 },
        webhook: { enabled: false, provider: 'generic', url: '', secret: '' },
      },
    },
  });
  writeJson(dir, LOCAL_FILENAME, {
    plugins: {
      notifier: {
        webhook: { enabled: true, secret: 'local-secret' },
      },
    },
  });

  const config = loadUmbrellaConfig(dir);
  const notifier = (config.plugins ?? {}).notifier;

  assert.equal(notifier.enabled, true, '本地层未涉及的开关必须沿用基础层');
  assert.equal(notifier.desktop.minDurationSeconds, 5, '深层字段不得因合并丢失');
  assert.equal(notifier.webhook.enabled, true, '本地层必须覆盖基础层同名标量');
  assert.equal(notifier.webhook.secret, 'local-secret', '本地层必须注入敏感字段');
  assert.equal(notifier.webhook.provider, 'generic', '深层合并必须保留同层其它键');
  assert.equal(notifier.webhook.url, '', '基础层空串不应被丢弃');
});

test('loadUmbrellaConfig: 仅存在本地覆盖文件时也能正常加载', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  writeJson(dir, LOCAL_FILENAME, {
    plugins: { notifier: { enabled: false } },
  });

  const config = loadUmbrellaConfig(dir);

  assert.equal((config.plugins ?? {}).notifier.enabled, false);
});

test('loadUmbrellaConfig: 配置文件全部缺失时平稳降级为 { plugins: {} }', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  assert.deepEqual(loadUmbrellaConfig(dir), { plugins: {} });
  assert.deepEqual(
    loadUmbrellaConfig(path.join(dir, 'not-exist-dir')),
    { plugins: {} },
    '根目录不存在时同样必须平稳降级',
  );
});

test('loadUmbrellaConfig: 基础配置 JSON 损坏时降级为空集合', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  writeRaw(dir, BASE_FILENAME, '{ "plugins": { "notifier": ');

  assert.deepEqual(loadUmbrellaConfig(dir), { plugins: {} });
});

test('loadUmbrellaConfig: 本地覆盖 JSON 损坏时保留基础配置', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  writeJson(dir, BASE_FILENAME, { plugins: { notifier: { enabled: true } } });
  writeRaw(dir, LOCAL_FILENAME, 'not-a-json-at-all');

  const config = loadUmbrellaConfig(dir);

  assert.equal((config.plugins ?? {}).notifier.enabled, true, '损坏的本地层不得拖垮基础层');
});

test('loadUmbrellaConfig: 容忍 Windows UTF-8 BOM 头的配置文件', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  // 记事本 / PowerShell `Set-Content -Encoding utf8` 会写入 BOM，JSON.parse 默认无法识别
  writeRaw(dir, BASE_FILENAME, '\uFEFF{ "plugins": { "notifier": { "enabled": false } } }');

  const config = loadUmbrellaConfig(dir);

  assert.equal((config.plugins ?? {}).notifier.enabled, false, '带 BOM 的配置必须被正常解析');
});

test('getPluginConfig: 未配置的插件默认返回 { enabled: true, config: {} }', () => {
  assert.deepEqual(getPluginConfig({ plugins: {} }, 'notifier'), {
    enabled: true,
    config: {},
  });
  assert.deepEqual(getPluginConfig({}, 'notifier'), { enabled: true, config: {} });
});

test('getPluginConfig: 显式 enabled: false 被正确识别', () => {
  const config = { plugins: { notifier: { enabled: false, sound: { enabled: true } } } };

  const result = getPluginConfig(config, 'notifier');

  assert.equal(result.enabled, false);
  assert.deepEqual(result.config, { sound: { enabled: true } }, '禁用时仍需返回剥离后的业务配置');
});

test('getPluginConfig: 剥离 enabled 字段且不污染原始配置', () => {
  const section = { enabled: true, desktop: { enabled: true }, webhook: { url: 'https://example.com' } };
  const config = { plugins: { notifier: section } };

  const result = getPluginConfig(config, 'notifier');

  assert.equal(result.enabled, true);
  assert.equal('enabled' in result.config, false, '透传配置严禁携带加载器元字段 enabled');
  assert.deepEqual(result.config, {
    desktop: { enabled: true },
    webhook: { url: 'https://example.com' },
  });
  assert.equal(section.enabled, true, '原始配置对象不得被就地删除字段');
});

test('Config: 符合 Standard Schema v1 接口约定', () => {
  const standard = Config['~standard'];

  assert.ok(standard, '必须暴露 ~standard 接口');
  assert.equal(standard.version, 1);
  assert.equal(standard.vendor, 'schemastery');
  assert.equal(typeof standard.validate, 'function');
});

test('Config: validate 同步返回 { value } 且兼容非法输入', () => {
  const input = { plugins: { notifier: { enabled: false } } };

  const result = Config['~standard'].validate(input);

  assert.equal(typeof (result as any).then, 'undefined', 'validate 严禁返回 Promise');
  assert.equal(result.issues, undefined, '合法输入不应产生 issues');
  assert.deepEqual(result.value, input);

  for (const invalid of [undefined, null, 'not-an-object', 42]) {
    const fallback = Config['~standard'].validate(invalid);
    assert.deepEqual(fallback.value, {}, `非法输入 ${String(invalid)} 必须降级为空对象`);
  }
});
