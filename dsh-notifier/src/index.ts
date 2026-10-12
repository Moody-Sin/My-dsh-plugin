import { resolveConfig, Config, type NotifierConfig } from './config.ts';
import { NotificationDispatcher } from './dispatcher.ts';
import { startSettingsServer, stopSettingsServer } from './server.ts';

export const name = 'notifier';
// sessions 为历史兼容保留，插件实际不使用会话存储。
// sessionTitle 故意不写进 inject：它是可选增强而非硬依赖，一旦声明，服务缺失时
// Cordis 会把插件 fiber 永久挂在 PENDING，导致一条通知都发不出。
// 这里改由 getSessionTitle 用 ctx.get 按需安全读取，缺失时优雅降级为无标题。
export const inject = ['sessions'];
export { Config };
export type { NotifierConfig };

export interface ApplyOptions {
  dispatcher?: NotificationDispatcher;
}

const MAX_TRACKED_TURNS = 200;

/** 统一日志前缀，与根总线风格保持一致。 */
const LOG_PREFIX = '[dsh-notifier]';

/**
 * 取 Cordis 原生 logger，缺失时优雅降级到控制台。
 *
 * `ctx` 是 Cordis Proxy：访问未声明 `inject` 的服务属性会直接抛错，
 * 因此 `ctx.logger?.(...)` 也必须包在 try 中，否则插件会在启动阶段崩溃。
 *
 * 注意：日志文案自带 `[dsh-notifier]` 前缀，兜底实现不再重复添加，
 * 保证「有无 Cordis logger」两种情况下输出文本完全一致。
 */
function resolveLogger(ctx: any): { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void } {
  let logger: any;
  try {
    logger = ctx?.logger?.(name);
  } catch {
    logger = undefined;
  }
  if (!logger) {
    return {
      info: (...args: unknown[]) => console.info(...args),
      warn: (...args: unknown[]) => console.warn(...args),
      error: (...args: unknown[]) => console.error(...args),
    };
  }

  const pick = (level: 'info' | 'warn' | 'error') =>
    typeof logger[level] === 'function'
      ? (...args: unknown[]) => logger[level](...args)
      : (...args: unknown[]) => console[level](...args);

  return { info: pick('info'), warn: pick('warn'), error: pick('error') };
}

/** 生成设置看板就绪提示，形如 `[dsh-notifier] 设置看板已就绪: http://127.0.0.1:3088`。 */
export function formatReadyMessage(url: string): string {
  return `${LOG_PREFIX} 设置看板已就绪: ${url}`;
}

export function apply(ctx: any, rawConfig: unknown, options?: ApplyOptions): void {
  const config = resolveConfig(rawConfig);
  const dispatcher = options?.dispatcher || new NotificationDispatcher(config);
  const logger = resolveLogger(ctx);

  const turnStartTimes = new Map<string, number>();

  // ── 内置设置看板服务 ────────────────────────────────────────────────────
  // 仅在配置显式开启时启动；启动失败绝不拖垮插件本体（通知能力优先于看板）。
  const serverEnabled = config.server?.enabled !== false;
  if (serverEnabled) {
    void startSettingsServer({
      port: config.server?.port,
      config,
      logger,
    })
      .then((handle) => {
        logger.info(formatReadyMessage(handle.url));
      })
      .catch((error: unknown) => {
        logger.warn(`${LOG_PREFIX} 设置看板启动失败，通知功能不受影响:`, error);
      });
  }

  // Ensure cleanup on plugin reload / unmount
  if (typeof ctx.on === 'function') {
    ctx.on('dispose', () => {
      turnStartTimes.clear();
      // 平稳关停服务，防止端口与连接句柄泄漏（热重载会反复进出 apply）。
      void stopSettingsServer().catch(() => undefined);
    });
  }

  function getSessionTitle(session: any): string | undefined {
    if (!session) return undefined;
    // Cordis 的 ctx 是 Proxy：读取未声明在 inject 中的服务属性会直接抛异常，
    // 可选链挡不住该抛错（历史 bug 正是因此吞掉了标题并连 cwd 兜底都走不到）。
    // ctx.get('服务名') 是 Cordis 公开的安全读取 API，服务缺失时返回 undefined 而不抛错。
    let service: any;
    try {
      service = typeof ctx.get === 'function' ? ctx.get('sessionTitle') : ctx.sessionTitle;
    } catch {
      // ctx.get 不可用（部分 mock 环境）时静默降级，继续走后续兜底
      service = undefined;
    }

    // 兼容不同版本 DSH 的会话标题服务形态：主路径为 get(session).title
    try {
      if (typeof service?.get === 'function') {
        const snap = service.get(session);
        if (snap?.title) return snap.title;
      }
      if (typeof service?.titleOf === 'function') {
        const res = service.titleOf(session);
        if (res) return res;
      }
      if (typeof service?.title === 'function') {
        const res = service.title(session);
        if (res) return res;
      }
    } catch {
      // 服务探测失败时静默降级，继续走 cwd 兜底
    }

    if (session.header?.cwd) {
      return session.header.cwd;
    }
    return undefined;
  }

  // 1. Session log event observer (turn/start & turn/end)
  ctx.on('session/event', (session: any, event: any) => {
    if (!event || !event.type) return;

    if (event.type === 'turn/start') {
      const turn = event.data?.turn ?? 0;
      const key = `${session?.id || 'default'}:${turn}`;
      // Capacity eviction protection
      if (turnStartTimes.size >= MAX_TRACKED_TURNS) {
        const oldestKey = turnStartTimes.keys().next().value;
        if (oldestKey) turnStartTimes.delete(oldestKey);
      }
      turnStartTimes.set(key, Date.now());
    } else if (event.type === 'turn/end') {
      const turn = event.data?.turn ?? 0;
      const key = `${session?.id || 'default'}:${turn}`;
      const startTime = turnStartTimes.get(key);
      turnStartTimes.delete(key);

      // If start wasn't observed (e.g. HMR reload), assume long task (Infinity) rather than 0
      const durationMs = startTime !== undefined ? Date.now() - startTime : Infinity;
      const sessionTitle = getSessionTitle(session);

      void dispatcher.onTurnEnd({
        turn,
        reason: event.data?.reason || { kind: 'completed' },
        durationMs,
        sessionTitle,
      });
    }
  });

  // 2. User question waterfall (non-blocking delivery)
  ctx.on('user-questions/request', async (request: any, next: () => Promise<any>) => {
    try {
      const questions = request?.questions || [];
      const sessionTitle = getSessionTitle(request?.agent?.session);
      void dispatcher.onUserQuestion({
        questions,
        sessionTitle,
      });
    } catch {
      // contain errors
    }
    return await next();
  });

  // 3. User approval waterfall (non-blocking delivery)
  ctx.on('approval/request', async (req: any, next: () => Promise<any>) => {
    try {
      const toolName = req?.toolName || 'unknown';
      const reason = req?.reason || req?.displayReason?.zh || req?.displayReason?.en;
      const sessionTitle = getSessionTitle(req?.agent?.session);
      void dispatcher.onApproval({
        toolName,
        reason,
        sessionTitle,
      });
    } catch {
      // contain errors
    }
    return await next();
  });

  // 4. Agent error observer
  ctx.on('agent/error', (payload: any) => {
    try {
      const sessionTitle = getSessionTitle(payload?.agent?.session);
      void dispatcher.onError({
        error: payload?.error,
        turn: payload?.turn,
        step: payload?.step,
        sessionTitle,
      });
    } catch {
      // contain errors
    }
  });
}
