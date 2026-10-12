// src/config.ts
var DEFAULT_LOCALE = "auto";
var DEFAULT_SERVER_PORT = 3088;
var DEFAULT_CONFIG = {
  locale: DEFAULT_LOCALE,
  desktop: {
    enabled: true,
    // 保留以保持完全向下兼容，实际过滤阈值以 events.minDurationSeconds 优先
    minDurationSeconds: 5
  },
  sound: {
    enabled: true
  },
  events: {
    onTurnEnd: true,
    onQuestion: true,
    onApproval: true,
    onError: true,
    minDurationSeconds: 5
  },
  webhook: {
    enabled: false,
    provider: "generic",
    url: "",
    secret: ""
  },
  server: {
    enabled: true,
    port: DEFAULT_SERVER_PORT
  }
};
var VALID_PROVIDERS = /* @__PURE__ */ new Set([
  "feishu",
  "dingtalk",
  "wecom",
  "bark",
  "telegram",
  "discord",
  "generic"
]);
var VALID_LOCALES = /* @__PURE__ */ new Set(["auto", "zh", "en"]);
function normalizeDurationSeconds(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : void 0;
}
function normalizePort(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return void 0;
  const port = Math.floor(value);
  return port >= 1 && port <= 65535 ? port : void 0;
}
function normalizeLocale(value) {
  return typeof value === "string" && VALID_LOCALES.has(value) ? value : DEFAULT_LOCALE;
}
function resolveConfig(candidate) {
  if (candidate === null || typeof candidate !== "object") {
    return {
      locale: DEFAULT_LOCALE,
      desktop: { ...DEFAULT_CONFIG.desktop },
      sound: { ...DEFAULT_CONFIG.sound },
      events: { ...DEFAULT_CONFIG.events },
      webhook: { ...DEFAULT_CONFIG.webhook },
      server: { ...DEFAULT_CONFIG.server }
    };
  }
  const raw = candidate;
  const desktopRaw = raw.desktop && typeof raw.desktop === "object" ? raw.desktop : {};
  const soundRaw = raw.sound && typeof raw.sound === "object" ? raw.sound : {};
  const eventsRaw = raw.events && typeof raw.events === "object" ? raw.events : {};
  const webhookRaw = raw.webhook && typeof raw.webhook === "object" ? raw.webhook : {};
  const serverRaw = raw.server && typeof raw.server === "object" ? raw.server : {};
  const desktopMin = normalizeDurationSeconds(desktopRaw.minDurationSeconds);
  const eventsMin = normalizeDurationSeconds(eventsRaw.minDurationSeconds);
  const minDuration = eventsMin ?? desktopMin ?? DEFAULT_CONFIG.events.minDurationSeconds ?? 5;
  const provider = VALID_PROVIDERS.has(webhookRaw.provider) ? webhookRaw.provider : DEFAULT_CONFIG.webhook.provider;
  return {
    locale: normalizeLocale(raw.locale),
    desktop: {
      enabled: typeof desktopRaw.enabled === "boolean" ? desktopRaw.enabled : DEFAULT_CONFIG.desktop.enabled,
      minDurationSeconds: desktopMin ?? minDuration
    },
    sound: {
      enabled: typeof soundRaw.enabled === "boolean" ? soundRaw.enabled : DEFAULT_CONFIG.sound.enabled
    },
    events: {
      onTurnEnd: typeof eventsRaw.onTurnEnd === "boolean" ? eventsRaw.onTurnEnd : DEFAULT_CONFIG.events.onTurnEnd,
      onQuestion: typeof eventsRaw.onQuestion === "boolean" ? eventsRaw.onQuestion : DEFAULT_CONFIG.events.onQuestion,
      onApproval: typeof eventsRaw.onApproval === "boolean" ? eventsRaw.onApproval : DEFAULT_CONFIG.events.onApproval,
      onError: typeof eventsRaw.onError === "boolean" ? eventsRaw.onError : DEFAULT_CONFIG.events.onError,
      minDurationSeconds: minDuration
    },
    webhook: {
      enabled: typeof webhookRaw.enabled === "boolean" ? webhookRaw.enabled : DEFAULT_CONFIG.webhook.enabled,
      provider,
      url: typeof webhookRaw.url === "string" ? webhookRaw.url : DEFAULT_CONFIG.webhook.url,
      secret: typeof webhookRaw.secret === "string" ? webhookRaw.secret : DEFAULT_CONFIG.webhook.secret
    },
    server: {
      enabled: typeof serverRaw.enabled === "boolean" ? serverRaw.enabled : DEFAULT_CONFIG.server.enabled,
      port: normalizePort(serverRaw.port) ?? DEFAULT_CONFIG.server.port
    }
  };
}
var SCHEMA_DICT = {
  locale: {
    type: "string",
    description: "\u901A\u77E5\u6587\u6848\u8BED\u8A00\uFF1Aauto\uFF08\u6309 DSH_LOCALE/LANG/LC_ALL \u81EA\u52A8\u5224\u65AD\uFF09| zh | en\uFF0C\u9ED8\u8BA4 auto",
    meta: { volatile: true }
  },
  desktop: {
    type: "object",
    description: "\u684C\u9762\u901A\u77E5\u6E20\u9053\u914D\u7F6E\uFF08minDurationSeconds \u5DF2\u5E9F\u5F03\uFF0C\u4EC5\u4F5C\u5411\u540E\u517C\u5BB9\u56DE\u9000\uFF09",
    // DSH 的 volatileForm() / isVolatilePath() 会无条件读取 node.meta.volatile，
    // 且会递归遍历 dict 的每一个子节点，因此每个节点都必须带 meta，否则设置面板会崩溃。
    meta: {},
    dict: {
      enabled: { type: "boolean", description: "\u662F\u5426\u542F\u7528\u64CD\u4F5C\u7CFB\u7EDF\u539F\u751F\u684C\u9762\u5F39\u7A97\u901A\u77E5", meta: { volatile: true } },
      minDurationSeconds: { type: "number", description: "[\u5DF2\u5E9F\u5F03] \u8BF7\u6539\u7528 events.minDurationSeconds", meta: {} }
    }
  },
  sound: {
    type: "object",
    description: "\u7CFB\u7EDF\u63D0\u793A\u97F3\u914D\u7F6E\uFF08Windows \u4E0B\u7531\u684C\u9762 Toast \u5185\u8054\u64AD\u653E\uFF0C\u4E0D\u989D\u5916\u542F\u52A8\u5B50\u8FDB\u7A0B\uFF09",
    meta: {},
    dict: {
      enabled: { type: "boolean", description: "\u662F\u5426\u5728\u901A\u77E5\u65F6\u64AD\u653E\u7CFB\u7EDF\u63D0\u793A\u97F3", meta: { volatile: true } }
    }
  },
  events: {
    type: "object",
    description: "\u4E8B\u4EF6\u5F00\u5173\u4E0E\u8FC7\u6EE4\u9608\u503C\u914D\u7F6E",
    meta: {},
    dict: {
      onTurnEnd: { type: "boolean", description: "\u4EFB\u52A1\u5B8C\u6210\u65F6\u662F\u5426\u901A\u77E5", meta: { volatile: true } },
      onQuestion: { type: "boolean", description: "Agent \u63D0\u95EE\u7B49\u5F85\u56DE\u7B54\u65F6\u662F\u5426\u901A\u77E5", meta: { volatile: true } },
      onApproval: { type: "boolean", description: "Agent \u7533\u8BF7\u6743\u9650\u5BA1\u6279\u65F6\u662F\u5426\u901A\u77E5", meta: { volatile: true } },
      onError: { type: "boolean", description: "Agent \u6267\u884C\u5F02\u5E38\u65F6\u662F\u5426\u901A\u77E5", meta: { volatile: true } },
      minDurationSeconds: {
        type: "number",
        description: "\u4EFB\u52A1\u5B8C\u6210\u901A\u77E5\u7684\u8017\u65F6\u8FC7\u6EE4\u9608\u503C\uFF08\u79D2\uFF09\uFF0C\u9ED8\u8BA4 5\uFF1B\u4E0E\u684C\u9762\u6E20\u9053\u5F00\u5173\u89E3\u8026",
        meta: { volatile: true }
      }
    }
  },
  webhook: {
    type: "object",
    description: "Webhook \u79BB\u673A\u63A8\u9001\u6E20\u9053\u914D\u7F6E",
    meta: {},
    dict: {
      enabled: { type: "boolean", description: "\u662F\u5426\u5F00\u542F Webhook \u8FDC\u7AEF\u63A8\u9001", meta: { volatile: true } },
      provider: {
        type: "string",
        description: "\u6E20\u9053\u7C7B\u578B\uFF1Afeishu | dingtalk | wecom | bark | telegram | discord | generic",
        meta: { volatile: true }
      },
      url: { type: "string", description: "Webhook \u673A\u5668\u4EBA\u5730\u5740", meta: { volatile: true } },
      secret: {
        type: "string",
        description: "\u7B7E\u540D\u5BC6\u94A5\uFF08\u53EF\u9009\uFF09\uFF1Btelegram \u6E20\u9053\u4E0B\u4F5C\u4E3A chat_id",
        meta: { volatile: true }
      }
    }
  },
  server: {
    type: "object",
    description: "\u5185\u7F6E\u8BBE\u7F6E\u770B\u677F\u4E0E\u4E00\u952E\u6D4B\u8BD5\u670D\u52A1\uFF08\u6539\u52A8\u9700\u91CD\u542F DSH \u540E\u751F\u6548\uFF09",
    meta: {},
    dict: {
      enabled: { type: "boolean", description: "\u662F\u5426\u968F\u63D2\u4EF6\u542F\u52A8\u672C\u5730\u8BBE\u7F6E\u770B\u677F\u670D\u52A1\uFF0C\u9ED8\u8BA4 true", meta: {} },
      port: { type: "number", description: "\u8BBE\u7F6E\u770B\u677F\u76D1\u542C\u7AEF\u53E3\uFF0C\u9ED8\u8BA4 3088\uFF1B\u88AB\u5360\u7528\u65F6\u81EA\u52A8\u5411\u540E\u63A2\u6D4B", meta: {} }
    }
  }
};
var Config = Object.assign(
  function validateConfig(data) {
    return resolveConfig(data);
  },
  {
    [/* @__PURE__ */ Symbol.for("schemastery")]: true,
    "~standard": {
      version: 1,
      vendor: "schemastery",
      validate(data) {
        return { value: resolveConfig(data) };
      }
    },
    toJSON() {
      return {
        type: "object",
        description: "DSH Notifier Configuration",
        dict: SCHEMA_DICT
      };
    },
    type: "object",
    description: "DSH Notifier Configuration",
    // 本插件不含 volatile 字段，缺失 meta 会让 DSH 的 volatileForm()/isVolatilePath() 抛 TypeError。
    meta: {},
    dict: SCHEMA_DICT
  }
);

