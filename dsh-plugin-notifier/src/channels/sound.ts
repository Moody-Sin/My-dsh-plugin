import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const defaultExec = promisify(execFile);

export interface SoundOptions {
  platform?: string;
  execFn?: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
}

export type SoundKind = 'default' | 'alert' | 'success';

export async function playNotificationSound(
  kind: SoundKind = 'default',
  options: SoundOptions = {}
): Promise<boolean> {
  const platform = options.platform || os.platform();
  const exec = options.execFn || ((cmd: string, args: string[]) => defaultExec(cmd, args) as any);

  try {
    if (platform === 'win32') {
      const soundType = kind === 'alert'
        ? '[System.Media.SystemSounds]::Exclamation.Play()'
        : '[System.Media.SystemSounds]::Asterisk.Play()';
      const encoded = Buffer.from(soundType, 'utf16le').toString('base64');
      await exec('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
      return true;
    } else if (platform === 'darwin') {
      const soundFile = kind === 'alert'
        ? '/System/Library/Sounds/Basso.aiff'
        : '/System/Library/Sounds/Glass.aiff';
      await exec('afplay', [soundFile]);
      return true;
    } else if (platform === 'linux') {
      await exec('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga']);
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}
