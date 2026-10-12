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
 * `apply()` 的根目录由 `resolveProjectRoot()` 推导（基于 `import.meta.url`），
 * 因此把 `src/` 副本连同配置文件放进临时目录，即可得到一个完全独立的场景根。
 * 全程不触及仓库内任何已提交文件，测试中断也不会留下残留。
 */
async function makeIsolatedRoot(
  pluginsConfig?: unknown,
  /** 是否放置一个最小的 dsh-notifier 子插件目录（「扫描为空」场景需传 false） */
  withPluginDir = true,
): Promise<{ rootDir: string; mod: typeof import('../src/index.ts') }> {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umbrella-loader-'));
  // 本测试文件位于 tests/ 下，其上级目录即仓库根，src/ 由此定位
  const srcDir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'src');
  fs.cpSync(srcDir, path.join(rootDir, 'src'), { recursive: true });
  // resolveProjectRoot 以 package.json 是否存在作为根判定依据，必须补齐
  fs.writeFileSync(path.join(rootDir, 'package.json'), '{ "type": "module" }\n', 'utf8');

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

test('loader: apply 正确挂载子插件并剥离 enabled 元字段', async () => {
  const mounted: any[] = [];
  const mockRegistry = new Map();
  const mockCtx: any = {
    registry: mockRegistry,
    plugin: async (pluginDef: any, pluginConfig: any) => {
      mounted.push({ pluginDef, pluginConfig });
      return Promise.resolve();
    },
  };

  // 显式指定 notifier 为 enabled 并带测试配置
  await apply(mockCtx, {
    plugins: {
      notifier: {
        enabled: true,
        sound: { enabled: false, volume: 3 },
      },
    },
  });

  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].pluginConfig.enabled, undefined, 'enabled 字段必须被剥离');
  assert.equal(mounted[0].pluginConfig.sound.volume, 3, '非冲突字段必须原样透传');
  // 仓库 plugins.config.json 中 notifier.sound.enabled 为 true，文件配置优先级更高（缺陷 A）。
  assert.equal(
    mounted[0].pluginConfig.sound.enabled,
    true,
    '文件配置优先级必须高于 DSH Profile Patch 传入配置',
  );
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

test('loader: enabled 为 false 时提前跳过挂载', async () => {
  const mounted: any[] = [];
  const mockRegistry = new Map();
  const mockCtx: any = {
    registry: mockRegistry,
    plugin: async (pluginDef: any, pluginConfig: any) => {
      mounted.push({ pluginDef, pluginConfig });
      return Promise.resolve();
    },
  };

  // 在临时根目录的文件层显式禁用 notifier（文件配置优先级最高，缺陷 A 修复后的正确表达位置）
  await withIsolatedRoot({ plugins: { notifier: { enabled: false } } }, async (mod) => {
    await mod.apply(mockCtx, {
      plugins: {
        notifier: {
          enabled: false,
        },
      },
    });
  });

  assert.equal(mounted.length, 0, '禁用插件不应触发 ctx.plugin');
});

test('loader: 文件配置优先级高于传入配置（缺陷 A）', async () => {
  const mounted: any[] = [];
  const mockCtx: any = {
    registry: { has: () => false },
    plugin: async (pluginDef: any, pluginConfig: any) => {
      mounted.push({ pluginDef, pluginConfig });
      return Promise.resolve();
    },
  };

  await withIsolatedRoot(
    { plugins: { notifier: { enabled: true, sound: { enabled: true }, volume: 7 } } },
    async (mod) => {
      await mod.apply(mockCtx, {
        plugins: { notifier: { enabled: true, sound: { enabled: false }, volume: 1 } },
      });
    },
  );

  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].pluginConfig.volume, 7, '文件配置标量必须覆盖传入配置');
  assert.equal(mounted[0].pluginConfig.sound.enabled, true, '文件配置深层字段必须覆盖传入配置');
});

test('loader: 单个子插件初始化异常时沙箱隔离且不拖垮宿主', async () => {
  const mockRegistry = new Map();
  const mockCtx: any = {
    registry: mockRegistry,
    plugin: async () => {
      throw new Error('模拟子插件内部错误');
    },
  };

  // 不应抛出未捕获异常
  await assert.doesNotReject(async () => {
    await apply(mockCtx, {
      plugins: {
        notifier: { enabled: true },
      },
    });
  });
});

