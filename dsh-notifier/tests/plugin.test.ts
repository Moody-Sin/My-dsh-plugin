import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, name, inject, Config, sendTestNotification } from '../src/index.ts';

import { resolveConfig } from '../src/config.ts';
import { NotificationDispatcher } from '../src/dispatcher.ts';

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

  // 轮次计时表已提升为**模块级**，因此 apply() 不再需要 effect 清理回调：
  // 热重载走 Cordis restart()，清空计时表会让「start 在重载前、end 在重载后」的轮次
  // 耗时归零并被 minDurationSeconds 过滤掉，该轮结束通知随之丢失。
  // 监听器由 Cordis 随 fiber 自动注销，计时表靠容量淘汰 + TTL 回收，二者都不需要手动清理。
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
  assert.deepEqual([...inject], [], 'inject 必须为空：插件从不使用会话存储，声明硬依赖会让服务缺失时 fiber 永久 PENDING');
  assert.ok(
    ![...inject].includes('sessionTitle'),
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


test('plugin: 热重载（restart）后仍能为「start 在重载前」的轮次算出真实耗时', async () => {
  // 聚合总线热重载子插件时走 Cordis restart()，即 dispose 再 apply。
  // 若轮次计时表声明在 apply() 内，重载会把它清空，于是
  // 「turn/start 在重载前、turn/end 在重载后」的轮次取不到 startTime，
  // 耗时被保守记为 0 → 被 minDurationSeconds 过滤 → **该轮结束通知静默丢失**。
  // 计时表提升到模块级后，跨重载的轮次必须仍能算出真实耗时。
  const durations: number[] = [];
  const mockDispatcher = {
    onTurnEnd: async (info: any) => { durations.push(info.durationMs); },
    onUserQuestion: async () => {},
    onApproval: async () => {},
    onError: async () => {},
  };

  const firstCtx = createMockContext();
  apply(firstCtx as any, { events: { onTurnEnd: true, minDurationSeconds: 5 } }, {
    dispatcher: mockDispatcher as any,
  });

  const session = { id: 'sess-restart' };
  const realNow = Date.now;
  try {
    // 1) 重载前记录 turn/start
    firstCtx.emit('session/event', session, { type: 'turn/start', data: { turn: 1 } });

    // 2) 模拟热重载：旧实例销毁 + 新实例 apply（计时表不得被清空）
    const secondCtx = createMockContext();
    apply(secondCtx as any, { events: { onTurnEnd: true, minDurationSeconds: 5 } }, {
      dispatcher: mockDispatcher as any,
    });

    // 3) 重载后收到 turn/end，人为推进时钟 20 秒，远超 5 秒阈值
    let offset = 0;
    Date.now = () => realNow() + offset;
    offset = 20_000;
    secondCtx.emit('session/event', session, {
      type: 'turn/end',
      data: { turn: 1, reason: { kind: 'completed' } },
    });
  } finally {
    Date.now = realNow;
  }

  assert.equal(durations.length, 1, '必须派发一次 turn/end 通知');
  assert.ok(
    durations[0] >= 20_000,
    `跨重载的轮次必须算出真实耗时（期望 >= 20000ms，实际 ${durations[0]}ms），` +
      '否则会被 minDurationSeconds 过滤导致通知丢失',
  );
});

test('plugin: sendTestNotification 真实调用已启用渠道，不返回假成功', async () => {
  const calls: string[] = [];
  const config = resolveConfig({
    locale: 'zh',
    desktop: { enabled: true },
    sound: { enabled: false },
    events: { onTurnEnd: true, minDurationSeconds: 0 },
    webhook: { enabled: false, provider: 'generic', url: '' },
  });

  const dispatched: any[] = [];
  const mockDispatcher = {
    sendRaw: async (title: string, message: string, _kind: string, channel: string) => {
      calls.push(channel);
      dispatched.push({ title, message });
      return true;
    },
  };

  // 通过依赖注入验证诊断入口：它必须走真实派发路径，而不是凭空返回 ok
  const result = await sendTestNotification(config, { dispatcher: mockDispatcher as any });

  assert.deepEqual(calls, ['desktop'], '桌面已启用而声音/Webhook 关闭，只应触发桌面渠道一次');
  assert.equal(result.ok, true);
  assert.ok(result.desktop, '桌面渠道已启用，应报告成功');
  assert.ok(result.message, '必须回传可读的诊断结论');
  assert.ok(
    dispatched[0]?.title?.includes('测试通知'),
    '诊断消息文案必须来自词典，避免中英文环境错乱',
  );
});

test('plugin: sendTestNotification 各渠道独立统计，Webhook 失败不得误报桌面失败', async () => {
  // 回归：曾用「一次 sendRaw 派发多个渠道 + 聚合布尔返回值」，导致
  //  1) Webhook 被连发两次（第一步无选项时已发过，第三步又显式发一次）；
  //  2) Webhook 失败时把明明成功弹窗的桌面渠道也标记为 false（误报）。
  // 现在每个渠道独立调用、独立统计，用**真实 dispatcher** 验证调用次数与归属。
  const hits = { desktop: 0, sound: 0, webhook: 0 };

  const config = resolveConfig({
    locale: 'zh',
    desktop: { enabled: true },
    sound: { enabled: true },
    events: { onTurnEnd: true, minDurationSeconds: 0 },
    webhook: { enabled: true, provider: 'generic', url: 'https://bad.example/hook' },
  });

  // 用真实 NotificationDispatcher，仅替换三个渠道实现以观测真实派发行为
  const dispatcher = new NotificationDispatcher(config, {
    platform: 'linux',
    debounceMs: 0,
    desktopFn: async () => { hits.desktop++; return true; },
    soundFn: async () => { hits.sound++; return true; },
    // Webhook 刻意失败：不应影响其它渠道的统计结果
    webhookFn: async () => { hits.webhook++; return false; },
  });

  const result = await sendTestNotification(config, { dispatcher });

  assert.equal(hits.desktop, 1, '桌面渠道必须且只能被触发 1 次');
  assert.equal(hits.sound, 1, '提示音渠道必须且只能被触发 1 次（不得被桌面测试连带触发）');
  assert.equal(hits.webhook, 1, 'Webhook 必须且只能被触发 1 次（修复前会连发 2 次）');

  assert.equal(result.desktop, true, '桌面弹窗成功，绝不能因 Webhook 失败而被误报为失败');
  assert.equal(result.sound, true, '提示音成功，同样不受 Webhook 影响');
  assert.equal(result.webhook, false, 'Webhook 确实失败，应如实报告');
  assert.equal(result.ok, false, '存在失败渠道时整体不得报告成功');
});

test('plugin: 桌面渠道独立诊断时不内联提示音（避免与声音测试重复）', async () => {
  const optionsSeen: any[] = [];
  const config = resolveConfig({
    locale: 'zh',
    desktop: { enabled: true },
    sound: { enabled: false },
    events: { onTurnEnd: true, minDurationSeconds: 0 },
  });

  // 即便在 Windows 上（历史上会把声音内联进 Toast），独立诊断也不得带声音
  const dispatcher = new NotificationDispatcher(config, {
    platform: 'win32',
    debounceMs: 0,
    desktopFn: async (_t, _m, options) => { optionsSeen.push(options); return true; },
    soundFn: async () => true,
  });

  await sendTestNotification(config, { dispatcher });

  assert.equal(optionsSeen.length, 1);
  assert.equal(
    optionsSeen[0]?.soundEnabled,
    false,
    '桌面渠道的独立诊断必须关闭内联声音，否则会与声音渠道的测试重复发声',
  );
});

