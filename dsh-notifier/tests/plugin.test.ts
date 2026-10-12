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

test('plugin: exports expected Cordis interfaces', () => {
  assert.equal(name, 'notifier');
  assert.ok(Array.isArray(inject));
  assert.ok(Config);
  assert.equal(typeof apply, 'function');
});

test('plugin: attaches listeners and processes turn/start -> turn/end cycle', async () => {
  const ctx = createMockContext();
  let dispatchedTurnEnd = false;

  const mockDispatcher = {
    onTurnEnd: async () => { dispatchedTurnEnd = true; },
    onUserQuestion: async () => {},
    onApproval: async () => {},
    onError: async () => {},
  };

  apply(ctx as any, {}, { dispatcher: mockDispatcher as any });

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

  apply(ctx as any, {}, { dispatcher: mockDispatcher as any });

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

  apply(ctx as any, {}, { dispatcher: mockDispatcher as any });

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
