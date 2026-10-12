import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeXml } from '../src/utils/xml.ts';
import { sendDesktopNotification } from '../src/channels/desktop.ts';
import { playNotificationSound } from '../src/channels/sound.ts';
import { sendWebhookNotification } from '../src/channels/webhook.ts';
import type { WebhookConfig } from '../src/config.ts';

test('utils: escapeXml handles XML entities', () => {
  const raw = `Tom & Jerry <cartoon> "fun" 'cat'`;
  const escaped = escapeXml(raw);
  assert.equal(escaped, 'Tom &amp; Jerry &lt;cartoon&gt; &quot;fun&quot; &apos;cat&apos;');
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
