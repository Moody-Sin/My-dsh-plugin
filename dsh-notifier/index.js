// src/config.ts
var DEFAULT_CONFIG = {
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
  }
};
var VALID_PROVIDERS = /* @__PURE__ */ new Set(["feishu", "dingtalk", "wecom", "bark", "generic"]);
function normalizeDurationSeconds(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : void 0;
}
function resolveConfig(candidate) {
  if (candidate === null || typeof candidate !== "object") {
    return {
      desktop: { ...DEFAULT_CONFIG.desktop },
      sound: { ...DEFAULT_CONFIG.sound },
      events: { ...DEFAULT_CONFIG.events },
      webhook: { ...DEFAULT_CONFIG.webhook }
    };
  }
  const raw = candidate;
  const desktopRaw = raw.desktop && typeof raw.desktop === "object" ? raw.desktop : {};
  const soundRaw = raw.sound && typeof raw.sound === "object" ? raw.sound : {};
  const eventsRaw = raw.events && typeof raw.events === "object" ? raw.events : {};
  const webhookRaw = raw.webhook && typeof raw.webhook === "object" ? raw.webhook : {};
  const desktopMin = normalizeDurationSeconds(desktopRaw.minDurationSeconds);
  const eventsMin = normalizeDurationSeconds(eventsRaw.minDurationSeconds);
  const minDuration = eventsMin ?? desktopMin ?? DEFAULT_CONFIG.events.minDurationSeconds ?? 5;
  const provider = VALID_PROVIDERS.has(webhookRaw.provider) ? webhookRaw.provider : DEFAULT_CONFIG.webhook.provider;
  return {
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
    }
  };
}
var SCHEMA_DICT = {
  desktop: {
    type: "object",
    description: "\u684C\u9762\u901A\u77E5\u6E20\u9053\u914D\u7F6E\uFF08minDurationSeconds \u5DF2\u5E9F\u5F03\uFF0C\u4EC5\u4F5C\u5411\u540E\u517C\u5BB9\u56DE\u9000\uFF09",
    dict: {
      enabled: { type: "boolean", description: "\u662F\u5426\u542F\u7528\u64CD\u4F5C\u7CFB\u7EDF\u539F\u751F\u684C\u9762\u5F39\u7A97\u901A\u77E5" },
      minDurationSeconds: { type: "number", description: "[\u5DF2\u5E9F\u5F03] \u8BF7\u6539\u7528 events.minDurationSeconds" }
    }
  },
  sound: {
    type: "object",
    description: "\u7CFB\u7EDF\u63D0\u793A\u97F3\u914D\u7F6E",
    dict: {
      enabled: { type: "boolean", description: "\u662F\u5426\u5728\u901A\u77E5\u65F6\u64AD\u653E\u7CFB\u7EDF\u63D0\u793A\u97F3" }
    }
  },
  events: {
    type: "object",
    description: "\u4E8B\u4EF6\u5F00\u5173\u4E0E\u8FC7\u6EE4\u9608\u503C\u914D\u7F6E",
    dict: {
      onTurnEnd: { type: "boolean", description: "\u4EFB\u52A1\u5B8C\u6210\u65F6\u662F\u5426\u901A\u77E5" },
      onQuestion: { type: "boolean", description: "Agent \u63D0\u95EE\u7B49\u5F85\u56DE\u7B54\u65F6\u662F\u5426\u901A\u77E5" },
      onApproval: { type: "boolean", description: "Agent \u7533\u8BF7\u6743\u9650\u5BA1\u6279\u65F6\u662F\u5426\u901A\u77E5" },
      onError: { type: "boolean", description: "Agent \u6267\u884C\u5F02\u5E38\u65F6\u662F\u5426\u901A\u77E5" },
      minDurationSeconds: {
        type: "number",
        description: "\u4EFB\u52A1\u5B8C\u6210\u901A\u77E5\u7684\u8017\u65F6\u8FC7\u6EE4\u9608\u503C\uFF08\u79D2\uFF09\uFF0C\u9ED8\u8BA4 5\uFF1B\u4E0E\u684C\u9762\u6E20\u9053\u5F00\u5173\u89E3\u8026"
      }
    }
  },
  webhook: {
    type: "object",
    description: "Webhook \u79BB\u673A\u63A8\u9001\u6E20\u9053\u914D\u7F6E",
    dict: {
      enabled: { type: "boolean", description: "\u662F\u5426\u5F00\u542F Webhook \u8FDC\u7AEF\u63A8\u9001" },
      provider: { type: "string", description: "\u6E20\u9053\u7C7B\u578B\uFF1Afeishu | dingtalk | wecom | bark | generic" },
      url: { type: "string", description: "Webhook \u673A\u5668\u4EBA\u5730\u5740" },
      secret: { type: "string", description: "\u7B7E\u540D\u5BC6\u94A5\uFF08\u53EF\u9009\uFF09" }
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
    dict: SCHEMA_DICT
  }
);

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
async function sendDesktopNotification(title, message, options = {}) {
  const platform = options.platform || os.platform();
  const exec = options.execFn || ((cmd, args) => defaultExec(cmd, args, { timeout: 5e3, windowsHide: true }));
  try {
    if (platform === "win32") {
      const escapedTitle = escapeXml(title);
      const escapedMessage = escapeXml(message);
      const xmlString = `<toast><visual><binding template="ToastGeneric"><text>${escapedTitle}</text><text>${escapedMessage}</text></binding></visual><audio silent="true"/></toast>`;
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
      await exec("osascript", [
        "-e",
        "on run argv",
        "-e",
        "display notification (item 1 of argv) with title (item 2 of argv)",
        "-e",
        "end run",
        "--",
        message,
        title
      ]);
      return true;
    } else if (platform === "linux") {
      await exec("notify-send", [title, message]);
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

// src/dispatcher.ts
function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "\u672A\u77E5";
  }
  const seconds = Math.round(durationMs / 1e3);
  if (seconds < 60) {
    return `${seconds}\u79D2`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  return `${mins}\u5206${remSecs}\u79D2`;
}
var NotificationDispatcher = class {
  config;
  desktopFn;
  soundFn;
  webhookFn;
  constructor(config, options = {}) {
    this.config = config;
    this.desktopFn = options.desktopFn || sendDesktopNotification;
    this.soundFn = options.soundFn || playNotificationSound;
    this.webhookFn = options.webhookFn || sendWebhookNotification;
  }
  async dispatch(title, message, event, kind = "info", soundKind = "default") {
    const tasks = [];
    if (this.config.desktop.enabled) {
      tasks.push(this.desktopFn(title, message).catch(() => false));
    }
    if (this.config.sound.enabled) {
      tasks.push(this.soundFn(soundKind).catch(() => false));
    }
    if (this.config.webhook.enabled && this.config.webhook.url) {
      tasks.push(
        this.webhookFn(this.config.webhook, {
          title,
          message,
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
    const title = isSuccess ? "DeepSeek Harness - \u4EFB\u52A1\u5DF2\u5B8C\u6210" : "DeepSeek Harness - \u4EFB\u52A1\u5DF2\u7ED3\u675F";
    const lines = [];
    if (info.sessionTitle) {
      lines.push(`\u4F1A\u8BDD: ${info.sessionTitle}`);
    }
    const durationText = formatDuration(info.durationMs);
    lines.push(`\u8F6E\u6B21: #${info.turn} \xB7 \u8017\u65F6: ${durationText}`);
    if (!isSuccess && info.reason.kind) {
      lines.push(`\u72B6\u6001: ${info.reason.kind}`);
    }
    const message = lines.join("\n");
    await this.dispatch(
      title,
      message,
      "turn/end",
      isSuccess ? "success" : "info",
      isSuccess ? "success" : "default"
    );
  }
  async onUserQuestion(info) {
    if (!this.config.events.onQuestion) {
      return;
    }
    const title = "DeepSeek Harness - \u7B49\u5F85\u60A8\u7684\u56DE\u7B54";
    const lines = [];
    if (info.sessionTitle) {
      lines.push(`\u4F1A\u8BDD: ${info.sessionTitle}`);
    }
    if (info.questions && info.questions.length > 0) {
      const qList = info.questions.map((q, i) => info.questions.length > 1 ? `${i + 1}. ${q.question}` : q.question);
      lines.push(qList.join("\n"));
    }
    const message = lines.join("\n");
    await this.dispatch(title, message, "user-questions/request", "warning", "alert");
  }
  async onApproval(info) {
    if (!this.config.events.onApproval) {
      return;
    }
    const title = "DeepSeek Harness - \u8BF7\u6C42\u6743\u9650\u5BA1\u6279";
    const lines = [];
    if (info.sessionTitle) {
      lines.push(`\u4F1A\u8BDD: ${info.sessionTitle}`);
    }
    lines.push(`\u5DE5\u5177: ${info.toolName}`);
    if (info.reason) {
      lines.push(`\u7406\u7531: ${info.reason}`);
    }
    const message = lines.join("\n");
    await this.dispatch(title, message, "approval/request", "warning", "alert");
  }
  async onError(info) {
    if (!this.config.events.onError) {
      return;
    }
    const title = "DeepSeek Harness - \u4EFB\u52A1\u5F02\u5E38";
    const lines = [];
    if (info.sessionTitle) {
      lines.push(`\u4F1A\u8BDD: ${info.sessionTitle}`);
    }
    const errMsg = info.error instanceof Error ? info.error.message : String(info.error);
    lines.push(`\u9519\u8BEF: ${errMsg}`);
    const message = lines.join("\n");
    await this.dispatch(title, message, "agent/error", "error", "alert");
  }
};

// src/index.ts
var name = "notifier";
var inject = ["sessions"];
var MAX_TRACKED_TURNS = 200;
function apply(ctx, rawConfig, options) {
  const config = resolveConfig(rawConfig);
  const dispatcher = options?.dispatcher || new NotificationDispatcher(config);
  const turnStartTimes = /* @__PURE__ */ new Map();
  if (typeof ctx.on === "function") {
    ctx.on("dispose", () => {
      turnStartTimes.clear();
    });
  }
  function getSessionTitle(session) {
    if (!session) return void 0;
    try {
      if (typeof ctx.sessionTitle?.get === "function") {
        const snap = ctx.sessionTitle.get(session);
        if (snap?.title) return snap.title;
      }
      if (typeof ctx.sessionTitle?.titleOf === "function") {
        const res = ctx.sessionTitle.titleOf(session);
        if (res) return res;
      }
      if (typeof ctx.sessionTitle?.title === "function") {
        const res = ctx.sessionTitle.title(session);
        if (res) return res;
      }
      if (session.header?.cwd) {
        return session.header.cwd;
      }
    } catch {
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
  inject,
  name
};
