import crypto from 'node:crypto';
import type { WebhookConfig } from '../config.ts';

export interface WebhookPayload {
  title: string;
  message: string;
  event: string;
  kind?: 'info' | 'success' | 'warning' | 'error';
  metadata?: Record<string, any>;
}

export interface WebhookOptions {
  fetchFn?: typeof fetch;
  /** 高优先级事件重试前的退避延迟（毫秒），默认 400，测试可传 0。 */
  retryDelayMs?: number;
  /** 自定义日志输出，默认 console.warn */
  logFn?: (msg: string, ...args: unknown[]) => void;
}

/** 各渠道单条消息正文最大安全字符数，防止超长报错导致 HTTP 400 失败 */
const MAX_WEBHOOK_MESSAGE_CHARS = 3000;

/** DSH Web GUI 控制台地址，作为 Bark 通知的默认点击跳转目标。 */
const DEFAULT_BARK_URL = 'http://127.0.0.1:3080';

/** 高优先级事件：需要用户立即响应的提问/审批，或告警级通知。 */
export function isHighPriorityEvent(event: string, kind?: string): boolean {
  return (
    event === 'user-questions/request' ||
    event === 'approval/request' ||
    kind === 'warning' ||
    kind === 'error'
  );
}

/** 判断 URL 查询串中是否已存在指定参数（用于避免 Telegram chat_id 被 secret 重复覆盖）。 */
function hasQueryParam(url: string, name: string): boolean {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return false;
  }
  const query = url.slice(queryIndex + 1).split('#')[0];
  return query
    .split('&')
    .some((pair) => decodeURIComponent(pair.split('=')[0] ?? '').trim() === name);
}

function generateFeishuSign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac('sha256', stringToSign).digest('base64');
}

function generateDingTalkSign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return encodeURIComponent(
    crypto.createHmac('sha256', secret).update(stringToSign).digest('base64')
  );
}

/** 转义 Telegram HTML 实体字符，避免正文特殊符号破坏消息结构 */
function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendWebhookNotification(
  config: WebhookConfig,
  payload: WebhookPayload,
  options: WebhookOptions = {}
): Promise<boolean> {
  if (!config.enabled || !config.url) {
    return false;
  }

  const fetchImpl = options.fetchFn || globalThis.fetch;
  if (!fetchImpl) {
    return false;
  }

  try {
    let targetUrl = config.url;
    let body: any;
    const { title, message: rawMessage, event, kind = 'info', metadata } = payload;

    // 安全长度截断保护：防止超大堆栈/报错日志突破 Telegram/飞书/企微/Discord 单条大小限制
    const message =
      rawMessage && rawMessage.length > MAX_WEBHOOK_MESSAGE_CHARS
        ? `${rawMessage.slice(0, MAX_WEBHOOK_MESSAGE_CHARS - 20)}\n...[已截断]`
        : rawMessage;

    switch (config.provider) {
      case 'feishu': {
        const templateColor = kind === 'error' ? 'red' : kind === 'warning' ? 'orange' : 'blue';
        body = {
          msg_type: 'interactive',
          card: {
            header: {
              title: { tag: 'plain_text', content: title },
              template: templateColor,
            },
            elements: [
              {
                tag: 'div',
                text: { tag: 'lark_md', content: message },
              },
            ],
          },
        };

        if (config.secret) {
          const timestamp = Math.floor(Date.now() / 1000);
          const sign = generateFeishuSign(config.secret, timestamp);
          body.timestamp = String(timestamp);
          body.sign = sign;
        }
        break;
      }

      case 'dingtalk': {
        if (config.secret) {
          const timestamp = Date.now();
          const sign = generateDingTalkSign(config.secret, timestamp);
          const sep = targetUrl.includes('?') ? '&' : '?';
          targetUrl = `${targetUrl}${sep}timestamp=${timestamp}&sign=${sign}`;
        }

        body = {
          msgtype: 'markdown',
          markdown: {
            title,
            text: `### ${title}\n\n${message}`,
          },
        };
        break;
      }

      case 'wecom': {
        body = {
          msgtype: 'markdown',
          markdown: {
            content: `### ${title}\n\n${message}`,
          },
        };
        break;
      }

      case 'bark': {
        body = {
          title,
          body: message,
          group: 'DeepSeek Harness',
          // 点击通知直接跳转 DSH 控制台；metadata.url 可覆盖为更具体的地址
          url: metadata?.url || DEFAULT_BARK_URL,
          badge: kind === 'error' ? 2 : 1,
        };
        break;
      }

      case 'telegram': {
        // Telegram Bot API：使用稳健的 HTML 模式，避免 Markdown 下划线或星号被误判为语法导致 400 失败；
        // secret 作为 chat_id 的便捷配置入口；URL 查询串已自带 chat_id 时以 URL 为准。
        const escapedTitle = escapeTelegramHtml(title);
        const escapedMessage = escapeTelegramHtml(message);
        body = {
          text: `<b>${escapedTitle}</b>\n\n${escapedMessage}`,
          parse_mode: 'HTML',
        };
        if (config.secret && !hasQueryParam(targetUrl, 'chat_id')) {
          body.chat_id = config.secret;
        }
        break;
      }

      case 'discord': {
        const embedColor =
          kind === 'error'
            ? 0xff0000
            : kind === 'warning'
              ? 0xffa500
              : kind === 'success'
                ? 0x00ff00
                : 0x3498db;
        body = {
          embeds: [
            {
              title,
              description: message,
              color: embedColor,
              timestamp: new Date().toISOString(),
            },
          ],
        };
        break;
      }

      case 'generic':
      default: {
        body = {
          title,
          message,
          event,
          kind,
          metadata,
          timestamp: Date.now(),
        };
        break;
      }
    }

    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    };

    const logger = options.logFn || console.warn;

    const send = async (): Promise<boolean> => {
      const response = await fetchImpl(targetUrl, {
        ...requestInit,
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        let errSnippet = '';
        try {
          const text = await response.text();
          errSnippet = text ? ` - ${text.slice(0, 100)}` : '';
        } catch {
          // 忽略流读取错误
        }
        logger(`[dsh-notifier] Webhook 请求失败 [HTTP ${response.status}] [provider: ${config.provider}]${errSnippet}`);
      }
      return response.ok;
    };

    let firstSuccess = false;
    try {
      firstSuccess = await send();
      if (firstSuccess) return true;
    } catch (firstError) {
      logger(`[dsh-notifier] Webhook 发送异常 [provider: ${config.provider}]:`, firstError);
      if (!isHighPriorityEvent(event, kind)) {
        throw firstError;
      }
    }

    // 高优先级事件在网络抖动或服务端非 2xx（如 502/503/429）时做一次短退避重试，提升可达性；
    // 普通 turn/end 成功通知不重试，避免重复打扰。
    if (isHighPriorityEvent(event, kind)) {
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 400));
      return await send();
    }

    return firstSuccess;
  } catch {
    // Contain all network exceptions (timeout, DNS, connection refusal)
    return false;
  }
}