// src/dispatcher.ts
import os3 from "node:os";

// src/channels/desktop.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

// src/utils/xml.ts
function escapeXml(text) {
  if (typeof text !== "string") {
    text = String(text ?? "");
  }
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// src/channels/desktop.ts
var defaultExec = promisify(execFile);
function buildWinAudioElement(soundEnabled, soundKind) {
  if (!soundEnabled) {
    return '<audio silent="true"/>';
  }
  const source = soundKind === "alert" ? "ms-winsoundevent:Notification.Reminder" : "ms-winsoundevent:Notification.Default";
  return `<audio src="${source}"/>`;
}
async function sendDesktopNotification(title, message, options = {}) {
  const platform = options.platform || os.platform();
  const exec = options.execFn || ((cmd, args) => defaultExec(cmd, args, { timeout: 5e3, windowsHide: true }));
  try {
    if (platform === "win32") {
      const escapedTitle = escapeXml(title);
      const escapedMessage = escapeXml(message);
      const audioElement = buildWinAudioElement(options.soundEnabled === true, options.soundKind ?? "default");
      const xmlString = `<toast><visual><binding template="ToastGeneric"><text>${escapedTitle}</text><text>${escapedMessage}</text></binding></visual>${audioElement}</toast>`;
      const base64Xml = Buffer.from(xmlString, "utf-8").toString("base64");
      const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$xmlText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64Xml}'))
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml($xmlText)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$appId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"
try {
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
} catch {
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier().Show($toast)
}
`.trim();
      const encoded = Buffer.from(psScript, "utf16le").toString("base64");
      await exec("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
      return true;
    } else if (platform === "darwin") {
      const script = [
        "on run argv",
        "if (count of argv) > 2 then",
        "display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv)",
        "else",
        "display notification (item 1 of argv) with title (item 2 of argv)",
        "end if",
        "end run"
      ];
      const scriptArgs = [];
      for (const line of script) {
        scriptArgs.push("-e", line);
      }
      scriptArgs.push("--", message, title);
      if (options.subtitle) {
        scriptArgs.push(options.subtitle);
      }
      await exec("osascript", scriptArgs);
      return true;
    } else if (platform === "linux") {
      const args = [];
      if (options.kind === "warning" || options.kind === "error") {
        args.push("-u", "critical");
      }
      if (options.iconPath) {
        args.push("-i", options.iconPath);
      }
      args.push(title, message);
      await exec("notify-send", args);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// src/channels/sound.ts
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import os2 from "node:os";
var defaultExec2 = promisify2(execFile2);
async function playNotificationSound(kind = "default", options = {}) {
  const platform = options.platform || os2.platform();
  const exec = options.execFn || ((cmd, args) => defaultExec2(cmd, args, { timeout: 5e3, windowsHide: true }));
  try {
    if (platform === "win32") {
      const soundType = kind === "alert" ? "[System.Media.SystemSounds]::Exclamation.Play()" : "[System.Media.SystemSounds]::Asterisk.Play()";
      const encoded = Buffer.from(soundType, "utf16le").toString("base64");
      await exec("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
      return true;
    } else if (platform === "darwin") {
      const soundFile = kind === "alert" ? "/System/Library/Sounds/Basso.aiff" : "/System/Library/Sounds/Glass.aiff";
      await exec("afplay", [soundFile]);
      return true;
    } else if (platform === "linux") {
      await exec("paplay", ["/usr/share/sounds/freedesktop/stereo/complete.oga"]);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// src/channels/webhook.ts
import crypto from "node:crypto";
var DEFAULT_BARK_URL = "http://127.0.0.1:3080";
function isHighPriorityEvent(event, kind) {
  return event === "user-questions/request" || event === "approval/request" || kind === "warning" || kind === "error";
}
function hasQueryParam(url, name2) {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) {
    return false;
  }
  const query = url.slice(queryIndex + 1).split("#")[0];
  return query.split("&").some((pair) => decodeURIComponent(pair.split("=")[0] ?? "").trim() === name2);
}
function generateFeishuSign(secret, timestamp) {
  const stringToSign = `${timestamp}
${secret}`;
  return crypto.createHmac("sha256", stringToSign).update("").digest("base64");
}
function generateDingTalkSign(secret, timestamp) {
  const stringToSign = `${timestamp}
${secret}`;
  return encodeURIComponent(
    crypto.createHmac("sha256", secret).update(stringToSign).digest("base64")
  );
}
async function sendWebhookNotification(config, payload, options = {}) {
  if (!config.enabled || !config.url) {
    return false;
  }
  const fetchImpl = options.fetchFn || globalThis.fetch;
  if (!fetchImpl) {
    return false;
  }
  try {
    let targetUrl = config.url;
    let body;
    const { title, message, event, kind = "info", metadata } = payload;
    switch (config.provider) {
      case "feishu": {
        const templateColor = kind === "error" ? "red" : kind === "warning" ? "orange" : "blue";
        body = {
          msg_type: "interactive",
          card: {
            header: {
              title: { tag: "plain_text", content: title },
              template: templateColor
            },
            elements: [
              {
                tag: "div",
                text: { tag: "lark_md", content: message }
              }
            ]
          }
        };
        if (config.secret) {
          const timestamp = Math.floor(Date.now() / 1e3);
          const sign = generateFeishuSign(config.secret, timestamp);
          body.timestamp = String(timestamp);
          body.sign = sign;
        }
        break;
      }
      case "dingtalk": {
        if (config.secret) {
          const timestamp = Date.now();
          const sign = generateDingTalkSign(config.secret, timestamp);
          const sep = targetUrl.includes("?") ? "&" : "?";
          targetUrl = `${targetUrl}${sep}timestamp=${timestamp}&sign=${sign}`;
        }
        body = {
          msgtype: "markdown",
          markdown: {
            title,
            text: `### ${title}

${message}`
          }
        };
        break;
      }
      case "wecom": {
        body = {
          msgtype: "markdown",
          markdown: {
            content: `### ${title}

${message}`
          }
        };
        break;
      }
      case "bark": {
        body = {
          title,
          body: message,
          group: "DeepSeek Harness",
          // 点击通知直接跳转 DSH 控制台；metadata.url 可覆盖为更具体的地址
          url: metadata?.url || DEFAULT_BARK_URL,
          badge: kind === "error" ? 2 : 1
        };
        break;
      }
      case "telegram": {
        body = {
          text: `*${title}*

${message}`,
          parse_mode: "Markdown"
        };
        if (config.secret && !hasQueryParam(targetUrl, "chat_id")) {
          body.chat_id = config.secret;
        }
        break;
      }
      case "discord": {
        const embedColor = kind === "error" ? 16711680 : kind === "warning" ? 16753920 : kind === "success" ? 65280 : 3447003;
        body = {
          embeds: [
            {
              title,
              description: message,
              color: embedColor,
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            }
          ]
        };
        break;
      }
      case "generic":
      default: {
        body = {
          title,
          message,
          event,
          kind,
          metadata,
          timestamp: Date.now()
        };
        break;
      }
    }
    const requestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    };
    const send = async () => {
      const response = await fetchImpl(targetUrl, {
        ...requestInit,
        signal: AbortSignal.timeout(5e3)
      });
      return response.ok;
    };
    try {
      return await send();
    } catch (firstError) {
      if (!isHighPriorityEvent(event, kind)) {
        throw firstError;
      }
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 400));
      return await send();
    }
  } catch {
    return false;
  }
}

// src/utils/i18n.ts
var DICTIONARIES = {
  zh: {
    taskCompleted: "DeepSeek Harness - \u4EFB\u52A1\u5DF2\u5B8C\u6210",
    taskEnded: "DeepSeek Harness - \u4EFB\u52A1\u5DF2\u7ED3\u675F",
    waitingForResponse: "DeepSeek Harness - \u7B49\u5F85\u60A8\u7684\u56DE\u7B54",
    approvalRequested: "DeepSeek Harness - \u8BF7\u6C42\u6743\u9650\u5BA1\u6279",
    taskError: "DeepSeek Harness - \u4EFB\u52A1\u5F02\u5E38",
    session: "\u4F1A\u8BDD",
    turn: "\u8F6E\u6B21",
    duration: "\u8017\u65F6",
    status: "\u72B6\u6001",
    tool: "\u5DE5\u5177",
    reason: "\u7406\u7531",
    error: "\u9519\u8BEF",
    unknown: "\u672A\u77E5"
  },
  en: {
    taskCompleted: "DeepSeek Harness - Task Completed",
    taskEnded: "DeepSeek Harness - Task Ended",
    waitingForResponse: "DeepSeek Harness - Waiting for Response",
    approvalRequested: "DeepSeek Harness - Approval Requested",
    taskError: "DeepSeek Harness - Task Error",
    session: "Session",
    turn: "Turn",
    duration: "Duration",
    status: "Status",
    tool: "Tool",
    reason: "Reason",
    error: "Error",
    unknown: "Unknown"
  }
};
function normalizeLocaleTag(tag) {
  if (!tag) return void 0;
  return tag.trim().toLowerCase().startsWith("en") ? "en" : "zh";
}
function resolveLocale(setting, env = process.env) {
  if (setting === "zh" || setting === "en") {
    return setting;
  }
  return normalizeLocaleTag(env.DSH_LOCALE) ?? normalizeLocaleTag(env.LANG) ?? normalizeLocaleTag(env.LC_ALL) ?? "zh";
}
function t(locale, key) {
  return DICTIONARIES[locale][key];
}
function label(locale, key) {
  return `${t(locale, key)}:`;
}

// src/dispatcher.ts
var DEFAULT_DEBOUNCE_MS = 200;
var MAX_DEBOUNCE_ENTRIES = 200;
function formatDuration(durationMs, locale = "zh") {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return t(locale, "unknown");
  }
  const seconds = Math.round(durationMs / 1e3);
  const en = locale === "en";
  if (seconds < 60) {
    return en ? `${seconds}s` : `${seconds}\u79D2`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  if (mins < 60) {
    return en ? `${mins}m ${remSecs}s` : `${mins}\u5206${remSecs}\u79D2`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return en ? `${hours}h ${remMins}m ${remSecs}s` : `${hours}\u5C0F\u65F6${remMins}\u5206${remSecs}\u79D2`;
}
var NotificationDispatcher = class {
  config;
  locale;
  platform;
  debounceMs;
  nowFn;
  desktopFn;
  soundFn;
  webhookFn;
  /** 事件键 → 上次派发时间戳，用于窗口内去重。 */
  recentEvents = /* @__PURE__ */ new Map();
  constructor(config, options = {}) {
    this.config = config;
    this.locale = resolveLocale(config.locale);
    this.platform = options.platform || os3.platform();
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.nowFn = options.nowFn || Date.now;
    this.desktopFn = options.desktopFn || sendDesktopNotification;
    this.soundFn = options.soundFn || playNotificationSound;
    this.webhookFn = options.webhookFn || sendWebhookNotification;
  }
  /**
   * 防抖判定：窗口内出现完全相同的事件键时返回 true（应抑制）。
   * 首次出现一律放行，不做延迟，保证通知实时性。
   */
  isDuplicate(key) {
    if (this.debounceMs <= 0) {
      return false;
    }
    const now = this.nowFn();
    const last = this.recentEvents.get(key);
    if (last !== void 0 && now - last < this.debounceMs) {
      return true;
    }
    for (const [existingKey, timestamp] of this.recentEvents) {
      if (now - timestamp >= this.debounceMs) {
        this.recentEvents.delete(existingKey);
      }
    }
    if (this.recentEvents.size >= MAX_DEBOUNCE_ENTRIES) {
      const oldestKey = this.recentEvents.keys().next().value;
      if (oldestKey !== void 0) {
        this.recentEvents.delete(oldestKey);
      }
    }
    this.recentEvents.set(key, now);
    return false;
  }
  async dispatch(title, message, event, kind = "info", soundKind = "default", extras = {}) {
    const sessionTitle = extras.sessionTitle;
    const sessionLine = sessionTitle ? `${label(this.locale, "session")} ${sessionTitle}` : void 0;
    const macMessage = extras.bodyLines ? extras.bodyLines.join("\n") : message;
    const fullMessage = sessionLine ? `${sessionLine}
${macMessage}` : macMessage;
    if (this.isDuplicate([event, title, fullMessage, kind, soundKind].join("\0"))) {
      return;
    }
    const tasks = [];
    const isWindows = this.platform === "win32";
    const desktopEnabled = this.config.desktop.enabled;
    const soundEnabled = this.config.sound.enabled;
    if (desktopEnabled) {
      const inlineSound = isWindows && soundEnabled;
      tasks.push(
        this.desktopFn(title, this.platform === "darwin" ? macMessage : fullMessage, {
          platform: this.platform,
          kind,
          subtitle: sessionTitle,
          soundEnabled: inlineSound,
          soundKind
        }).catch(() => false)
      );
    }
    if (soundEnabled && !(isWindows && desktopEnabled)) {
      tasks.push(this.soundFn(soundKind).catch(() => false));
    }
    if (this.config.webhook.enabled && this.config.webhook.url) {
      tasks.push(
        this.webhookFn(this.config.webhook, {
          title,
          message: fullMessage,
          event,
          kind
        }).catch(() => false)
      );
    }
    await Promise.allSettled(tasks);
  }
  async onTurnEnd(info) {
    if (!this.config.events.onTurnEnd) {
      return;
    }
    const minSec = this.config.events.minDurationSeconds ?? this.config.desktop.minDurationSeconds ?? 5;
    const minMs = minSec * 1e3;
    if (info.durationMs < minMs) {
      return;
    }
    const isSuccess = info.reason.kind === "completed";
    const title = t(this.locale, isSuccess ? "taskCompleted" : "taskEnded");
    const lines = [];
    const durationText = formatDuration(info.durationMs, this.locale);
    lines.push(
      `${label(this.locale, "turn")} #${info.turn} \xB7 ${label(this.locale, "duration")} ${durationText}`
    );
    if (!isSuccess && info.reason.kind) {
      lines.push(`${label(this.locale, "status")} ${info.reason.kind}`);
    }
    const message = lines.join("\n");
    await this.dispatch(title, message, "turn/end", isSuccess ? "success" : "info", isSuccess ? "success" : "default", {
      sessionTitle: info.sessionTitle,
      bodyLines: lines
    });
  }
  async onUserQuestion(info) {
    if (!this.config.events.onQuestion) {
      return;
    }
    const title = t(this.locale, "waitingForResponse");
    const lines = [];
    if (info.questions && info.questions.length > 0) {
      const qList = info.questions.map((q, i) => info.questions.length > 1 ? `${i + 1}. ${q.question}` : q.question);
      lines.push(qList.join("\n"));
    }
    await this.dispatch(title, lines.join("\n"), "user-questions/request", "warning", "alert", {
      sessionTitle: info.sessionTitle,
      bodyLines: lines
    });
  }
  async onApproval(info) {
    if (!this.config.events.onApproval) {
      return;
    }
    const title = t(this.locale, "approvalRequested");
    const lines = [];
    lines.push(`${label(this.locale, "tool")} ${info.toolName}`);
    if (info.reason) {
      lines.push(`${label(this.locale, "reason")} ${info.reason}`);
    }
    await this.dispatch(title, lines.join("\n"), "approval/request", "warning", "alert", {
      sessionTitle: info.sessionTitle,
      bodyLines: lines
    });
  }
  async onError(info) {
    if (!this.config.events.onError) {
      return;
    }
    const title = t(this.locale, "taskError");
    const errMsg = info.error instanceof Error ? info.error.message : String(info.error);
    const lines = [`${label(this.locale, "error")} ${errMsg}`];
    await this.dispatch(title, lines.join("\n"), "agent/error", "error", "alert", {
      sessionTitle: info.sessionTitle,
      bodyLines: lines
    });
  }
};

