import os from 'node:os';
import type { NotifierConfig } from './config.ts';
import { sendDesktopNotification, type NotificationKind, type DesktopOptions } from './channels/desktop.ts';
import { playNotificationSound, type SoundKind } from './channels/sound.ts';
import { sendWebhookNotification, type WebhookPayload } from './channels/webhook.ts';
import { resolveLocale, label, t, type ResolvedLocale } from './utils/i18n.ts';

export interface DispatcherOptions {
  desktopFn?: (title: string, message: string, options?: DesktopOptions) => Promise<boolean>;
  soundFn?: (kind: SoundKind) => Promise<boolean>;
  webhookFn?: (config: NotifierConfig['webhook'], payload: WebhookPayload) => Promise<boolean>;
  /** 平台标识，默认取 `os.platform()`；显式传入便于测试与跨平台模拟。 */
  platform?: string;
  /** 相同事件的去重窗口（毫秒），默认 200；设为 0 关闭频控。 */
  debounceMs?: number;
  /** 时间源，默认 `Date.now`；便于测试防抖窗口。 */
  nowFn?: () => number;
}

/** 默认防抖窗口：抑制 200ms 内完全相同的重复事件，保护下游网络请求。 */
const DEFAULT_DEBOUNCE_MS = 200;

/** 去重表容量上限，防止长时间运行下 Map 无界增长。 */
const MAX_DEBOUNCE_ENTRIES = 200;

/**
 * 格式化耗时。
 * `< 60` 秒显示 `N秒`/`Ns`；`< 3600` 秒显示 `N分N秒`/`Nm Ns`；
 * 超过一小时显示 `X小时Y分Z秒`/`Xh Ym Zs`；非法输入返回 `未知`/`Unknown`。
 */
export function formatDuration(durationMs: number, locale: ResolvedLocale = 'zh'): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return t(locale, 'unknown');
  }
  const seconds = Math.round(durationMs / 1000);
  const en = locale === 'en';

  if (seconds < 60) {
    return en ? `${seconds}s` : `${seconds}秒`;
  }

  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;

  if (mins < 60) {
    return en ? `${mins}m ${remSecs}s` : `${mins}分${remSecs}秒`;
  }

  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return en ? `${hours}h ${remMins}m ${remSecs}s` : `${hours}小时${remMins}分${remSecs}秒`;
}

interface DispatchExtras {
  /** 会话名：macOS 作为 subtitle，其余平台仅用于正文。 */
  sessionTitle?: string;
  /** 正文行（不含会话行），用于 macOS 避免与 subtitle 重复。 */
  bodyLines?: string[];
}

export class NotificationDispatcher {
  private readonly config: NotifierConfig;
  private readonly locale: ResolvedLocale;
  private readonly platform: string;
  private readonly debounceMs: number;
  private readonly nowFn: () => number;
  private readonly desktopFn: (title: string, message: string, options?: DesktopOptions) => Promise<boolean>;
  private readonly soundFn: (kind: SoundKind) => Promise<boolean>;
  private readonly webhookFn: (config: NotifierConfig['webhook'], payload: WebhookPayload) => Promise<boolean>;
  /** 事件键 → 上次派发时间戳，用于窗口内去重。 */
  private readonly recentEvents = new Map<string, number>();

  constructor(config: NotifierConfig, options: DispatcherOptions = {}) {
    this.config = config;
    this.locale = resolveLocale(config.locale);
    this.platform = options.platform || os.platform();
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.nowFn = options.nowFn || Date.now;
    this.desktopFn = options.desktopFn || sendDesktopNotification;
    this.soundFn = options.soundFn || playNotificationSound;
    this.webhookFn = options.webhookFn || sendWebhookNotification;
  }

  /**
   * 防抖判定：窗口内出现完全相同的事件键时返回 true（应抑制）。
   * 首次出现一律放行，不做延迟，保证通知实时性。
   */
  private isDuplicate(key: string): boolean {
    if (this.debounceMs <= 0) {
      return false;
    }

    const now = this.nowFn();
    const last = this.recentEvents.get(key);
    if (last !== undefined && now - last < this.debounceMs) {
      return true;
    }

    // 顺带清理过期键；容量超限时淘汰最旧记录，避免 Map 无界增长。
    for (const [existingKey, timestamp] of this.recentEvents) {
      if (now - timestamp >= this.debounceMs) {
        this.recentEvents.delete(existingKey);
      }
    }
    if (this.recentEvents.size >= MAX_DEBOUNCE_ENTRIES) {
      const oldestKey = this.recentEvents.keys().next().value;
      if (oldestKey !== undefined) {
        this.recentEvents.delete(oldestKey);
      }
    }
    this.recentEvents.set(key, now);
    return false;
  }

