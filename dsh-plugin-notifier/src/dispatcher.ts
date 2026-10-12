import type { NotifierConfig } from './config.ts';
import { sendDesktopNotification } from './channels/desktop.ts';
import { playNotificationSound, type SoundKind } from './channels/sound.ts';
import { sendWebhookNotification, type WebhookPayload } from './channels/webhook.ts';

export interface DispatcherOptions {
  desktopFn?: (title: string, message: string) => Promise<boolean>;
  soundFn?: (kind: SoundKind) => Promise<boolean>;
  webhookFn?: (config: NotifierConfig['webhook'], payload: WebhookPayload) => Promise<boolean>;
}

export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '未知';
  }
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  return `${mins}分${remSecs}秒`;
}

export class NotificationDispatcher {
  private readonly config: NotifierConfig;
  private readonly desktopFn: (title: string, message: string) => Promise<boolean>;
  private readonly soundFn: (kind: SoundKind) => Promise<boolean>;
  private readonly webhookFn: (config: NotifierConfig['webhook'], payload: WebhookPayload) => Promise<boolean>;

  constructor(config: NotifierConfig, options: DispatcherOptions = {}) {
    this.config = config;
    this.desktopFn = options.desktopFn || sendDesktopNotification;
    this.soundFn = options.soundFn || playNotificationSound;
    this.webhookFn = options.webhookFn || sendWebhookNotification;
  }

  private async dispatch(
    title: string,
    message: string,
    event: string,
    kind: 'info' | 'success' | 'warning' | 'error' = 'info',
    soundKind: SoundKind = 'default'
  ): Promise<void> {
    const tasks: Promise<any>[] = [];

    if (this.config.desktop.enabled) {
      tasks.push(this.desktopFn(title, message).catch(() => false));
    }

    if (this.config.sound.enabled) {
      tasks.push(this.soundFn(soundKind).catch(() => false));
    }

    if (this.config.webhook.enabled && this.config.webhook.url) {
      tasks.push(
        this.webhookFn(this.config.webhook, {
          title,
          message,
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

    const minMs = this.config.desktop.minDurationSeconds * 1000;
    if (info.durationMs < minMs) {
      // Suppress short turn notifications to prevent spam
      return;
    }

    const isSuccess = info.reason.kind === 'completed';
    const title = isSuccess ? 'DeepSeek Harness - 任务已完成' : 'DeepSeek Harness - 任务已结束';
    const lines: string[] = [];

    if (info.sessionTitle) {
      lines.push(`会话: ${info.sessionTitle}`);
    }
    const durationText = formatDuration(info.durationMs);
    lines.push(`轮次: #${info.turn} · 耗时: ${durationText}`);
    if (!isSuccess && info.reason.kind) {
      lines.push(`状态: ${info.reason.kind}`);
    }

    const message = lines.join('\n');
    await this.dispatch(
      title,
      message,
      'turn/end',
      isSuccess ? 'success' : 'info',
      isSuccess ? 'success' : 'default'
    );
  }

  async onUserQuestion(info: {
    questions: { question: string; [key: string]: any }[];
    sessionTitle?: string;
  }): Promise<void> {
    if (!this.config.events.onQuestion) {
      return;
    }

    const title = 'DeepSeek Harness - 等待您的回答';
    const lines: string[] = [];
    if (info.sessionTitle) {
      lines.push(`会话: ${info.sessionTitle}`);
    }
    if (info.questions && info.questions.length > 0) {
      const qList = info.questions.map((q, i) => (info.questions.length > 1 ? `${i + 1}. ${q.question}` : q.question));
      lines.push(qList.join('\n'));
    }

    const message = lines.join('\n');
    await this.dispatch(title, message, 'user-questions/request', 'warning', 'alert');
  }

  async onApproval(info: {
    toolName: string;
    reason?: string;
    sessionTitle?: string;
  }): Promise<void> {
    if (!this.config.events.onApproval) {
      return;
    }

    const title = 'DeepSeek Harness - 请求权限审批';
    const lines: string[] = [];
    if (info.sessionTitle) {
      lines.push(`会话: ${info.sessionTitle}`);
    }
    lines.push(`工具: ${info.toolName}`);
    if (info.reason) {
      lines.push(`理由: ${info.reason}`);
    }

    const message = lines.join('\n');
    await this.dispatch(title, message, 'approval/request', 'warning', 'alert');
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

    const title = 'DeepSeek Harness - 任务异常';
    const lines: string[] = [];
    if (info.sessionTitle) {
      lines.push(`会话: ${info.sessionTitle}`);
    }
    const errMsg = info.error instanceof Error ? info.error.message : String(info.error);
    lines.push(`错误: ${errMsg}`);

    const message = lines.join('\n');
    await this.dispatch(title, message, 'agent/error', 'error', 'alert');
  }
}
