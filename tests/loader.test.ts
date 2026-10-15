import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { apply, resolveProjectRoot, name, Config } from '../src/index.ts';

/**
 * 在 `os.tmpdir()` 下构造一个隔离的加载器根目录：复制 `src/` 并按需写入配置文件。
 *
 * `apply()` 的根目录由 `resolveProjectRoot()` 推导（基于 `import.meta.url` 向上查找），
 * 因此把 `src/` 副本连同根标志文件放进临时目录，即可得到一个完全独立的场景根。
 * 全程不触及仓库内任何已提交文件，测试中断也不会留下残留。
 *
 * @param pluginsConfig 写入临时根 `plugins.config.json` 的内容，`undefined` 表示不创建
 * @param withPluginDir 是否放置一个最小的 dsh-notifier 子插件目录（「扫描为空」场景需传 false）
 * @param options.omitRootMarkers 是否故意不写任何根标志（包名与配置文件），
 *   用于验证 `resolveProjectRoot()` 找不到根时**抛错而非回落 cwd**
 */
async function makeIsolatedRoot(
  pluginsConfig?: unknown,
  withPluginDir = true,
  options: { omitRootMarkers?: boolean } = {},
): Promise<{ rootDir: string; mod: typeof import('../src/index.ts') }> {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umbrella-loader-'));
  // 本测试文件位于 tests/ 下，其上级目录即仓库根，src/ 由此定位
  const srcDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'src');
  fs.cpSync(srcDir, path.join(rootDir, 'src'), { recursive: true });

  if (!options.omitRootMarkers) {
    // resolveProjectRoot 以「包名或 plugins.config.json」作为根判定依据，必须补齐根标志
    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      '{ "name": "@local/my-dsh-plugins", "type": "module" }\n',
      'utf8',
    );
  }

  if (withPluginDir) {
    const pluginDir = path.join(rootDir, 'dsh-notifier');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'index.js'),
      'export default { name: "dsh-notifier", apply: () => {} };\n',
      'utf8',
    );
  }

  if (pluginsConfig !== undefined) {
    fs.writeFileSync(
      path.join(rootDir, 'plugins.config.json'),
      JSON.stringify(pluginsConfig, null, 2),
      'utf8',
    );
  }

  const mod = await import(pathToFileURL(path.join(rootDir, 'src', 'index.ts')).href);
  return { rootDir, mod };
}

/** 覆写临时根的 `plugins.config.json`（热重载用例用） */
function writeRootConfig(rootDir: string, pluginsConfig: unknown): void {
  fs.writeFileSync(
    path.join(rootDir, 'plugins.config.json'),
    JSON.stringify(pluginsConfig, null, 2),
    'utf8',
  );
}

/** 等待条件成立（热重载由 fs.watch + 防抖异步驱动，必须轮询而非固定 sleep） */
async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 8000, intervalMs = 50, label = '条件' } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`等待超时（${timeoutMs}ms）：${label} 始终未成立`);
}

/** 固定等待若干毫秒，用于断言「某件事确实没有发生」 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 异步版 console 拦截：等待回调 Promise 落定后再还原，避免漏掉异步告警 */
async function captureConsoleAsync(fn: () => Promise<unknown>): Promise<string[]> {
  const logs: string[] = [];
  const originals = { warn: console.warn, error: console.error, info: console.info };
  const push = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };
  console.warn = push;
  console.error = push;
  console.info = push;
  try {
    await fn();
  } finally {
    console.warn = originals.warn;
    console.error = originals.error;
    console.info = originals.info;
  }
  return logs;
}

/** 挂载记录：既保留 ctx.plugin 的入参，也暴露 fiber 供热重载断言 */
interface MountRecord {
  pluginDef: any;
  pluginConfig: any;
  fiber: any;
}

/**
 * 构造最小可用的 Cordis `ctx` 替身。
 *
 * 默认 fiber 自带 `dispose` / `update` 探针，用于验证热重载的销毁与热更新分支；
 * `on('dispose')` 注册的回调由 `dispose()` 统一触发，等价于宿主卸载插件。
 */
