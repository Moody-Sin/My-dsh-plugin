import test from 'node:test';
import assert from 'node:assert/strict';
import { NotificationDispatcher, formatDuration } from '../src/dispatcher.ts';
import { resolveConfig } from '../src/config.ts';
import { resolveLocale } from '../src/utils/i18n.ts';

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
    locale: 'zh',
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
    platform: 'linux',
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
    locale: 'zh',
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
    locale: 'zh',
    events: { onError: true },
  });

  const dispatcher = new NotificationDispatcher(config, {
    platform: 'linux',
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

test('dispatcher: formatDuration 支持中英文小时、分钟、秒与未知值', () => {
  assert.equal(formatDuration(3_661_000, 'zh'), '1小时1分1秒');
  assert.equal(formatDuration(3_661_000, 'en'), '1h 1m 1s');
  assert.equal(formatDuration(75_000, 'en'), '1m 15s');
  assert.equal(formatDuration(15_000, 'en'), '15s');
  assert.equal(formatDuration(Infinity, 'en'), 'Unknown');
});

test('dispatcher: auto locale 按 DSH_LOCALE、LANG、LC_ALL 顺序解析', () => {
  assert.equal(resolveLocale('auto', { DSH_LOCALE: 'en-US', LANG: 'zh_CN', LC_ALL: 'zh_CN' }), 'en');
  assert.equal(resolveLocale('auto', { LANG: 'en_GB', LC_ALL: 'zh_CN' }), 'en');
  assert.equal(resolveLocale('auto', { LC_ALL: 'en_US.UTF-8' }), 'en');
  assert.equal(resolveLocale('auto', { DSH_LOCALE: 'zh-CN', LANG: 'en_US' }), 'zh');
  assert.equal(resolveLocale('auto', {}), 'zh');
});

test('dispatcher: 英文配置翻译标题与全部字段标签', async () => {
  const records: { title: string; message: string }[] = [];
  const config = resolveConfig({
    locale: 'en',
    desktop: { enabled: true },
    sound: { enabled: false },
    events: { minDurationSeconds: 0 },
  });
  const dispatcher = new NotificationDispatcher(config, {
    platform: 'linux',
    debounceMs: 0,
    desktopFn: async (title, message) => {
      records.push({ title, message });
      return true;
    },
  });

  await dispatcher.onTurnEnd({
    turn: 7,
    reason: { kind: 'cancelled' },
    durationMs: 3_661_000,
    sessionTitle: 'Release',
  });
  await dispatcher.onUserQuestion({ questions: [{ question: 'Continue?' }], sessionTitle: 'Release' });
  await dispatcher.onApproval({ toolName: 'pwsh', reason: 'Deploy', sessionTitle: 'Release' });
  await dispatcher.onError({ error: new Error('Boom'), sessionTitle: 'Release' });

  assert.equal(records[0].title, 'DeepSeek Harness - Task Ended');
  assert.match(records[0].message, /Session: Release/);
  assert.match(records[0].message, /Turn: #7 · Duration: 1h 1m 1s/);
  assert.match(records[0].message, /Status: cancelled/);
  assert.equal(records[1].title, 'DeepSeek Harness - Waiting for Response');
  assert.equal(records[2].title, 'DeepSeek Harness - Approval Requested');
  assert.match(records[2].message, /Tool: pwsh/);
  assert.match(records[2].message, /Reason: Deploy/);
  assert.equal(records[3].title, 'DeepSeek Harness - Task Error');
  assert.match(records[3].message, /Error: Boom/);
});

test('dispatcher: Windows 桌面与声音同时开启时仅调用 desktopFn 并委托内联声音', async () => {
  let desktopCalls = 0;
  let soundCalls = 0;
  let receivedOptions: any;
  const dispatcher = new NotificationDispatcher(resolveConfig({
    desktop: { enabled: true },
    sound: { enabled: true },
    events: { minDurationSeconds: 0 },
  }), {
    platform: 'win32',
    desktopFn: async (_title, _message, options) => {
      desktopCalls += 1;
      receivedOptions = options;
      return true;
    },
    soundFn: async () => { soundCalls += 1; return true; },
  });

  await dispatcher.onUserQuestion({ questions: [{ question: '确认？' }], sessionTitle: '会话 A' });

  assert.equal(desktopCalls, 1);
  assert.equal(soundCalls, 0, 'Windows 不得再启动第二个声音子进程');
  assert.equal(receivedOptions.soundEnabled, true);
  assert.equal(receivedOptions.soundKind, 'alert');
  assert.equal(receivedOptions.kind, 'warning');
  assert.equal(receivedOptions.subtitle, '会话 A');
});

test('dispatcher: Windows 仅启用声音时独立调用 soundFn', async () => {
  let desktopCalls = 0;
  let soundCalls = 0;
  const dispatcher = new NotificationDispatcher(resolveConfig({
    desktop: { enabled: false }, sound: { enabled: true }, events: { minDurationSeconds: 0 },
  }), {
    platform: 'win32',
    desktopFn: async () => { desktopCalls += 1; return true; },
    soundFn: async () => { soundCalls += 1; return true; },
  });

  await dispatcher.onTurnEnd({ turn: 1, reason: { kind: 'completed' }, durationMs: 1_000 });
  assert.equal(desktopCalls, 0);
  assert.equal(soundCalls, 1);
});

test('dispatcher: Windows 关闭声音时弹窗保持静音且不播放提示音', async () => {
  let soundCalls = 0;
  let receivedOptions: any;
  const dispatcher = new NotificationDispatcher(resolveConfig({
    desktop: { enabled: true }, sound: { enabled: false }, events: { minDurationSeconds: 0 },
  }), {
    platform: 'win32',
    desktopFn: async (_title, _message, options) => {
      receivedOptions = options;
      return true;
    },
    soundFn: async () => { soundCalls += 1; return true; },
  });

  await dispatcher.onTurnEnd({ turn: 1, reason: { kind: 'completed' }, durationMs: 1_000 });

  assert.equal(soundCalls, 0);
  assert.equal(receivedOptions.soundEnabled, false, '关闭声音时必须回落到静音 Toast');
});

test('dispatcher: 非 Windows 平台继续分别调用桌面与声音渠道', async () => {
  const calls: string[] = [];
  const dispatcher = new NotificationDispatcher(resolveConfig({
    desktop: { enabled: true }, sound: { enabled: true }, events: { minDurationSeconds: 0 },
  }), {
    platform: 'darwin',
    desktopFn: async (_title, message, options) => {
      calls.push('desktop');
      assert.equal(options?.subtitle, 'macOS 会话');
      assert.ok(!message.includes('会话:'), 'macOS message 不应重复 subtitle 中的会话名');
      return true;
    },
    soundFn: async () => { calls.push('sound'); return true; },
  });

  await dispatcher.onTurnEnd({
    turn: 1, reason: { kind: 'completed' }, durationMs: 1_000, sessionTitle: 'macOS 会话',
  });
  assert.deepEqual(calls.sort(), ['desktop', 'sound']);
});

test('dispatcher: 200ms 内完全相同事件去重且过期后重新派发', async () => {
  let now = 1_000;
  let calls = 0;
  const dispatcher = new NotificationDispatcher(resolveConfig({
    desktop: { enabled: true }, sound: { enabled: false }, events: { minDurationSeconds: 0 },
  }), {
    platform: 'linux',
    nowFn: () => now,
    desktopFn: async () => { calls += 1; return true; },
  });
  const event = { questions: [{ question: '是否继续？' }], sessionTitle: '防抖测试' };

  await dispatcher.onUserQuestion(event);
  now = 1_100;
  await dispatcher.onUserQuestion(event);
  assert.equal(calls, 1, '防抖窗口内重复事件必须被抑制');

  now = 1_201;
  await dispatcher.onUserQuestion(event);
  assert.equal(calls, 2, '窗口过期后相同事件必须重新派发');

  await dispatcher.onUserQuestion({ questions: [{ question: '另一个问题？' }], sessionTitle: '防抖测试' });
  assert.equal(calls, 3, '内容不同的事件不得被误抑制');
});

