/** 通知语言标识：`auto` 表示按环境变量自动判断。 */
export type LocaleSetting = 'auto' | 'zh' | 'en';

/** 实际生效的语言（不含 auto）。 */
export type ResolvedLocale = 'zh' | 'en';

/** 通知文案键：标题、字段标签、诊断文案与未知值占位。 */
export type MessageKey =
  | 'taskCompleted'
  | 'taskEnded'
  | 'waitingForResponse'
  | 'approvalRequested'
  | 'taskError'
  | 'session'
  | 'turn'
  | 'duration'
  | 'status'
  | 'tool'
  | 'reason'
  | 'error'
  | 'unknown';

const DICTIONARIES: Record<ResolvedLocale, Record<MessageKey, string>> = {
  zh: {
    taskCompleted: 'DeepSeek Harness - 任务已完成',
    taskEnded: 'DeepSeek Harness - 任务已结束',
    waitingForResponse: 'DeepSeek Harness - 等待您的回答',
    approvalRequested: 'DeepSeek Harness - 请求权限审批',
    taskError: 'DeepSeek Harness - 任务异常',
    session: '会话',
    turn: '轮次',
    duration: '耗时',
    status: '状态',
    tool: '工具',
    reason: '理由',
    error: '错误',
    unknown: '未知',
  },
  en: {
    taskCompleted: 'DeepSeek Harness - Task Completed',
    taskEnded: 'DeepSeek Harness - Task Ended',
    waitingForResponse: 'DeepSeek Harness - Waiting for Response',
    approvalRequested: 'DeepSeek Harness - Approval Requested',
    taskError: 'DeepSeek Harness - Task Error',
    session: 'Session',
    turn: 'Turn',
    duration: 'Duration',
    status: 'Status',
    tool: 'Tool',
    reason: 'Reason',
    error: 'Error',
    unknown: 'Unknown',
  },
};

/**
 * 将候选语言标签判定为 `zh` 或 `en`。
 * 只要以 `en` 开头（忽略大小写，兼容 `en`、`en-US`、`en_US.UTF-8`）即为英文，其余一律中文。
 */
function normalizeLocaleTag(tag: string | undefined): ResolvedLocale | undefined {
  if (!tag) return undefined;
  return tag.trim().toLowerCase().startsWith('en') ? 'en' : 'zh';
}

/**
 * 解析最终生效语言。
 * `auto` 模式按 `DSH_LOCALE` → `LANG` → `LC_ALL` 顺序取首个可用环境变量，
 * 以 `en` 开头用英文，否则默认中文；显式 `zh`/`en` 直接返回。
 */
export function resolveLocale(
  setting: LocaleSetting | undefined,
  env: Record<string, string | undefined> = process.env
): ResolvedLocale {
  if (setting === 'zh' || setting === 'en') {
    return setting;
  }
  return (
    normalizeLocaleTag(env.DSH_LOCALE) ??
    normalizeLocaleTag(env.LANG) ??
    normalizeLocaleTag(env.LC_ALL) ??
    'zh'
  );
}

/** 取指定语言下某个文案键的文本。 */
export function t(locale: ResolvedLocale, key: MessageKey): string {
  return DICTIONARIES[locale][key];
}

/** 构造带冒号的字段标签，如 `会话:` / `Session:`。 */
export function label(locale: ResolvedLocale, key: MessageKey): string {
  return `${t(locale, key)}:`;
}
