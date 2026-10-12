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
