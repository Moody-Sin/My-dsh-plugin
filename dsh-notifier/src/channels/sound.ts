import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { isWslWithPowershell, WSL_POWERSHELL_PATH } from '../utils/wsl.ts';

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
  const shouldBridgeWsl = options.platform === undefined && isWslWithPowershell();
  const platform = options.platform || (shouldBridgeWsl ? 'win32' : os.platform());
  const defaultExecCmd = shouldBridgeWsl ? WSL_POWERSHELL_PATH : 'powershell';
  const exec = options.execFn || ((cmd: string, args: string[]) => defaultExec(shouldBridgeWsl && cmd === 'powershell' ? defaultExecCmd : cmd, args, { timeout: 5000, windowsHide: true }) as any);

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
  } catch {
    return false;
  }
}
