import { resolveConfig, Config, type NotifierConfig } from './config.ts';
import { NotificationDispatcher } from './dispatcher.ts';

export const name = 'notifier';
export const inject = ['sessions'];
export { Config };
export type { NotifierConfig };

export interface ApplyOptions {
  dispatcher?: NotificationDispatcher;
}

const MAX_TRACKED_TURNS = 200;

export function apply(ctx: any, rawConfig: unknown, options?: ApplyOptions): void {
  const config = resolveConfig(rawConfig);
  const dispatcher = options?.dispatcher || new NotificationDispatcher(config);

  const turnStartTimes = new Map<string, number>();

  // Ensure cleanup on plugin reload / unmount
  if (typeof ctx.on === 'function') {
    ctx.on('dispose', () => {
      turnStartTimes.clear();
    });
  }

  function getSessionTitle(session: any): string | undefined {
    if (!session) return undefined;
    try {
      if (ctx.sessionTitle?.titleOf) {
        return ctx.sessionTitle.titleOf(session);
      }
      if (ctx.sessionTitle?.title) {
        return ctx.sessionTitle.title(session);
      }
      if (session.header?.cwd) {
        return session.header.cwd;
      }
    } catch {
      // ignore
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
