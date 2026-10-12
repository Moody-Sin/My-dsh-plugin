import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Config,
  deepMerge,
  getPluginConfig,
  interpolateEnvVariables,
  loadUmbrellaConfig,
} from '../src/config.ts';

/** 拦截 console.warn，收集告警文本并在回调结束后还原 */
function captureWarnings(fn: () => void): string[] {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    fn();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

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

test('loadUmbrellaConfig: 配置文件 JSON 损坏时输出带绝对路径的中文告警（缺陷 C）', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  writeRaw(dir, BASE_FILENAME, '{ "plugins": { "notifier": ');

  const result = { config: undefined as any, warnings: [] as string[] };
  result.warnings = captureWarnings(() => {
    result.config = loadUmbrellaConfig(dir);
  });

  assert.deepEqual(result.config, { plugins: {} }, '损坏文件仍须平稳降级');
  assert.equal(result.warnings.length, 1, '解析失败必须告警，杜绝静默忽略用户配置');
  assert.match(result.warnings[0], /\[my-dsh-plugins\]/);
  assert.match(result.warnings[0], /配置文件解析失败/);
  assert.ok(
    result.warnings[0].includes(path.join(dir, BASE_FILENAME)),
    `告警必须带上损坏文件的绝对路径，实际: ${result.warnings[0]}`,
  );
});

test('loadUmbrellaConfig: 配置文件缺失（ENOENT）时不产生告警（缺陷 C）', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  const warnings = captureWarnings(() => {
    assert.deepEqual(loadUmbrellaConfig(dir), { plugins: {} });
  });

  assert.deepEqual(warnings, [], '文件不存在属正常情况，严禁刷屏告警');
});

