import { formatModelBadgeText, formatModelName, formatModelTooltip } from './formatter.ts';

declare const window: any;
declare const document: any;

function isChineseLocale(): boolean {
  if (typeof document !== 'undefined') {
    const lang = document.documentElement?.lang || '';
    if (lang.toLowerCase().startsWith('zh')) return true;
  }
  if (typeof navigator !== 'undefined') {
    const navLang = navigator.language || '';
    if (navLang.toLowerCase().startsWith('zh')) return true;
  }
  return true;
}

/**
 * 客户端浏览器 bundle 入口：通过 __ModuleLoader__.load 注册到 DSH 客户端模块系统。
 *
 * 只保留这一条路径。DSH 会在渲染 index.html 之前先输出模块队列脚本
 * （`dsh-client-modules` 的 `bootInjections` 保证 `window.__ModuleLoader__` 在
 * queue 模式下必然存在），本 bundle 执行时 `ml.load` 一定可用；
 * 曾有的「扫 React Fiber 找 slot 服务 + 15 秒轮询兜底」属于不可达路径，已删除。
 */
export function registerClientExtension() {
  const PLUGIN_ID = '@local/dsh-subagent-model-indicator';

  if (typeof window === 'undefined') return;
  const w = window as any;

  // 防重复执行守卫：无论脚本被以任何形式注入或执行多少次，确保完全幂等
  if (w.__subagent_model_indicator_registered__) return;
  w.__subagent_model_indicator_registered__ = true;

  const ml = w.__ModuleLoader__;
  if (!ml?.load) return;

  // 防重保护：在 queue 模式下检查 pendingQueue，避免重复推入
  const alreadyInQueue =
    ml.mode === 'queue' &&
    Array.isArray(ml.pendingQueue) &&
    ml.pendingQueue.some((reg: any) => reg.id === PLUGIN_ID);
  if (alreadyInQueue) return;

  ml.load({
    id: PLUGIN_ID,
    factory(require: any) {
      const React = require('react');
      return {
        // 会话数据经 props.useSessions 由插槽宿主注入，无需声明 sessions 服务依赖
        inject: ['slots'],
        apply(ctx: any) {
          setupSlots(ctx, React);
        },
      };
    },
  });
}

function setupSlots(ctx: any, React: any) {
  function SubagentModelBadge(props: any) {
    const session = props.useSessions?.((state: any) => state.byId[props.sessionId]);
    const isSubagent =
      session?.origin === 'subagent' || session?.projectionValues?.subagent != null;
    if (!isSubagent) return null;

    const modelInfo =
      session?.projectionValues?.modelSelection?.next ??
      session?.projectionValues?.modelSelection?.lastUsed;
    if (!modelInfo || !modelInfo.model) return null;

    const rawModel = modelInfo.model;
    const modelName = formatModelName(rawModel, true);
    const effort = modelInfo.reasoningEffort;
    const text = formatModelBadgeText(modelName, effort);
    const title = formatModelTooltip(
      modelInfo.provider,
      rawModel,
      effort,
      isChineseLocale(),
    );

    const svgIcon = React.createElement(
      'svg',
      {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        xmlns: 'http://www.w3.org/2000/svg',
        stroke: 'currentColor',
        strokeWidth: '1.2',
        style: { opacity: 0.8, flex: 'none' },
        'aria-hidden': 'true',
      },
      React.createElement('path', {
        d: 'M8 1.5C4.41 1.5 1.5 4.41 1.5 8s2.91 6.5 6.5 6.5 6.5-2.91 6.5-6.5S11.59 1.5 8 1.5zm0 2.5a2 2 0 110 4 2 2 0 010-4zm0 8c-2 0-3.5-1-4-2.5.5-1.5 2-2.5 4-2.5s3.5 1 4 2.5c-.5 1.5-2 2.5-4 2.5z',
      }),
    );

    return React.createElement(
      'span',
      {
        className: 'SVAs4q_label',
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '0 6px',
          height: '22px',
          borderRadius: 'var(--dsw-radius-xs, 4px)',
          background: 'var(--dsw-alias-fill-tsp-secondary, rgba(0, 0, 0, 0.04))',
          color: 'var(--dsw-alias-label-secondary, #60646c)',
          fontSize: '12px',
          lineHeight: '22px',
          whiteSpace: 'nowrap',
          fontWeight: 500,
        },
        title,
      },
      svgIcon,
      text,
    );
  }

  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'subagent-model-indicator',
        order: 5,
      },
      SubagentModelBadge,
    ),
  );
}

// 自动执行客户端自注册
registerClientExtension();
