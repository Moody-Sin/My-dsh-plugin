import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationDispatcher } from '../src/dispatcher.ts';
import { resolveConfig } from '../src/config.ts';

test('dispatcher: onTurnEnd skips notifications when duration is below threshold', async () => {
  let desktopCalled = false;
  let soundCalled = false;
  let webhookCalled = false;

  const config = resolveConfig({
    desktop: { enabled: true, minDurationSeconds: 10 },
    events: { onTurnEnd: true },
  });

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async () => { desktopCalled = true; return true; },
    soundFn: async () => { soundCalled = true; return true; },
    webhookFn: async () => { webhookCalled = true; return true; },
  });

  // Duration is 3s < 10s threshold
  await dispatcher.onTurnEnd({
    turn: 1,
    reason: { kind: 'completed' },
    durationMs: 3000,
    sessionTitle: 'Test Session',
  });

  assert.equal(desktopCalled, false, 'Should not notify for short turn duration');
  assert.equal(soundCalled, false);
  assert.equal(webhookCalled, false);
});

test('dispatcher: onTurnEnd dispatches notifications when duration meets threshold', async () => {
  let dispatchedTitle = '';
  let dispatchedMsg = '';

  const config = resolveConfig({
    desktop: { enabled: true, minDurationSeconds: 5 },
    events: { onTurnEnd: true },
    sound: { enabled: true },
    webhook: { enabled: true, provider: 'generic', url: 'https://example.com' },
  });

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async (title, msg) => {
      dispatchedTitle = title;
      dispatchedMsg = msg;
      return true;
    },
    soundFn: async () => true,
    webhookFn: async () => true,
  });

  await dispatcher.onTurnEnd({
    turn: 2,
    reason: { kind: 'completed' },
    durationMs: 12000,
    sessionTitle: 'Heavy Task',
  });

  assert.ok(dispatchedTitle.includes('任务已完成'));
  assert.ok(dispatchedMsg.includes('Heavy Task'));
  assert.ok(dispatchedMsg.includes('12秒') || dispatchedMsg.includes('12s'));
});

test('dispatcher: onUserQuestion triggers high-priority alert notification', async () => {
  let soundKind = '';
  let desktopMsg = '';

  const config = resolveConfig({
    desktop: { enabled: true },
    sound: { enabled: true },
    events: { onQuestion: true },
  });

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async (_t, msg) => { desktopMsg = msg; return true; },
    soundFn: async (kind) => { soundKind = kind; return true; },
    webhookFn: async () => true,
  });

  await dispatcher.onUserQuestion({
    questions: [{ question: '请问需要删除历史缓存吗？' }],
    sessionTitle: 'Cache Cleanup',
  });

  assert.equal(soundKind, 'alert');
  assert.ok(desktopMsg.includes('请问需要删除历史缓存吗？'));
});

test('dispatcher: onApproval triggers approval alert notification', async () => {
  let desktopTitle = '';
  let desktopMsg = '';

  const config = resolveConfig({
    desktop: { enabled: true },
    events: { onApproval: true },
  });

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async (t, msg) => { desktopTitle = t; desktopMsg = msg; return true; },
    soundFn: async () => true,
    webhookFn: async () => true,
  });

  await dispatcher.onApproval({
    toolName: 'pwsh',
    reason: '执行系统命令重启服务',
    sessionTitle: 'Server Ops',
  });

  assert.ok(desktopTitle.includes('请求权限审批'));
  assert.ok(desktopMsg.includes('pwsh'));
  assert.ok(desktopMsg.includes('执行系统命令重启服务'));
});

test('dispatcher: respects event disabled switches', async () => {
  let called = false;

  const config = resolveConfig({
    events: { onQuestion: false },
  });

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async () => { called = true; return true; },
    soundFn: async () => { called = true; return true; },
    webhookFn: async () => { called = true; return true; },
  });

  await dispatcher.onUserQuestion({
    questions: [{ question: 'hello?' }],
  });

  assert.equal(called, false, 'Must not dispatch when event type is disabled in config');
});

test('dispatcher: onError triggers error alert notification and formats message', async () => {
  let errorTitle = '';
  let errorMsg = '';
  let errorKind = '';

  const config = resolveConfig({
    events: { onError: true },
  });

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async (t, msg) => {
      errorTitle = t;
      errorMsg = msg;
      return true;
    },
    soundFn: async (kind) => {
      errorKind = kind;
      return true;
    },
    webhookFn: async () => true,
  });

  await dispatcher.onError({
    error: new Error('Database connection failed'),
    sessionTitle: 'Crash Test',
  });

  assert.ok(errorTitle.includes('异常'));
  assert.ok(errorMsg.includes('Crash Test'));
  assert.ok(errorMsg.includes('Database connection failed'));
  assert.equal(errorKind, 'alert');
});