test('loader: 插件已在注册表中时跳过重复挂载', async () => {
  const mounted: any[] = [];
  // 改用 Cordis 原生 registry.has(模块命名空间) 判定（缺陷 B）：未注册 → false，已注册 → true。
  // 这里保留 values() 形态的 mock 但 has 返回 true，用于锁定「按 name 误判」的旧行为不再生效。
  const mockRegistry = {
    has: () => true,
    values: () => [
      {
        name: 'notifier',
        callback: () => {},
      },
    ],
  };
  const mockCtx: any = {
    registry: mockRegistry,
    plugin: async (def: any, conf: any) => {
      mounted.push({ def, conf });
      return Promise.resolve();
    },
  };

  await apply(mockCtx, {
    plugins: {
      notifier: { enabled: true },
    },
  });

  assert.equal(mounted.length, 0, '已注册的同名插件应被跳过');
});

test('loader: 不同子插件导出同名 name 时不得被误吞（缺陷 B）', async () => {
  const seen: string[] = [];
  // 重现旧缺陷：registry 中已有一个 name='notifier' 的插件，但 callback 指向另一个模块命名空间。
  // 修复前 name 字符串比较恒命中，导致本次装载被静默跳过。
  const otherNamespace = { name: 'notifier', apply: () => {} };
  const mockRegistry = {
    has: (plugin: unknown) => plugin === otherNamespace,
    values: () => [{ name: 'notifier', callback: otherNamespace.apply }],
  };
  const mockCtx: any = {
    registry: mockRegistry,
    plugin: async (def: any) => {
      seen.push(String(def?.name));
      return Promise.resolve();
    },
  };

  await apply(mockCtx, { plugins: { notifier: { enabled: true } } });

  assert.equal(seen.length, 1, '不同模块的同名插件必须照常装载，不得因 name 撞车被静默跳过');
});

test('loader: fiber 未进入 ACTIVE 状态时输出中文告警（缺陷 E）', async (t) => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };
  t.after(() => {
    console.warn = originalWarn;
  });

  const mockCtx: any = {
    registry: { has: () => false },
    // 依赖未满足时 ctx.plugin 立刻返回，fiber 停在 PENDING（state=0）
    plugin: async () => ({ state: 0 }),
  };

  await apply(mockCtx, { plugins: { notifier: { enabled: true } } });

  assert.equal(warnings.length, 1, '卡在 PENDING 的插件必须告警');
  assert.match(warnings[0], /\[my-dsh-plugins\]/);
  assert.match(warnings[0], /notifier/);
  assert.match(warnings[0], /未在|未进入|等待依赖|尚未真正生效|ACTIVE/);
});

test('loader: fiber 为 ACTIVE 或 mock 未返回 fiber 时不告警（缺陷 E）', async (t) => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };
  t.after(() => {
    console.warn = originalWarn;
  });

  // state=2（ACTIVE）正常放行
  await apply(
    { registry: { has: () => false }, plugin: async () => ({ state: 2 }) } as any,
    { plugins: { notifier: { enabled: true } } },
  );
  assert.deepEqual(warnings, [], 'ACTIVE 状态不得告警');

  // mock ctx.plugin 返回 undefined 时严禁崩溃
  await assert.doesNotReject(async () => {
    await apply(
      { registry: { has: () => false }, plugin: async () => undefined } as any,
      { plugins: { notifier: { enabled: true } } },
    );
  });
  assert.deepEqual(warnings, [], 'fiber 缺失（state 不存在）时不得崩溃或误告警');
});

test('loader: 扫描结果为空时输出带 rootDir 的中文告警（缺陷 F）', async (t) => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };
  t.after(() => {
    console.warn = originalWarn;
  });

  // 临时根目录内不放置任何 dsh-* 子插件，无需改名仓库真实目录即可得到「扫描为空」
  const { rootDir, mod } = await makeIsolatedRoot(undefined, false);
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  const mounted: any[] = [];
  await mod.apply(
    {
      registry: { has: () => false },
      plugin: async (def: any) => {
        mounted.push(def);
      },
    } as any,
    { plugins: { notifier: { enabled: true } } },
  );

  assert.equal(mounted.length, 0);
  assert.equal(warnings.length, 1, '扫描为空必须告警，杜绝静默什么都不做');
  assert.match(warnings[0], /\[my-dsh-plugins\]/);
  assert.match(warnings[0], /dsh-\*/, '告警须提示未找到 dsh-* 子插件');
  assert.match(warnings[0], /根目录/);
  assert.ok(warnings[0].includes(rootDir), `告警必须带上解析出的 rootDir，实际: ${warnings[0]}`);
});