test('UmbrellaLoaderConfig: 不再声明无人读取的死字段 configFile（缺陷 D）', (t) => {
  const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const source = fs.readFileSync(path.join(dir, 'src', 'config.ts'), 'utf8');

  assert.equal(
    /configFile/.test(source),
    false,
    'configFile 全仓库无读取点，属死字段，必须从类型声明中移除',
  );
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

// ── 环境变量插值 ──────────────────────────────────────────────────────────

/**
 * 在用例内临时设置环境变量，结束后无论成败都还原 / 删除，杜绝跨用例污染。
 */
function withEnv<T>(vars: Record<string, string>, fn: () => T): T {
  const originals = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    originals.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of originals) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('interpolateEnvVariables: 支持 ${VAR} 与 ${env:VAR} 两种占位符写法', () => {
  withEnv({ UMBRELLA_TEST_TOKEN: 's3cr3t', UMBRELLA_TEST_URL: 'https://example.com' }, () => {
    assert.equal(
      interpolateEnvVariables('${UMBRELLA_TEST_TOKEN}'),
      's3cr3t',
      '${VAR} 写法必须被替换',
    );
    assert.equal(
      interpolateEnvVariables('${env:UMBRELLA_TEST_TOKEN}'),
      's3cr3t',
      '${env:VAR} 写法必须被替换',
    );
    assert.equal(
      interpolateEnvVariables('url=${UMBRELLA_TEST_URL}/hook?token=${env:UMBRELLA_TEST_TOKEN}'),
      'url=https://example.com/hook?token=s3cr3t',
      '同一字符串内的多个占位符必须全部替换',
    );
  });
});

test('interpolateEnvVariables: 变量不存在时原样保留占位符', () => {
  delete process.env.UMBRELLA_TEST_ABSENT;

  assert.equal(
    interpolateEnvVariables('${UMBRELLA_TEST_ABSENT}'),
    '${UMBRELLA_TEST_ABSENT}',
    '漏配的变量必须原样保留，便于用户直观发现，而不是被静默替换为空串',
  );
  assert.equal(
    interpolateEnvVariables('${env:UMBRELLA_TEST_ABSENT}'),
    '${env:UMBRELLA_TEST_ABSENT}',
    '带 env: 前缀的漏配变量同样必须原样保留',
  );
});

test('interpolateEnvVariables: 变量为空串时按存在处理并替换为空', () => {
  withEnv({ UMBRELLA_TEST_EMPTY: '' }, () => {
    assert.equal(
      interpolateEnvVariables('a${UMBRELLA_TEST_EMPTY}b'),
      'ab',
      '空串是合法取值，必须替换而非保留占位符',
    );
  });
});

test('interpolateEnvVariables: 非环境变量写法与非法变量名一律不动', () => {
  withEnv({ UMBRELLA_TEST_TOKEN: 's3cr3t' }, () => {
    for (const raw of [
      '${a.b}',
      '${1INVALID}',
      '${}',
      '$UMBRELLA_TEST_TOKEN',
      '{UMBRELLA_TEST_TOKEN}',
      '${UMBRELLA-TEST}',
      '普通文本',
    ]) {
      assert.equal(interpolateEnvVariables(raw), raw, `${raw} 不是合法占位符，严禁被改写`);
    }
  });
});

test('interpolateEnvVariables: 替换值中的 $ 字符不被当作替换模式二次解释', () => {
  withEnv({ UMBRELLA_TEST_DOLLAR: 'a$&b$1c' }, () => {
    assert.equal(
      interpolateEnvVariables('${UMBRELLA_TEST_DOLLAR}'),
      'a$&b$1c',
      '$& 与 $1 必须原样输出，不得被 String.replace 的模式语法吞掉',
    );
  });
});

test('loadUmbrellaConfig: 配置文件中的环境变量占位符被插值（含 BOM 与嵌套字段）', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  withEnv(
    { UMBRELLA_TEST_WEBHOOK: 'https://hook.example.com/abc', UMBRELLA_TEST_SECRET: 'top-secret' },
    () => {
      // 同时覆盖 BOM 前缀与 ${env:VAR} 写法：插值必须发生在 BOM 剥离之后、JSON.parse 之前
      writeRaw(
        dir,
        BASE_FILENAME,
        '\uFEFF' +
          JSON.stringify({
            plugins: {
              notifier: {
                enabled: true,
                webhook: { url: '${UMBRELLA_TEST_WEBHOOK}', secret: '${env:UMBRELLA_TEST_SECRET}' },
              },
            },
          }),
      );

      const config = loadUmbrellaConfig(dir);
      const webhook = (config.plugins ?? {}).notifier.webhook;

      assert.equal(webhook.url, 'https://hook.example.com/abc', 'BOM 之后的占位符同样必须被插值');
      assert.equal(webhook.secret, 'top-secret', '敏感凭据必须能由环境变量注入');
    },
  );
});

test('loadUmbrellaConfig: 本地覆盖层同样支持环境变量插值且优先级不变', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  writeJson(dir, BASE_FILENAME, {
    plugins: { notifier: { webhook: { secret: 'base-secret', url: 'https://base.example.com' } } },
  });

  withEnv({ UMBRELLA_TEST_LOCAL_SECRET: 'local-from-env' }, () => {
    writeRaw(
      dir,
      LOCAL_FILENAME,
      JSON.stringify({ plugins: { notifier: { webhook: { secret: '${UMBRELLA_TEST_LOCAL_SECRET}' } } } }),
    );

    const webhook = (loadUmbrellaConfig(dir).plugins ?? {}).notifier.webhook;

    assert.equal(webhook.secret, 'local-from-env', '本地层的占位符必须被插值');
    assert.equal(webhook.url, 'https://base.example.com', '插值不得破坏双层合并语义');
  });
});

test('loadUmbrellaConfig: 未配置的环境变量不会让整份配置解析失败', (t) => {
  const dir = makeTempDir();
  t.after(() => cleanup(dir));

  delete process.env.UMBRELLA_TEST_ABSENT;
  writeRaw(
    dir,
    BASE_FILENAME,
    JSON.stringify({ plugins: { notifier: { enabled: true, token: '${UMBRELLA_TEST_ABSENT}' } } }),
  );

  const warnings = captureWarnings(() => {
    const notifier = (loadUmbrellaConfig(dir).plugins ?? {}).notifier;
    assert.equal(notifier.token, '${UMBRELLA_TEST_ABSENT}', '未配置的占位符必须原样保留');
    assert.equal(notifier.enabled, true, '同一文件中的其它字段必须照常解析');
  });

  assert.deepEqual(warnings, [], '未配置的环境变量不是错误，不得刷告警');
});
