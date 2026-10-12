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
  resolveVolatileRefs,
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
  const result = Config['~standard'].validate({ plugins: { notifier: { enabled: false } } });

  assert.equal(typeof (result as any).then, 'undefined', 'validate 严禁返回 Promise');
  assert.equal(result.issues, undefined, '合法输入不应产生 issues');

  for (const invalid of [undefined, null, 'not-an-object', 42]) {
    const fallback = Config['~standard'].validate(invalid);
    assert.equal(typeof (fallback as any).then, 'undefined', '降级路径同样严禁返回 Promise');
    assert.equal(fallback.issues, undefined);
    assert.equal(typeof fallback.value, 'object', `非法输入 ${String(invalid)} 必须降级为对象`);
  }
});

// ── Schemastery 契约：DSH 表单投影的结构前提 ──────────────────────────────

/** 递归收集 Schema 树中的全部节点路径，形如 `plugins.notifier.webhook.url` */
function collectPaths(node: any, prefix = ''): string[] {
  const paths: string[] = [];
  for (const [key, child] of Object.entries<any>(node.dict ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(path, ...collectPaths(child, path));
  }
  return paths;
}

/** 仅收集叶子节点路径（可编辑控件对应的字段），用于投影结果的精确断言 */
function collectLeafPaths(node: any, prefix = ''): string[] {
  return Object.entries<any>(node.dict ?? {}).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child.dict ? collectLeafPaths(child, path) : [path];
  });
}

test('Config: 满足 Schemastery 结构契约（type / dict / meta / toJSON / 全局符号）', () => {
  assert.equal(Config[Symbol.for('schemastery')], true, '必须带全局 schemastery 符号，否则 DSH 不认');
  assert.equal(Config.type, 'object');
  assert.equal(typeof Config.toJSON, 'function');
  assert.equal(typeof Config, 'function', 'schemastery schema 本身可调用，本实现同样可调用');
  assert.ok(Config.dict, '必须暴露 dict 供 volatileForm 递归遍历');
  assert.deepEqual(Config.meta, {}, '根节点 meta 必须存在；标记 volatile 会让表单跳过剪枝');

  // 真实 schemastery 的 toJSON 返回 { uid, refs }，DSH 会 new z(schema.toJSON())；
  // 本实现返回等价 plain 结构（type/dict/meta），语义一致且更易读。
  const plain = Config.toJSON();
  assert.equal(plain.type, 'object');
  assert.ok(plain.dict);
  assert.ok(plain.meta);
});

test('Config.toJSON(): 返回 plain 结构且与模块级 SCHEMA_DICT 结构一致', () => {
  const plain = Config.toJSON();

  assert.deepEqual(
    collectPaths(plain).sort(),
    collectPaths(Config).sort(),
    'toJSON 投影出的字段路径必须与 Schema 完全一致',
  );
  assert.equal(
    plain.dict.plugins.dict.notifier.dict.webhook.dict.secret.description,
    '签名密钥 / Chat ID (可选)',
  );
});

test('SCHEMA_DICT: 每一层都必须带 meta，叶子必须带 volatile 标记', () => {
  const expectedVolatile = [
    'plugins.notifier.enabled',
    'plugins.notifier.locale',
    'plugins.notifier.desktop.enabled',
    'plugins.notifier.sound.enabled',
    'plugins.notifier.events.onTurnEnd',
    'plugins.notifier.events.onQuestion',
    'plugins.notifier.events.onApproval',
    'plugins.notifier.events.onError',
    'plugins.notifier.events.minDurationSeconds',
    'plugins.notifier.webhook.enabled',
    'plugins.notifier.webhook.provider',
    'plugins.notifier.webhook.url',
    'plugins.notifier.webhook.secret',
  ];

  const actualVolatile: string[] = [];
  const walk = (node: any, prefix = ''): void => {
    // DSH 的 volatileForm() / isVolatilePath() 会无条件读取 node.meta.volatile：
    // 任一节点缺失 meta 都会抛 TypeError 并让整个设置面板崩溃。
    assert.ok(node.meta, `节点 ${prefix || '<root>'} 缺失 meta，DSH 表单会抛 TypeError`);
    assert.equal(typeof node.meta, 'object');
    if (node.meta.volatile) actualVolatile.push(prefix);

    for (const [key, child] of Object.entries<any>(node.dict ?? {})) {
      walk(child, prefix ? `${prefix}.${key}` : key);
    }
  };
  walk(Config);

  assert.deepEqual(actualVolatile.sort(), expectedVolatile.sort(), 'volatile 字段集合必须与设计一致');
});

