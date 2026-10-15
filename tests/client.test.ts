import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

describe('Client Script Bundle', () => {
  it('should verify client registration logic syntax and exports in source', () => {
    const clientTs = fs.readFileSync(path.join(process.cwd(), 'src/client.tsx'), 'utf8');
    assert.ok(clientTs.includes('settings.plugins.tab'));
    assert.ok(clientTs.includes('__ModuleLoader__'));
    assert.ok(clientTs.includes('@local/my-dsh-plugins'));
    assert.ok(clientTs.includes('export const inject'));
    assert.ok(clientTs.includes('export function apply'));
  });

  it('should execute client bundle in browser-like environment without top-level require errors', () => {
    const clientJs = fs.readFileSync(path.join(process.cwd(), 'client.js'), 'utf8');

    // 浏览器沙箱环境：不提供全局 require，模拟 DSH 浏览器的 module loader
    const sandbox: any = {
      window: {},
      document: {
        createElement: () => ({ setAttribute() {}, appendChild() {} }),
        head: { appendChild() {} },
        querySelectorAll: () => [],
      },
      console,
    };
    sandbox.globalThis = sandbox.window;
    sandbox.window.__ModuleLoader__ = {
      mode: 'queue',
      pendingQueue: [],
      load(reg: any) {
        this.pendingQueue.push(reg);
      },
    };

    // 执行 client.js，绝不得抛出 "Dynamic require is not supported" 或其他异常
    assert.doesNotThrow(() => {
      vm.runInNewContext(clientJs, sandbox);
    });

    // 验证成功注册进 __ModuleLoader__
    const queue = sandbox.window.__ModuleLoader__.pendingQueue;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].id, '@local/my-dsh-plugins');
    assert.equal(typeof queue[0].factory, 'function');

    // 模拟 DSH 模块系统 materialize 阶段（通过 factory 传入运行时提供的 require）
    const fakeReact = {
      createElement: (type: any, props: any, ...children: any[]) => ({
        type,
        props,
        children,
      }),
      useState: (initial: any) => [initial, () => {}],
      useEffect: () => {},
    };

    const pluginExports = queue[0].factory((spec: string) => {
      if (spec === 'react') return fakeReact;
      if (spec === 'react-dom') return {};
      throw new Error(`Unexpected require: ${spec}`);
    });

    assert.ok(pluginExports, 'factory should return module exports');
    assert.ok(Array.isArray(pluginExports.inject), 'plugin should export inject array');
    assert.ok(pluginExports.inject.includes('slots'), 'inject should include slots');
    assert.ok(!pluginExports.inject.includes('locale'), 'inject should not include non-existent locale');
    assert.equal(typeof pluginExports.apply, 'function', 'plugin should export apply function');

    // 模拟 Cordis 宿主调用 apply(ctx)
    let registeredSlot: any = null;
    const fakeCtx = {
      slots: {
        inject(name: string, callback: () => void) {
          callback();
        },
        register(slotDef: any, component: any) {
          registeredSlot = { slotDef, component };
        },
      },
    };

    assert.doesNotThrow(() => {
      pluginExports.apply(fakeCtx);
    });

    assert.ok(registeredSlot, 'should have registered settings.plugins.tab slot');
    assert.equal(registeredSlot.slotDef.name, 'settings.plugins.tab');
    assert.equal(registeredSlot.slotDef.id, 'local-plugins-config');
  });

  it('should be idempotent and not register duplicate factories when executed multiple times', () => {
    const clientJs = fs.readFileSync(path.join(process.cwd(), 'client.js'), 'utf8');

    const sandbox: any = {
      window: {},
      document: {
        createElement: () => ({ setAttribute() {}, appendChild() {} }),
        head: { appendChild() {} },
        querySelectorAll: () => [],
      },
      console,
    };
    sandbox.globalThis = sandbox.window;
    sandbox.window.__ModuleLoader__ = {
      mode: 'queue',
      pendingQueue: [],
      load(reg: any) {
        this.pendingQueue.push(reg);
      },
    };

    vm.runInNewContext(clientJs, sandbox);
    // 第二次执行模拟内联注入重复加载
    vm.runInNewContext(clientJs, sandbox);

    // 队列中仍然应仅有一项，杜绝 duplicate factory registration 崩溃
    assert.equal(sandbox.window.__ModuleLoader__.pendingQueue.length, 1);
  });
});

