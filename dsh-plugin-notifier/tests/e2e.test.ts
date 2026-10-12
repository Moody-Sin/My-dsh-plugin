import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, name, inject, Config } from '../index.js';

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