test('SCHEMA_DICT: 层级节点严禁标记 volatile（否则表单跳过剪枝、层级变可编辑控件）', () => {
  for (const path of ['plugins', 'plugins.notifier', 'plugins.notifier.desktop', 'plugins.notifier.sound', 'plugins.notifier.events', 'plugins.notifier.webhook']) {
    const node = path.split('.').reduce<any>((acc, key) => acc.dict[key], Config);
    assert.equal(node.meta.volatile, undefined, `层级节点 ${path} 不得标记 volatile`);
    assert.equal(node.type, 'object');
  }
});

// ── DSH volatileForm() 投影契约 ───────────────────────────────────────────

/**
 * DSH `dsh-settings` 表单投影引擎的最小忠实复刻。
 *
 * 逐行对照官方实现（`dsh-settings/lib/types/schema.js`）：
 * - `new z(plain)` 只做**浅层** `Object.assign`，因此 `result.meta` 与
 *   `toJSON()` 返回的 `meta` **共享同一个对象**；
 * - 紧随其后的 `walk()` 会**就地** `delete node.meta.volatile`。
 *
 * 正是这两点组合，使得 `toJSON()` 若返回共享引用，第二次投影就会因
 * volatile 标记被抹掉而返回 `undefined`（表单整片消失）。
 */
// 必须用普通函数而非箭头函数：官方实现以 `new z(...)` 调用，箭头函数不可构造。
const z: any = function z(options: any) {
  return { ...options };
};
z.object = (dict: any) => ({ type: 'object', dict });

function plainSchema(schema: any): any {
  const result = new z(schema.toJSON());
  const walk = (node: any): void => {
    delete node.meta.volatile;
    for (const child of Object.values<any>(node.dict ?? {})) walk(child);
    if (node.inner) walk(node.inner);
    for (const child of node.list ?? []) walk(child);
  };
  walk(result);
  return result;
}

function volatileForm(schema: any): any {
  if (schema.meta.volatile) return plainSchema(schema);
  if (schema.type === 'object') {
    const dict = Object.fromEntries(
      Object.entries<any>(schema.dict ?? {}).flatMap(([key, child]) => {
        const field = volatileForm(child);
        return field === undefined ? [] : [[key, field]];
      }),
    );
    return Object.keys(dict).length === 0 ? undefined : z.object(dict);
  }
  return undefined;
}

test('volatileForm 投影: 能完整投影出 plugins.notifier 的可编辑字段', () => {
  const form = volatileForm(Config);

  assert.ok(form, 'DSH 插件详情页必须能拿到非空表单，否则不会渲染任何控件');
  assert.equal(form.type, 'object');

  // 不含 volatile 字段的子树必须被整棵剪除
  assert.deepEqual(
    collectLeafPaths(form).sort(),
    [
      'plugins.notifier.desktop.enabled',
      'plugins.notifier.enabled',
      'plugins.notifier.events.minDurationSeconds',
      'plugins.notifier.events.onApproval',
      'plugins.notifier.events.onError',
      'plugins.notifier.events.onQuestion',
      'plugins.notifier.events.onTurnEnd',
      'plugins.notifier.locale',
      'plugins.notifier.sound.enabled',
      'plugins.notifier.webhook.enabled',
      'plugins.notifier.webhook.provider',
      'plugins.notifier.webhook.secret',
      'plugins.notifier.webhook.url',
    ],
    '投影结果必须精确等于 13 个 volatile 叶子字段',
  );

  // 层级节点必须保留，否则前端无法分组渲染
  for (const branch of ['plugins', 'plugins.notifier', 'plugins.notifier.desktop', 'plugins.notifier.sound', 'plugins.notifier.events', 'plugins.notifier.webhook']) {
    assert.ok(collectPaths(form).includes(branch), `层级节点 ${branch} 必须保留以支持分组渲染`);
  }
});

