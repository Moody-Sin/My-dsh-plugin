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
 * 同时支持直接作为全局脚本在 index.html 预加载阶段执行。
 */
export function registerClientExtension() {
  const PLUGIN_ID = '@local/dsh-subagent-model-indicator';

  // 1. 尝试注册进 ModuleLoader（DSH 规范 bundle 机制）
  if (typeof window !== 'undefined' && window.__ModuleLoader__?.load) {
    try {
      window.__ModuleLoader__.load({
        id: PLUGIN_ID,
        factory(require: any) {
          const React = require('react');
          return {
            inject: ['slots', 'sessions'],
            apply(ctx: any) {
              setupSlots(ctx, React);
            },
          };
        },
      });
    } catch {
      // 容错处理
    }
  }

  // 2. 补丁注入：若页面已处于运行阶段，拦截 slotService 并动态挂载
  if (typeof document !== 'undefined') {
    mountDirectSlot();
  }
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
    const modelName = formatModelName(rawModel);
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

function mountDirectSlot() {
  function tryInject() {
    const elements = document.querySelectorAll('*');
    let slotService: any = null;
    for (const el of elements) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
      if (!key) continue;
      let f = (el as any)[key];
      while (f) {
        if (
          f.type &&
          typeof f.type === 'object' &&
          f.type.$$typeof === Symbol.for('react.provider')
        ) {
          const val = f.memoizedProps?.value;
          if (val && typeof val === 'object' && typeof val.entriesOfSlot === 'function') {
            slotService = val;
            break;
          }
        }
        f = f.return;
      }
      if (slotService) break;
    }

    if (!slotService || slotService.__subagent_model_hooked) return false;
    slotService.__subagent_model_hooked = true;

    const origEntriesOfSlot = slotService.entriesOfSlot.bind(slotService);
    slotService.entriesOfSlot = function (name: string) {
      const res = origEntriesOfSlot(name);
      if (name === 'conversation.session.header.actions') {
        const alreadyHas = res.some(
          (e: any) => e.options?.id === 'subagent-model-indicator',
        );
        if (alreadyHas) return res;

        return [
          ...res,
          {
            component: function SubagentModelBadgeDirect(props: any) {
              const session = props.useSessions?.(
                (state: any) => state.byId[props.sessionId],
              );
              const isSubagent =
                session?.origin === 'subagent' ||
                session?.projectionValues?.subagent != null;
              if (!isSubagent) return null;

              const modelInfo =
                session?.projectionValues?.modelSelection?.next ??
                session?.projectionValues?.modelSelection?.lastUsed;
              if (!modelInfo || !modelInfo.model) return null;

              const rawModel = modelInfo.model;
              const modelName = formatModelName(rawModel);
              const effort = modelInfo.reasoningEffort;
              const text = formatModelBadgeText(modelName, effort);
              const title = formatModelTooltip(
                modelInfo.provider,
                rawModel,
                effort,
                isChineseLocale(),
              );

              // 构建标准 React 元素
              const svgElement = {
                $$typeof: Symbol.for('react.element'),
                type: 'svg',
                key: 'subagent-model-icon',
                ref: null,
                props: {
                  width: 13,
                  height: 13,
                  viewBox: '0 0 16 16',
                  fill: 'none',
                  xmlns: 'http://www.w3.org/2000/svg',
                  stroke: 'currentColor',
                  strokeWidth: '1.2',
                  style: { opacity: 0.8, flex: 'none' },
                  'aria-hidden': 'true',
                  children: {
                    $$typeof: Symbol.for('react.element'),
                    type: 'path',
                    key: null,
                    ref: null,
                    props: {
                      d: 'M8 1.5C4.41 1.5 1.5 4.41 1.5 8s2.91 6.5 6.5 6.5 6.5-2.91 6.5-6.5S11.59 1.5 8 1.5zm0 2.5a2 2 0 110 4 2 2 0 010-4zm0 8c-2 0-3.5-1-4-2.5.5-1.5 2-2.5 4-2.5s3.5 1 4 2.5c-.5 1.5-2 2.5-4 2.5z',
                    },
                    _owner: null,
                  },
                },
                _owner: null,
              };

              return {
                $$typeof: Symbol.for('react.element'),
                type: 'span',
                key: null,
                ref: null,
                props: {
                  className: 'SVAs4q_label',
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '0 6px',
                    height: '22px',
                    borderRadius: 'var(--dsw-radius-xs, 4px)',
                    background:
                      'var(--dsw-alias-fill-tsp-secondary, rgba(0, 0, 0, 0.04))',
                    color: 'var(--dsw-alias-label-secondary, #60646c)',
                    fontSize: '12px',
                    lineHeight: '22px',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  },
                  title,
                  children: [svgElement, text],
                },
                _owner: null,
              };
            },
            options: { id: 'subagent-model-indicator', order: 5 },
            registrant: '@local/dsh-subagent-model-indicator',
          },
        ];
      }
      return res;
    };
    return true;
  }

  if (!tryInject()) {
    let attempts = 0;
    const maxAttempts = 30; // 最多轮询 15 秒，避免无休止占用
    const timer = setInterval(() => {
      attempts++;
      if (tryInject() || attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 500);
  }
}

// 自动执行客户端自注册
registerClientExtension();
