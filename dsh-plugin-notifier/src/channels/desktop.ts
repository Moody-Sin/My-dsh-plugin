import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { escapeXml } from '../utils/xml.ts';

const defaultExec = promisify(execFile);

export interface DesktopOptions {
  platform?: string;
  execFn?: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
}

export async function sendDesktopNotification(
  title: string,
  message: string,
  options: DesktopOptions = {}
): Promise<boolean> {
  const platform = options.platform || os.platform();
  const exec = options.execFn || ((cmd: string, args: string[]) => defaultExec(cmd, args) as any);

  try {
    if (platform === 'win32') {
      const escapedTitle = escapeXml(title);
      const escapedMessage = escapeXml(message);
      const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$template = @"
<toast>
    <visual>
        <binding template="ToastGeneric">
            <text>${escapedTitle}</text>
            <text>${escapedMessage}</text>
        </binding>
    </visual>
</toast>
"@
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$appId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
`.trim();

      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      await exec('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
      return true;
    } else if (platform === 'darwin') {
      const safeTitle = title.replace(/"/g, '\\"');
      const safeMessage = message.replace(/"/g, '\\"');
      const script = `display notification "${safeMessage}" with title "${safeTitle}"`;
      await exec('osascript', ['-e', script]);
      return true;
    } else if (platform === 'linux') {
      await exec('notify-send', [title, message]);
      return true;
    }
    return false;
  } catch (err) {
    // Graceful containment
    return false;
  }
}
