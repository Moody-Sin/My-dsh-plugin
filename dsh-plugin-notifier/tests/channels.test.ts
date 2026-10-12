import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeXml } from '../src/utils/xml.ts';
import { sendDesktopNotification } from '../src/channels/desktop.ts';
import { playNotificationSound } from '../src/channels/sound.ts';
import { sendWebhookNotification } from '../src/channels/webhook.ts';
import type { WebhookConfig } from '../src/config.ts';

test('channels: sendWebhookNotification constructs correct payload for feishu with secret', async () => {
  let requestedBody = '';
  const mockFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    requestedBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ code: 0 }), { status: 200 });
  };

  const feishuConfig: WebhookConfig = {
    enabled: true,
    provider: 'feishu',
    url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
    secret: 'my-feishu-secret',
  };

  const ok = await sendWebhookNotification(
    feishuConfig,
    { title: 'Secure Task', message: 'Hello', event: 'turn/end' },
    { fetchFn: mockFetch }
  );

  assert.equal(ok, true);
  const parsed = JSON.parse(requestedBody);
  assert.ok(parsed.timestamp, 'timestamp must be present when secret configured');
  assert.ok(parsed.sign, 'sign must be present when secret configured');
});

test('channels: sendWebhookNotification constructs correct payload for dingtalk with secret', async () => {
  let requestedUrl = '';
  let requestedBody = '';
  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url);
    requestedBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ errcode: 0 }), { status: 200 });
  };

  const dingConfig: WebhookConfig = {
    enabled: true,
    provider: 'dingtalk',
    url: 'https://oapi.dingtalk.com/robot/send?access_token=test',
    secret: 'my-ding-secret',
  };

  const ok = await sendWebhookNotification(
    dingConfig,
    { title: 'Ding Task', message: 'Ding content', event: 'turn/end' },
    { fetchFn: mockFetch }
  );

  assert.equal(ok, true);
  assert.ok(requestedUrl.includes('timestamp='), 'URL must include timestamp query param');
  assert.ok(requestedUrl.includes('sign='), 'URL must include sign query param');
  const parsed = JSON.parse(requestedBody);
  assert.equal(parsed.msgtype, 'markdown');
});

test('channels: sendWebhookNotification constructs correct payload for wecom and bark', async () => {
  let wecomBody = '';
  let barkBody = '';
  const mockFetchWecom = async (_url: any, init?: RequestInit) => {
    wecomBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ errcode: 0 }), { status: 200 });
  };
  const mockFetchBark = async (_url: any, init?: RequestInit) => {
    barkBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ code: 200 }), { status: 200 });
  };

  await sendWebhookNotification(
    { enabled: true, provider: 'wecom', url: 'https://qyapi.weixin.qq.com/send' },
    { title: 'WeCom Title', message: 'WeCom Msg', event: 'turn/end' },
    { fetchFn: mockFetchWecom }
  );
  assert.ok(JSON.parse(wecomBody).markdown.content.includes('WeCom Title'));

  await sendWebhookNotification(
    { enabled: true, provider: 'bark', url: 'https://api.day.app/key' },
    { title: 'Bark Title', message: 'Bark Msg', event: 'turn/end' },
    { fetchFn: mockFetchBark }
  );
  assert.equal(JSON.parse(barkBody).title, 'Bark Title');
});

test('channels: playNotificationSound supports linux platform', async () => {
  const calls: { cmd: string; args: string[] }[] = [];
  const mockExec = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return { stdout: '', stderr: '' };
  };

  const linuxSound = await playNotificationSound('default', {
    platform: 'linux',
    execFn: mockExec,
  });
  assert.equal(linuxSound, true);
  assert.equal(calls[0].cmd, 'paplay');
});

test('utils: escapeXml strips illegal XML control characters', () => {
  const textWithControl = `Hello\x00\x08World\x1B`;
  const clean = escapeXml(textWithControl);
  assert.equal(clean, 'HelloWorld');
});

test('channels: sendDesktopNotification formats commands per platform', async () => {
  const calls: { cmd: string; args: string[] }[] = [];
  const mockExec = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return { stdout: '', stderr: '' };
  };

  // Test windows
  const winSuccess = await sendDesktopNotification('Test Title', 'Test Message', {
    platform: 'win32',
    execFn: mockExec,
  });
  assert.equal(winSuccess, true);
  assert.equal(calls[0].cmd, 'powershell');
  assert.ok(calls[0].args.includes('-EncodedCommand'));

  // Test darwin
  const macSuccess = await sendDesktopNotification('Mac Title', 'Mac Message', {
    platform: 'darwin',
    execFn: mockExec,
  });
  assert.equal(macSuccess, true);
  assert.equal(calls[1].cmd, 'osascript');

  // Test linux
  const linuxSuccess = await sendDesktopNotification('Linux Title', 'Linux Message', {
    platform: 'linux',
    execFn: mockExec,
  });
  assert.equal(linuxSuccess, true);
  assert.equal(calls[2].cmd, 'notify-send');
});

test('channels: sendDesktopNotification gracefully handles execution failure', async () => {
  const failingExec = async () => {
    throw new Error('Command failed');
  };

  const success = await sendDesktopNotification('Title', 'Message', {
    platform: 'win32',
    execFn: failingExec,
  });
  assert.equal(success, false, 'Must return false on error without throwing');
});

test('channels: playNotificationSound plays sound per platform without throwing', async () => {
  const calls: { cmd: string; args: string[] }[] = [];
  const mockExec = async (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return { stdout: '', stderr: '' };
  };

  const winSound = await playNotificationSound('success', {
    platform: 'win32',
    execFn: mockExec,
  });
  assert.equal(winSound, true);
  assert.equal(calls[0].cmd, 'powershell');

  const macSound = await playNotificationSound('default', {
    platform: 'darwin',
    execFn: mockExec,
  });
  assert.equal(macSound, true);
  assert.equal(calls[1].cmd, 'afplay');
});

test('channels: sendWebhookNotification constructs correct payload for feishu', async () => {
  let requestedUrl = '';
  let requestedBody = '';

  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(url);
    requestedBody = String(init?.body ?? '');
    return new Response(JSON.stringify({ code: 0, msg: 'success' }), { status: 200 });
  };

  const feishuConfig: WebhookConfig = {
    enabled: true,
    provider: 'feishu',
    url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
  };

  const ok = await sendWebhookNotification(
    feishuConfig,
    { title: 'Task Done', message: 'All steps complete', event: 'turn/end' },
    { fetchFn: mockFetch }
  );

  assert.equal(ok, true);
  assert.equal(requestedUrl, feishuConfig.url);
  const parsed = JSON.parse(requestedBody);
  assert.equal(parsed.msg_type, 'interactive');
  assert.equal(parsed.card.header.title.content, 'Task Done');
});

test('channels: sendWebhookNotification handles network failure gracefully', async () => {
  const failingFetch = async () => {
    throw new Error('Network timeout');
  };

  const config: WebhookConfig = {
    enabled: true,
    provider: 'generic',
    url: 'https://example.com/webhook',
  };

  const ok = await sendWebhookNotification(
    config,
    { title: 'Alert', message: 'Fail', event: 'error' },
    { fetchFn: failingFetch }
  );

  assert.equal(ok, false, 'Should return false on fetch error without throwing');
});