test('volatileForm 投影: 重复投影仍然非空（toJSON 深拷贝防御）', () => {
  // DSH 的 describe() 每次刷新都会重新投影；plainSchema 的 walk() 会就地删除
  // meta.volatile，因此若 toJSON() 返回共享引用，第二次投影必然为空表单。
  const first = volatileForm(Config);
  const second = volatileForm(Config);
  const third = volatileForm(Config);

  assert.ok(first, '首次投影必须非空');
  assert.ok(second, '第二次投影必须非空 —— toJSON 返回共享引用会让表单永久消失');
  assert.ok(third, '第三次投影同样必须非空');
  assert.deepEqual(collectPaths(second).sort(), collectPaths(first).sort());
});

test('volatileForm 投影: 投影过程不得污染模块级 SCHEMA_DICT 的 volatile 标记', () => {
  volatileForm(Config);

  assert.equal(
    Config.dict.plugins.dict.notifier.dict.webhook.dict.url.meta.volatile,
    true,
    'plainSchema 会就地 delete meta.volatile，模块级 Schema 必须靠深拷贝免疫',
  );
  assert.equal(Config.dict.plugins.dict.notifier.dict.enabled.meta.volatile, true);
  assert.equal(Config.dict.plugins.dict.notifier.dict.events.dict.onTurnEnd.meta.volatile, true);
});

test('volatileForm 投影: 每个 volatile 节点都具备 toJSON（plainSchema 会逐个调用）', () => {
  // plainSchema() 对**每个** volatile 节点执行 new z(schema.toJSON())，
  // 叶子节点缺 toJSON 会直接抛 "schema.toJSON is not a function"。
  const walk = (node: any, prefix = ''): void => {
    if (node.meta?.volatile) {
      assert.equal(typeof node.toJSON, 'function', `volatile 节点 ${prefix} 必须提供 toJSON()`);
    }
    for (const [key, child] of Object.entries<any>(node.dict ?? {})) {
      walk(child, prefix ? `${prefix}.${key}` : key);
    }
  };
  assert.doesNotThrow(() => walk(Config));
  assert.doesNotThrow(() => volatileForm(Config), '完整投影不得抛出任何异常');
});

// ── volatile 引用：DSH 免重启热改通道 ─────────────────────────────────────

const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write');

test('Config: validate 把 Schema 声明的叶子物化为 cosmokit volatile 引用', () => {
  const value: any = Config['~standard'].validate({
    plugins: { notifier: { enabled: false, webhook: { url: 'https://example.com/hook' } } },
  }).value;

  const notifier = value.plugins.notifier;
  assert.equal(typeof notifier.enabled.get, 'function', 'enabled 必须是 volatile 引用');
  assert.equal(notifier.enabled.get(), false, '引用必须携带实际配置值');
  assert.equal(notifier.webhook.url.get(), 'https://example.com/hook');
  assert.ok(VOLATILE_WRITE in notifier.locale, '必须带 cosmokit 写入符号，DSH 才认它是 volatile 引用');

  // 层级节点本身不是引用，仍是可遍历的普通对象
  assert.equal(typeof value.plugins.get, 'undefined');
  assert.equal(typeof notifier.get, 'undefined');
  assert.equal(typeof notifier.webhook.get, 'undefined');
});

