import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, name, inject, Config } from '../index.js';
import { NotificationDispatcher } from '../src/dispatcher.ts';
import { resolveConfig } from '../src/config.ts';

test('e2e: bundled index.js successfully runs full lifecycle', async () => {
  assert.equal(name, 'notifier');
  assert.deepEqual(inject, ['sessions']);
  assert.ok(Config);

  const eventsRecorded: string[] = [];

  const ctx: any = {
    listeners: {} as Record<string, Function[]>,
    on(event: string, callback: Function) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    },
    emit(event: string, ...args: any[]) {
      for (const fn of this.listeners[event] || []) {
        fn(...args);
      }
    },
    async waterfall(event: string, payload: any, nextFn: Function) {
      const list = this.listeners[event] || [];
      let i = 0;
      const next = async (): Promise<any> => {
        if (i < list.length) {
          return list[i++](payload, next);
        }
        return nextFn();
      };
      return next();
    },
    sessionTitle: {
      get: (session: any) => ({ title: `Session Title for ${session.id}` }),
    },
  };

  const testConfig = {
    desktop: { enabled: true, minDurationSeconds: 0 },
    sound: { enabled: true },
    events: {
      onTurnEnd: true,
      onQuestion: true,
      onApproval: true,
      onError: true,
    },
    webhook: {
      enabled: true,
      provider: 'generic',
      url: 'https://httpbin.org/post',
    },
  };

  // Mock channels
  const mockDispatcher = {
    onTurnEnd: async (info: any) => {
      eventsRecorded.push(`turnEnd:${info.turn}:${info.sessionTitle}`);
    },
    onUserQuestion: async (info: any) => {
      eventsRecorded.push(`question:${info.questions[0].question}`);
    },
    onApproval: async (info: any) => {
      eventsRecorded.push(`approval:${info.toolName}`);
    },
    onError: async (info: any) => {
      eventsRecorded.push(`error:${info.error}`);
    },
  };

  apply(ctx, testConfig, { dispatcher: mockDispatcher as any });

  // 1. Test turn lifecycle
  ctx.emit('session/event', { id: 'sess-e2e' }, {
    type: 'turn/start',
    data: { turn: 1 },
  });
  await new Promise(r => setTimeout(r, 10));
  ctx.emit('session/event', { id: 'sess-e2e' }, {
    type: 'turn/end',
    data: { turn: 1, reason: { kind: 'completed' } },
  });

  // 2. Test user questions
  await ctx.waterfall('user-questions/request', {
    questions: [{ question: 'What is next?' }],
  }, async () => ({ answer: 'proceed' }));

  // 3. Test approvals
  await ctx.waterfall('approval/request', {
    toolName: 'bash',
    reason: 'Run deploy',
  }, async () => ({ outcome: 'allow' }));

  // 4. Test error
  ctx.emit('agent/error', {
    error: 'Model timeout',
    turn: 1,
    step: 2,
  });

  assert.ok(eventsRecorded.includes('turnEnd:1:Session Title for sess-e2e'));
  assert.ok(eventsRecorded.includes('question:What is next?'));
  assert.ok(eventsRecorded.includes('approval:bash'));
  assert.ok(eventsRecorded.includes('error:Model timeout'));
});

test('e2e: bundled plugin filters turns by events.minDurationSeconds with desktop disabled', async () => {
  const dispatched: string[] = [];
  const config = resolveConfig({
    desktop: { enabled: false, minDurationSeconds: 1 },
    sound: { enabled: false },
    events: { onTurnEnd: true, minDurationSeconds: 20 },
    webhook: { enabled: true, provider: 'generic', url: 'https://example.com/hook' },
  });

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async () => { dispatched.push('desktop'); return true; },
    soundFn: async () => { dispatched.push('sound'); return true; },
    webhookFn: async () => { dispatched.push('webhook'); return true; },
  });

  const ctx: any = {
    listeners: {} as Record<string, Function[]>,
    on(event: string, callback: Function) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(callback);
    },
    emit(event: string, ...args: any[]) {
      for (const fn of this.listeners[event] || []) fn(...args);
    },
  };

  apply(ctx, config, { dispatcher: dispatcher as any });

  const realNow = Date.now;
  try {
    // 第一轮：真实耗时约 30ms，远低于 events 阈值 20 秒 —— 必须被抑制
    ctx.emit('session/event', { id: 'sess-threshold' }, { type: 'turn/start', data: { turn: 1 } });
    await new Promise((r) => setTimeout(r, 30));
    ctx.emit('session/event', { id: 'sess-threshold' }, {
      type: 'turn/end',
      data: { turn: 1, reason: { kind: 'completed' } },
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(dispatched, [], '短轮次必须被 events.minDurationSeconds 抑制');

    // 第二轮：伪造时钟推进 25 秒，超过 events 阈值 —— 仅 Webhook 派发，桌面渠道关闭
    let offset = 0;
    Date.now = () => realNow() + offset;
    ctx.emit('session/event', { id: 'sess-threshold' }, { type: 'turn/start', data: { turn: 2 } });
    offset = 25000;
    ctx.emit('session/event', { id: 'sess-threshold' }, {
      type: 'turn/end',
      data: { turn: 2, reason: { kind: 'completed' } },
    });
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    Date.now = realNow;
  }

  assert.deepEqual(
    dispatched,
    ['webhook'],
    '超过阈值后应仅派发 Webhook：desktop 已关闭，且过滤阈值来自 events 而非 desktop 配置'
  );
});
