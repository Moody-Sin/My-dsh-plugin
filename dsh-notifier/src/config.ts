import type { LocaleSetting } from './utils/i18n.ts';

export interface DesktopConfig {
  enabled: boolean;
  /**
   * @deprecated 请改用 `events.minDurationSeconds`。
   * 该字段属于桌面渠道的职责，却长期被用作全局任务完成过滤阈值，
   * 导致「关闭桌面通知后 Webhook 仍被 desktop 配置过滤」的职责混乱。
   * 当前仅作为向后兼容的回退读取来源保留。
   */
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
  /** 任务完成通知的耗时过滤阈值（秒），与桌面渠道开关完全解耦，默认 5。 */
  minDurationSeconds?: number;
}

export type WebhookProvider = 'feishu' | 'dingtalk' | 'wecom' | 'bark' | 'telegram' | 'discord' | 'generic';

export interface WebhookConfig {
  enabled: boolean;
  provider: WebhookProvider;
  url: string;
  secret?: string;
}

/** 内置设置看板与一键测试服务配置。 */
export interface ServerConfig {
  /** 是否随插件启动设置看板服务，默认 `true`。 */
  enabled: boolean;
  /** 监听端口，默认 `3088`；被占用时会自动向后探测可用端口。 */
  port: number;
}

export interface NotifierConfig {
  /**
   * 通知文案语言：`auto` 按环境变量判断，或强制 `zh`/`en`；默认 `auto`。
   * 该字段可省略，`resolveConfig()` 保证返回对象中必定存在有效值。
   */
  locale?: LocaleSetting;
  desktop: DesktopConfig;
  sound: SoundConfig;
  events: EventsConfig;
  webhook: WebhookConfig;
  /** 设置看板服务；可省略，`resolveConfig()` 保证返回对象中必定存在。 */
  server?: ServerConfig;
}

/** 默认语言设置：`auto` 表示按运行环境自动判断中英文。 */
const DEFAULT_LOCALE: LocaleSetting = 'auto';

/** 设置看板默认端口，与 `src/server.ts` 的 `DEFAULT_PORT` 保持一致。 */
export const DEFAULT_SERVER_PORT = 3088;

export const DEFAULT_CONFIG: NotifierConfig = {
  locale: DEFAULT_LOCALE,
  desktop: {
    enabled: true,
    // 保留以保持完全向下兼容，实际过滤阈值以 events.minDurationSeconds 优先
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
    minDurationSeconds: 5,
  },
  webhook: {
    enabled: false,
    provider: 'generic',
    url: '',
    secret: '',
  },
  server: {
    enabled: true,
    port: DEFAULT_SERVER_PORT,
  },
};

const VALID_PROVIDERS = new Set<WebhookProvider>([
  'feishu',
  'dingtalk',
  'wecom',
  'bark',
  'telegram',
  'discord',
  'generic',
]);

const VALID_LOCALES = new Set<LocaleSetting>(['auto', 'zh', 'en']);

/** 将候选值规整为非负整数秒数，非法输入返回 undefined。 */
function normalizeDurationSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : undefined;
}

/** 将候选值规整为合法端口（1~65535 整数），非法输入返回 undefined。 */
function normalizePort(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const port = Math.floor(value);
  return port >= 1 && port <= 65535 ? port : undefined;
}

/** 校验语言配置，非法值回落 `auto`。 */
function normalizeLocale(value: unknown): LocaleSetting {
  return typeof value === 'string' && VALID_LOCALES.has(value as LocaleSetting)
    ? (value as LocaleSetting)
    : DEFAULT_LOCALE;
}

