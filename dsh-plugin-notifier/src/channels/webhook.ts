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
        break;
      }

      case 'dingtalk': {
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

    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return response.ok;
  } catch (err) {
    // Contain all network exceptions
    return false;
  }
}
