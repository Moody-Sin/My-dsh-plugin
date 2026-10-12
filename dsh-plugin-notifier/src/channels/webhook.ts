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
}

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

function generateFeishuSign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac('sha256', stringToSign).update('').digest('base64');
}

function generateDingTalkSign(secret: string, timestamp: number): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return encodeURIComponent(
    crypto.createHmac('sha256', secret).update(stringToSign).digest('base64')
  );
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
    const { title, message, event, kind = 'info', metadata } = payload;

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

    const send = async (): Promise<boolean> => {
      const response = await fetchImpl(targetUrl, {
        ...requestInit,
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    };

    try {
      return await send();
    } catch (firstError) {
      // 高优先级事件在网络抖动时做一次短退避重试，提升可达性；
      // 普通 turn/end 成功通知不重试，避免重复打扰。
      if (!isHighPriorityEvent(event, kind)) {
        throw firstError;
      }
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 400));
      return await send();
    }
  } catch {
    // Contain all network exceptions (timeout, DNS, connection refusal)
    return false;
  }
}