export function resolveConfig(candidate?: unknown): NotifierConfig {
  if (candidate === null || typeof candidate !== 'object') {
    return {
      locale: DEFAULT_LOCALE,
      desktop: { ...DEFAULT_CONFIG.desktop },
      sound: { ...DEFAULT_CONFIG.sound },
      events: { ...DEFAULT_CONFIG.events },
      webhook: { ...DEFAULT_CONFIG.webhook },
      server: { ...DEFAULT_CONFIG.server! },
    };
  }

  const raw = candidate as Record<string, any>;
  const desktopRaw = raw.desktop && typeof raw.desktop === 'object' ? raw.desktop : {};
  const soundRaw = raw.sound && typeof raw.sound === 'object' ? raw.sound : {};
  const eventsRaw = raw.events && typeof raw.events === 'object' ? raw.events : {};
  const webhookRaw = raw.webhook && typeof raw.webhook === 'object' ? raw.webhook : {};
  const serverRaw = raw.server && typeof raw.server === 'object' ? raw.server : {};

  const desktopMin = normalizeDurationSeconds(desktopRaw.minDurationSeconds);
  const eventsMin = normalizeDurationSeconds(eventsRaw.minDurationSeconds);

  // 事件级阈值与桌面渠道开关解耦：优先 events，其次回退读取旧版 desktop 配置，最后兜底 5 秒
  const minDuration = eventsMin ?? desktopMin ?? DEFAULT_CONFIG.events.minDurationSeconds ?? 5;

  const provider: WebhookProvider = VALID_PROVIDERS.has(webhookRaw.provider)
    ? webhookRaw.provider
    : DEFAULT_CONFIG.webhook.provider;

  return {
    locale: normalizeLocale(raw.locale),
    desktop: {
      enabled: typeof desktopRaw.enabled === 'boolean' ? desktopRaw.enabled : DEFAULT_CONFIG.desktop.enabled,
      minDurationSeconds: desktopMin ?? minDuration,
    },
    sound: {
      enabled: typeof soundRaw.enabled === 'boolean' ? soundRaw.enabled : DEFAULT_CONFIG.sound.enabled,
    },
    events: {
      onTurnEnd: typeof eventsRaw.onTurnEnd === 'boolean' ? eventsRaw.onTurnEnd : DEFAULT_CONFIG.events.onTurnEnd,
      onQuestion: typeof eventsRaw.onQuestion === 'boolean' ? eventsRaw.onQuestion : DEFAULT_CONFIG.events.onQuestion,
      onApproval: typeof eventsRaw.onApproval === 'boolean' ? eventsRaw.onApproval : DEFAULT_CONFIG.events.onApproval,
      onError: typeof eventsRaw.onError === 'boolean' ? eventsRaw.onError : DEFAULT_CONFIG.events.onError,
      minDurationSeconds: minDuration,
    },
    webhook: {
      enabled: typeof webhookRaw.enabled === 'boolean' ? webhookRaw.enabled : DEFAULT_CONFIG.webhook.enabled,
      provider,
      url: typeof webhookRaw.url === 'string' ? webhookRaw.url : DEFAULT_CONFIG.webhook.url,
      secret: typeof webhookRaw.secret === 'string' ? webhookRaw.secret : DEFAULT_CONFIG.webhook.secret,
    },
    server: {
      enabled: typeof serverRaw.enabled === 'boolean' ? serverRaw.enabled : DEFAULT_CONFIG.server!.enabled,
      port: normalizePort(serverRaw.port) ?? DEFAULT_CONFIG.server!.port,
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
const SCHEMA_DICT = {
  locale: {
    type: 'string',
    description: '通知文案语言：auto（按 DSH_LOCALE/LANG/LC_ALL 自动判断）| zh | en，默认 auto',
    meta: { volatile: true },
  },
  desktop: {
    type: 'object',
    description: '桌面通知渠道配置（minDurationSeconds 已废弃，仅作向后兼容回退）',
    // DSH 的 volatileForm() / isVolatilePath() 会无条件读取 node.meta.volatile，
    // 且会递归遍历 dict 的每一个子节点，因此每个节点都必须带 meta，否则设置面板会崩溃。
    meta: {},
    dict: {
      enabled: { type: 'boolean', description: '是否启用操作系统原生桌面弹窗通知', meta: { volatile: true } },
      minDurationSeconds: { type: 'number', description: '[已废弃] 请改用 events.minDurationSeconds', meta: {} },
    },
  },
  sound: {
    type: 'object',
    description: '系统提示音配置（Windows 下由桌面 Toast 内联播放，不额外启动子进程）',
    meta: {},
    dict: {
      enabled: { type: 'boolean', description: '是否在通知时播放系统提示音', meta: { volatile: true } },
    },
  },
  events: {
    type: 'object',
    description: '事件开关与过滤阈值配置',
    meta: {},
    dict: {
      onTurnEnd: { type: 'boolean', description: '任务完成时是否通知', meta: { volatile: true } },
      onQuestion: { type: 'boolean', description: 'Agent 提问等待回答时是否通知', meta: { volatile: true } },
      onApproval: { type: 'boolean', description: 'Agent 申请权限审批时是否通知', meta: { volatile: true } },
      onError: { type: 'boolean', description: 'Agent 执行异常时是否通知', meta: { volatile: true } },
      minDurationSeconds: {
        type: 'number',
        description: '任务完成通知的耗时过滤阈值（秒），默认 5；与桌面渠道开关解耦',
        meta: { volatile: true },
      },
    },
  },
  webhook: {
    type: 'object',
    description: 'Webhook 离机推送渠道配置',
    meta: {},
    dict: {
      enabled: { type: 'boolean', description: '是否开启 Webhook 远端推送', meta: { volatile: true } },
      provider: {
        type: 'string',
        description: '渠道类型：feishu | dingtalk | wecom | bark | telegram | discord | generic',
        meta: { volatile: true },
      },
      url: { type: 'string', description: 'Webhook 机器人地址', meta: { volatile: true } },
      secret: {
        type: 'string',
        description: '签名密钥（可选）；telegram 渠道下作为 chat_id',
        meta: { volatile: true },
      },
    },
  },
  server: {
    type: 'object',
    description: '内置设置看板与一键测试服务（改动需重启 DSH 后生效）',
    meta: {},
    dict: {
      enabled: { type: 'boolean', description: '是否随插件启动本地设置看板服务，默认 true', meta: {} },
      port: { type: 'number', description: '设置看板监听端口，默认 3088；被占用时自动向后探测', meta: {} },
    },
  },
};

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
        dict: SCHEMA_DICT,
      };
    },
    type: 'object',
    description: 'DSH Notifier Configuration',
    // 本插件不含 volatile 字段，缺失 meta 会让 DSH 的 volatileForm()/isVolatilePath() 抛 TypeError。
    meta: {},
    dict: SCHEMA_DICT,
  }
);
