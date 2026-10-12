import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Config, deepMerge, getPluginConfig, loadUmbrellaConfig } from './config.ts';
import { scanPlugins } from './scanner.ts';

/** 聚合插件加载器的插件名，供 Cordis 日志与插件注册表识别 */
export const name = 'my-dsh-plugins';

/** 根插件自身配置 Schema，交由宿主在启动前校验 */
export { Config };

/**
 * 推断项目根目录：本文件所在目录 → 上级目录 → 进程工作目录。
 *
 * 以 `package.json` 是否存在的首个命中断点为准；
 * 三个候选均未命中时回落到 `process.cwd()`，保证调用方始终拿到一个非空路径。
 */
export function resolveProjectRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [currentDir, path.dirname(currentDir)];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  return process.cwd();
}

/**
 * 聚合插件入口：扫描并装载工作区内所有 `dsh-*` 子插件。
 *
 * 配置优先级为「`plugins.config.local.json` > `plugins.config.json` > DSH Profile Patch 传入配置」；
 * 单插件失败只告警，不影响其余插件装载。
 */
export async function apply(ctx: any, config?: any): Promise<void> {
  const rootDir = resolveProjectRoot();
  const fileConfig = loadUmbrellaConfig(rootDir);
  // 文件配置为最高权威，必须覆盖 DSH Profile Patch 传入的配置。
  const mergedConfig = deepMerge(config || {}, fileConfig);
  const scanned = scanPlugins(rootDir);

  // 扫描结果为空意味着加载器什么都不会做，必须显式告警以便定位根目录错误。
  if (scanned.length === 0) {
    console.warn(
      `[my-dsh-plugins] 未在根目录 ${rootDir} 下扫描到任何 dsh-* 子插件，` +
        '请检查是否已安装子插件，或项目根目录定位是否有误。',
    );
    return;
  }

  for (const plugin of scanned) {
    const conf = getPluginConfig(mergedConfig, plugin.pluginKey);
    if (!conf.enabled) continue;

    try {
      const mod = await import(plugin.entryUrl);
      const pluginDef = mod.default ?? mod;

      // 同一入口可能被重复装载（热重载 / 多处引用），命中已注册项时直接跳过。
      if (ctx.registry?.has?.(pluginDef)) continue;

      const fiber = await ctx.plugin(pluginDef, conf.config);
      // fiber.state: 0=PENDING 1=LOADING 2=ACTIVE 3=FAILED 4=DISPOSED；
      // 依赖未满足时 ctx.plugin 会立刻返回且 fiber 停在 PENDING，插件体并未真正执行。
      if (fiber?.state !== undefined && fiber.state !== 2) {
        console.warn(
          `[my-dsh-plugins] 子插件 ${plugin.pluginKey} 装载后未进入 ACTIVE 状态（state=${fiber.state}），` +
            '可能在等待依赖注入，插件尚未真正生效。',
        );
      }
    } catch (err) {
      console.warn(`[my-dsh-plugins] 子插件 ${plugin.pluginKey} 初始化失败:`, err);
    }
  }
}
