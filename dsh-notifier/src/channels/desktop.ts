import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { escapeXml } from '../utils/xml.ts';
import type { SoundKind } from './sound.ts';

const defaultExec = promisify(execFile);

/** 通知等级，决定 Linux 紧急度与各渠道的视觉权重。 */
export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export interface DesktopOptions {
  platform?: string;
  execFn?: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  /** 通知等级：Linux 下 warning/error 使用 critical 紧急度。 */
  kind?: NotificationKind;
  /**
   * Windows：是否把提示音内联进 WinRT Toast XML。
   * 为 true 时由同一次 PowerShell 调用完成弹窗与发声，避免第二个子进程造成声画不同步。
   */
  soundEnabled?: boolean;
  /** Windows：内联音频类型，alert 用 Notification.Reminder，其余用 Notification.Default。 */
  soundKind?: SoundKind;
  /** Linux/macOS：会话名等副标题信息。 */
  subtitle?: string;
  /** Linux：通知图标路径，非空时透传 `-i`。 */
  iconPath?: string;
}

/**
 * 生成 WinRT Toast 的 `<audio>` 节点。
 * 关闭声音时保持 `silent="true"` 的静音语义（同时避免 Windows 默认音与自定义音叠加）。
 */
function buildWinAudioElement(soundEnabled: boolean, soundKind: SoundKind): string {
  if (!soundEnabled) {
    return '<audio silent="true"/>';
  }
  const source =
    soundKind === 'alert'
      ? 'ms-winsoundevent:Notification.Reminder'
      : 'ms-winsoundevent:Notification.Default';
  return `<audio src="${source}"/>`;
}

export async function sendDesktopNotification(
  title: string,
  message: string,
  options: DesktopOptions = {}
): Promise<boolean> {
  const platform = options.platform || os.platform();
  const exec = options.execFn || ((cmd: string, args: string[]) => defaultExec(cmd, args, { timeout: 5000, windowsHide: true }) as any);

  try {
    if (platform === 'win32') {
      const escapedTitle = escapeXml(title);
      const escapedMessage = escapeXml(message);
      const audioElement = buildWinAudioElement(options.soundEnabled === true, options.soundKind ?? 'default');
      const xmlString = `<toast><visual><binding template="ToastGeneric"><text>${escapedTitle}</text><text>${escapedMessage}</text></binding></visual>${audioElement}</toast>`;
      const base64Xml = Buffer.from(xmlString, 'utf-8').toString('base64');

      const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$xmlText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64Xml}'))
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml($xmlText)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$appId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"
try {
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier().Show($toast)
}
`.trim();

      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      await exec('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
      return true;
    } else if (platform === 'darwin') {
      // 会话名放入 subtitle，正文保留轮次/耗时等细节，避免系统通知面板重复展示同一行。
      const script = [
        'on run argv',
        'if (count of argv) > 2 then',
        'display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv)',
        'else',
        'display notification (item 1 of argv) with title (item 2 of argv)',
        'end if',
        'end run',
      ];
      const scriptArgs: string[] = [];
      for (const line of script) {
        scriptArgs.push('-e', line);
      }
      scriptArgs.push('--', message, title);
      if (options.subtitle) {
        scriptArgs.push(options.subtitle);
      }
      await exec('osascript', scriptArgs);
      return true;
    } else if (platform === 'linux') {
      const args: string[] = [];
      if (options.kind === 'warning' || options.kind === 'error') {
        args.push('-u', 'critical');
      }
      // 图标路径由调用方按需提供（如插件自带的 icon.svg）；未提供时不追加该参数。
      if (options.iconPath) {
        args.push('-i', options.iconPath);
      }
      args.push(title, message);
      await exec('notify-send', args);
      return true;
    }
    return false;
  } catch {
    // Graceful containment
    return false;
  }
}