// src/server.ts
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
var DEFAULT_PORT = 3088;
var MAX_PORT_PROBE = 20;
var MAX_VALID_PORT = 65535;
var PLUGIN_CONFIG_KEY = "notifier";
var BASE_CONFIG_FILENAME = "plugins.config.json";
var LOCAL_CONFIG_FILENAME = "plugins.config.local.json";
var SECRET_PATHS = [["webhook", "secret"]];
var MANAGED_NON_SECRET_PATHS = [
  ["locale"],
  ["desktop", "enabled"],
  ["sound", "enabled"],
  ["events"],
  ["webhook", "enabled"],
  ["webhook", "provider"],
  ["webhook", "url"]
];
var FORM_MANAGED_PATHS = [...MANAGED_NON_SECRET_PATHS, ...SECRET_PATHS];
var MAX_BODY_BYTES = 64 * 1024;
var UI_TEXT = {
  zh: {
    htmlLang: "zh-CN",
    dir: "ltr",
    title: "DSH \u901A\u77E5\u8BBE\u7F6E",
    subtitle: "\u684C\u9762\u5F39\u7A97 \xB7 \u63D0\u793A\u97F3 \xB7 Webhook \u79BB\u673A\u63A8\u9001",
    badge: "\u770B\u677F\u5DF2\u5C31\u7EEA",
    sections: {
      general: {
        title: "\u901A\u7528\u4E0E\u8BED\u8A00",
        desc: "\u901A\u77E5\u6587\u6848\u8BED\u8A00\u3002auto \u4F1A\u4F9D\u6B21\u8BFB\u53D6 DSH_LOCALE\u3001LANG\u3001LC_ALL\u3002",
        locale: "\u8BED\u8A00",
        localeHint: "auto \u6309\u73AF\u5883\u53D8\u91CF\u81EA\u52A8\u5224\u65AD"
      },
      system: {
        title: "\u7CFB\u7EDF\u684C\u9762\u4E0E\u58F0\u97F3",
        desc: "\u64CD\u4F5C\u7CFB\u7EDF\u539F\u751F\u5F39\u7A97\u4E0E\u63D0\u793A\u97F3\u3002Windows \u4E0B\u63D0\u793A\u97F3\u5185\u8054\u8FDB Toast\uFF0C\u53EA\u542F\u52A8\u4E00\u6B21\u5B50\u8FDB\u7A0B\u3002",
        desktop: "\u684C\u9762\u901A\u77E5",
        desktopHint: "\u5173\u95ED\u540E\u4EC5\u4FDD\u7559 Webhook \u4E0E\u63D0\u793A\u97F3",
        sound: "\u7CFB\u7EDF\u63D0\u793A\u97F3",
        soundHint: "\u684C\u9762\u901A\u77E5\u5F00\u542F\u65F6\u7531\u5F39\u7A97\u5185\u8054\u53D1\u58F0"
      },
      events: {
        title: "\u4EFB\u52A1\u4E0E\u4E8B\u4EF6\u8FC7\u6EE4",
        desc: "\u6309\u9700\u8BA2\u9605\u4E8B\u4EF6\uFF0C\u5E76\u4E3A\u4EFB\u52A1\u5B8C\u6210\u901A\u77E5\u8BBE\u7F6E\u8017\u65F6\u4E0B\u9650\uFF0C\u907F\u514D\u77ED\u8F6E\u6B21\u6253\u6270\u3002",
        turnEnd: "Turn \u5B8C\u6210",
        question: "\u7B49\u5F85\u63D0\u95EE",
        approval: "\u6743\u9650\u5BA1\u6279",
        error: "\u9519\u8BEF\u5F02\u5E38",
        threshold: "\u8017\u65F6\u9608\u503C",
        thresholdHint: "\u4F4E\u4E8E\u8BE5\u79D2\u6570\u7684\u8F6E\u6B21\u4E0D\u901A\u77E5",
        thresholdUnit: "\u79D2"
      },
      webhook: {
        title: "Webhook \u79BB\u673A\u63A8\u9001",
        desc: "\u628A\u901A\u77E5\u8F6C\u53D1\u5230\u98DE\u4E66\u3001\u9489\u9489\u3001\u4F01\u5FAE\u3001Bark\u3001Telegram\u3001Discord \u6216\u4EFB\u610F HTTP \u7AEF\u70B9\u3002",
        enabled: "\u542F\u7528\u63A8\u9001",
        enabledHint: "\u5173\u95ED\u540E\u4E0D\u518D\u53D1\u8D77\u4EFB\u4F55\u7F51\u7EDC\u8BF7\u6C42",
        provider: "\u63D0\u4F9B\u5546",
        url: "\u5730\u5740 URL",
        urlPlaceholder: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
        secret: "Secret \u5BC6\u94A5",
        secretPlaceholder: "\u7B7E\u540D\u5BC6\u94A5\uFF08\u53EF\u9009\uFF09\uFF1Btelegram \u4E0B\u4E3A chat_id",
        secretHint: "\u51ED\u636E\u4EC5\u5728\u4F60\u52FE\u9009\u4E0B\u65B9\u300C\u4FDD\u5B58\u5230\u672C\u5730\u79C1\u6709\u8986\u76D6\u300D\u65F6\u5199\u5165 plugins.config.local.json"
      },
      test: {
        title: "\u4E00\u952E\u6D4B\u8BD5\u533A",
        desc: "\u65E0\u9700\u5148\u4FDD\u5B58\u5373\u53EF\u5373\u65F6\u9A8C\u8BC1\u4E09\u4E2A\u6E20\u9053\u3002Webhook \u4F7F\u7528\u4E0A\u65B9\u5F53\u524D\u586B\u5199\u7684\u503C\u3002",
        desktopBtn: "\u53D1\u9001\u6D4B\u8BD5\u5F39\u7A97",
        soundBtn: "\u64AD\u653E\u6D4B\u8BD5\u63D0\u793A\u97F3",
        webhookBtn: "\u6D4B\u8BD5 Webhook \u53D1\u9001",
        result: "\u6D4B\u8BD5\u7ED3\u679C",
        sending: "\u6B63\u5728\u53D1\u9001\u2026",
        idleHint: "\u70B9\u51FB\u4EFB\u610F\u6309\u94AE\u5F00\u59CB\u6D4B\u8BD5",
        latency: "\u8017\u65F6",
        status: "\u670D\u52A1\u7AEF\u54CD\u5E94",
        ok: "\u6210\u529F",
        fail: "\u5931\u8D25"
      },
      save: {
        title: "\u4FDD\u5B58\u9009\u9879",
        desc: "\u4FDD\u5B58\u540E\u7531\u6839\u603B\u7EBF\u70ED\u91CD\u8F7D\uFF0C\u7EA6 300ms \u81EA\u52A8\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F DSH\u3002",
        secretCheckbox: "\u5C06\u673A\u5BC6\u51ED\u636E\u4FDD\u5B58\u81F3\u672C\u5730\u79C1\u6709\u8986\u76D6 (plugins.config.local.json)",
        secretHint: "\u52FE\u9009\u540E Secret \u5199\u5165\u5DF2 gitignore \u7684\u672C\u5730\u6587\u4EF6\uFF0C\u5176\u4F59\u5B57\u6BB5\u5199\u5165 plugins.config.json",
        saveBtn: "\u4FDD\u5B58\u914D\u7F6E",
        resetBtn: "\u91CD\u65B0\u8F7D\u5165"
      }
    },
    toast: {
      saved: "\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF0C\u70ED\u91CD\u8F7D\u7EA6 300ms \u540E\u751F\u6548",
      saveFailed: "\u4FDD\u5B58\u5931\u8D25",
      needUrl: "\u8BF7\u5148\u586B\u5199 Webhook \u5730\u5740 URL",
      loaded: "\u5DF2\u91CD\u65B0\u8F7D\u5165\u5F53\u524D\u914D\u7F6E",
      loadFailed: "\u8F7D\u5165\u914D\u7F6E\u5931\u8D25"
    },
    footer: "\u672C\u5730\u8F7B\u91CF\u8BBE\u7F6E\u670D\u52A1 \xB7 \u4EC5\u76D1\u542C 127.0.0.1"
  },
  en: {
    htmlLang: "en",
    dir: "ltr",
    title: "DSH Notifier Settings",
    subtitle: "Desktop \xB7 Sound \xB7 Webhook",
    badge: "Dashboard ready",
    sections: {
      general: {
        title: "General & Language",
        desc: "Notification language. auto reads DSH_LOCALE, LANG, then LC_ALL.",
        locale: "Language",
        localeHint: "auto follows environment variables"
      },
      system: {
        title: "Desktop & Sound",
        desc: "Native OS notifications and alert sounds. On Windows the sound is inlined into the Toast.",
        desktop: "Desktop notification",
        desktopHint: "When off, only webhook and sound remain",
        sound: "System sound",
        soundHint: "Inlined into the popup when desktop is on"
      },
      events: {
        title: "Events & Filtering",
        desc: "Subscribe to events and set a minimum duration for task-completion notices.",
        turnEnd: "Turn completed",
        question: "Waiting for answer",
        approval: "Approval request",
        error: "Error",
        threshold: "Duration threshold",
        thresholdHint: "Turns shorter than this are ignored",
        thresholdUnit: "sec"
      },
      webhook: {
        title: "Webhook push",
        desc: "Forward notices to Feishu, DingTalk, WeCom, Bark, Telegram, Discord or any HTTP endpoint.",
        enabled: "Enable push",
        enabledHint: "No network request is made when off",
        provider: "Provider",
        url: "URL",
        urlPlaceholder: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
        secret: "Secret",
        secretPlaceholder: "Signing secret (optional); chat_id for telegram",
        secretHint: "Credentials are written to plugins.config.local.json only when you tick the box below"
      },
      test: {
        title: "One-click test",
        desc: "Verify all three channels without saving first. Webhook uses the values above.",
        desktopBtn: "Send test popup",
        soundBtn: "Play test sound",
        webhookBtn: "Test webhook",
        result: "Result",
        sending: "Sending\u2026",
        idleHint: "Click any button to start",
        latency: "Latency",
        status: "Server response",
        ok: "success",
        fail: "failed"
      },
      save: {
        title: "Save options",
        desc: "Saving triggers a root hot reload within ~300ms, no DSH restart needed.",
        secretCheckbox: "Save credentials to local private override (plugins.config.local.json)",
        secretHint: "When ticked, the secret goes to the gitignored local file; other fields go to plugins.config.json",
        saveBtn: "Save config",
        resetBtn: "Reload"
      }
    },
    toast: {
      saved: "Config saved; hot reload applies it in ~300ms",
      saveFailed: "Save failed",
      needUrl: "Please fill in the webhook URL first",
      loaded: "Current config reloaded",
      loadFailed: "Failed to reload config"
    },
    footer: "Local lightweight settings service \xB7 bound to 127.0.0.1 only"
  }
};
var PROVIDER_IDS = ["feishu", "dingtalk", "wecom", "bark", "telegram", "discord", "generic"];
var PROVIDER_LABELS = {
  feishu: { zh: "\u98DE\u4E66", en: "Feishu" },
  dingtalk: { zh: "\u9489\u9489", en: "DingTalk" },
  wecom: { zh: "\u4F01\u4E1A\u5FAE\u4FE1", en: "WeCom" },
  bark: { zh: "Bark (iOS)", en: "Bark (iOS)" },
  telegram: { zh: "Telegram", en: "Telegram" },
  discord: { zh: "Discord", en: "Discord" },
  generic: { zh: "\u901A\u7528 JSON", en: "Generic JSON" }
};
var LOCALE_IDS = ["auto", "zh", "en"];
var LOCALE_LABELS = {
  auto: { zh: "\u81EA\u52A8 (auto)", en: "Auto" },
  zh: { zh: "\u4E2D\u6587", en: "Chinese" },
  en: { zh: "English", en: "English" }
};
var activeHandle;
var activeServer;
function normalizePort2(value, fallback = DEFAULT_PORT) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  const port = Math.floor(num);
  return port >= 0 && port <= MAX_VALID_PORT ? port : fallback;
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function clonePlain(value) {
  if (!isPlainObject(value)) return value;
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = clonePlain(item);
  }
  return copy;
}
function deepMerge(target, source) {
  if (!isPlainObject(source)) return clonePlain(source);
  const merged = isPlainObject(target) ? clonePlain(target) : {};
  for (const [key, value] of Object.entries(source)) {
    merged[key] = isPlainObject(value) && isPlainObject(merged[key]) ? deepMerge(merged[key], value) : clonePlain(value);
  }
  return merged;
}
function getByPath(target, pathParts) {
  return pathParts.reduce((node, key) => isPlainObject(node) ? node[key] : void 0, target);
}
function setByPath(target, pathParts, value) {
  let node = target;
  for (const key of pathParts.slice(0, -1)) {
    if (!isPlainObject(node[key])) node[key] = {};
    node = node[key];
  }
  node[pathParts[pathParts.length - 1]] = value;
}
function deleteByPath(target, pathParts) {
  const parents = [];
  let node = target;
  for (const key of pathParts.slice(0, -1)) {
    if (!isPlainObject(node[key])) return;
    parents.push(node);
    node = node[key];
  }
  const last = pathParts[pathParts.length - 1];
  if (!(last in node)) return;
  delete node[last];
  for (let i = parents.length - 1; i >= 0; i--) {
    const parent = parents[i];
    const childKey = pathParts[i];
    if (isPlainObject(parent[childKey]) && Object.keys(parent[childKey]).length === 0) {
      delete parent[childKey];
    } else {
      break;
    }
  }
}
function resolveProjectRoot(startDir = path.dirname(fileURLToPath(import.meta.url))) {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, BASE_CONFIG_FILENAME))) return current;
    const packagePath = path.join(current, "package.json");
    if (fs.existsSync(packagePath)) {
      try {
        const raw = fs.readFileSync(packagePath, "utf8").replace(/^\uFEFF/, "");
        if (JSON.parse(raw)?.name === "@local/my-dsh-plugins") return current;
      } catch {
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}
function readJsonConfig(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function writeJsonConfig(filePath, data) {
  const text = `${JSON.stringify(data, null, 2)}
`;
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, text, "utf8");
  fs.renameSync(tmpPath, filePath);
}
function readBaseSlice(rootDir) {
  const base = readJsonConfig(path.join(rootDir, BASE_CONFIG_FILENAME));
  const plugins = isPlainObject(base.plugins) ? base.plugins : {};
  return isPlainObject(plugins[PLUGIN_CONFIG_KEY]) ? clonePlain(plugins[PLUGIN_CONFIG_KEY]) : {};
}
function readLocalSlice(rootDir) {
  const local = readJsonConfig(path.join(rootDir, LOCAL_CONFIG_FILENAME));
  const plugins = isPlainObject(local.plugins) ? local.plugins : {};
  return isPlainObject(plugins[PLUGIN_CONFIG_KEY]) ? clonePlain(plugins[PLUGIN_CONFIG_KEY]) : {};
}
function savePluginConfig(rootDir, nextSlice, saveSecretsLocally) {
  const baseSlice = nextSlice;
  const basePath = path.join(rootDir, BASE_CONFIG_FILENAME);
  const localPath = path.join(rootDir, LOCAL_CONFIG_FILENAME);
  const baseDoc = readJsonConfig(basePath);
  if (!isPlainObject(baseDoc.plugins)) baseDoc.plugins = {};
  const secretValues = [];
  if (saveSecretsLocally) {
    for (const pathParts of SECRET_PATHS) {
      const value = getByPath(baseSlice, pathParts);
      if (value === void 0) continue;
      secretValues.push({ pathParts, value });
      deleteByPath(baseSlice, pathParts);
    }
  }
  baseDoc.plugins[PLUGIN_CONFIG_KEY] = baseSlice;
  writeJsonConfig(basePath, baseDoc);
  let secretsIsolated = false;
  const localDoc = readJsonConfig(localPath);
  if (!isPlainObject(localDoc.plugins)) localDoc.plugins = {};
  const localPlugins = localDoc.plugins;
  const localSlice = isPlainObject(localPlugins[PLUGIN_CONFIG_KEY]) ? localPlugins[PLUGIN_CONFIG_KEY] : {};
  for (const pathParts of MANAGED_NON_SECRET_PATHS) {
    deleteByPath(localSlice, pathParts);
  }
  if (saveSecretsLocally) {
    for (const { pathParts, value } of secretValues) {
      if (typeof value === "string" && value.trim() === "") continue;
      setByPath(localSlice, pathParts, value);
      secretsIsolated = true;
    }
  } else {
    for (const pathParts of SECRET_PATHS) {
      deleteByPath(localSlice, pathParts);
    }
  }
  if (Object.keys(localSlice).length > 0) {
    localPlugins[PLUGIN_CONFIG_KEY] = localSlice;
  } else {
    delete localPlugins[PLUGIN_CONFIG_KEY];
  }
  if (Object.keys(localPlugins).length > 0 || Object.keys(localDoc).length > 1) {
    writeJsonConfig(localPath, localDoc);
  } else if (fs.existsSync(localPath)) {
    fs.rmSync(localPath, { force: true });
  }
  return { baseFile: basePath, localFile: localPath, secretsIsolated };
}
function loadMergedSlice(rootDir) {
  return deepMerge(readBaseSlice(rootDir), readLocalSlice(rootDir));
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderSettingsPage(initialConfig, uiLocale = "zh") {
  const text = UI_TEXT[uiLocale];
  const providerOptions = PROVIDER_IDS.map((id) => {
    const label2 = escapeHtml(PROVIDER_LABELS[id][uiLocale]);
    const selected = initialConfig.webhook.provider === id ? " selected" : "";
    return `<option value="${id}"${selected}>${label2}</option>`;
  }).join("");
  const localeOptions = LOCALE_IDS.map((id) => {
    const label2 = escapeHtml(LOCALE_LABELS[id][uiLocale]);
    const selected = (initialConfig.locale ?? "auto") === id ? " selected" : "";
    return `<option value="${id}"${selected}>${label2}</option>`;
  }).join("");
  const bootConfig = JSON.stringify(initialConfig).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const switchCase = (id, checked, label2, hint) => `
        <label class="row" for="${id}">
          <span class="row-text">
            <span class="row-label">${escapeHtml(label2)}</span>
            <span class="row-hint">${escapeHtml(hint)}</span>
          </span>
          <input class="switch" type="checkbox" id="${id}" data-field="${id}"${checked ? " checked" : ""}>
        </label>`;
  return `<!DOCTYPE html>
<html lang="${text.htmlLang}" dir="${text.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(text.title)}</title>
<style>
  :root {
    --bg: #f6f7f9;
    --panel: #ffffff;
    --panel-2: #fbfcfd;
    --text: #1b1f24;
    --muted: #6b7684;
    --border: #e3e7ec;
    --accent: #3b6df6;
    --accent-soft: #eaf0ff;
    --ok: #1a7f4b;
    --ok-soft: #e6f6ec;
    --warn: #b4400f;
    --warn-soft: #fdeee4;
    --shadow: 0 1px 2px rgba(16, 24, 40, .06), 0 8px 24px rgba(16, 24, 40, .06);
    --radius: 14px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14171c;
      --panel: #1c2128;
      --panel-2: #21272f;
      --text: #e6edf3;
      --muted: #9aa7b4;
      --border: #2d353f;
      --accent: #6f9bff;
      --accent-soft: #1e2a44;
      --ok: #56d68b;
      --ok-soft: #16301f;
      --warn: #ff9d6b;
      --warn-soft: #3a2416;
      --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px rgba(0, 0, 0, .35);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 20px 56px;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  header.hero { margin-bottom: 22px; }
  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px;
    background: var(--accent-soft); color: var(--accent);
    font-size: 12px; font-weight: 600;
  }
  .badge::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: currentColor;
  }
  h1 { margin: 12px 0 4px; font-size: 26px; letter-spacing: -.01em; }
  .sub { margin: 0; color: var(--muted); font-size: 14px; }
  section.card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 18px 20px 8px;
    margin-bottom: 16px;
  }
  section.card > h2 {
    margin: 0; font-size: 16px; font-weight: 650;
    display: flex; align-items: baseline; gap: 8px;
  }
  section.card > p.desc { margin: 6px 0 14px; color: var(--muted); font-size: 13px; }
  .grid { display: grid; gap: 10px; }
  @media (min-width: 620px) { .grid.two { grid-template-columns: 1fr 1fr; } }
  .field { display: flex; flex-direction: column; gap: 6px; padding-bottom: 12px; }
  .field > label { font-size: 13px; font-weight: 600; }
  .field .hint { color: var(--muted); font-size: 12px; }
  select, input[type="text"], input[type="number"], input[type="password"], input[type="url"] {
    width: 100%; padding: 9px 11px;
    background: var(--panel-2); color: var(--text);
    border: 1px solid var(--border); border-radius: 9px;
    font-size: 14px; font-family: inherit;
    transition: border-color .15s ease, box-shadow .15s ease;
  }
  select:focus-visible, input:focus-visible {
    outline: none; border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 10px 0; border-top: 1px solid var(--border);
  }
  .row-text { display: flex; flex-direction: column; gap: 2px; }
  .row-label { font-size: 14px; font-weight: 550; }
  .row-hint { color: var(--muted); font-size: 12px; }
  .switch {
    appearance: none; -webkit-appearance: none;
    position: relative; flex: none;
    width: 42px; height: 24px; margin: 0;
    background: var(--border); border-radius: 999px;
    cursor: pointer; transition: background .18s ease;
  }
  .switch::after {
    content: ''; position: absolute; top: 3px; left: 3px;
    width: 18px; height: 18px; border-radius: 50%;
    background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25);
    transition: transform .18s cubic-bezier(.22,1,.36,1);
  }
  .switch:checked { background: var(--accent); }
  .switch:checked::after { transform: translateX(18px); }
  .switch:focus-visible { box-shadow: 0 0 0 3px var(--accent-soft); }
  .btn-row { display: flex; flex-wrap: wrap; gap: 10px; padding-bottom: 12px; }
  button {
    padding: 9px 15px; border-radius: 9px;
    border: 1px solid var(--border); background: var(--panel-2);
    color: var(--text); font: inherit; font-size: 14px; font-weight: 550;
    cursor: pointer;
    transition: background .15s ease, border-color .15s ease, transform .1s ease;
  }
  button:hover { border-color: var(--accent); }
  button:active { transform: translateY(1px); }
  button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.primary:hover { filter: brightness(1.06); }
  button[disabled] { opacity: .6; cursor: progress; }
  .result {
    border: 1px dashed var(--border); border-radius: 10px;
    background: var(--panel-2); padding: 12px 14px;
    font-size: 13px; color: var(--muted); min-height: 62px;
  }
  .result .head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .pill {
    padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 650;
  }
  .pill.ok { background: var(--ok-soft); color: var(--ok); }
  .pill.fail { background: var(--warn-soft); color: var(--warn); }
  .pill.busy { background: var(--accent-soft); color: var(--accent); }
  .result pre {
    margin: 8px 0 0; padding: 10px; border-radius: 8px;
    background: rgba(127, 127, 127, .1);
    font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace;
    white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto;
  }
  .check {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 4px 0 12px; font-size: 14px;
  }
  .check input { margin: 3px 0 0; width: 16px; height: 16px; accent-color: var(--accent); }
  .toast {
    position: fixed; right: 18px; bottom: 18px;
    display: flex; flex-direction: column; gap: 8px; z-index: 50;
  }
  .toast-item {
    background: var(--panel); border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 10px; box-shadow: var(--shadow);
    padding: 10px 14px; font-size: 13px; max-width: 340px;
    animation: rise .22s cubic-bezier(.22,1,.36,1);
  }
  .toast-item.ok { border-left-color: var(--ok); }
  .toast-item.fail { border-left-color: var(--warn); }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  footer { text-align: center; color: var(--muted); font-size: 12px; margin-top: 24px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <span class="badge">${escapeHtml(text.badge)}</span>
    <h1>${escapeHtml(text.title)}</h1>
    <p class="sub">${escapeHtml(text.subtitle)}</p>
  </header>

  <section class="card">
    <h2>${escapeHtml(text.sections.general.title)}</h2>
    <p class="desc">${escapeHtml(text.sections.general.desc)}</p>
    <div class="field">
      <label for="locale">${escapeHtml(text.sections.general.locale)}</label>
      <select id="locale" data-field="locale">${localeOptions}</select>
      <span class="hint">${escapeHtml(text.sections.general.localeHint)}</span>
    </div>
  </section>

  <section class="card">
    <h2>${escapeHtml(text.sections.system.title)}</h2>
    <p class="desc">${escapeHtml(text.sections.system.desc)}</p>
    ${switchCase("desktopEnabled", initialConfig.desktop.enabled === true, text.sections.system.desktop, text.sections.system.desktopHint)}
    ${switchCase("soundEnabled", initialConfig.sound.enabled === true, text.sections.system.sound, text.sections.system.soundHint)}
  </section>

  <section class="card">
    <h2>${escapeHtml(text.sections.events.title)}</h2>
    <p class="desc">${escapeHtml(text.sections.events.desc)}</p>
    <div class="grid two">
      ${switchCase("onTurnEnd", initialConfig.events.onTurnEnd === true, text.sections.events.turnEnd, "")}
      ${switchCase("onQuestion", initialConfig.events.onQuestion === true, text.sections.events.question, "")}
      ${switchCase("onApproval", initialConfig.events.onApproval === true, text.sections.events.approval, "")}
      ${switchCase("onError", initialConfig.events.onError === true, text.sections.events.error, "")}
    </div>
    <div class="field">
      <label for="minDurationSeconds">${escapeHtml(text.sections.events.threshold)}</label>
      <input type="number" id="minDurationSeconds" data-field="minDurationSeconds" min="0" step="1" value="${Number(initialConfig.events.minDurationSeconds ?? DEFAULT_CONFIG.events.minDurationSeconds)}">
      <span class="hint">${escapeHtml(text.sections.events.thresholdHint)}\uFF08${escapeHtml(text.sections.events.thresholdUnit)}\uFF09</span>
    </div>
  </section>

  <section class="card">
    <h2>${escapeHtml(text.sections.webhook.title)}</h2>
    <p class="desc">${escapeHtml(text.sections.webhook.desc)}</p>
    ${switchCase("webhookEnabled", initialConfig.webhook.enabled === true, text.sections.webhook.enabled, text.sections.webhook.enabledHint)}
    <div class="grid two">
      <div class="field">
        <label for="provider">${escapeHtml(text.sections.webhook.provider)}</label>
        <select id="provider" data-field="provider">${providerOptions}</select>
      </div>
      <div class="field">
        <label for="url">${escapeHtml(text.sections.webhook.url)}</label>
        <input type="text" id="url" data-field="url" placeholder="${escapeHtml(text.sections.webhook.urlPlaceholder)}" value="${escapeHtml(initialConfig.webhook.url ?? "")}">
      </div>
    </div>
    <div class="field">
      <label for="secret">${escapeHtml(text.sections.webhook.secret)}</label>
      <input type="password" id="secret" data-field="secret" placeholder="${escapeHtml(text.sections.webhook.secretPlaceholder)}" value="${escapeHtml(initialConfig.webhook.secret ?? "")}">
      <span class="hint">${escapeHtml(text.sections.webhook.secretHint)}</span>
    </div>
  </section>

  <section class="card">
    <h2>${escapeHtml(text.sections.test.title)}</h2>
    <p class="desc">${escapeHtml(text.sections.test.desc)}</p>
    <div class="btn-row">
      <button type="button" data-test="desktop">${escapeHtml(text.sections.test.desktopBtn)}</button>
      <button type="button" data-test="sound">${escapeHtml(text.sections.test.soundBtn)}</button>
      <button type="button" data-test="webhook">${escapeHtml(text.sections.test.webhookBtn)}</button>
    </div>
    <div class="result" id="result" role="status" aria-live="polite">
      <div class="head"><strong>${escapeHtml(text.sections.test.result)}</strong></div>
      <div id="result-body">${escapeHtml(text.sections.test.idleHint)}</div>
    </div>
  </section>

  <section class="card">
    <h2>${escapeHtml(text.sections.save.title)}</h2>
    <p class="desc">${escapeHtml(text.sections.save.desc)}</p>
    <label class="check" for="saveSecretsLocally">
      <input type="checkbox" id="saveSecretsLocally">
      <span>${escapeHtml(text.sections.save.secretCheckbox)}<br><span class="hint">${escapeHtml(text.sections.save.secretHint)}</span></span>
    </label>
    <div class="btn-row">
      <button type="button" class="primary" data-action="save">${escapeHtml(text.sections.save.saveBtn)}</button>
      <button type="button" data-action="reload">${escapeHtml(text.sections.save.resetBtn)}</button>
    </div>
  </section>

  <footer>${escapeHtml(text.footer)}</footer>
</div>
<div class="toast" id="toast" aria-live="polite"></div>

<script>
(function () {
  'use strict';
  var TEXT = ${JSON.stringify(text).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")};
  var INITIAL = ${bootConfig};

  var el = function (id) { return document.getElementById(id); };
  var resultBody = el('result-body');
  var resultHead = document.querySelector('#result .head');

  function toast(message, kind) {
    var item = document.createElement('div');
    item.className = 'toast-item' + (kind ? ' ' + kind : '');
    item.textContent = message;
    el('toast').appendChild(item);
    setTimeout(function () { item.remove(); }, 3200);
  }

  function pill(label, kind) {
    return '<span class="pill ' + kind + '">' + label + '</span>';
  }

  function setResult(headHtml, bodyHtml) {
    resultHead.innerHTML = '<strong>' + TEXT.sections.test.result + '</strong>' + headHtml;
    resultBody.innerHTML = bodyHtml;
  }

  /** \u6536\u96C6\u8868\u5355\u5F53\u524D\u503C\uFF0C\u7EC4\u88C5\u4E3A\u63D2\u4EF6\u914D\u7F6E\u5207\u7247\uFF08\u4E0E NotifierConfig \u7ED3\u6784\u4E00\u81F4\uFF09\u3002 */
  function collectConfig() {
    var minSeconds = parseInt(el('minDurationSeconds').value, 10);
    if (!isFinite(minSeconds) || minSeconds < 0) minSeconds = 0;
    return {
      locale: el('locale').value,
      desktop: { enabled: el('desktopEnabled').checked },
      sound: { enabled: el('soundEnabled').checked },
      events: {
        onTurnEnd: el('onTurnEnd').checked,
        onQuestion: el('onQuestion').checked,
        onApproval: el('onApproval').checked,
        onError: el('onError').checked,
        minDurationSeconds: minSeconds
      },
      webhook: {
        enabled: el('webhookEnabled').checked,
        provider: el('provider').value,
        url: el('url').value.trim(),
        secret: el('secret').value
      }
    };
  }

  /** \u628A\u914D\u7F6E\u5207\u7247\u56DE\u586B\u5230\u8868\u5355\u3002 */
  function applyConfig(config) {
    var webhook = config.webhook || {};
    var events = config.events || {};
    el('locale').value = config.locale || 'auto';
    el('desktopEnabled').checked = !!(config.desktop && config.desktop.enabled);
    el('soundEnabled').checked = !!(config.sound && config.sound.enabled);
    el('onTurnEnd').checked = events.onTurnEnd !== false;
    el('onQuestion').checked = events.onQuestion !== false;
    el('onApproval').checked = events.onApproval !== false;
    el('onError').checked = events.onError !== false;
    el('minDurationSeconds').value = events.minDurationSeconds === undefined ? 5 : events.minDurationSeconds;
    el('webhookEnabled').checked = !!webhook.enabled;
    el('provider').value = webhook.provider || 'generic';
    el('url').value = webhook.url || '';
    el('secret').value = webhook.secret || '';
  }

  async function postJson(url, body) {
    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var payload = await response.json().catch(function () { return {}; });
    return { ok: response.ok, payload: payload };
  }

  var busy = false;

  async function runTest(kind) {
    if (busy) return;
    var body = { type: kind };
    if (kind === 'webhook') {
      var config = collectConfig();
      if (!config.webhook.url) {
        toast(TEXT.toast.needUrl, 'fail');
        return;
      }
      // \u6D4B\u8BD5\u4E00\u5F8B\u5F3A\u5236\u5F00\u542F\u76EE\u6807\u6E20\u9053\uFF1A\u5426\u5219\u300C\u5148\u6D4B\u540E\u5B58\u300D\u4F1A\u9759\u9ED8\u4EC0\u4E48\u90FD\u4E0D\u53D1\u3002
      body.webhook = { enabled: true, provider: config.webhook.provider, url: config.webhook.url, secret: config.webhook.secret };
    }
    busy = true;
    setButtons(true);
    setResult(pill(TEXT.sections.test.sending, 'busy'), escapeHtml(TEXT.sections.test.sending));
    try {
      var result = await postJson('/api/test', body);
      var payload = result.payload || {};
      var success = result.ok && payload.success !== false;
      var head = pill(success ? TEXT.sections.test.ok : TEXT.sections.test.fail, success ? 'ok' : 'fail');
      if (payload.latencyMs !== undefined) {
        head += '<span>' + TEXT.sections.test.latency + ': ' + payload.latencyMs + ' ms</span>';
      }
      if (payload.status !== undefined && payload.status !== null) {
        head += '<span>' + TEXT.sections.test.status + ': HTTP ' + payload.status + '</span>';
      }
      var lines = [];
      if (payload.message) lines.push(payload.message);
      if (payload.response) lines.push(payload.response);
      setResult(head, escapeHtml(lines.join('\\n')) || escapeHtml(success ? TEXT.sections.test.ok : TEXT.sections.test.fail));
      if (!success) toast(payload.message || TEXT.sections.test.fail, 'fail');
    } catch (error) {
      setResult(pill(TEXT.sections.test.fail, 'fail'), escapeHtml(String(error && error.message || error)));
    } finally {
      busy = false;
      setButtons(false);
    }
  }

  function setButtons(disabled) {
    var nodes = document.querySelectorAll('button[data-test]');
    for (var i = 0; i < nodes.length; i++) nodes[i].disabled = disabled;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function saveConfig() {
    var result = await postJson('/api/config', {
      config: collectConfig(),
      saveSecretsLocally: el('saveSecretsLocally').checked
    });
    if (result.ok && result.payload.success) {
      toast(TEXT.toast.saved, 'ok');
    } else {
      toast(result.payload.message || TEXT.toast.saveFailed, 'fail');
    }
  }

  async function reloadConfig() {
    try {
      var response = await fetch('/api/config', { headers: { 'Accept': 'application/json' } });
      var payload = await response.json();
      applyConfig(payload.config || payload);
      toast(TEXT.toast.loaded, 'ok');
    } catch (error) {
      toast(TEXT.toast.loadFailed, 'fail');
    }
  }

  var testButtons = document.querySelectorAll('button[data-test]');
  for (var i = 0; i < testButtons.length; i++) {
    (function (node) {
      node.addEventListener('click', function () { runTest(node.getAttribute('data-test')); });
    })(testButtons[i]);
  }
  document.querySelector('button[data-action="save"]').addEventListener('click', saveConfig);
  document.querySelector('button[data-action="reload"]').addEventListener('click', reloadConfig);

  applyConfig(INITIAL);
})();
</script>
</body>
</html>
`;
}
async function startSettingsServer(options = {}) {
  if (activeHandle) {
    await stopSettingsServer();
  }
  const host = options.host || "127.0.0.1";
  const rootDir = options.rootDir || resolveProjectRoot();
  const requestedPort = normalizePort2(options.port ?? DEFAULT_PORT);
  const config = options.config || resolveConfig(DEFAULT_CONFIG);
  const logger = options.logger;
  const strictPort = options.strictPort === true;
  const maxAttempts = strictPort ? 1 : MAX_PORT_PROBE;
  let server;
  let boundPort = requestedPort;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = requestedPort + attempt;
    if (candidate > MAX_VALID_PORT) break;
    const attemptServer = http.createServer((req, res) => {
      void handleRequest(req, res, { rootDir, config, options });
    });
    attemptServer.on("error", (error) => {
      if (error?.code === "EADDRINUSE") return;
      logger?.warn?.(`[dsh-notifier] \u8BBE\u7F6E\u670D\u52A1\u5F02\u5E38: ${error?.message ?? error}`);
    });
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          reject(error);
        };
        attemptServer.once("error", onError);
        attemptServer.listen(candidate, host, () => {
          attemptServer.removeListener("error", onError);
          resolve();
        });
      });
      server = attemptServer;
      attemptServer.unref?.();
      const address = attemptServer.address();
      boundPort = typeof address === "object" && address !== null ? address.port : candidate;
      break;
    } catch (error) {
      const code = error?.code;
      attemptServer.close();
      if (code !== "EADDRINUSE" || strictPort) {
        throw error;
      }
      logger?.warn?.(`[dsh-notifier] \u7AEF\u53E3 ${candidate} \u5DF2\u88AB\u5360\u7528\uFF0C\u81EA\u52A8\u5C1D\u8BD5 ${candidate + 1}`);
    }
  }
  if (!server) {
    throw new Error(`[dsh-notifier] \u65E0\u6CD5\u5728 ${requestedPort} ~ ${requestedPort + maxAttempts - 1} \u8303\u56F4\u5185\u7ED1\u5B9A\u8BBE\u7F6E\u670D\u52A1\u7AEF\u53E3`);
  }
  const active = server;
  const handle = {
    port: boundPort,
    host,
    url: `http://${host}:${boundPort}`,
    close: async () => {
      await closeServer(active);
      if (activeHandle === handle) {
        activeHandle = void 0;
        activeServer = void 0;
      }
    }
  };
  activeServer = active;
  activeHandle = handle;
  return handle;
}
async function closeServer(server) {
  await new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}
