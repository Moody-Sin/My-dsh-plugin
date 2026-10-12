import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, name, inject, Config } from '../src/index.ts';

// Mock Cordis Context
function createMockContext() {
  const listeners: Record<string, Function[]> = {};

  return {
    listeners,
    on(event: string, callback: Function) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
      return () => {
        const idx = listeners[event].indexOf(callback);
        if (idx !== -1) listeners[event].splice(idx, 1);
      };
    },
    emit(event: string, ...args: any[]) {
      const list = listeners[event] || [];
      for (const fn of list) {
        fn(...args);
      }
    },
    async waterfall(event: string, payload: any, finalNext: Function) {
      const list = listeners[event] || [];
      let index = 0;
      const next = async (): Promise<any> => {
        if (index < list.length) {
          const fn = list[index++];
          return fn(payload, next);
        }
        return finalNext();
      };
      return next();
    },
  };
}

// 模拟 Cordis 的 ctx Proxy 行为：读取未声明在 inject 中的服务属性会直接抛异常，
// 普通对象 mock（createMockContext）读任何属性都不抛，因此测不出缺陷 A。
function createProxyLikeContext(services: Record<string, any> = {}, injected: string[] = []) {
  const listeners: Record<string, Function[]> = {};

  const base: any = {
    listeners,
    on(event: string, callback: Function) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(callback);
      return () => {
        const idx = listeners[event].indexOf(callback);
        if (idx !== -1) listeners[event].splice(idx, 1);
      };
    },
    emit(event: string, ...args: any[]) {
      const list = listeners[event] || [];
      for (const fn of list) {
        fn(...args);
      }
    },
    // Cordis 公开的安全读取 API：不依赖 inject 声明，服务存在即返回，缺失返回 undefined 且不抛错。
    // 这正是本插件取 sessionTitle 的方式——因此 sessionTitle 无需写进 inject，
    // 服务缺失时插件照常激活，只是通知少个标题（而非 fiber 永久挂起导致通知全废）。
    get(name: string) {
      return Object.prototype.hasOwnProperty.call(services, name) ? services[name] : undefined;
    },
  };

  return new Proxy(base, {
    get(target: any, prop: string | symbol, receiver: any) {
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(services, prop)) {
        if (!injected.includes(prop)) {
          throw new Error(`cannot get property "${prop}" without inject`);
        }
        return services[prop];
      }
      if (typeof prop === 'string' && !(prop in target) && !injected.includes(prop)) {
        throw new Error(`cannot get property "${prop}" without inject`);
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as any;
}

function createRecordingDispatcher() {
  const calls: any = { turnEnd: undefined };
  return {
    calls,
    dispatcher: {
      onTurnEnd: async (info: any) => { calls.turnEnd = info; },
      onUserQuestion: async () => {},
      onApproval: async () => {},
      onError: async () => {},
    },
  };
}

test('plugin: exports expected Cordis interfaces', () => {
  assert.equal(name, 'notifier');
  assert.ok(Array.isArray(inject));
  assert.ok(Config);
  assert.equal(typeof apply, 'function');
});

/**
 * 本文件验证通知核心生命周期与派发逻辑。
 */
const DEFAULT_TEST_CONFIG = {};

test('plugin: attaches listeners and processes turn/start -> turn/end cycle', async () => {
  const ctx = createMockContext();
  let dispatchedTurnEnd = false;

  const mockDispatcher = {
    onTurnEnd: async () => { dispatchedTurnEnd = true; },
    onUserQuestion: async () => {},
    onApproval: async () => {},
    onError: async () => {},
  };

  apply(ctx as any, DEFAULT_TEST_CONFIG, { dispatcher: mockDispatcher as any });

  assert.ok(ctx.listeners['session/event']?.length, 'session/event must be registered');

  const session = { id: 'sess-123' };

  // Emit turn/start
  ctx.emit('session/event', session, {
    type: 'turn/start',
    data: { turn: 1 },
  });

  // Small delay
  await new Promise(r => setTimeout(r, 15));

  // Emit turn/end
  ctx.emit('session/event', session, {
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  });

  assert.equal(dispatchedTurnEnd, true, 'onTurnEnd should be triggered');
});

test('plugin: waterfall user-questions/request delegates to next() and triggers dispatcher', async () => {
  const ctx = createMockContext();
  let questionNotified = false;

  const mockDispatcher = {
    onTurnEnd: async () => {},
    onUserQuestion: async () => { questionNotified = true; },
    onApproval: async () => {},
    onError: async () => {},
  };

  apply(ctx as any, DEFAULT_TEST_CONFIG, { dispatcher: mockDispatcher as any });

  let finalNextCalled = false;
  const result = await ctx.waterfall(
    'user-questions/request',
    { questions: [{ question: 'Continue?' }] },
    async () => {
      finalNextCalled = true;
      return { answer: 'yes' };
    }
  );

  assert.equal(finalNextCalled, true, 'next() must be called in waterfall');
  assert.deepEqual(result, { answer: 'yes' });
  assert.equal(questionNotified, true, 'Question notification should be triggered');
});

test('plugin: waterfall approval/request delegates to next() and triggers dispatcher', async () => {
  const ctx = createMockContext();
  let approvalNotified = false;

  const mockDispatcher = {
    onTurnEnd: async () => {},
    onUserQuestion: async () => {},
    onApproval: async () => { approvalNotified = true; },
    onError: async () => {},
  };

  apply(ctx as any, DEFAULT_TEST_CONFIG, { dispatcher: mockDispatcher as any });

  let finalNextCalled = false;
  const result = await ctx.waterfall(
    'approval/request',
    { toolName: 'write', reason: 'Overwrite file' },
    async () => {
      finalNextCalled = true;
      return { outcome: 'allow' };
    }
  );

  assert.equal(finalNextCalled, true, 'next() must be called in waterfall');
  assert.deepEqual(result, { outcome: 'allow' });
  assert.equal(approvalNotified, true, 'Approval notification should be triggered');
});

test('plugin: inject omits sessionTitle to avoid PENDING fiber, yet title still resolves via ctx.get', () => {
  assert.ok(inject.includes('sessions'), 'inject 需保留 sessions 以兼容旧配置/旧 DSH 版本');
  assert.ok(
    !inject.includes('sessionTitle'),
    'sessionTitle 是可选增强，写进 inject 会让服务缺失时 fiber 永久挂起、通知全废'
  );

  // 即便未声明 inject，ctx.get('sessionTitle') 依然能取到服务并解析出标题
  const ctx = createProxyLikeContext(
    { sessionTitle: { get: () => ({ title: '未注入也能取到' }) } },
    inject as string[]
  );
  assert.equal(ctx.get('sessionTitle').get().title, '未注入也能取到', 'ctx.get 不依赖 inject 声明');
});

test('plugin: turn/end carries session title under Cordis Proxy-like ctx', async () => {
  const session = { id: 'sess-proxy-1' };
  const ctx = createProxyLikeContext(
    { sessionTitle: { get: (s: any) => ({ title: '修复通知插件' }) } },
    inject as string[]
  );
  const { calls, dispatcher } = createRecordingDispatcher();

  apply(ctx, DEFAULT_TEST_CONFIG, { dispatcher: dispatcher as any });

  ctx.emit('session/event', session, { type: 'turn/start', data: { turn: 1 } });
  await new Promise(r => setTimeout(r, 15));
  ctx.emit('session/event', session, {
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  });

  assert.ok(calls.turnEnd, 'onTurnEnd 应被触发');
  assert.equal(calls.turnEnd.sessionTitle, '修复通知插件', '通知正文必须带上会话标题');
});

test('plugin: falls back to session.header.cwd when sessionTitle service is missing', async () => {
  const session = { id: 'sess-proxy-2', header: { cwd: 'D:\\Project\\My-dsh-plugin' } };
  const ctx = createProxyLikeContext({}, inject as string[]);
  const { calls, dispatcher } = createRecordingDispatcher();

  apply(ctx, DEFAULT_TEST_CONFIG, { dispatcher: dispatcher as any });

  ctx.emit('session/event', session, {
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  });

  assert.ok(calls.turnEnd, 'onTurnEnd 应被触发');
  assert.equal(calls.turnEnd.sessionTitle, 'D:\\Project\\My-dsh-plugin', '缺失 sessionTitle 时应回退到 header.cwd');
});

test('plugin: returns undefined session title without throwing when no source exists', async () => {
  const session = { id: 'sess-proxy-3' };
  const ctx = createProxyLikeContext({}, inject as string[]);
  const { calls, dispatcher } = createRecordingDispatcher();

  apply(ctx, DEFAULT_TEST_CONFIG, { dispatcher: dispatcher as any });

  assert.doesNotThrow(() => {
    ctx.emit('session/event', session, {
      type: 'turn/end',
      data: { turn: 1, reason: { kind: 'completed' } },
    });
  }, '无任何标题来源时不得抛错');

  assert.ok(calls.turnEnd, 'onTurnEnd 应被触发');
  assert.equal(calls.turnEnd.sessionTitle, undefined, '无标题来源时应返回 undefined');
});

test('plugin: still dispatches notifications when sessionTitle service is absent entirely', async () => {
  // 模拟最坏情况：sessionTitle 服务完全不存在，且 session 也没有 header.cwd。
  // 因为 sessionTitle 未写进 inject，插件不会挂起，通知必须照发（只是没有标题行）。
  const session = { id: 'sess-no-title' };
  const ctx = createProxyLikeContext({}, inject as string[]);
  const { calls, dispatcher } = createRecordingDispatcher();

  assert.doesNotThrow(() => {
    apply(ctx, DEFAULT_TEST_CONFIG, { dispatcher: dispatcher as any });
  }, '服务缺失时插件装载不得抛错');

  assert.ok(ctx.listeners['session/event']?.length, 'session/event 监听器必须注册成功（插件已激活）');

  ctx.emit('session/event', session, { type: 'turn/start', data: { turn: 1 } });
  await new Promise(r => setTimeout(r, 15));
  ctx.emit('session/event', session, {
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  });

  assert.ok(calls.turnEnd, '服务缺失时通知仍须派发，不得因取标题失败而丢弃');
  assert.equal(calls.turnEnd.sessionTitle, undefined, '标题缺失时仅无标题行，不影响其余字段');
  assert.equal(calls.turnEnd.turn, 1, '轮次等主体信息必须照常携带');
});

test('plugin: 新增 locale 与 Webhook 渠道配置可通过入口 Schema 解析', () => {
  const parsed = Config({
    locale: 'en',
    webhook: {
      enabled: true,
      provider: 'telegram',
      url: 'https://api.telegram.org/botTOKEN/sendMessage',
      secret: '42',
    },
  });

  assert.equal(parsed.locale, 'en');
  assert.equal(parsed.webhook.provider, 'telegram');
  assert.equal(parsed.webhook.secret, '42');
});