function createMockCtx(
  options: {
    registryHas?: (pluginDef: any) => boolean;
    fiber?: (pluginDef: any, pluginConfig: any) => any;
    logger?: any;
    useEffect?: boolean;
  } = {},
) {
  const mounted: MountRecord[] = [];
  const disposeHandlers: Array<() => void> = [];
  /** 事件登记表：`ctx.on` 注册，`ctx.emit` 触发（复刻 Cordis 的 emit 语义） */
  const listeners = new Map<string, Array<(...args: any[]) => void>>();

  const defaultFiber = () => {
    const fiber: any = {
      state: 2,
      disposed: false,
      updates: [] as any[],
      dispose() {
        fiber.disposed = true;
      },
      update(next: any) {
        fiber.updates.push(next);
      },
    };
    return fiber;
  };

  const ctx: any = {
    registry: { has: options.registryHas ?? (() => false) },
    plugin: async (pluginDef: any, pluginConfig: any) => {
      const fiber = options.fiber ? options.fiber(pluginDef, pluginConfig) : defaultFiber();
      mounted.push({ pluginDef, pluginConfig, fiber });
      return fiber;
    },
    effect: (callback: () => void | (() => void)) => {
      const cleanup = callback();
      if (typeof cleanup === 'function') {
        disposeHandlers.push(cleanup);
      }
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    },
    on: (event: string, handler: any) => {
      if (event === 'dispose') disposeHandlers.push(handler);
      const bucket = listeners.get(event) ?? [];
      bucket.push(handler);
      listeners.set(event, bucket);
    },
    // 复刻 DSH 在 `loader/volatile-update` 上的调用形态（宿主以 emit 通知，非 waterfall）
    emit: (event: string, ...args: any[]) => {
      for (const handler of listeners.get(event) ?? []) handler(...args);
    },
  };
  // 仅在显式传入时挂载 logger：默认场景必须走 console 兜底路径
  if (options.logger !== undefined) ctx.logger = options.logger;

  return {
    ctx,
    mounted,
    /** 触发 ctx.on('dispose') 注册的全部回调，等价于宿主卸载本插件 */
    dispose: () => {
      for (const handler of disposeHandlers.splice(0)) handler();
    },
  };
}

/** 收集 Cordis 原生 logger 的调用记录，形如 `warn:配置文件中包含...` */
function createLoggerSpy() {
  const calls: string[] = [];
  const record =
    (level: string) =>
    (...args: unknown[]) => {
      calls.push(`${level}:${args.map((arg) => String(arg)).join(' ')}`);
    };
  const loggerFactory = (scope: string) => {
    calls.push(`scope:${scope}`);
    return { info: record('info'), warn: record('warn'), error: record('error') };
  };
  return { calls, loggerFactory };
}

test('loader: 导出符合规范的 Cordis 插件接口', () => {
  assert.equal(name, 'my-dsh-plugins');
  assert.ok(Config);
  assert.equal(typeof Config['~standard']?.validate, 'function');
  assert.equal(typeof apply, 'function');
});

test('loader: resolveProjectRoot 能唯一定位仓库根目录', () => {
  const root = resolveProjectRoot();
  assert.ok(root);
  assert.match(root, /My-dsh-plugin/i);
});

test('loader: apply 正确挂载子插件并剥离 enabled 元字段', async (t) => {
  const harness = createMockCtx();
  t.after(() => harness.dispose());

  // 显式指定 notifier 为 enabled 并带测试配置
  await apply(harness.ctx, {
    plugins: {
      notifier: {
        enabled: true,
        sound: { enabled: false, volume: 3 },
      },
    },
  });

  assert.equal(harness.mounted.length, 2);
  const notifierMount = harness.mounted.find(m => m.pluginDef?.name === 'notifier');
  assert.ok(notifierMount, 'notifier 必须被挂载');
  const conf = notifierMount.pluginConfig;
  assert.equal(conf.enabled, undefined, 'enabled 字段必须被剥离');
  assert.equal(conf.sound.volume, 3, '非冲突字段必须原样透传');
  // 仓库 plugins.config.json 中 notifier.sound.enabled 为 true，文件配置优先级更高（缺陷 A）。
  assert.equal(conf.sound.enabled, true, '文件配置优先级必须高于 DSH Profile Patch 传入配置');
});

/**
 * 在隔离的临时根目录下执行 `apply()`，回调结束后删除临时目录。
 *
 * 缺陷 A 修复后文件配置优先级最高，涉及 `enabled` 的场景必须在文件层表达，
 * 因此这里把测试配置写入临时根目录自己的 `plugins.config.json`，
 * 而绝不覆写仓库根的真实配置文件。
 */
