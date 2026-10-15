"use strict";
(() => {
  // src/formatter.ts
  function formatModelName(fullModel, trimVersionSuffix = false) {
    if (!fullModel || typeof fullModel !== "string") return "";
    const parts = fullModel.split("/");
    let name = parts[parts.length - 1];
    if (name.toLowerCase().startsWith("gemini-")) {
      name = name.replace(/^gemini-/i, "Gemini ");
    } else if (name.toLowerCase().startsWith("deepseek-")) {
      name = name.replace(/^deepseek-/i, "DeepSeek ");
    } else if (name.toLowerCase().startsWith("claude-")) {
      name = name.replace(/^claude-/i, "Claude ");
    } else if (name.toLowerCase().startsWith("gpt-")) {
      name = name.replace(/^gpt-/i, "GPT-");
    } else if (name.toLowerCase().startsWith("minimax-")) {
      name = name.replace(/^minimax-/i, "MiniMax-");
    } else if (name.toLowerCase().startsWith("qwen-")) {
      name = name.replace(/^qwen-/i, "Qwen-");
    }
    if (trimVersionSuffix) {
      name = name.replace(/-(?:latest|\d{8})$/i, "");
    }
    return name;
  }
  function formatModelBadgeText(modelName, effort) {
    if (!modelName) return "";
    if (!effort) return modelName;
    return `${modelName} \xB7 ${effort.toUpperCase()}`;
  }
  function formatModelTooltip(provider, model, effort, isZh = true) {
    const fullModel = `${provider}/${model}`;
    if (isZh) {
      return effort ? `\u5B50\u667A\u80FD\u4F53\u6A21\u578B: ${fullModel} (\u63A8\u7406\u5C42\u7EA7: ${effort})` : `\u5B50\u667A\u80FD\u4F53\u6A21\u578B: ${fullModel}`;
    }
    return effort ? `Subagent Model: ${fullModel} (Reasoning Effort: ${effort})` : `Subagent Model: ${fullModel}`;
  }

  // src/client.ts
  function isChineseLocale() {
    if (typeof document !== "undefined") {
      const lang = document.documentElement?.lang || "";
      if (lang.toLowerCase().startsWith("zh")) return true;
    }
    if (typeof navigator !== "undefined") {
      const navLang = navigator.language || "";
      if (navLang.toLowerCase().startsWith("zh")) return true;
    }
    return true;
  }
  function registerClientExtension() {
    const PLUGIN_ID = "@local/dsh-subagent-model-indicator";
    if (typeof window === "undefined") return;
    const w = window;
    if (w.__subagent_model_indicator_registered__) return;
    w.__subagent_model_indicator_registered__ = true;
    const ml = w.__ModuleLoader__;
    if (!ml?.load) return;
    const alreadyInQueue = ml.mode === "queue" && Array.isArray(ml.pendingQueue) && ml.pendingQueue.some((reg) => reg.id === PLUGIN_ID);
    if (alreadyInQueue) return;
    ml.load({
      id: PLUGIN_ID,
      factory(require2) {
        const React = require2("react");
        return {
          // 会话数据经 props.useSessions 由插槽宿主注入，无需声明 sessions 服务依赖
          inject: ["slots"],
          apply(ctx) {
            setupSlots(ctx, React);
          }
        };
      }
    });
  }
  function setupSlots(ctx, React) {
    function SubagentModelBadge(props) {
      const session = props.useSessions?.((state) => state.byId[props.sessionId]);
      const isSubagent = session?.origin === "subagent" || session?.projectionValues?.subagent != null;
      if (!isSubagent) return null;
      const modelInfo = session?.projectionValues?.modelSelection?.next ?? session?.projectionValues?.modelSelection?.lastUsed;
      if (!modelInfo || !modelInfo.model) return null;
      const rawModel = modelInfo.model;
      const modelName = formatModelName(rawModel, true);
      const effort = modelInfo.reasoningEffort;
      const text = formatModelBadgeText(modelName, effort);
      const title = formatModelTooltip(
        modelInfo.provider,
        rawModel,
        effort,
        isChineseLocale()
      );
      const svgIcon = React.createElement(
        "svg",
        {
          width: 14,
          height: 14,
          viewBox: "0 0 16 16",
          fill: "none",
          xmlns: "http://www.w3.org/2000/svg",
          stroke: "currentColor",
          strokeWidth: "1.2",
          style: { opacity: 0.8, flex: "none" },
          "aria-hidden": "true"
        },
        React.createElement("path", {
          d: "M8 1.5C4.41 1.5 1.5 4.41 1.5 8s2.91 6.5 6.5 6.5 6.5-2.91 6.5-6.5S11.59 1.5 8 1.5zm0 2.5a2 2 0 110 4 2 2 0 010-4zm0 8c-2 0-3.5-1-4-2.5.5-1.5 2-2.5 4-2.5s3.5 1 4 2.5c-.5 1.5-2 2.5-4 2.5z"
        })
      );
      return React.createElement(
        "span",
        {
          className: "SVAs4q_label",
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "0 6px",
            height: "22px",
            borderRadius: "var(--dsw-radius-xs, 4px)",
            background: "var(--dsw-alias-fill-tsp-secondary, rgba(0, 0, 0, 0.04))",
            color: "var(--dsw-alias-label-secondary, #60646c)",
            fontSize: "12px",
            lineHeight: "22px",
            whiteSpace: "nowrap",
            fontWeight: 500
          },
          title
        },
        svgIcon,
        text
      );
    }
    ctx.slots.inject(
      "conversation.session.header.actions",
      () => ctx.slots.register(
        {
          name: "conversation.session.header.actions",
          id: "subagent-model-indicator",
          order: 5
        },
        SubagentModelBadge
      )
    );
  }
  registerClientExtension();
})();
