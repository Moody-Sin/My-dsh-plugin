import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, DEFAULT_CONFIG, Config } from '../src/config.ts';

test('config: resolveConfig with empty or null candidate returns DEFAULT_CONFIG', () => {
  const config1 = resolveConfig({});
  assert.deepEqual(config1, DEFAULT_CONFIG);

  const config2 = resolveConfig(undefined);
  assert.deepEqual(config2, DEFAULT_CONFIG);
});

test('config: resolveConfig deep merges partial overrides', () => {
  const custom = resolveConfig({
    desktop: {
      enabled: false,
      minDurationSeconds: 15,
    },
    webhook: {
      enabled: true,
      provider: 'feishu',
      url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test-token',
    },
  });

  assert.equal(custom.desktop.enabled, false);
  assert.equal(custom.desktop.minDurationSeconds, 15);
  assert.equal(custom.sound.enabled, true); // preserved default
  assert.equal(custom.events.onTurnEnd, true); // preserved default
  assert.equal(custom.webhook.enabled, true);
  assert.equal(custom.webhook.provider, 'feishu');
  assert.equal(custom.webhook.url, 'https://open.feishu.cn/open-apis/bot/v2/hook/test-token');
});

test('config: resolveConfig sanitizes minDurationSeconds to non-negative integer', () => {
  const custom = resolveConfig({
    desktop: {
      minDurationSeconds: -10,
    },
  });

  assert.ok(custom.desktop.minDurationSeconds >= 0, 'minDurationSeconds must be >= 0');
});

test('config: Config schema conforms to expected structure', () => {
  assert.ok(Config, 'Config schema must be defined');
  assert.ok(typeof Config === 'function' || typeof Config === 'object', 'Config must be function or object');
  assert.ok(Config[Symbol.for('schemastery')], 'Schemastery symbol must be set');
  const parsed = Config({});
  assert.deepEqual(parsed, DEFAULT_CONFIG);
});

test('config: Config[~standard] follows the Standard Schema interface', () => {
  const standard = Config['~standard'];
  assert.ok(standard, 'Standard Schema interface must be exposed');
  assert.equal(standard.version, 1);
  assert.equal(standard.vendor, 'schemastery');
  assert.equal(typeof standard.validate, 'function');
});

test('config: Config[~standard].validate returns a synchronous result without issues', () => {
  // Cordis 会同步调用 validate 并读取 result.issues / result.value
  const result = Config['~standard'].validate({
    webhook: { enabled: true, provider: 'dingtalk', url: 'https://oapi.dingtalk.com/robot/send?access_token=test' },
  });

  assert.ok(!('then' in result), 'validation result must be synchronous');
  assert.equal(result.issues, undefined);
  assert.equal(result.value.webhook.provider, 'dingtalk');
  assert.equal(result.value.webhook.enabled, true);
  assert.equal(result.value.desktop.minDurationSeconds, DEFAULT_CONFIG.desktop.minDurationSeconds);
});

test('config: Config[~standard].validate normalizes empty input to defaults', () => {
  const result = Config['~standard'].validate(undefined);
  assert.deepEqual(result.value, DEFAULT_CONFIG);
});

test('config: Config.toJSON exposes a serializable schema description', () => {
  const json = Config.toJSON();

  assert.equal(json.type, 'object');
  assert.equal(json.description, 'DSH Notifier Configuration');
  assert.deepEqual(Object.keys(json.dict).sort(), ['desktop', 'events', 'sound', 'webhook']);
  assert.deepEqual(JSON.parse(JSON.stringify(Config)), json);
});

test('config: events.minDurationSeconds defaults to 5 and desktop keeps it for backward compatibility', () => {
  const config = resolveConfig({});
  assert.equal(config.events.minDurationSeconds, 5);
  assert.equal(config.desktop.minDurationSeconds, 5);
  assert.equal(DEFAULT_CONFIG.events.minDurationSeconds, 5);
});

test('config: events.minDurationSeconds takes precedence over desktop.minDurationSeconds', () => {
  const config = resolveConfig({
    events: { minDurationSeconds: 30 },
    desktop: { minDurationSeconds: 10 },
  });

  assert.equal(config.events.minDurationSeconds, 30, 'events 层必须优先');
  assert.equal(config.desktop.minDurationSeconds, 10, 'desktop 原值仍被保留');
});

test('config: events.minDurationSeconds falls back to desktop.minDurationSeconds for backward compatibility', () => {
  const config = resolveConfig({
    desktop: { minDurationSeconds: 20 },
  });

  assert.equal(config.events.minDurationSeconds, 20, '未提供 events 阈值时应回退读取旧版 desktop 配置');
  assert.equal(config.desktop.minDurationSeconds, 20);
});

test('config: minDurationSeconds is decoupled from desktop.enabled', () => {
  const config = resolveConfig({
    desktop: { enabled: false, minDurationSeconds: 12 },
    events: { onTurnEnd: true },
    webhook: { enabled: true, provider: 'generic', url: 'https://example.com' },
  });

  assert.equal(config.desktop.enabled, false);
  assert.equal(
    config.events.minDurationSeconds,
    12,
    '关闭桌面通知不应使 Webhook 失去过滤阈值，也不应误用 desktop 配置作为渠道开关'
  );
});

test('config: events.minDurationSeconds sanitizes illegal values to non-negative integer', () => {
  assert.equal(resolveConfig({ events: { minDurationSeconds: -7 } }).events.minDurationSeconds, 0);
  assert.equal(resolveConfig({ events: { minDurationSeconds: 3.9 } }).events.minDurationSeconds, 3);
  assert.equal(resolveConfig({ events: { minDurationSeconds: NaN } }).events.minDurationSeconds, 5);
  assert.equal(resolveConfig({ events: { minDurationSeconds: Infinity } }).events.minDurationSeconds, 5);
  assert.equal(resolveConfig({ events: { minDurationSeconds: '8' as any } }).events.minDurationSeconds, 5);
});

test('config: Config[~standard].validate resolves events.minDurationSeconds', () => {
  const result = Config['~standard'].validate({
    events: { minDurationSeconds: 42 },
    desktop: { enabled: false },
  });

  assert.equal(result.value.events.minDurationSeconds, 42);
  assert.equal(result.value.desktop.enabled, false);
});

test('config: Config.toJSON describes the new events.minDurationSeconds field', () => {
  const json = Config.toJSON();

  assert.equal(json.dict.events.dict.minDurationSeconds.type, 'number');
  assert.match(json.dict.events.dict.minDurationSeconds.description, /过滤阈值/);
  assert.match(json.dict.desktop.dict.minDurationSeconds.description, /废弃/);
});