async function withIsolatedRoot<T>(
  pluginsConfig: unknown,
  fn: (mod: typeof import('../src/index.ts')) => Promise<T>,
): Promise<T> {
  const { rootDir, mod } = await makeIsolatedRoot(pluginsConfig);
  try {
    return await fn(mod);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

test('loader: enabled 为 false 时提前跳过挂载', async (t) => {
  const harness = createMockCtx();
  t.after(() => harness.dispose());

  // 在临时根目录的文件层显式禁用 notifier（文件配置优先级最高，缺陷 A 修复后的正确表达位置）
  await withIsolatedRoot({ plugins: { notifier: { enabled: false } } }, async (mod) => {
    await mod.apply(harness.ctx, { plugins: { notifier: { enabled: false } } });
  });

  assert.equal(harness.mounted.length, 0, '禁用插件不应触发 ctx.plugin');
});

test('loader: 文件配置优先级高于传入配置（缺陷 A）', async (t) => {
  const harness = createMockCtx();
  t.after(() => harness.dispose());

  await withIsolatedRoot(
    { plugins: { notifier: { enabled: true, sound: { enabled: true }, volume: 7 } } },
    async (mod) => {
      await mod.apply(harness.ctx, {
        plugins: { notifier: { enabled: true, sound: { enabled: false }, volume: 1 } },
      });
    },
  );

  assert.equal(harness.mounted.length, 1);
  const conf = harness.mounted[0].pluginConfig;
  assert.equal(conf.volume, 7, '文件配置标量必须覆盖传入配置');
  assert.equal(conf.sound.enabled, true, '文件配置深层字段必须覆盖传入配置');
});

test('loader: 单个子插件初始化异常时沙箱隔离且不拖垮宿主', async (t) => {
  const harness = createMockCtx({
    fiber: () => {
      throw new Error('模拟子插件内部错误');
    },
  });
  t.after(() => harness.dispose());

  // 不应抛出未捕获异常
  await assert.doesNotReject(async () => {
    await apply(harness.ctx, { plugins: { notifier: { enabled: true } } });
  });
});

test('loader: 插件已在注册表中时跳过重复挂载', async (t) => {
  // 改用 Cordis 原生 registry.has(模块命名空间) 判定（缺陷 B）：未注册 → false，已注册 → true。
  // 这里保留 values() 形态的 mock 但 has 返回 true，用于锁定「按 name 误判」的旧行为不再生效。
  const harness = createMockCtx({ registryHas: () => true });
  t.after(() => harness.dispose());

  await apply(harness.ctx, { plugins: { notifier: { enabled: true } } });

  assert.equal(harness.mounted.length, 0, '已注册的同名插件应被跳过');
});

test('loader: 不同子插件导出同名 name 时不得被误吞（缺陷 B）', async (t) => {
  // 重现旧缺陷：registry 中已有一个 name='notifier' 的插件，但 callback 指向另一个模块命名空间。
  // 修复前 name 字符串比较恒命中，导致本次装载被静默跳过。
  const otherNamespace = { name: 'notifier', apply: () => {} };
  const harness = createMockCtx({ registryHas: (pluginDef) => pluginDef === otherNamespace });
  t.after(() => harness.dispose());

  await apply(harness.ctx, { plugins: { notifier: { enabled: true } } });

  assert.equal(harness.mounted.length, 2, '不同模块的同名插件必须照常装载，不得因 name 撞车被静默跳过');
  assert.ok(harness.mounted.some(m => m.pluginDef?.name === 'notifier'));
});

test('loader: fiber 未进入 ACTIVE 状态时输出中文告警（缺陷 E）', async (t) => {
  // 依赖未满足时 ctx.plugin 立刻返回，fiber 停在 PENDING（state=0）
  const harness = createMockCtx({ fiber: () => ({ state: 0 }) });
  t.after(() => harness.dispose());

  const logs = await captureConsoleAsync(() =>
    apply(harness.ctx, { plugins: { notifier: { enabled: true } } }),
  );
  const warnings = logs.filter((line) => line.includes('未进入 ACTIVE'));

  assert.equal(warnings.length, 2, '卡在 PENDING 的插件必须告警');
  assert.match(warnings[0], /\[my-dsh-plugins\]/);
  assert.ok(warnings.some(w => w.includes('notifier')));
  assert.match(warnings[0], /未在|未进入|等待依赖|尚未真正生效|ACTIVE/);
});

test('loader: fiber 为 ACTIVE 或 mock 未返回 fiber 时不告警（缺陷 E）', async (t) => {
  const active = createMockCtx({ fiber: () => ({ state: 2 }) });
  const noFiber = createMockCtx({ fiber: () => undefined });
  t.after(() => {
    active.dispose();
    noFiber.dispose();
  });

  const first = await captureConsoleAsync(() =>
    apply(active.ctx, { plugins: { notifier: { enabled: true } } }),
  );
  assert.deepEqual(first, [], 'ACTIVE 状态不得告警');

  // mock ctx.plugin 返回 undefined 时严禁崩溃
  await assert.doesNotReject(async () => {
    await apply(noFiber.ctx, { plugins: { notifier: { enabled: true } } });
  });
  const second = await captureConsoleAsync(() =>
    apply(noFiber.ctx, { plugins: { notifier: { enabled: true } } }),
  );
  assert.deepEqual(second, [], 'fiber 缺失（state 不存在）时不得崩溃或误告警');
});

test('loader: 扫描结果为空时输出带 rootDir 的中文告警（缺陷 F）', async (t) => {
  // 临时根目录内不放置任何 dsh-* 子插件，无需改名仓库真实目录即可得到「扫描为空」
  const { rootDir, mod } = await makeIsolatedRoot(undefined, false);
  const harness = createMockCtx();
  t.after(() => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  const warnings = await captureConsoleAsync(() =>
    mod.apply(harness.ctx, { plugins: { notifier: { enabled: true } } }),
  );

  assert.equal(harness.mounted.length, 0);
  assert.equal(warnings.length, 1, '扫描为空必须告警，杜绝静默什么都不做');
  assert.match(warnings[0], /\[my-dsh-plugins\]/);
  assert.match(warnings[0], /dsh-\*/, '告警须提示未找到 dsh-* 子插件');
  assert.match(warnings[0], /根目录/);
  assert.ok(warnings[0].includes(rootDir), `告警必须带上解析出的 rootDir，实际: ${warnings[0]}`);
});

// ── 根目录向上查找（Upward Search）────────────────────────────────────────

/** 找出给定目录祖先链中「恰好构成根标志」的目录，用于负向用例的环境前置校验 */
function findRootMarkerAncestor(startDir: string): string | undefined {
  let current = path.dirname(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'plugins.config.json'))) return current;
    const packagePath = path.join(current, 'package.json');
    if (fs.existsSync(packagePath)) {
      try {
        const raw = fs.readFileSync(packagePath, 'utf8').replace(/^\uFEFF/, '');
        if (JSON.parse(raw)?.name === '@local/my-dsh-plugins') return current;
      } catch {
        // 祖先目录的 package.json 损坏不影响判定，继续上溯
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

test('resolveProjectRoot: 从深层嵌套目录向上查找命中包名根标志', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: {} });
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  // 把 src/ 深埋三层，验证查找不止步于「上一级」，而是持续上溯
  const nested = path.join(rootDir, 'a', 'b', 'c');
  fs.mkdirSync(nested, { recursive: true });
  fs.cpSync(path.join(rootDir, 'src'), path.join(nested, 'src'), { recursive: true });
  const deepMod = await import(pathToFileURL(path.join(nested, 'src', 'index.ts')).href);

  assert.equal(deepMod.resolveProjectRoot(), rootDir, '必须一路向上找到真正的仓库根');
  assert.equal(mod.resolveProjectRoot(), rootDir);
});

test('resolveProjectRoot: 无包名但存在 plugins.config.json 时同样命中', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: {} });
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  // 移除包名标志，仅保留 plugins.config.json，验证第二条命中条件独立生效
  fs.writeFileSync(path.join(rootDir, 'package.json'), '{ "type": "module" }\n', 'utf8');

  assert.equal(mod.resolveProjectRoot(), rootDir);
});

