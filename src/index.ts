import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BASE_CONFIG_FILENAME,
  Config,
  LOCAL_CONFIG_FILENAME,
  deepMerge,
  getPluginConfig,
  loadUmbrellaConfig,
  type UmbrellaLoaderConfig,
} from './config.ts';
import { scanPlugins, type ScannedPlugin } from './scanner.ts';

/** 聚合插件加载器的插件名，供 Cordis 日志与插件注册表识别 */
export const name = 'my-dsh-plugins';

/** 根插件自身配置 Schema，交由宿主在启动前校验 */
export { Config };

/** 根包名：向上查找项目根目录时的唯一身份依据 */
const ROOT_PACKAGE_NAME = '@local/my-dsh-plugins';

/** 统一日志前缀，保证所有输出可被检索 */
const LOG_PREFIX = '[my-dsh-plugins]';

/** 配置热重载防抖时长：编辑器一次保存常触发多个文件事件，必须合并 */
const CONFIG_WATCH_DEBOUNCE_MS = 300;

/** 参与热重载的配置文件集合（根目录下的其它文件变更一律忽略） */
const WATCHED_CONFIG_FILENAMES = new Set([BASE_CONFIG_FILENAME, LOCAL_CONFIG_FILENAME]);

/** 最小日志器契约：Cordis 原生 logger 与控制台兜底实现均满足 */
interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** 兜底日志器：宿主未注入 Cordis logger 时退回控制台，保证告警永不丢失 */
const fallbackLogger: Logger = {
  info: (...args: unknown[]) => console.info(LOG_PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(LOG_PREFIX, ...args),
  error: (...args: unknown[]) => console.error(LOG_PREFIX, ...args),
};

/**
 * 取得 Cordis 原生 logger，缺失时优雅降级到控制台。
 *
 * `ctx` 是 Cordis Proxy：访问未声明 `inject` 的服务属性会**直接抛错**，
 * 因此 `ctx.logger?.(...)` 也必须包在 try 中，否则加载器会在启动阶段崩溃。
 */
function resolveLogger(ctx: any): Logger {
  let logger: any;
  try {
    logger = ctx?.logger?.(name);
  } catch {
    logger = undefined;
  }
  if (!logger) return fallbackLogger;

  const pick = (level: keyof Logger): ((...args: unknown[]) => void) =>
    typeof logger[level] === 'function'
      ? (...args: unknown[]) => logger[level](...args)
      : fallbackLogger[level];

  return { info: pick('info'), warn: pick('warn'), error: pick('error') };
}

/**
 * 判定目录是否为聚合总线根目录。
 *
 * 命中条件（满足其一即可）：`package.json` 的 `name` 为 `@local/my-dsh-plugins`，
 * 或目录下存在 `plugins.config.json`。后者用于兼容尚未写入包名的开发期仓库。
 */
function isProjectRoot(dir: string): boolean {
  try {
    const packagePath = path.join(dir, 'package.json');
    if (fs.existsSync(packagePath)) {
      // Windows 下记事本 / PowerShell 写入的 UTF-8 BOM 会让 JSON.parse 抛错，必须先剥离。
      const raw = fs.readFileSync(packagePath, 'utf8').replace(/^\uFEFF/, '');
      if (JSON.parse(raw)?.name === ROOT_PACKAGE_NAME) return true;
    }
  } catch {
    // package.json 损坏或不可读不构成致命错误：继续用 plugins.config.json 判定该目录。
  }
  return fs.existsSync(path.join(dir, BASE_CONFIG_FILENAME));
}

/**
 * 从本文件所在目录起向上查找项目根目录，直到文件系统根（`path.dirname(current) === current`）。
 *
 * 全部候选未命中时**抛出异常**，绝不回落 `process.cwd()`：DSH 运行时的 cwd 是用户的目标工程目录，
 * 一旦回落就会被误判为插件根，导致扫描、配置读写污染用户工程。
 */
export function resolveProjectRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    if (isProjectRoot(current)) return current;

    const parent = path.dirname(current);
    // 已抵达文件系统根（POSIX `/` 或 Windows 盘符根），停止上溯。
    if (parent === current) break;
    current = parent;
  }

  throw new Error(`${LOG_PREFIX} 无法定位项目根目录，请确保从有效的仓库安装或运行`);
}

