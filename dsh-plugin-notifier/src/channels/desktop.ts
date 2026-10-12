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
      const xmlString = `<toast><visual><binding template="ToastGeneric"><text>${escapedTitle}</text><text>${escapedMessage}</text></binding></visual></toast>`;
      const base64Xml = Buffer.from(xmlString, 'utf-8').toString('base64');

      const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$xmlText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64Xml}'))
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml($xmlText)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$appId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
`.trim();

      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      await exec('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
      return true;
    } else if (platform === 'darwin') {
      const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
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