test('resolveProjectRoot: 找不到根标志时抛出中文异常，绝不回落 process.cwd()', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot(undefined, false, { omitRootMarkers: true });
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  // 系统临时目录的祖先若恰好含根标志，本用例的前提即不成立，诚实跳过而非误报
  const polluted = findRootMarkerAncestor(rootDir);
  if (polluted) {
    t.skip(`系统临时目录祖先 ${polluted} 含根标志，无法构造「找不到根」场景`);
    return;
  }

  assert.throws(
    () => mod.resolveProjectRoot(),
    (error: any) => {
      assert.match(String(error?.message), /\[my-dsh-plugins\]/);
      assert.match(String(error?.message), /无法定位项目根目录/);
      assert.match(String(error?.message), /请确保从有效的仓库安装或运行/);
      return true;
    },
    '找不到根标志必须抛错，绝不能静默回落 cwd 污染用户工程目录',
  );
});

test('resolveProjectRoot: 定位失败时 apply 直接抛出，不扫描用户工作目录', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot(undefined, false, { omitRootMarkers: true });
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  if (findRootMarkerAncestor(rootDir)) {
    t.skip('系统临时目录祖先含根标志，无法构造「找不到根」场景');
    return;
  }

  const harness = createMockCtx();
  t.after(() => harness.dispose());

  await assert.rejects(
    () => mod.apply(harness.ctx, { plugins: {} }),
    /无法定位项目根目录/,
    'apply 必须把定位失败上抛，而不是拿 cwd 当根目录继续扫描',
  );
  assert.equal(harness.mounted.length, 0);
});