/**
 * 校验配置中的插件键能否对应到已扫描到的子插件。
 *
 * 未知键通常源于目录改名、拼写错误或子插件未安装，其配置会被静默忽略，必须显式告警。
 */
function warnUnknownPluginKeys(
  config: UmbrellaLoaderConfig,
  scanned: ScannedPlugin[],
  logger: Logger,
): void {
  const known = new Set(scanned.map((plugin) => plugin.pluginKey));

  for (const key of Object.keys(config.plugins ?? {})) {
    if (known.has(key)) continue;
    const detected = known.size > 0 ? [...known].join('、') : '（无）';
    logger.warn(`配置文件中包含未识别的插件项 "${key}"，当前已检测到的子插件为: ${detected}`);
  }
}

/**
 * 动态导入子插件入口并取出 Cordis 插件定义（模块默认导出优先，兼容裸命名空间导出）。
 */
async function importPluginDef(entryUrl: string): Promise<any> {
  const mod = await import(entryUrl);
  return mod.default ?? mod;
}

/**
 * 装载单个子插件并返回其 fiber；因已注册而跳过时返回 `undefined`。
 *
 * 依赖未满足时 `ctx.plugin` 会立刻返回且 fiber 停在 PENDING，插件体并未真正执行，故必须告警。
 */
async function mountPlugin(
  ctx: any,
  plugin: ScannedPlugin,
  pluginConfig: Record<string, any>,
  logger: Logger,
): Promise<any> {
  const pluginDef = await importPluginDef(plugin.entryUrl);

  // 同一入口可能被重复装载（热重载 / 多处引用），命中已注册项时直接跳过。
  if (ctx.registry?.has?.(pluginDef)) return undefined;

  const fiber = await ctx.plugin(pluginDef, pluginConfig);
  // fiber.state: 0=PENDING 1=LOADING 2=ACTIVE 3=FAILED 4=DISPOSED
  if (fiber?.state !== undefined && fiber.state !== 2) {
    logger.warn(
      `子插件 ${plugin.pluginKey} 装载后未进入 ACTIVE 状态（state=${fiber.state}），` +
        '可能在等待依赖注入，插件尚未真正生效。',
    );
  }
  return fiber;
}

/**
 * 聚合插件入口：扫描并装载工作区内所有 `dsh-*` 子插件，并监听配置文件变更。
 *
 * 配置优先级为「`plugins.config.local.json` > `plugins.config.json` > DSH Profile Patch 传入配置」；
 * 单插件失败只告警，不影响其余插件装载。
 */
