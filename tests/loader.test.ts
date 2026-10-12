import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, resolveProjectRoot, name, Config } from '../src/index.ts';

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
        sound: { enabled: false },
      },
    },
  });

  assert.equal(mounted.length, 1);
  assert.equal(mounted[0].pluginConfig.enabled, undefined, 'enabled 字段必须被剥离');
  assert.equal(mounted[0].pluginConfig.sound.enabled, false);
});

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

  // 显式禁用 notifier
  await apply(mockCtx, {
    plugins: {
      notifier: {
        enabled: false,
      },
    },
  });

  assert.equal(mounted.length, 0, '禁用插件不应触发 ctx.plugin');
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
  // 模拟 registry 已存在该插件
  const mockRegistry = {
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