test('Config: 未填写的字段同样建立引用（否则 DSH 保存会被静默丢弃）', () => {
  // LoaderEntry._commitVolatile() 首行即 volatileEntries(fiber.config)；
  // 若引用集合为空会立即 return，随后变更键列表被清空 → 整次保存什么都不发生。
  const value: any = Config['~standard'].validate({}).value;

  const notifier = value.plugins.notifier;
  assert.equal(typeof notifier.enabled.get, 'function');
  assert.equal(notifier.enabled.get(), undefined, '未配置字段的引用快照为 undefined');
  assert.equal(typeof notifier.webhook.secret.get, 'function');
  assert.equal(typeof notifier.events.minDurationSeconds.get, 'function');

  // 结构必须与「已填写」时完全同构，compareConfig 才能稳定判定为「仅 volatile 变更」
  const filled: any = Config['~standard'].validate({
    plugins: { notifier: { enabled: true, webhook: { url: 'x' } } },
  }).value;

  /** 收集普通配置对象的键路径（对象即下钻，叶子记录路径） */
  const plainPaths = (node: any, prefix = ''): string[] =>
    Object.entries<any>(node).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      const isBranch = child !== null && typeof child === 'object' && typeof child.get !== 'function';
      return isBranch ? plainPaths(child, path) : [path];
    });

  assert.deepEqual(
    plainPaths(value).sort(),
    plainPaths(filled).sort(),
    '空配置与满配置的键结构必须同构，否则 compareConfig 会误判为「普通配置变更」并重启插件',
  );
});

test('volatile 引用: 快照不可变，且 updateVolatile 能就地刷新同一引用', () => {
  const value: any = Config['~standard'].validate({
    plugins: { notifier: { webhook: { url: 'old' } } },
  }).value;
  const ref = value.plugins.notifier.webhook.url;

  assert.equal(Object.isFrozen(ref.get()), true, '快照必须深冻结，杜绝插件绕过引用协议就地篡改');

  // 复刻 DSH 的 updateVolatile(target, source)：把新快照灌进插件持有的**旧**引用
  const next: any = Config['~standard'].validate({
    plugins: { notifier: { webhook: { url: 'new' } } },
  }).value;
  ref[VOLATILE_WRITE](next.plugins.notifier.webhook.url.get());

  assert.equal(ref.get(), 'new', '宿主保存表单后，插件持有的旧引用必须立刻读到新值');
});

test('volatile 引用: 快照拒绝函数与循环引用（与 cosmokit 语义一致）', () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(' '));
  try {
    // 快照失败必须降级为原始值而非让插件启动崩溃
    const value: any = Config['~standard'].validate({
      plugins: { notifier: { enabled: () => {} } },
    }).value;
    assert.equal(typeof value.plugins.notifier.enabled, 'function', '快照失败必须降级为原始值');
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1, '降级必须告警，杜绝静默失效');
  assert.match(warnings[0], /\[my-dsh-plugins\]/);
});

test('resolveVolatileRefs: 递归解包为普通可序列化值', () => {
  const value: any = Config['~standard'].validate({
    plugins: { notifier: { enabled: true, locale: 'zh', events: { onError: false } } },
  }).value;

  const plain = resolveVolatileRefs(value);

  assert.equal(plain.plugins.notifier.enabled, true, '引用必须被解开为原始值');
  assert.equal(plain.plugins.notifier.locale, 'zh');
  assert.equal(plain.plugins.notifier.events.onError, false);
  assert.equal(
    typeof plain.plugins.notifier.webhook.secret,
    'undefined',
    '未配置字段解包后仍为 undefined，不得泄漏 get 方法',
  );
  assert.equal(
    JSON.stringify(plain).includes('get'),
    false,
    '解包结果必须可安全 JSON 序列化，不得残留引用句柄',
  );
});

test('deepMerge: 遇到 volatile 引用时先解包再合并', () => {
  const value: any = Config['~standard'].validate({
    plugins: { notifier: { enabled: false, webhook: { url: 'from-profile' } } },
  }).value;

  const merged = deepMerge(value, { plugins: { notifier: { webhook: { provider: 'feishu' } } } });

  assert.equal(merged.plugins.notifier.enabled, false, '引用必须被解包为原始值参与合并');
  assert.equal(merged.plugins.notifier.webhook.url, 'from-profile');
  assert.equal(merged.plugins.notifier.webhook.provider, 'feishu', '文件层必须覆盖 Profile 层');
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