// ── 未知插件配置告警 ──────────────────────────────────────────────────────

test('loader: 配置中的未知插件项输出中文告警并列出已检测插件', async (t) => {
  const harness = createMockCtx();
  t.after(() => harness.dispose());

  const logs = await captureConsoleAsync(() =>
    withIsolatedRoot(
      { plugins: { notifier: { enabled: true }, ghost: { enabled: true }, typo: { enabled: false } } },
      (mod) => mod.apply(harness.ctx, {}),
    ),
  );

  const unknownLogs = logs.filter((line) => line.includes('未识别的插件项'));
  assert.equal(unknownLogs.length, 2, '每个未知键都必须单独告警，便于逐项排查');
  assert.match(unknownLogs[0], /\[my-dsh-plugins\]/);
  assert.match(unknownLogs[0], /"ghost"/);
  assert.match(unknownLogs[0], /当前已检测到的子插件为/);
  assert.match(unknownLogs[0], /notifier/, '告警必须列出已检测到的插件名');
  assert.match(unknownLogs[1], /"typo"/);
  // 已知键 notifier 照常装载，未知键不得阻断任何装载
  assert.equal(harness.mounted.length, 1);
});

test('loader: 无未知插件项时不产生任何未知键告警', async (t) => {
  const harness = createMockCtx();
  t.after(() => harness.dispose());

  const logs = await captureConsoleAsync(() =>
    withIsolatedRoot({ plugins: { notifier: { enabled: true } } }, (mod) =>
      mod.apply(harness.ctx, {}),
    ),
  );

  assert.deepEqual(logs.filter((line) => line.includes('未识别的插件项')), []);
});

test('loader: 扫描为空时只告警根目录问题，不逐个罗列未知插件项', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: { ghost: { enabled: true } } }, false);
  const harness = createMockCtx();
  t.after(() => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  const logs = await captureConsoleAsync(() => mod.apply(harness.ctx, {}));

  assert.equal(logs.filter((line) => line.includes('未识别的插件项')).length, 0);
  assert.equal(logs.length, 1, '此时唯一有效的提示是「未扫描到子插件」');
});

// ── Cordis 原生 Logger 对接 ───────────────────────────────────────────────

test('loader: 优先使用 Cordis 原生 logger 且作用域为插件名', async (t) => {
  const spy = createLoggerSpy();
  const harness = createMockCtx({ logger: spy.loggerFactory });
  t.after(() => harness.dispose());

  const logs = await captureConsoleAsync(() =>
    withIsolatedRoot({ plugins: { notifier: { enabled: true }, ghost: {} } }, (mod) =>
      mod.apply(harness.ctx, {}),
    ),
  );

  assert.ok(spy.calls.includes('scope:my-dsh-plugins'), '必须以插件名作为 logger 作用域');
  assert.equal(
    spy.calls.filter((line) => line.startsWith('warn:') && line.includes('"ghost"')).length,
    1,
    '未知插件告警必须走 Cordis logger',
  );
  assert.deepEqual(logs, [], '注入 logger 后不得再向控制台输出');
});

test('loader: ctx Proxy 读取 logger 抛错时优雅降级到控制台且不崩溃', async (t) => {
  const harness = createMockCtx();
  // Cordis 的 ctx 是 Proxy：访问未声明 inject 的服务属性会直接抛错
  Object.defineProperty(harness.ctx, 'logger', {
    get() {
      throw new Error('cannot get property "logger" without inject');
    },
  });
  t.after(() => harness.dispose());

  const logs = await captureConsoleAsync(() =>
    withIsolatedRoot({ plugins: { notifier: { enabled: true }, ghost: {} } }, (mod) =>
      mod.apply(harness.ctx, {}),
    ),
  );

  assert.equal(harness.mounted.length, 1, 'logger 取用失败不得影响插件装载');
  assert.ok(
    logs.some((line) => line.includes('未识别的插件项') && line.includes('"ghost"')),
    '必须降级到控制台输出，杜绝告警彻底丢失',
  );
});

