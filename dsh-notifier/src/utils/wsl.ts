import fs from 'node:fs';

export const WSL_POWERSHELL_PATH = '/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe';

/**
 * 探测结果缓存。
 *
 * `fs.existsSync` 的结果在进程生命周期内不会变化（不会有人在运行中安装 WSL 宿主），
 * 而一次通知派发里 dispatcher / desktop / sound 三处都会调用本函数，
 * 等于凭空多出三次文件系统探测。缓存后只付一次代价。
 *
 * 显式传入 `platform` 或自定义 `checkPathExists`（测试用法）时**不走缓存**，
 * 以保证用例之间的确定性。
 */
let cachedResult: boolean | undefined;

/** 默认的路径存在性检查：独立成常量，供缓存判定做同一性比较 */
function defaultCheck(p: string): boolean {
  return fs.existsSync(p);
}

/**
 * 探测当前运行环境是否为 WSL 且 Windows 宿主 PowerShell 可用。
 *
 * 在 WSL 环境下，Node.js 的 process.platform 为 'linux'，但若系统未安装
 * Linux 桌面图形环境或 notify-send/paplay，直接调用会导致通知静默失效。
 * 检测到 WSL 且 PowerShell 可用时，支持跨界委托 Windows 宿主弹窗与提示音。
 */
export function isWslWithPowershell(
  platform = process.platform,
  checkPathExists: (p: string) => boolean = defaultCheck,
): boolean {
  // 仅在默认参数（生产路径）下使用缓存：显式传参一律实时探测，保证测试确定性
  const isProductionCall = platform === process.platform && checkPathExists === defaultCheck;
  if (isProductionCall && cachedResult !== undefined) return cachedResult;

  const result = platform === 'linux' && checkPathExists(WSL_POWERSHELL_PATH);
  if (isProductionCall) cachedResult = result;
  return result;
}