async function stopSettingsServer() {
  const handle = activeHandle;
  if (!handle) return;
  await handle.close();
}
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("\u8BF7\u6C42\u4F53\u8FC7\u5927"), { statusCode: 413 });
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw === "") return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON"), { statusCode: 400 });
  }
  return isPlainObject(parsed) ? parsed : {};
}
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}
function resolveUiLocale(req) {
  const queryLocale = new URL(req.url || "/", "http://localhost").searchParams.get("lang");
  if (queryLocale === "zh" || queryLocale === "en") return queryLocale;
  const header = req.headers["accept-language"];
  if (typeof header === "string") {
    const first = header.split(",")[0]?.trim().toLowerCase();
    if (first?.startsWith("en")) return "en";
  }
  return "zh";
}
async function handleRequest(req, res, ctx) {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;
  const method = (req.method || "GET").toUpperCase();
  try {
    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      const merged = resolveConfig(loadMergedSlice(ctx.rootDir));
      const html = renderSettingsPage(merged, resolveUiLocale(req));
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": Buffer.byteLength(html),
        "Cache-Control": "no-store"
      });
      res.end(html);
      return;
    }
    if (method === "GET" && pathname === "/api/config") {
      const merged = resolveConfig(loadMergedSlice(ctx.rootDir));
      const raw = loadMergedSlice(ctx.rootDir);
      sendJson(res, 200, {
        success: true,
        config: merged,
        raw,
        defaults: resolveConfig(DEFAULT_CONFIG),
        files: {
          base: path.join(ctx.rootDir, BASE_CONFIG_FILENAME),
          local: path.join(ctx.rootDir, LOCAL_CONFIG_FILENAME)
        }
      });
      return;
    }
    if (method === "POST" && pathname === "/api/config") {
      const body = await readJsonBody(req);
      const incoming = isPlainObject(body.config) ? body.config : body;
      const normalized = resolveConfig(incoming);
      const managed = {};
      for (const pathParts of FORM_MANAGED_PATHS) {
        const value = getByPath(normalized, pathParts);
        if (value !== void 0) setByPath(managed, pathParts, value);
      }
      const nextSlice = deepMerge(loadMergedSlice(ctx.rootDir), managed);
      const result = savePluginConfig(ctx.rootDir, nextSlice, body.saveSecretsLocally === true);
      sendJson(res, 200, {
        success: true,
        message: "\u914D\u7F6E\u5DF2\u4FDD\u5B58",
        secretsIsolated: result.secretsIsolated,
        files: { base: result.baseFile, local: result.localFile }
      });
      return;
    }
    if (method === "POST" && pathname === "/api/test") {
      const body = await readJsonBody(req);
      const result = await runChannelTest(body, ctx);
      const statusCode = result.success ? 200 : result.statusCode ?? 502;
      sendJson(res, statusCode, result);
      return;
    }
    sendJson(res, 404, { success: false, message: "\u672A\u627E\u5230\u8BE5\u63A5\u53E3" });
  } catch (error) {
    const statusCode = error?.statusCode ?? 500;
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) {
      sendJson(res, statusCode, { success: false, message });
    } else {
      res.end();
    }
  }
}
function buildTestMessage(locale) {
  return locale === "en" ? {
    title: "DeepSeek Harness - Test Notification",
    message: "This is a test notification from the DSH notifier settings dashboard.\nIf you can see it, this channel works."
  } : {
    title: "DeepSeek Harness - \u6D4B\u8BD5\u901A\u77E5",
    message: "\u8FD9\u662F\u4E00\u6761\u6765\u81EA DSH \u901A\u77E5\u8BBE\u7F6E\u770B\u677F\u7684\u6D4B\u8BD5\u901A\u77E5\u3002\n\u5982\u679C\u4F60\u770B\u5230\u4E86\u5B83\uFF0C\u8BF4\u660E\u8BE5\u6E20\u9053\u5DE5\u4F5C\u6B63\u5E38\u3002"
  };
}
async function runChannelTest(body, ctx) {
  const type = body.type;
  const uiLocale = body.locale === "en" ? "en" : "zh";
  const { title, message } = buildTestMessage(uiLocale);
  if (type === "desktop") {
    const desktopFn = ctx.options.desktopFn || ((t2, m) => sendDesktopNotification(t2, m, { kind: "info" }));
    const startedAt = Date.now();
    const ok = await desktopFn(title, message, { kind: "info" });
    return {
      success: ok === true,
      latencyMs: Date.now() - startedAt,
      message: ok === true ? uiLocale === "en" ? "Desktop popup dispatched" : "\u684C\u9762\u5F39\u7A97\u5DF2\u53D1\u51FA" : uiLocale === "en" ? "Desktop popup failed" : "\u684C\u9762\u5F39\u7A97\u53D1\u9001\u5931\u8D25"
    };
  }
  if (type === "sound") {
    const soundFn = ctx.options.soundFn || ((kind) => playNotificationSound(kind));
    const startedAt = Date.now();
    const ok = await soundFn("default");
    return {
      success: ok === true,
      latencyMs: Date.now() - startedAt,
      message: ok === true ? uiLocale === "en" ? "Sound played" : "\u63D0\u793A\u97F3\u5DF2\u64AD\u653E" : uiLocale === "en" ? "Sound playback failed" : "\u63D0\u793A\u97F3\u64AD\u653E\u5931\u8D25"
    };
  }
  if (type === "webhook") {
    const rawWebhook = isPlainObject(body.webhook) ? body.webhook : {};
    const webhookConfig = resolveConfig({ webhook: { ...rawWebhook, enabled: true } }).webhook;
    if (!webhookConfig.url || webhookConfig.url.trim() === "") {
      return { success: false, statusCode: 400, message: uiLocale === "en" ? "Webhook URL is empty" : "Webhook \u5730\u5740\u4E3A\u7A7A" };
    }
    const startedAt = Date.now();
    const webhookFn = ctx.options.webhookFn || ((config, payload) => sendWebhookNotification(config, payload));
    const ok = await webhookFn(webhookConfig, {
      title,
      message,
      event: "settings/test",
      kind: "info"
    });
    return {
      success: ok === true,
      latencyMs: Date.now() - startedAt,
      message: ok === true ? uiLocale === "en" ? "Webhook delivered" : "Webhook \u53D1\u9001\u6210\u529F" : uiLocale === "en" ? "Webhook delivery failed" : "Webhook \u53D1\u9001\u5931\u8D25"
    };
  }
  return {
    success: false,
    statusCode: 400,
    message: uiLocale === "en" ? `Unknown test type: ${String(type)}` : `\u672A\u77E5\u7684\u6D4B\u8BD5\u7C7B\u578B: ${String(type)}`
  };
}

