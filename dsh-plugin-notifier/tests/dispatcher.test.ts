import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationDispatcher, formatDuration } from '../src/dispatcher.ts';
import { resolveConfig } from '../src/config.ts';

test('dispatcher: formatDuration handles normal and non-finite numbers', () => {
  assert.equal(formatDuration(15000), '15秒');
  assert.equal(formatDuration(75000), '1分15秒');
  assert.equal(formatDuration(Infinity), '未知');
  assert.equal(formatDuration(-100), '未知');
  assert.equal(formatDuration(NaN), '未知');
});

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

test('dispatcher: onTurnEnd honors events.minDurationSeconds as the filter threshold', async () => {
  let called = false;

  const config = resolveConfig({
    desktop: { enabled: true, minDurationSeconds: 1 },
    events: { onTurnEnd: true, minDurationSeconds: 30 },
  });

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async () => { called = true; return true; },
    soundFn: async () => { called = true; return true; },
    webhookFn: async () => { called = true; return true; },
  });

  // 10s 高于 desktop 阈值但低于 events 阈值，必须被抑制
  await dispatcher.onTurnEnd({
    turn: 1,
    reason: { kind: 'completed' },
    durationMs: 10000,
  });
  assert.equal(called, false, 'events.minDurationSeconds 必须优先于 desktop.minDurationSeconds');

  await dispatcher.onTurnEnd({
    turn: 2,
    reason: { kind: 'completed' },
    durationMs: 31000,
  });
  assert.equal(called, true, '超过 events 阈值时必须派发');
});

test('dispatcher: onTurnEnd keeps filtering webhook by events threshold when desktop is disabled', async () => {
  let webhookCalled = false;
  let desktopCalled = false;

  const config = resolveConfig({
    desktop: { enabled: false, minDurationSeconds: 60 },
    events: { onTurnEnd: true, minDurationSeconds: 5 },
    webhook: { enabled: true, provider: 'generic', url: 'https://example.com/hook' },
  });

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async () => { desktopCalled = true; return true; },
    soundFn: async () => true,
    webhookFn: async () => { webhookCalled = true; return true; },
  });

  // 8s：高于 events 阈值 5s，低于 desktop 阈值 60s
  await dispatcher.onTurnEnd({
    turn: 1,
    reason: { kind: 'completed' },
    durationMs: 8000,
  });

  assert.equal(desktopCalled, false, '桌面渠道关闭时不得调用 desktopFn');
  assert.equal(webhookCalled, true, 'Webhook 过滤必须使用 events 阈值，不得误用 desktop 配置');
});

test('dispatcher: onTurnEnd falls back to desktop.minDurationSeconds when events threshold absent', async () => {
  let called = false;

  // 模拟旧版配置：仅存在 desktop.minDurationSeconds（经 resolveConfig 后 events 会被回填）
  const config = resolveConfig({
    desktop: { enabled: true, minDurationSeconds: 10 },
  });
  assert.equal(config.events.minDurationSeconds, 10, 'resolveConfig 应回填 events 阈值');

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async () => { called = true; return true; },
    soundFn: async () => true,
    webhookFn: async () => true,
  });

  await dispatcher.onTurnEnd({ turn: 1, reason: { kind: 'completed' }, durationMs: 4000 });
  assert.equal(called, false, '低于旧版 desktop 阈值时应被抑制');

  await dispatcher.onTurnEnd({ turn: 2, reason: { kind: 'completed' }, durationMs: 11000 });
  assert.equal(called, true, '高于旧版 desktop 阈值时应派发');
});

test('dispatcher: onTurnEnd uses a 5-second safety fallback when thresholds are missing', async () => {
  let called = false;

  // 绕过 resolveConfig，构造缺失阈值字段的残缺配置以验证兜底逻辑
  const config = {
    desktop: { enabled: true },
    sound: { enabled: false },
    events: { onTurnEnd: true },
    webhook: { enabled: false, provider: 'generic', url: '' },
  } as any;

  const dispatcher = new NotificationDispatcher(config, {
    desktopFn: async () => { called = true; return true; },
    soundFn: async () => true,
    webhookFn: async () => true,
  });

  await dispatcher.onTurnEnd({ turn: 1, reason: { kind: 'completed' }, durationMs: 4999 });
  assert.equal(called, false, '低于 5 秒兜底阈值应被抑制');

  await dispatcher.onTurnEnd({ turn: 2, reason: { kind: 'completed' }, durationMs: 5000 });
  assert.equal(called, true, '达到 5 秒兜底阈值应派发');
});
