import fs from 'node:fs';

export const WSL_POWERSHELL_PATH = '/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe';

/**
 * 探测当前运行环境是否为 WSL 且 Windows 宿主 PowerShell 可用。
 *
 * 在 WSL 环境下，Node.js 的 process.platform 为 'linux'，但若系统未安装
 * Linux 桌面图形环境或 notify-send/paplay，直接调用会导致通知静默失效。
 * 检测到 WSL 且 PowerShell 可用时，支持跨界委托 Windows 宿主弹窗与提示音。
 */
export function isWslWithPowershell(
  platform = process.platform,
  checkPathExists = (p: string) => fs.existsSync(p)
): boolean {
  return platform === 'linux' && checkPathExists(WSL_POWERSHELL_PATH);
}