  private async dispatch(
    title: string,
    message: string,
    event: string,
    kind: NotificationKind = 'info',
    soundKind: SoundKind = 'default',
    extras: DispatchExtras = {}
  ): Promise<void> {
    const sessionTitle = extras.sessionTitle;
    const sessionLine = sessionTitle ? `${label(this.locale, 'session')} ${sessionTitle}` : undefined;
    // 会话名在 macOS 走 subtitle，正文里去掉该行避免重复；其余渠道保留完整正文。
    const macMessage = extras.bodyLines ? extras.bodyLines.join('\n') : message;
    const fullMessage = sessionLine ? `${sessionLine}\n${macMessage}` : macMessage;

    if (this.isDuplicate([event, title, fullMessage, kind, soundKind].join('\u0000'))) {
      return;
    }

    const tasks: Promise<any>[] = [];
    const isWindows = this.platform === 'win32';
    const desktopEnabled = this.config.desktop.enabled;
    const soundEnabled = this.config.sound.enabled;

    if (desktopEnabled) {
      // Windows：声音内联进 Toast XML，由同一次 PowerShell 调用完成弹窗与发声，
      // 既省掉一个子进程，也彻底消除两个子进程先后启动导致的声画不同步。
      const inlineSound = isWindows && soundEnabled;
      tasks.push(
        this.desktopFn(title, this.platform === 'darwin' ? macMessage : fullMessage, {
          platform: this.platform,
          kind,
          subtitle: sessionTitle,
          soundEnabled: inlineSound,
          soundKind,
        }).catch(() => false)
      );
    }

    // 仅当桌面渠道关闭（或无弹窗可承载声音）时才独立播放提示音。
    if (soundEnabled && !(isWindows && desktopEnabled)) {
      tasks.push(this.soundFn(soundKind).catch(() => false));
    }

    if (this.config.webhook.enabled && this.config.webhook.url) {
      tasks.push(
        this.webhookFn(this.config.webhook, {
          title,
          message: fullMessage,
          event,
          kind,
        }).catch(() => false)
      );
    }

    await Promise.allSettled(tasks);
  }

  async onTurnEnd(info: {
    turn: number;
    reason: { kind: string; [key: string]: any };
    durationMs: number;
    sessionTitle?: string;
  }): Promise<void> {
    if (!this.config.events.onTurnEnd) {
      return;
    }

    // 事件级过滤阈值：优先 events.minDurationSeconds，其次回退旧版 desktop 配置，最后兜底 5 秒。
    // 与 desktop.enabled 完全解耦，避免关闭桌面通知后 Webhook 仍被 desktop 配置过滤。
    // 注意：正常路径下 resolveConfig 已保证 events.minDurationSeconds 一定存在（缺失时会用 desktop 值或 5 回填），
    // 因此后两层 ?? 回退在生产路径上不可达；此处保留仅为兼容绕过 resolveConfig、直接构造 config 对象的调用方。
    const minSec = this.config.events.minDurationSeconds ?? this.config.desktop.minDurationSeconds ?? 5;
    const minMs = minSec * 1000;
    if (info.durationMs < minMs) {
      // Suppress short turn notifications to prevent spam
      return;
    }

    const isSuccess = info.reason.kind === 'completed';
    const title = t(this.locale, isSuccess ? 'taskCompleted' : 'taskEnded');
    const lines: string[] = [];
    const durationText = formatDuration(info.durationMs, this.locale);
    lines.push(
      `${label(this.locale, 'turn')} #${info.turn} · ${label(this.locale, 'duration')} ${durationText}`
    );
    if (!isSuccess && info.reason.kind) {
      lines.push(`${label(this.locale, 'status')} ${info.reason.kind}`);
    }

    const message = lines.join('\n');
    await this.dispatch(title, message, 'turn/end', isSuccess ? 'success' : 'info', isSuccess ? 'success' : 'default', {
      sessionTitle: info.sessionTitle,
      bodyLines: lines,
    });
  }

  async onUserQuestion(info: {
    questions: { question: string; [key: string]: any }[];
    sessionTitle?: string;
  }): Promise<void> {
    if (!this.config.events.onQuestion) {
      return;
    }

    const title = t(this.locale, 'waitingForResponse');
    const lines: string[] = [];
    if (info.questions && info.questions.length > 0) {
      const qList = info.questions.map((q, i) => (info.questions.length > 1 ? `${i + 1}. ${q.question}` : q.question));
      lines.push(qList.join('\n'));
    }

    await this.dispatch(title, lines.join('\n'), 'user-questions/request', 'warning', 'alert', {
      sessionTitle: info.sessionTitle,
      bodyLines: lines,
    });
  }

  async onApproval(info: {
    toolName: string;
    reason?: string;
    sessionTitle?: string;
  }): Promise<void> {
    if (!this.config.events.onApproval) {
      return;
    }

    const title = t(this.locale, 'approvalRequested');
    const lines: string[] = [];
    lines.push(`${label(this.locale, 'tool')} ${info.toolName}`);
    if (info.reason) {
      lines.push(`${label(this.locale, 'reason')} ${info.reason}`);
    }

    await this.dispatch(title, lines.join('\n'), 'approval/request', 'warning', 'alert', {
      sessionTitle: info.sessionTitle,
      bodyLines: lines,
    });
  }

  async onError(info: {
    error: unknown;
    turn?: number;
    step?: number;
    sessionTitle?: string;
  }): Promise<void> {
    if (!this.config.events.onError) {
      return;
    }

    const title = t(this.locale, 'taskError');
    const errMsg = info.error instanceof Error ? info.error.message : String(info.error);
    const lines = [`${label(this.locale, 'error')} ${errMsg}`];

    await this.dispatch(title, lines.join('\n'), 'agent/error', 'error', 'alert', {
      sessionTitle: info.sessionTitle,
      bodyLines: lines,
    });
  }
}