export async function apply(ctx: any, config?: any): Promise<void> {
  const rootDir = resolveProjectRoot();
  const logger = resolveLogger(ctx);
  const fileConfig = loadUmbrellaConfig(rootDir);
  // 文件配置为最高权威，必须覆盖 DSH Profile Patch 传入的配置。
  const mergedConfig = deepMerge(config || {}, fileConfig);
  const scanned = scanPlugins(rootDir);

  // 扫描结果为空意味着加载器什么都不会做，必须显式告警以便定位根目录错误。
  // 此分支先于未知键校验返回：无任何子插件时逐个罗列「未识别插件项」只会淹没真正的病因。
  if (scanned.length === 0) {
    logger.warn(
      `未在根目录 ${rootDir} 下扫描到任何 dsh-* 子插件，` +
        '请检查是否已安装子插件，或项目根目录定位是否有误。',
    );
    return;
  }

  warnUnknownPluginKeys(mergedConfig, scanned, logger);

  /** 已挂载子插件登记表：pluginKey → Cordis fiber，供热重载时销毁 / 更新 */
  const forks = new Map<string, any>();
  /** 当前生效配置，热重载时用于对比启用状态的新旧差异 */
  let currentConfig = mergedConfig;

  for (const plugin of scanned) {
    const conf = getPluginConfig(currentConfig, plugin.pluginKey);
    if (!conf.enabled) continue;

    try {
      const fiber = await mountPlugin(ctx, plugin, conf.config, logger);
      if (fiber) forks.set(plugin.pluginKey, fiber);
    } catch (err) {
      logger.error(`子插件 ${plugin.pluginKey} 初始化失败:`, err);
    }
  }

  // ── 配置热重载 ──────────────────────────────────────────────────────────
  // 监听根目录本身而非具体文件：文件尚不存在时监听目标会失效，
  // 而「新建 plugins.config.local.json」恰恰是最常见的本地覆盖场景。
  let watcher: fs.FSWatcher | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;

  const reload = async (): Promise<void> => {
    // dispose 与重载存在竞态：宿主已卸载后绝不能再补挂插件。
    if (!active) return;

    const latestConfig = deepMerge(config || {}, loadUmbrellaConfig(rootDir));

    for (const plugin of scanned) {
      const key = plugin.pluginKey;
      const wasEnabled = getPluginConfig(currentConfig, key).enabled;
      const next = getPluginConfig(latestConfig, key);

      try {
        if (wasEnabled && !next.enabled) {
          // 原已启用 → 现被禁用：销毁 fiber 并移出登记表，杜绝残留实例。
          // 注意 Map.delete 返回的是 boolean 而非被删的值，必须先 get 再 delete。
          const fiber = forks.get(key);
          forks.delete(key);
          fiber?.dispose?.();
        } else if (!wasEnabled && next.enabled) {
          // 原未启用 → 现已启用：动态补挂，与首轮装载走完全相同的路径。
          const fiber = await mountPlugin(ctx, plugin, next.config, logger);
          if (fiber) forks.set(key, fiber);
        } else if (wasEnabled && next.enabled) {
          // 持续启用：原地热更新配置，避免销毁重建导致的监听器抖动与通知丢失。
          forks.get(key)?.update?.(next.config);
        }
      } catch (error) {
        logger.warn(`子插件 ${key} 热重载失败:`, error);
      }
    }

    currentConfig = latestConfig;
    logger.info(`配置文件变更已生效，共 ${scanned.length} 个子插件参与热重载`);
  };

  try {
    watcher = fs.watch(rootDir, (_eventType, filename) => {
      // filename 在部分平台可能为 null；此时无法过滤，保守触发重载。
      if (filename && !WATCHED_CONFIG_FILENAMES.has(String(filename))) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void reload();
      }, CONFIG_WATCH_DEBOUNCE_MS);
      // 监听器不得阻止宿主进程退出：DSH 生命周期由宿主决定，插件只做被动响应。
      timer.unref?.();
    });
    // 同上，避免仅剩文件监听句柄时把 Node 进程钉死（测试与 CLI 场景尤其明显）。
    watcher.unref?.();
    // 根目录被删除 / 权限变更时 FSWatcher 会发出 'error'；EventEmitter 的未处理 'error'
    // 会直接抛出并拖垮宿主进程，必须就地消化，热重载失效不应影响已装载的插件。
    watcher.on?.('error', (error: unknown) => {
      logger.warn('配置文件热重载监听已中断，配置变更需重启后生效:', error);
    });
  } catch (error) {
    logger.warn('配置文件热重载监听启动失败，配置变更需重启后生效:', error);
  }

  // 宿主卸载插件时必须注销监听，否则句柄与定时器会长期驻留形成内存泄漏。
  ctx.on?.('dispose', () => {
    active = false;
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    watcher?.close();
    watcher = undefined;
  });
}
