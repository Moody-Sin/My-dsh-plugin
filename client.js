"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/client.tsx
  var import_react4 = __toESM(__require("react"), 1);

  // src/ui/SettingsTab.tsx
  var import_react3 = __toESM(__require("react"), 1);

  // src/ui/NotifierCard.tsx
  var import_react = __toESM(__require("react"), 1);
  function NotifierCard({
    config,
    onChange,
    onTestNotify,
    testStatus
  }) {
    const notifier = config?.plugins?.notifier || { enabled: true };
    const desktop = notifier.desktop || { enabled: true };
    const sound = notifier.sound || { enabled: true };
    const events = notifier.events || {
      onTurnEnd: true,
      onQuestion: true,
      onApproval: true,
      onError: true,
      minDurationSeconds: 5
    };
    const webhook = notifier.webhook || {
      enabled: false,
      provider: "generic",
      url: "",
      secret: ""
    };
    const updateNotifier = (key, val) => {
      onChange((prev) => ({
        ...prev,
        plugins: {
          ...prev.plugins,
          notifier: {
            ...prev.plugins?.notifier,
            [key]: val
          }
        }
      }));
    };
    const updateDesktop = (key, val) => {
      updateNotifier("desktop", { ...desktop, [key]: val });
    };
    const updateSound = (key, val) => {
      updateNotifier("sound", { ...sound, [key]: val });
    };
    const updateEvents = (key, val) => {
      updateNotifier("events", { ...events, [key]: val });
    };
    const updateWebhook = (key, val) => {
      updateNotifier("webhook", { ...webhook, [key]: val });
    };
    return /* @__PURE__ */ import_react.default.createElement(
      "div",
      {
        style: {
          border: "0.5px solid var(--dsw-alias-border-l3, #333)",
          borderRadius: "var(--dsw-radius-xl, 12px)",
          background: "var(--dsw-alias-settings-card-fill, #1a1a1a)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px"
        }
      },
      /* @__PURE__ */ import_react.default.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }
        },
        /* @__PURE__ */ import_react.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ import_react.default.createElement("span", { style: { fontSize: "18px" } }, "\u{1F514}"), /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("div", { style: { fontWeight: 600, fontSize: "15px" } }, "\u901A\u77E5\u4E2D\u5FC3 (dsh-notifier)"), /* @__PURE__ */ import_react.default.createElement(
          "div",
          {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-tertiary, #888)"
            }
          },
          "\u652F\u6301\u8DE8\u5E73\u53F0\u7CFB\u7EDF\u539F\u751F\u684C\u9762\u5F39\u7A97\u3001\u63D0\u793A\u97F3\u4E0E Webhook \u79BB\u673A\u591A\u6E20\u9053\u63A8\u9001"
        ))),
        /* @__PURE__ */ import_react.default.createElement(
          "label",
          {
            style: {
              display: "inline-flex",
              alignItems: "center",
              cursor: "pointer",
              gap: "6px"
            }
          },
          /* @__PURE__ */ import_react.default.createElement(
            "input",
            {
              type: "checkbox",
              checked: notifier.enabled !== false,
              onChange: (e) => updateNotifier("enabled", e.target.checked)
            }
          ),
          /* @__PURE__ */ import_react.default.createElement("span", { style: { fontSize: "13px" } }, "\u542F\u7528\u63D2\u4EF6")
        )
      ),
      notifier.enabled !== false && /* @__PURE__ */ import_react.default.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginTop: "4px"
          }
        },
        /* @__PURE__ */ import_react.default.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }
          },
          /* @__PURE__ */ import_react.default.createElement("span", { style: { fontSize: "13px" } }, "\u901A\u77E5\u8BED\u8A00"),
          /* @__PURE__ */ import_react.default.createElement(
            "select",
            {
              value: notifier.locale || "auto",
              onChange: (e) => updateNotifier("locale", e.target.value),
              style: {
                background: "var(--dsw-alias-bg-layer-1, #242424)",
                color: "var(--dsw-alias-label-primary, #fff)",
                border: "0.5px solid var(--dsw-alias-border-l4, #444)",
                borderRadius: "var(--dsw-radius-md, 6px)",
                padding: "4px 8px",
                fontSize: "13px"
              }
            },
            /* @__PURE__ */ import_react.default.createElement("option", { value: "auto" }, "\u8DDF\u968F\u7CFB\u7EDF (auto)"),
            /* @__PURE__ */ import_react.default.createElement("option", { value: "zh" }, "\u7B80\u4F53\u4E2D\u6587 (zh)"),
            /* @__PURE__ */ import_react.default.createElement("option", { value: "en" }, "English (en)")
          )
        ),
        /* @__PURE__ */ import_react.default.createElement(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px"
            }
          },
          /* @__PURE__ */ import_react.default.createElement(
            "label",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--dsw-alias-bg-layer-1, #242424)",
                padding: "10px 12px",
                borderRadius: "var(--dsw-radius-md, 6px)",
                cursor: "pointer"
              }
            },
            /* @__PURE__ */ import_react.default.createElement(
              "input",
              {
                type: "checkbox",
                checked: desktop.enabled !== false,
                onChange: (e) => updateDesktop("enabled", e.target.checked)
              }
            ),
            /* @__PURE__ */ import_react.default.createElement("span", { style: { fontSize: "13px" } }, "\u{1F4BB} \u7CFB\u7EDF\u684C\u9762\u5F39\u7A97")
          ),
          /* @__PURE__ */ import_react.default.createElement(
            "label",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--dsw-alias-bg-layer-1, #242424)",
                padding: "10px 12px",
                borderRadius: "var(--dsw-radius-md, 6px)",
                cursor: "pointer"
              }
            },
            /* @__PURE__ */ import_react.default.createElement(
              "input",
              {
                type: "checkbox",
                checked: sound.enabled !== false,
                onChange: (e) => updateSound("enabled", e.target.checked)
              }
            ),
            /* @__PURE__ */ import_react.default.createElement("span", { style: { fontSize: "13px" } }, "\u{1F50A} \u7CFB\u7EDF\u63D0\u793A\u97F3")
          )
        ),
        /* @__PURE__ */ import_react.default.createElement(
          "div",
          {
            style: {
              background: "var(--dsw-alias-bg-layer-1, #242424)",
              padding: "12px",
              borderRadius: "var(--dsw-radius-md, 6px)",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }
          },
          /* @__PURE__ */ import_react.default.createElement("div", { style: { fontSize: "13px", fontWeight: 500 } }, "\u89E6\u53D1\u65F6\u673A\u4E0E\u8017\u65F6\u8FC7\u6EE4"),
          /* @__PURE__ */ import_react.default.createElement(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "8px",
                fontSize: "12px"
              }
            },
            /* @__PURE__ */ import_react.default.createElement(
              "label",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer"
                }
              },
              /* @__PURE__ */ import_react.default.createElement(
                "input",
                {
                  type: "checkbox",
                  checked: events.onTurnEnd !== false,
                  onChange: (e) => updateEvents("onTurnEnd", e.target.checked)
                }
              ),
              /* @__PURE__ */ import_react.default.createElement("span", null, "\u56DE\u5408\u7ED3\u675F (onTurnEnd)")
            ),
            /* @__PURE__ */ import_react.default.createElement(
              "label",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer"
                }
              },
              /* @__PURE__ */ import_react.default.createElement(
                "input",
                {
                  type: "checkbox",
                  checked: events.onQuestion !== false,
                  onChange: (e) => updateEvents("onQuestion", e.target.checked)
                }
              ),
              /* @__PURE__ */ import_react.default.createElement("span", null, "\u7528\u6237\u63D0\u95EE (onQuestion)")
            ),
            /* @__PURE__ */ import_react.default.createElement(
              "label",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer"
                }
              },
              /* @__PURE__ */ import_react.default.createElement(
                "input",
                {
                  type: "checkbox",
                  checked: events.onApproval !== false,
                  onChange: (e) => updateEvents("onApproval", e.target.checked)
                }
              ),
              /* @__PURE__ */ import_react.default.createElement("span", null, "\u5BA1\u6279\u786E\u8BA4 (onApproval)")
            ),
            /* @__PURE__ */ import_react.default.createElement(
              "label",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer"
                }
              },
              /* @__PURE__ */ import_react.default.createElement(
                "input",
                {
                  type: "checkbox",
                  checked: events.onError !== false,
                  onChange: (e) => updateEvents("onError", e.target.checked)
                }
              ),
              /* @__PURE__ */ import_react.default.createElement("span", null, "\u6267\u884C\u5F02\u5E38 (onError)")
            )
          ),
          /* @__PURE__ */ import_react.default.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "4px"
              }
            },
            /* @__PURE__ */ import_react.default.createElement(
              "span",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--dsw-alias-label-tertiary, #888)"
                }
              },
              "\u8FC7\u6EE4\u6781\u901F\u4EFB\u52A1\uFF1A\u6700\u5C0F\u8017\u65F6\u9608\u503C\uFF08\u79D2\uFF09"
            ),
            /* @__PURE__ */ import_react.default.createElement(
              "input",
              {
                type: "number",
                min: "0",
                value: events.minDurationSeconds ?? 5,
                onChange: (e) => updateEvents(
                  "minDurationSeconds",
                  Math.max(0, parseInt(e.target.value, 10) || 0)
                ),
                style: {
                  width: "60px",
                  background: "var(--dsw-alias-bg-layer-2, #333)",
                  color: "var(--dsw-alias-label-primary, #fff)",
                  border: "0.5px solid var(--dsw-alias-border-l4, #444)",
                  borderRadius: "var(--dsw-radius-sm, 4px)",
                  padding: "2px 6px",
                  fontSize: "12px"
                }
              }
            )
          )
        ),
        /* @__PURE__ */ import_react.default.createElement(
          "div",
          {
            style: {
              background: "var(--dsw-alias-bg-layer-1, #242424)",
              padding: "12px",
              borderRadius: "var(--dsw-radius-md, 6px)",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            }
          },
          /* @__PURE__ */ import_react.default.createElement(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }
            },
            /* @__PURE__ */ import_react.default.createElement("div", { style: { fontSize: "13px", fontWeight: 500 } }, "\u{1F310} Webhook \u79BB\u673A\u63A8\u9001"),
            /* @__PURE__ */ import_react.default.createElement(
              "label",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer"
                }
              },
              /* @__PURE__ */ import_react.default.createElement(
                "input",
                {
                  type: "checkbox",
                  checked: Boolean(webhook.enabled),
                  onChange: (e) => updateWebhook("enabled", e.target.checked)
                }
              ),
              /* @__PURE__ */ import_react.default.createElement("span", { style: { fontSize: "12px" } }, "\u5F00\u542F\u63A8\u9001")
            )
          ),
          webhook.enabled && /* @__PURE__ */ import_react.default.createElement(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                fontSize: "12px"
              }
            },
            /* @__PURE__ */ import_react.default.createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }
              },
              /* @__PURE__ */ import_react.default.createElement("span", null, "\u63D0\u4F9B\u5546"),
              /* @__PURE__ */ import_react.default.createElement(
                "select",
                {
                  value: webhook.provider || "generic",
                  onChange: (e) => updateWebhook("provider", e.target.value),
                  style: {
                    background: "var(--dsw-alias-bg-layer-2, #333)",
                    color: "var(--dsw-alias-label-primary, #fff)",
                    border: "0.5px solid var(--dsw-alias-border-l4, #444)",
                    borderRadius: "var(--dsw-radius-sm, 4px)",
                    padding: "2px 6px",
                    fontSize: "12px"
                  }
                },
                /* @__PURE__ */ import_react.default.createElement("option", { value: "feishu" }, "\u98DE\u4E66\u673A\u5668\u4EBA"),
                /* @__PURE__ */ import_react.default.createElement("option", { value: "dingtalk" }, "\u9489\u9489\u673A\u5668\u4EBA"),
                /* @__PURE__ */ import_react.default.createElement("option", { value: "wecom" }, "\u4F01\u4E1A\u5FAE\u4FE1"),
                /* @__PURE__ */ import_react.default.createElement("option", { value: "bark" }, "Bark (iOS)"),
                /* @__PURE__ */ import_react.default.createElement("option", { value: "telegram" }, "Telegram"),
                /* @__PURE__ */ import_react.default.createElement("option", { value: "discord" }, "Discord"),
                /* @__PURE__ */ import_react.default.createElement("option", { value: "generic" }, "\u81EA\u5B9A\u4E49\u901A\u7528 Webhook")
              )
            ),
            /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("div", { style: { marginBottom: "2px" } }, "Webhook \u5730\u5740 (URL)"), /* @__PURE__ */ import_react.default.createElement(
              "input",
              {
                type: "text",
                placeholder: "https://... \u652F\u6301 ${WEBHOOK_URL}",
                value: webhook.url || "",
                onChange: (e) => updateWebhook("url", e.target.value),
                style: {
                  width: "100%",
                  boxSizing: "border-box",
                  background: "var(--dsw-alias-bg-layer-2, #333)",
                  color: "var(--dsw-alias-label-primary, #fff)",
                  border: "0.5px solid var(--dsw-alias-border-l4, #444)",
                  borderRadius: "var(--dsw-radius-sm, 4px)",
                  padding: "4px 8px",
                  fontSize: "12px"
                }
              }
            )),
            /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("div", { style: { marginBottom: "2px" } }, "\u7B7E\u540D\u5BC6\u94A5 (Secret\uFF0C\u53EF\u9009)"), /* @__PURE__ */ import_react.default.createElement(
              "input",
              {
                type: "password",
                placeholder: "\u652F\u6301 ${WEBHOOK_SECRET}",
                value: webhook.secret || "",
                onChange: (e) => updateWebhook("secret", e.target.value),
                style: {
                  width: "100%",
                  boxSizing: "border-box",
                  background: "var(--dsw-alias-bg-layer-2, #333)",
                  color: "var(--dsw-alias-label-primary, #fff)",
                  border: "0.5px solid var(--dsw-alias-border-l4, #444)",
                  borderRadius: "var(--dsw-radius-sm, 4px)",
                  padding: "4px 8px",
                  fontSize: "12px"
                }
              }
            ))
          )
        ),
        /* @__PURE__ */ import_react.default.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "4px"
            }
          },
          /* @__PURE__ */ import_react.default.createElement(
            "button",
            {
              type: "button",
              onClick: onTestNotify,
              disabled: testStatus?.loading,
              style: {
                border: "0.5px solid var(--dsw-alias-border-l3, #555)",
                borderRadius: "var(--dsw-radius-md, 6px)",
                background: "var(--dsw-alias-bg-layer-1, #2a2a2a)",
                color: "var(--dsw-alias-label-primary, #fff)",
                padding: "6px 14px",
                fontSize: "12px",
                cursor: testStatus?.loading ? "not-allowed" : "pointer"
              }
            },
            testStatus?.loading ? "\u6B63\u5728\u6D4B\u8BD5\u901A\u77E5..." : "\u26A1 \u53D1\u9001\u6D4B\u8BD5\u901A\u77E5"
          ),
          testStatus?.result && /* @__PURE__ */ import_react.default.createElement("span", { style: { fontSize: "12px", color: "#4ade80" } }, "\u2705 \u6D4B\u8BD5\u8BF7\u6C42\u5DF2\u6267\u884C"),
          testStatus?.error && /* @__PURE__ */ import_react.default.createElement("span", { style: { fontSize: "12px", color: "#f87171" } }, "\u274C ", testStatus.error)
        )
      )
    );
  }

  // src/ui/ModelIndicatorCard.tsx
  var import_react2 = __toESM(__require("react"), 1);
  function ModelIndicatorCard({
    config,
    onChange
  }) {
    const indicator = config?.plugins?.["subagent-model-indicator"] || {
      enabled: true
    };
    const updateIndicator = (key, val) => {
      onChange((prev) => ({
        ...prev,
        plugins: {
          ...prev.plugins,
          "subagent-model-indicator": {
            ...prev.plugins?.["subagent-model-indicator"],
            [key]: val
          }
        }
      }));
    };
    return /* @__PURE__ */ import_react2.default.createElement(
      "div",
      {
        style: {
          border: "0.5px solid var(--dsw-alias-border-l3, #333)",
          borderRadius: "var(--dsw-radius-xl, 12px)",
          background: "var(--dsw-alias-settings-card-fill, #1a1a1a)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px"
        }
      },
      /* @__PURE__ */ import_react2.default.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }
        },
        /* @__PURE__ */ import_react2.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ import_react2.default.createElement("span", { style: { fontSize: "18px" } }, "\u{1F3F7}\uFE0F"), /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("div", { style: { fontWeight: 600, fontSize: "15px" } }, "\u5B50\u667A\u80FD\u4F53\u6A21\u578B\u6307\u793A\u5668 (dsh-subagent-model-indicator)"), /* @__PURE__ */ import_react2.default.createElement(
          "div",
          {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-tertiary, #888)"
            }
          },
          "\u5728\u5B50\u667A\u80FD\u4F53\u5BF9\u8BDD\u9875\u9762\u5934\u90E8\u76F4\u89C2\u5C55\u793A\u5F53\u524D\u6A21\u578B\u540D\u79F0\u4E0E\u63A8\u7406\u5C42\u7EA7 (Reasoning Effort)"
        ))),
        /* @__PURE__ */ import_react2.default.createElement(
          "label",
          {
            style: {
              display: "inline-flex",
              alignItems: "center",
              cursor: "pointer",
              gap: "6px"
            }
          },
          /* @__PURE__ */ import_react2.default.createElement(
            "input",
            {
              type: "checkbox",
              checked: indicator.enabled !== false,
              onChange: (e) => updateIndicator("enabled", e.target.checked)
            }
          ),
          /* @__PURE__ */ import_react2.default.createElement("span", { style: { fontSize: "13px" } }, "\u542F\u7528\u6307\u793A\u5668")
        )
      ),
      indicator.enabled !== false && /* @__PURE__ */ import_react2.default.createElement(
        "div",
        {
          style: {
            background: "var(--dsw-alias-bg-layer-1, #242424)",
            padding: "12px",
            borderRadius: "var(--dsw-radius-md, 6px)",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }
        },
        /* @__PURE__ */ import_react2.default.createElement(
          "div",
          {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-tertiary, #aaa)"
            }
          },
          "\u5C55\u793A\u6548\u679C\u9884\u89C8\uFF1A"
        ),
        /* @__PURE__ */ import_react2.default.createElement(
          "div",
          {
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "2px 8px",
              borderRadius: "9999px",
              background: "rgba(59, 130, 246, 0.15)",
              border: "0.5px solid rgba(59, 130, 246, 0.3)",
              color: "#60a5fa",
              fontSize: "12px",
              fontWeight: 500
            }
          },
          /* @__PURE__ */ import_react2.default.createElement("span", null, "\u{1F916}"),
          /* @__PURE__ */ import_react2.default.createElement("span", null, "DeepSeek-V3 \xB7 high")
        )
      )
    );
  }

  // src/ui/SettingsTab.tsx
  function SettingsTab() {
    const [config, setConfig] = (0, import_react3.useState)(null);
    const [target, setTarget] = (0, import_react3.useState)("local");
    const [loading, setLoading] = (0, import_react3.useState)(false);
    const [saving, setSaving] = (0, import_react3.useState)(false);
    const [message, setMessage] = (0, import_react3.useState)(null);
    const [testStatus, setTestStatus] = (0, import_react3.useState)({
      loading: false
    });
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/local-plugins/config");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setConfig(data.merged || { plugins: {} });
        setMessage(null);
      } catch (err) {
        setMessage({ text: `\u52A0\u8F7D\u914D\u7F6E\u5931\u8D25: ${err.message}`, error: true });
      } finally {
        setLoading(false);
      }
    };
    (0, import_react3.useEffect)(() => {
      fetchConfig();
    }, []);
    const handleSave = async () => {
      if (!config) return;
      setSaving(true);
      setMessage(null);
      try {
        const res = await fetch("/api/local-plugins/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target, config })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setMessage({
          text: `\u2705 \u914D\u7F6E\u5DF2\u6210\u529F\u4FDD\u5B58\u81F3 ${target === "local" ? "plugins.config.local.json" : "plugins.config.json"} \u5E76\u5373\u65F6\u70ED\u751F\u6548\uFF01`
        });
      } catch (err) {
        setMessage({ text: `\u4FDD\u5B58\u5931\u8D25: ${err.message}`, error: true });
      } finally {
        setSaving(false);
      }
    };
    const handleTestNotify = async () => {
      setTestStatus({ loading: true });
      try {
        const res = await fetch("/api/local-plugins/test-notify", {
          method: "POST"
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTestStatus({ loading: false, result: data });
      } catch (err) {
        setTestStatus({ loading: false, error: err.message });
      }
    };
    if (loading && !config) {
      return /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: "24px", color: "var(--dsw-alias-label-tertiary, #888)" } }, "\u6B63\u5728\u8BFB\u53D6\u672C\u5730\u63D2\u4EF6\u914D\u7F6E...");
    }
    return /* @__PURE__ */ import_react3.default.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          maxWidth: "760px",
          color: "var(--dsw-alias-label-primary, #fff)",
          padding: "4px 0 24px 0"
        }
      },
      /* @__PURE__ */ import_react3.default.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            paddingBottom: "12px",
            borderBottom: "0.5px solid var(--dsw-alias-border-l2, #333)"
          }
        },
        /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: "18px", fontWeight: 600 } }, "\u672C\u5730\u63D2\u4EF6\u53C2\u6570\u914D\u7F6E"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: "13px", color: "var(--dsw-alias-label-tertiary, #888)" } }, "\u7EDF\u4E00\u7BA1\u7406\u672C\u5730\u805A\u5408\u63D2\u4EF6\u7684\u8FD0\u884C\u53C2\u6570\uFF0C\u4FDD\u5B58\u540E\u65E0\u9700\u91CD\u542F DSH \u81EA\u52A8\u70ED\u751F\u6548\u3002")),
        /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, /* @__PURE__ */ import_react3.default.createElement(
          "select",
          {
            value: target,
            onChange: (e) => setTarget(e.target.value),
            title: "\u4FDD\u5B58\u4F4D\u7F6E\uFF1Alocal \u4E3A\u79C1\u6709\u8986\u76D6\uFF08\u542B Secret\uFF0C\u4E0D\u8FDB Git\uFF09\uFF1Bbase \u4E3A\u57FA\u7840\u9ED8\u8BA4\u914D\u7F6E",
            style: {
              background: "var(--dsw-alias-bg-layer-1, #242424)",
              color: "var(--dsw-alias-label-primary, #fff)",
              border: "0.5px solid var(--dsw-alias-border-l4, #444)",
              borderRadius: "var(--dsw-radius-md, 6px)",
              padding: "6px 8px",
              fontSize: "12px"
            }
          },
          /* @__PURE__ */ import_react3.default.createElement("option", { value: "local" }, "\u4FDD\u5B58\u81F3 local.json (\u79C1\u6709\u63A8\u8350)"),
          /* @__PURE__ */ import_react3.default.createElement("option", { value: "base" }, "\u4FDD\u5B58\u81F3 config.json (\u5171\u4EAB\u63D0\u4EA4)")
        ), /* @__PURE__ */ import_react3.default.createElement(
          "button",
          {
            type: "button",
            onClick: handleSave,
            disabled: saving || !config,
            style: {
              background: "var(--dsw-alias-state-business-primary, #3b82f6)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--dsw-radius-md, 6px)",
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: saving ? "not-allowed" : "pointer"
            }
          },
          saving ? "\u4FDD\u5B58\u4E2D..." : "\u{1F4BE} \u4FDD\u5B58\u66F4\u6539"
        ))
      ),
      message && /* @__PURE__ */ import_react3.default.createElement(
        "div",
        {
          style: {
            padding: "8px 12px",
            borderRadius: "var(--dsw-radius-md, 6px)",
            background: message.error ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
            color: message.error ? "#f87171" : "#4ade80",
            fontSize: "13px"
          }
        },
        message.text
      ),
      /* @__PURE__ */ import_react3.default.createElement(
        NotifierCard,
        {
          config,
          onChange: setConfig,
          onTestNotify: handleTestNotify,
          testStatus
        }
      ),
      /* @__PURE__ */ import_react3.default.createElement(ModelIndicatorCard, { config, onChange: setConfig })
    );
  }

  // src/client.tsx
  function registerSettingsUI() {
    const PLUGIN_ID = "@local/my-dsh-plugins/settings-ui";
    if (typeof window === "undefined") return;
    const w = window;
    if (w.__my_dsh_plugins_settings_ui_registered__) return;
    w.__my_dsh_plugins_settings_ui_registered__ = true;
    const ml = w.__ModuleLoader__;
    if (ml?.load) {
      const alreadyInQueue = ml.mode === "queue" && Array.isArray(ml.pendingQueue) && ml.pendingQueue.some((reg) => reg.id === PLUGIN_ID);
      if (!alreadyInQueue) {
        try {
          ml.load({
            id: PLUGIN_ID,
            factory(require2) {
              const ReactMod = require2("react");
              return {
                inject: ["slots", "locale"],
                apply(ctx) {
                  setupSettingsSlot(ctx, ReactMod);
                }
              };
            }
          });
        } catch {
        }
      }
    }
    if (typeof document !== "undefined") {
      mountDirectSlot();
    }
  }
  function setupSettingsSlot(ctx, ReactMod) {
    try {
      ctx.slots.inject(
        "settings.plugins.tab",
        () => ctx.slots.register(
          {
            name: "settings.plugins.tab",
            id: "local-plugins-config",
            order: 5,
            // 排在官方只读清单前面
            label: () => "\u53C2\u6570\u914D\u7F6E"
          },
          () => ReactMod.createElement(SettingsTab, null)
        )
      );
    } catch (err) {
    }
  }
  function mountDirectSlot() {
    try {
      const w = window;
      const slotService = w.__DSH_SLOTS__ || w.__dsh_slots__;
      if (slotService?.register && !w.__my_dsh_plugins_tab_direct_registered__) {
        w.__my_dsh_plugins_tab_direct_registered__ = true;
        slotService.register(
          {
            name: "settings.plugins.tab",
            id: "local-plugins-config",
            order: 5,
            label: "\u53C2\u6570\u914D\u7F6E"
          },
          () => import_react4.default.createElement(SettingsTab, null)
        );
      }
    } catch {
    }
  }
  registerSettingsUI();
})();
