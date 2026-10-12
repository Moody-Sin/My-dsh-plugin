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

    const response = await fetchImpl(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch {
    // Contain all network exceptions (timeout, DNS, connection refusal)
    return false;
  }
}