test('loader: logger 工厂返回残缺对象时逐级降级到控制台', async (t) => {
  // 只实现 warn，info / error 缺失：缺失的级别必须各自回落，而非整体失效
  const harness = createMockCtx({ logger: () => ({ warn: () => {} }) });
  t.after(() => harness.dispose());

  await assert.doesNotReject(async () => {
    await withIsolatedRoot({ plugins: { notifier: { enabled: true } } }, (mod) =>
      mod.apply(harness.ctx, {}),
    );
  });
});

// ── 配置热重载 ────────────────────────────────────────────────────────────

test('热重载: 插件由启用改为禁用时销毁 fiber 并移出登记表', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: { notifier: { enabled: true } } });
  const harness = createMockCtx();
  t.after(async () => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  await mod.apply(harness.ctx, {});
  assert.equal(harness.mounted.length, 1, '初始应挂载 1 个子插件');
  const fiber = harness.mounted[0].fiber;

  writeRootConfig(rootDir, { plugins: { notifier: { enabled: false } } });
  await waitFor(() => fiber.disposed, { label: '禁用后 fiber.dispose 被调用' });

  assert.equal(fiber.disposed, true, '禁用必须销毁已挂载 fiber');
  assert.deepEqual(fiber.updates, [], '禁用分支不得再走热更新');

  // 再次启用应能重新挂载，证明登记表已正确移除旧 fiber
  writeRootConfig(rootDir, { plugins: { notifier: { enabled: true } } });
  await waitFor(() => harness.mounted.length === 2, { label: '重新启用后再次挂载' });
});

test('热重载: 插件由禁用改为启用时动态补挂', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: { notifier: { enabled: false } } });
  const harness = createMockCtx();
  t.after(async () => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  await mod.apply(harness.ctx, {});
  assert.equal(harness.mounted.length, 0, '初始禁用不得挂载');

  writeRootConfig(rootDir, { plugins: { notifier: { enabled: true, volume: 9 } } });
  await waitFor(() => harness.mounted.length === 1, { label: '启用后动态挂载' });

  assert.equal(harness.mounted[0].pluginConfig.volume, 9, '补挂时必须透传最新配置');
  assert.equal(harness.mounted[0].pluginConfig.enabled, undefined, '补挂同样必须剥离 enabled');
});

test('热重载: 持续启用时调用 fiber.update 热更新配置而非重建', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({
    plugins: { notifier: { enabled: true, volume: 1 } },
  });
  const harness = createMockCtx();
  t.after(async () => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  await mod.apply(harness.ctx, {});
  const fiber = harness.mounted[0].fiber;

  writeRootConfig(rootDir, { plugins: { notifier: { enabled: true, volume: 2 } } });
  await waitFor(() => fiber.updates.length > 0, { label: 'fiber.update 被调用' });

  assert.equal(fiber.updates.at(-1).volume, 2, '必须把最新配置交给 fiber.update');
  assert.equal(fiber.updates.at(-1).enabled, undefined, '热更新配置同样不得携带 enabled');
  assert.equal(harness.mounted.length, 1, '持续启用时严禁销毁重建，避免监听器抖动');
  assert.equal(fiber.disposed, false);
});

test('热重载: 本地覆盖文件新建后同样触发热重载', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: { notifier: { enabled: true } } });
  const harness = createMockCtx();
  t.after(async () => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  await mod.apply(harness.ctx, {});
  const fiber = harness.mounted[0].fiber;

  // 监听根目录而非具体文件，正是为了让「新建 plugins.config.local.json」也能被捕获
  fs.writeFileSync(
    path.join(rootDir, 'plugins.config.local.json'),
    JSON.stringify({ plugins: { notifier: { enabled: false } } }, null, 2),
    'utf8',
  );
  await waitFor(() => fiber.disposed, { label: '新建本地覆盖文件后热重载生效' });
});

