export interface DesktopConfig {
  enabled: boolean;
  minDurationSeconds: number;
}

export interface SoundConfig {
  enabled: boolean;
}

export interface EventsConfig {
  onTurnEnd: boolean;
  onQuestion: boolean;
  onApproval: boolean;
  onError: boolean;
}

export type WebhookProvider = 'feishu' | 'dingtalk' | 'wecom' | 'bark' | 'generic';

export interface WebhookConfig {
  enabled: boolean;
  provider: WebhookProvider;
  url: string;
  secret?: string;
}

export interface NotifierConfig {
  desktop: DesktopConfig;
  sound: SoundConfig;
  events: EventsConfig;
  webhook: WebhookConfig;
}

export const DEFAULT_CONFIG: NotifierConfig = {
  desktop: {
    enabled: true,
    minDurationSeconds: 5,
  },
  sound: {
    enabled: true,
  },
  events: {
    onTurnEnd: true,
    onQuestion: true,
    onApproval: true,
    onError: true,
  },
  webhook: {
    enabled: false,
    provider: 'generic',
    url: '',
    secret: '',
  },
};

const VALID_PROVIDERS = new Set<WebhookProvider>(['feishu', 'dingtalk', 'wecom', 'bark', 'generic']);

export function resolveConfig(candidate?: unknown): NotifierConfig {
  if (candidate === null || typeof candidate !== 'object') {
    return {
      desktop: { ...DEFAULT_CONFIG.desktop },
      sound: { ...DEFAULT_CONFIG.sound },
      events: { ...DEFAULT_CONFIG.events },
      webhook: { ...DEFAULT_CONFIG.webhook },
    };
  }

  const raw = candidate as Record<string, any>;
  const desktopRaw = raw.desktop && typeof raw.desktop === 'object' ? raw.desktop : {};
  const soundRaw = raw.sound && typeof raw.sound === 'object' ? raw.sound : {};
  const eventsRaw = raw.events && typeof raw.events === 'object' ? raw.events : {};
  const webhookRaw = raw.webhook && typeof raw.webhook === 'object' ? raw.webhook : {};

  const minDuration = typeof desktopRaw.minDurationSeconds === 'number'
    ? Math.max(0, Math.floor(desktopRaw.minDurationSeconds))
    : DEFAULT_CONFIG.desktop.minDurationSeconds;

  const provider: WebhookProvider = VALID_PROVIDERS.has(webhookRaw.provider)
    ? webhookRaw.provider
    : DEFAULT_CONFIG.webhook.provider;

  return {
    desktop: {
      enabled: typeof desktopRaw.enabled === 'boolean' ? desktopRaw.enabled : DEFAULT_CONFIG.desktop.enabled,
      minDurationSeconds: minDuration,
    },
    sound: {
      enabled: typeof soundRaw.enabled === 'boolean' ? soundRaw.enabled : DEFAULT_CONFIG.sound.enabled,
    },
    events: {
      onTurnEnd: typeof eventsRaw.onTurnEnd === 'boolean' ? eventsRaw.onTurnEnd : DEFAULT_CONFIG.events.onTurnEnd,
      onQuestion: typeof eventsRaw.onQuestion === 'boolean' ? eventsRaw.onQuestion : DEFAULT_CONFIG.events.onQuestion,
      onApproval: typeof eventsRaw.onApproval === 'boolean' ? eventsRaw.onApproval : DEFAULT_CONFIG.events.onApproval,
      onError: typeof eventsRaw.onError === 'boolean' ? eventsRaw.onError : DEFAULT_CONFIG.events.onError,
    },
    webhook: {
      enabled: typeof webhookRaw.enabled === 'boolean' ? webhookRaw.enabled : DEFAULT_CONFIG.webhook.enabled,
      provider,
      url: typeof webhookRaw.url === 'string' ? webhookRaw.url : DEFAULT_CONFIG.webhook.url,
      secret: typeof webhookRaw.secret === 'string' ? webhookRaw.secret : DEFAULT_CONFIG.webhook.secret,
    },
  };
}

/**
 * Cordis / Schemastery compatible schema representation.
 *
 * Cordis v4 在启动插件前会调用 `runtime.Config['~standard'].validate(config)`
 * 完成配置校验，因此这里必须提供符合 Standard Schema 规范的 `~standard` 属性，
 * 否则会抛出 `Cannot read properties of undefined (reading 'validate')`。
 */
export const Config: any = Object.assign(
  function validateConfig(data: unknown) {
    return resolveConfig(data);
  },
  {
    [Symbol.for('schemastery')]: true,
    '~standard': {
      version: 1,
      vendor: 'schemastery',
      validate(data: unknown) {
        return { value: resolveConfig(data) };
      },
    },
    toJSON() {
      return {
        type: 'object',
        description: 'DSH Notifier Configuration',
        dict: {
          desktop: { type: 'object' },
          sound: { type: 'object' },
          events: { type: 'object' },
          webhook: { type: 'object' },
        },
      };
    },
    type: 'object',
    description: 'DSH Notifier Configuration',
    dict: {
      desktop: { type: 'object' },
      sound: { type: 'object' },
      events: { type: 'object' },
      webhook: { type: 'object' },
    },
  }
);
