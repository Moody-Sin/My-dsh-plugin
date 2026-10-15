import { resolveConfig, Config, type NotifierConfig } from './config.ts';
import { NotificationDispatcher } from './dispatcher.ts';

export const name = 'notifier';
/**
 * 依赖列表刻意为空（必须显式标注类型，否则 TS 会推断为 `never[]`，
 * 令 `inject.includes(...)` 之类的断言在类型层面无法成立）。
 *
 * 曾声明 `inject = ['sessions']`，但插件实际从不使用会话存储；一旦把它写成硬依赖，
 * 服务缺失或初始化晚于本插件时 Cordis 会把 fiber 永久挂在 PENDING，`apply()` 从不执行，
 * **一条通知都发不出**，且没有任何告警指向真正原因。
 * 同理 `sessionTitle` 也绝不写进 inject：它是可选增强，改由 `getSessionTitle` 用
 * `ctx.get` 按需安全读取，缺失时优雅降级为无标题。
 */
/**
 * 依赖列表刻意为空。
 *
 * 显式标注 `string[]` 并通过 `.at(0)` 之外的形态导出，是为了让 esbuild 产出的
 * `var inject = []` 在 TS 眼中仍是 `string[]` 而非 `never[]` ——
 * 后者会让下游 `inject.includes('x')` 之类的断言在类型层面无法成立。
 * （esbuild 会剥离注释，因此不能依赖 JSDoc 传递类型。）
 */
export const inject: string[] = [] as string[];
export { Config };
export type { NotifierConfig };

export interface ApplyOptions {
  dispatcher?: NotificationDispatcher;
}

const MAX_TRACKED_TURNS = 200;

/**
 * 轮次计时的过期时长：24 小时。
 *
 * 计时表位于模块级以跨越 `restart()` 存活，因此无法依赖 `apply()` 的清理时机；
 * 超过该时长的陈旧条目（例如进程被挂起后恢复）一律视为无效并回收，
 * 避免长时间运行下 Map 无界增长。
 */
const TURN_TIME_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 轮次计时表：**模块级**而非 `apply()` 内局部。
 *
 * 聚合总线热重载子插件时走的是 Cordis `Fiber.update()`，其内部为 `restart()`
 * （dispose 再 apply）而非原地热更新。若计时表是局部变量，一轮 turn 的 start 发生在
 * 重载前、end 发生在重载后，`startTime` 就会取不到，耗时被保守记为 0 并触发
 * `minDurationSeconds` 过滤 —— **该轮结束通知静默丢失**。
 * 提升到模块级后，重启不再清空计时，跨重载的轮次仍能算出真实耗时。
 */
const turnStartTimes = new Map<string, number>();

export function apply(ctx: any, rawConfig: unknown, options?: ApplyOptions): void {
  const config = resolveConfig(rawConfig);
  const dispatcher = options?.dispatcher || new NotificationDispatcher(config);

  // 计时表为模块级，**热重载（restart）期间不得清空**：否则「start 在重载前、
  // end 在重载后」的轮次会丢失耗时、被 minDurationSeconds 阈值过滤掉。
  // 因此这里不做任何清理：条目由 MAX_TRACKED_TURNS 容量淘汰与 TURN_TIME_TTL_MS
  // 过期回收共同收敛，长期运行也不会无界增长。

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

    // 兼容可能直接携带在 session 根属性上的 title 或 cwd
    if (session.title) {
      return session.title;
    }
    if (session.cwd) {
      return session.cwd;
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
      // 先回收超过 TTL 的陈旧条目，再做容量淘汰（仅淘汰最旧的一条无法防止持续泄漏）
      const now = Date.now();
      for (const [existingKey, startedAt] of turnStartTimes) {
        if (now - startedAt > TURN_TIME_TTL_MS) turnStartTimes.delete(existingKey);
      }
      if (turnStartTimes.size >= MAX_TRACKED_TURNS) {
        const oldestKey = turnStartTimes.keys().next().value;
        if (oldestKey) turnStartTimes.delete(oldestKey);
      }
      turnStartTimes.set(key, now);
    } else if (event.type === 'turn/end') {
      const turn = event.data?.turn ?? 0;
      const key = `${session?.id || 'default'}:${turn}`;
      const startTime = turnStartTimes.get(key);
      turnStartTimes.delete(key);

      // 若未捕获到 turn/start（如中途热重载或超限淘汰），保守设为 0，避免瞬间失败的短任务被误报为耗时无限大
      const durationMs = startTime !== undefined ? Math.max(0, Date.now() - startTime) : 0;
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
