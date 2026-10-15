import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig, type ModelIndicatorConfig } from './config.ts';

export const name = 'subagent-model-indicator';
export const inject = [];

/**
 * Node 宿主半侧：
 * 1. 负责生命周期维护与配置热更新；
 * 2. 监听 `webserver/index-inject`，将客户端脚本直接作为 script-src / inline script 注入网页，
 *    确保无需重启 DSH 官方服务也能随 index.html 或动态 HMR 实时生效。
 */
export function apply(ctx: any, rawConfig: unknown): void {
  const config = resolveConfig(rawConfig);
  if (!config.enabled) return;

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const clientBundlePath = fs.existsSync(path.join(currentDir, 'client.js'))
    ? path.join(currentDir, 'client.js')
    : path.join(currentDir, '..', 'client.js');

  const onIndexInject = (table: any[]) => {
    try {
      if (!Array.isArray(table)) return;
      // 防重保护：如果 table 中已存在本插件脚本，绝不重复注入
      const alreadyInjected = table.some(
        (row) =>
          row?.kind === 'script' &&
          typeof row?.text === 'string' &&
          row.text.includes('@local/dsh-subagent-model-indicator'),
      );
      if (alreadyInjected) return;

      if (fs.existsSync(clientBundlePath)) {
        const clientCode = fs.readFileSync(clientBundlePath, 'utf8');
        table.push({
          kind: 'script',
          placement: 'body',
          text: clientCode,
        });
      }
    } catch (err) {
      ctx.logger?.warn?.('[dsh-subagent-model-indicator] 注入前端脚本失败:', err);
    }
  };

  // 使用 ctx.effect 托管生命周期清理（兼容 Cordis v4 与 ctx.on('dispose')）
  const cleanup = () => {
    // 监听注销由 Cordis 生命周期机制自动管理
  };

  try {
    if (typeof ctx?.effect === 'function') {
      ctx.effect(() => {
        const unlisten = ctx.on('webserver/index-inject', onIndexInject);
        return () => {
          unlisten?.();
          cleanup();
        };
      });
    } else if (typeof ctx?.on === 'function') {
      ctx.on('webserver/index-inject', onIndexInject);
      ctx.on('dispose', cleanup);
    }
  } catch {
    try {
      ctx.on?.('webserver/index-inject', onIndexInject);
    } catch {
      // 容错降级
    }
  }
}