// src/index.ts
var name = "notifier";
var inject = ["sessions"];
var MAX_TRACKED_TURNS = 200;
var LOG_PREFIX = "[dsh-notifier]";
function resolveLogger(ctx) {
  let logger;
  try {
    logger = ctx?.logger?.(name);
  } catch {
    logger = void 0;
  }
  if (!logger) {
    return {
      info: (...args) => console.info(...args),
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args)
    };
  }
  const pick = (level) => typeof logger[level] === "function" ? (...args) => logger[level](...args) : (...args) => console[level](...args);
  return { info: pick("info"), warn: pick("warn"), error: pick("error") };
}
function formatReadyMessage(url) {
  return `${LOG_PREFIX} \u8BBE\u7F6E\u770B\u677F\u5DF2\u5C31\u7EEA: ${url}`;
}
function apply(ctx, rawConfig, options) {
  const config = resolveConfig(rawConfig);
  const dispatcher = options?.dispatcher || new NotificationDispatcher(config);
  const logger = resolveLogger(ctx);
  const turnStartTimes = /* @__PURE__ */ new Map();
  const serverEnabled = config.server?.enabled !== false;
  if (serverEnabled) {
    void startSettingsServer({
      port: config.server?.port,
      config,
      logger
    }).then((handle) => {
      logger.info(formatReadyMessage(handle.url));
    }).catch((error) => {
      logger.warn(`${LOG_PREFIX} \u8BBE\u7F6E\u770B\u677F\u542F\u52A8\u5931\u8D25\uFF0C\u901A\u77E5\u529F\u80FD\u4E0D\u53D7\u5F71\u54CD:`, error);
    });
  }
  if (typeof ctx.on === "function") {
    ctx.on("dispose", () => {
      turnStartTimes.clear();
      void stopSettingsServer().catch(() => void 0);
    });
  }
  function getSessionTitle(session) {
    if (!session) return void 0;
    let service;
    try {
      service = typeof ctx.get === "function" ? ctx.get("sessionTitle") : ctx.sessionTitle;
    } catch {
      service = void 0;
    }
    try {
      if (typeof service?.get === "function") {
        const snap = service.get(session);
        if (snap?.title) return snap.title;
      }
      if (typeof service?.titleOf === "function") {
        const res = service.titleOf(session);
        if (res) return res;
      }
      if (typeof service?.title === "function") {
        const res = service.title(session);
        if (res) return res;
      }
    } catch {
    }
    if (session.header?.cwd) {
      return session.header.cwd;
    }
    return void 0;
  }
  ctx.on("session/event", (session, event) => {
    if (!event || !event.type) return;
    if (event.type === "turn/start") {
      const turn = event.data?.turn ?? 0;
      const key = `${session?.id || "default"}:${turn}`;
      if (turnStartTimes.size >= MAX_TRACKED_TURNS) {
        const oldestKey = turnStartTimes.keys().next().value;
        if (oldestKey) turnStartTimes.delete(oldestKey);
      }
      turnStartTimes.set(key, Date.now());
    } else if (event.type === "turn/end") {
      const turn = event.data?.turn ?? 0;
      const key = `${session?.id || "default"}:${turn}`;
      const startTime = turnStartTimes.get(key);
      turnStartTimes.delete(key);
      const durationMs = startTime !== void 0 ? Date.now() - startTime : Infinity;
      const sessionTitle = getSessionTitle(session);
      void dispatcher.onTurnEnd({
        turn,
        reason: event.data?.reason || { kind: "completed" },
        durationMs,
        sessionTitle
      });
    }
  });
  ctx.on("user-questions/request", async (request, next) => {
    try {
      const questions = request?.questions || [];
      const sessionTitle = getSessionTitle(request?.agent?.session);
      void dispatcher.onUserQuestion({
        questions,
        sessionTitle
      });
    } catch {
    }
    return await next();
  });
  ctx.on("approval/request", async (req, next) => {
    try {
      const toolName = req?.toolName || "unknown";
      const reason = req?.reason || req?.displayReason?.zh || req?.displayReason?.en;
      const sessionTitle = getSessionTitle(req?.agent?.session);
      void dispatcher.onApproval({
        toolName,
        reason,
        sessionTitle
      });
    } catch {
    }
    return await next();
  });
  ctx.on("agent/error", (payload) => {
    try {
      const sessionTitle = getSessionTitle(payload?.agent?.session);
      void dispatcher.onError({
        error: payload?.error,
        turn: payload?.turn,
        step: payload?.step,
        sessionTitle
      });
    } catch {
    }
  });
}
export {
  Config,
  apply,
  formatReadyMessage,
  inject,
  name
};
