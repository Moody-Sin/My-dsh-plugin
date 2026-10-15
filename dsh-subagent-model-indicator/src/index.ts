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
  const clientBundlePath = path.join(currentDir, 'client.js');

  const injectToWebServer = (targetCtx: any) => {
    targetCtx.on('webserver/index-inject', (table: any[]) => {
      try {
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
    });
  };

  // 既支持直接在宿主上下文中监听，也支持在父级 root 监听
  try {
    injectToWebServer(ctx);
  } catch {
    // 忽略
  }
  if (ctx.root && ctx.root !== ctx) {
    try {
      injectToWebServer(ctx.root);
    } catch {
      // 忽略
    }
  }
}
