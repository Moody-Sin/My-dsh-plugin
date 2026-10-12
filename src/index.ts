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
 * 配置优先级为「文件配置覆盖传入配置」；单插件失败只告警，不影响其余插件装载。
 */
export async function apply(ctx: any, config?: any): Promise<void> {
  const rootDir = resolveProjectRoot();
  const fileConfig = loadUmbrellaConfig(rootDir);
  const mergedConfig = deepMerge(fileConfig, config || {});
  const scanned = scanPlugins(rootDir);

  for (const plugin of scanned) {
    const conf = getPluginConfig(mergedConfig, plugin.pluginKey);
    if (!conf.enabled) continue;

    try {
      const mod = await import(plugin.entryUrl);
      const pluginDef = mod.default ?? mod;

      // 同一入口可能被重复装载（热重载 / 多处引用），命中已注册项时直接跳过。
      if (ctx.registry) {
        const exists = Array.from(ctx.registry.values?.() || []).some(
          (r: any) => r.callback === pluginDef || (pluginDef.name && r.name === pluginDef.name),
        );
        if (exists) continue;
      }

      await ctx.plugin(pluginDef, conf.config);
    } catch (err) {
      console.warn(`[my-dsh-plugins] 子插件 ${plugin.pluginKey} 初始化失败:`, err);
    }
  }
}
