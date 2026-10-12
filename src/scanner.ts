import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 子插件目录名前缀，同时作为 pluginKey 的剥离依据 */
const PLUGIN_DIR_PREFIX = 'dsh-';

/**
 * 单个已扫描到的子插件元数据。
 *
 * `pluginKey` 由目录名剥离 `dsh-` 前缀推导，用于在 `plugins.config.json` 中定位配置切片。
 */
export interface ScannedPlugin {
  /** 子插件目录名，例如 `dsh-notifier` */
  dirName: string;
  /** 配置键名，例如 `notifier` */
  pluginKey: string;
  /** 子插件目录绝对路径 */
  dirPath: string;
  /** 入口文件绝对路径 */
  entryPath: string;
  /** 入口文件的 `file:///` URL，跨平台安全，供动态 `import()` 使用 */
  entryUrl: string;
}

/**
 * 读取子插件 `package.json` 中声明的入口相对路径。
 *
 * 优先级：`exports`（`.` 子路径，含条件对象）> `main`。
 * 文件缺失、内容损坏或未声明入口时返回 `undefined`。
 */
function resolvePackageEntry(dirPath: string): string | undefined {
  const packagePath = path.join(dirPath, 'package.json');
  if (!fs.existsSync(packagePath)) return undefined;

  let pkg: any;
  try {
    // Windows 下记事本 / PowerShell `Set-Content -Encoding utf8` 会写入 UTF-8 BOM，
    // 而 JSON.parse 无法识别 BOM，必须先剥离。
    const raw = fs.readFileSync(packagePath, 'utf8').replace(/^\uFEFF/, '');
    pkg = JSON.parse(raw);
  } catch (error) {
    // 静默跳过会让用户完全无从排查，必须显式告警（模块仍被跳过，不中断整体扫描）。
    console.warn(`[my-dsh-plugins] 子插件 ${path.basename(dirPath)} 的 package.json 解析失败，已跳过:`, error);
    return undefined;
  }

  if (typeof pkg !== 'object' || pkg === null) return undefined;

  const exported = pkg.exports?.['.'] ?? pkg.exports;
  // exports 既可为字符串，也可为条件对象（node / import / default），逐层取首个字符串声明。
  const candidates = [
    exported,
    typeof exported === 'object' && exported !== null
      ? exported.node ?? exported.import ?? exported.default ?? exported.require
      : undefined,
    pkg.main,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  }
  return undefined;
}

/**
 * 解析单个子插件目录的入口文件绝对路径。
 *
 * 优先 `index.js`，其次 `package.json` 的 `exports` / `main`；返回 `undefined` 表示无有效入口。
 */
function resolveEntryPath(dirPath: string): string | undefined {
  const indexFile = path.join(dirPath, 'index.js');
  if (fs.existsSync(indexFile)) return indexFile;

  const declared = resolvePackageEntry(dirPath);
  if (declared === undefined) return undefined;

  const entryPath = path.resolve(dirPath, declared);
  // 声明了却并不存在的入口（未构建 / 路径写错）一律视为无效，避免 import 阶段才抛错。
  return fs.existsSync(entryPath) ? entryPath : undefined;
}

/**
 * 扫描根目录下的所有 `dsh-*` 子插件目录。
 *
 * 忽略非 `dsh-` 前缀项、隐藏目录、保留目录与无有效入口的目录；
 * 结果按 `dirName` 字母序稳定排列，`entryUrl` 经 `pathToFileURL` 转换以规避 Windows 反斜杠路径的 ESM 导入异常。
 */
export function scanPlugins(rootDir: string): ScannedPlugin[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    // 根目录不存在或不可读时平稳降级为空列表，交由上层决定告警策略。
    return [];
  }

  const plugins: ScannedPlugin[] = [];
  for (const entry of entries) {
    // 仅处理目录，且严格限定单层扫描，绝不递归进入 node_modules。
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(PLUGIN_DIR_PREFIX)) continue;

    const dirPath = path.join(rootDir, entry.name);
    const entryPath = resolveEntryPath(dirPath);
    if (entryPath === undefined) continue;

    plugins.push({
      dirName: entry.name,
      pluginKey: entry.name.slice(PLUGIN_DIR_PREFIX.length),
      dirPath,
      entryPath,
      entryUrl: pathToFileURL(entryPath).href,
    });
  }

  return plugins.sort((a, b) => a.dirName.localeCompare(b.dirName));
}