test('热重载: 无关文件变更不触发重载', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: { notifier: { enabled: true } } });
  const harness = createMockCtx();
  t.after(async () => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  await mod.apply(harness.ctx, {});
  const fiber = harness.mounted[0].fiber;

  fs.writeFileSync(path.join(rootDir, 'unrelated.txt'), 'noise', 'utf8');
  // 等待超过防抖窗口，确认确实没有触发任何重载动作
  await delay(700);

  assert.deepEqual(fiber.updates, [], '非配置文件变更不得触发 fiber.update');
  assert.equal(fiber.disposed, false);
  assert.equal(harness.mounted.length, 1);
});

test('热重载: 连续多次写入被 300ms 防抖合并为一次重载', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({
    plugins: { notifier: { enabled: true, volume: 0 } },
  });
  const harness = createMockCtx();
  t.after(async () => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  await mod.apply(harness.ctx, {});
  const fiber = harness.mounted[0].fiber;

  // 模拟编辑器保存：短时间内的多次写入必须合并
  for (let i = 1; i <= 5; i += 1) {
    writeRootConfig(rootDir, { plugins: { notifier: { enabled: true, volume: i } } });
    await delay(40);
  }
  await waitFor(() => fiber.updates.length > 0, { label: '防抖后至少触发一次热更新' });
  await delay(700);

  assert.equal(fiber.updates.length, 1, `防抖应把 5 次写入合并为 1 次，实际 ${fiber.updates.length} 次`);
  assert.equal(fiber.updates[0].volume, 5, '合并后必须使用最后一次写入的配置');
});

test('热重载: 宿主 dispose 后注销 watcher，配置变更不再生效', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({
    plugins: { notifier: { enabled: true, volume: 1 } },
  });
  const harness = createMockCtx();
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  await mod.apply(harness.ctx, {});
  const fiber = harness.mounted[0].fiber;

  harness.dispose();
  writeRootConfig(rootDir, { plugins: { notifier: { enabled: true, volume: 99 } } });
  await delay(700);

  assert.deepEqual(fiber.updates, [], 'dispose 之后严禁再响应配置变更，否则句柄与定时器会长期驻留');
  assert.equal(harness.mounted.length, 1);

  // 验证 Cordis v4 的 ctx.effect 清理钩子被正常注册
  let effectCleanerRegistered = false;
  const effectOnlyHarness = {
    registry: { has: () => false },
    plugin: async () => ({ state: 2 }),
    effect: (callback: any) => {
      const cleaner = callback();
      if (typeof cleaner === 'function') effectCleanerRegistered = true;
    },
  };
  await mod.apply(effectOnlyHarness, {});
  assert.equal(effectCleanerRegistered, true, 'Cordis v4 ctx.effect 清理钩子必须正常挂载');
});

test('热重载: 子插件重载异常被捕获，不拖垮宿主', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: { notifier: { enabled: true } } });
  // update 抛错模拟子插件自身的重载缺陷
  const harness = createMockCtx({
    fiber: () => ({
      state: 2,
      update() {
        throw new Error('模拟子插件热更新失败');
      },
    }),
  });
  t.after(async () => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  await mod.apply(harness.ctx, {});
  const logs = await captureConsoleAsync(async () => {
    writeRootConfig(rootDir, { plugins: { notifier: { enabled: true, volume: 3 } } });
    await delay(900);
  });

  assert.ok(
    logs.some((line) => line.includes('notifier') && line.includes('热重载失败')),
    `热重载异常必须告警，实际: ${JSON.stringify(logs)}`,
  );
});

// ── DSH 原生设置表单联动（方案 A）────────────────────────────────────────

/** 模拟 DSH `updateVolatile()`：把新快照灌进插件持有的**旧**引用 */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write');

function commitVolatile(target: any, source: any): void {
  target[VOLATILE_WRITE](source.get());
}

test('设置表单: 传入配置的 volatile 引用被解引用后再透传给子插件', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: {} });
  const harness = createMockCtx();
  t.after(() => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  // 复刻 Cordis：先用 Config['~standard'].validate 物化，再把结果交给 apply
  const profileConfig = mod.Config['~standard'].validate({
    plugins: { notifier: { enabled: true, locale: 'en', webhook: { url: 'https://hook.example.com' } } },
  }).value;

  await mod.apply(harness.ctx, profileConfig);

  const conf = harness.mounted[0].pluginConfig;
  assert.equal(conf.locale, 'en', '引用必须被解开为原始值与子插件 Schema 对齐');
  assert.equal(conf.webhook.url, 'https://hook.example.com');
  assert.equal(
    typeof conf.webhook.secret,
    'undefined',
    '未配置字段解引用后为 undefined，严禁把 get 句柄泄漏给子插件',
  );
  assert.equal(
    JSON.stringify(conf).includes('"get"'),
    false,
    '透传配置必须完全可序列化，不得残留 volatile 句柄',
  );
});

