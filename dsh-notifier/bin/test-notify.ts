#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig, type WebhookProvider } from '../src/config.ts';
import { interpolateEnvVariables } from '../src/utils/env.ts';
import { sendDesktopNotification } from '../src/channels/desktop.ts';
import { playNotificationSound } from '../src/channels/sound.ts';
import { sendWebhookNotification } from '../src/channels/webhook.ts';

// 保持对外可导入：已有测试与外部脚本从本 CLI 模块取该函数
export { interpolateEnvVariables };

/**
 * 递归向上查找仓库根目录中的配置文件。
 */
function findConfigFile(filename: string): string | undefined {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  let dir = currentDir;
  while (true) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function loadJsonFile(filepath?: string): Record<string, any> {
  if (!filepath) return {};
  try {
    const raw = fs.readFileSync(filepath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(interpolateEnvVariables(raw));
  } catch {
    return {};
  }
}

/** 解析简易 CLI 参数，如 --type=desktop --url=https://... */
function parseCliArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx).trim();
        const value = arg.slice(eqIdx + 1).trim();
        parsed[key] = value;
      } else {
        parsed[arg.slice(2).trim()] = 'true';
      }
    }
  }
  return parsed;
}

async function main() {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const type = cliArgs.type || 'all';
  const targetLocale: 'zh' | 'en' = cliArgs.locale === 'en' ? 'en' : 'zh';

  // 读取配置文件并合并
  const baseConfigPath = findConfigFile('plugins.config.json');
  const localConfigPath = findConfigFile('plugins.config.local.json');
  const baseJson = loadJsonFile(baseConfigPath);
  const localJson = loadJsonFile(localConfigPath);

  const notifierSlice = {
    ...(baseJson.plugins?.notifier || baseJson.notifier || {}),
    ...(localJson.plugins?.notifier || localJson.notifier || {}),
  };

  const resolved = resolveConfig(notifierSlice);

  // 命令行参数覆盖
  if (cliArgs.url) resolved.webhook.url = cliArgs.url;
  if (cliArgs.provider) resolved.webhook.provider = cliArgs.provider as WebhookProvider;
  if (cliArgs.secret) resolved.webhook.secret = cliArgs.secret;

  console.log(`[dsh-notifier] 🔔 开始通知渠道诊断与连通性测试 (模式: ${type})`);

  const testTitle = targetLocale === 'en' ? 'DeepSeek Harness - Test Notification' : 'DeepSeek Harness - 测试通知';
  const testMessage = targetLocale === 'en'
    ? 'This is a test notification from DSH CLI.\nIf you see this, your notification channel is working.'
    : '这是一条来自 DSH CLI 的测试通知。\n如果你看到了这条消息，说明你的通知渠道工作正常。';

  let hasError = false;

  // 1. Desktop 测试
  if (type === 'all' || type === 'desktop') {
    const started = Date.now();
    try {
      const ok = await sendDesktopNotification(testTitle, testMessage, {
        kind: 'info',
        soundEnabled: resolved.sound.enabled,
        soundKind: 'default',
      });
      const cost = Date.now() - started;
      if (ok) {
        console.log(`  ✔ [desktop] 桌面通知已发送 (${cost}ms)`);
      } else {
        console.warn(`  ✖ [desktop] 桌面通知发送失败 (${cost}ms)`);
        hasError = true;
      }
    } catch (err) {
      console.error(`  ✖ [desktop] 异常:`, err);
      hasError = true;
    }
  }

  // 2. Sound 测试
  if (type === 'all' || type === 'sound') {
    const started = Date.now();
    try {
      const ok = await playNotificationSound('default');
      const cost = Date.now() - started;
      if (ok) {
        console.log(`  ✔ [sound] 系统提示音已播放 (${cost}ms)`);
      } else {
        console.warn(`  ✖ [sound] 系统提示音播放失败 (${cost}ms)`);
        hasError = true;
      }
    } catch (err) {
      console.error(`  ✖ [sound] 异常:`, err);
      hasError = true;
    }
  }

  // 3. Webhook 测试
  if (type === 'all' || type === 'webhook') {
    const url = resolved.webhook.url?.trim();
    if (!url) {
      if (type === 'webhook') {
        console.error(`  ✖ [webhook] 未配置 Webhook 地址！请在 plugins.config.json 中配置，或通过 --url=https://... 传入`);
        hasError = true;
      } else {
        console.log(`  ℹ [webhook] 未配置 Webhook 地址，已跳过测试`);
      }
    } else {
      const started = Date.now();
      try {
        const ok = await sendWebhookNotification(
          { ...resolved.webhook, enabled: true },
          {
            title: testTitle,
            message: testMessage,
            event: 'cli/test',
            kind: 'info',
          }
        );
        const cost = Date.now() - started;
        if (ok) {
          console.log(`  ✔ [webhook] [${resolved.webhook.provider}] 推送成功 (${cost}ms) -> ${url}`);
        } else {
          console.warn(`  ✖ [webhook] [${resolved.webhook.provider}] 推送失败 (${cost}ms) -> ${url}`);
          hasError = true;
        }
      } catch (err) {
        console.error(`  ✖ [webhook] 异常:`, err);
        hasError = true;
      }
    }
  }

  console.log(`[dsh-notifier] 测试完成。`);
  if (hasError) {
    process.exitCode = 1;
  }
}

void main();