test('设置表单: 宿主刷新 volatile 快照并触发 loader/volatile-update 后热更新生效', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: {} });
  const harness = createMockCtx();
  t.after(() => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  const profileConfig = mod.Config['~standard'].validate({
    plugins: { notifier: { enabled: true, webhook: { url: 'https://old.example.com' } } },
  }).value;

  await mod.apply(harness.ctx, profileConfig);
  assert.equal(harness.mounted[0].pluginConfig.webhook.url, 'https://old.example.com');
  const fiber = harness.mounted[0].fiber;

  // 复刻 DSH 保存表单的完整链路：
  // 1) 新配置经同一 Schema 校验并建立全新引用；
  // 2) updateVolatile() 把新快照就地灌进插件持有的旧引用；
  // 3) 宿主发出 loader/volatile-update 通知（不重启插件）。
  const next = mod.Config['~standard'].validate({
    plugins: { notifier: { enabled: true, webhook: { url: 'https://new.example.com' } } },
  }).value;
  commitVolatile(
    profileConfig.plugins.notifier.webhook.url,
    next.plugins.notifier.webhook.url,
  );
  harness.ctx.emit('loader/volatile-update', [['plugins', 'notifier', 'webhook', 'url']]);

  await waitFor(() => fiber.updates.length > 0, { label: '表单保存后触发 fiber.update' });

  assert.equal(
    fiber.updates.at(-1).webhook.url,
    'https://new.example.com',
    '必须把宿主刷新后的最新配置交给子插件',
  );
  assert.equal(harness.mounted.length, 1, '表单更新是热更新，严禁销毁重建');
  assert.equal(fiber.disposed, false);
});

test('设置表单: enabled 引用被改写后按启用状态重新协调装载', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: {} });
  const harness = createMockCtx();
  t.after(() => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  const profileConfig = mod.Config['~standard'].validate({
    plugins: { notifier: { enabled: true } },
  }).value;

  await mod.apply(harness.ctx, profileConfig);
  assert.equal(harness.mounted.length, 1, '初始启用应挂载');
  const fiber = harness.mounted[0].fiber;

  // 在表单里关掉开关：文件层未声明 enabled，因此 Profile 值可以生效
  const next = mod.Config['~standard'].validate({ plugins: { notifier: { enabled: false } } }).value;
  commitVolatile(profileConfig.plugins.notifier.enabled, next.plugins.notifier.enabled);
  harness.ctx.emit('loader/volatile-update', [['plugins', 'notifier', 'enabled']]);

  await waitFor(() => fiber.disposed, { label: '表单关闭开关后销毁 fiber' });
  assert.equal(fiber.disposed, true, '表单关闭开关必须销毁已挂载实例');
});

test('设置表单: 宿主 dispose 后不再响应表单变更', async (t) => {
  const { rootDir, mod } = await makeIsolatedRoot({ plugins: {} });
  const harness = createMockCtx();
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const profileConfig = mod.Config['~standard'].validate({
    plugins: { notifier: { enabled: true, volume: 1 } },
  }).value;
  await mod.apply(harness.ctx, profileConfig);
  const fiber = harness.mounted[0].fiber;

  harness.dispose();
  harness.ctx.emit('loader/volatile-update', [['plugins', 'notifier', 'volume']]);
  await delay(300);

  assert.deepEqual(fiber.updates, [], 'dispose 之后严禁再响应表单变更，否则会向已卸载的 fiber 写入');
});

test('设置表单: 文件配置仍为最高权威，覆盖表单值（既定优先级不变）', async (t) => {
  // 文件层显式声明 locale，因此表单改动必须被文件值盖回 —— 锁定既有优先级契约。
  const { rootDir, mod } = await makeIsolatedRoot({
    plugins: { notifier: { enabled: true, locale: 'zh' } },
  });
  const harness = createMockCtx();
  t.after(() => {
    harness.dispose();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  const profileConfig = mod.Config['~standard'].validate({
    plugins: { notifier: { enabled: true, locale: 'en' } },
  }).value;

  await mod.apply(harness.ctx, profileConfig);
  assert.equal(
    harness.mounted[0].pluginConfig.locale,
    'zh',
    '文件配置为最高权威，必须覆盖 Profile / 表单传入值',
  );
});
