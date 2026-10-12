// dsh-plugin-notifier/src/config.ts
var DEFAULT_CONFIG = {
  desktop: {
    enabled: true,
    minDurationSeconds: 5
  },
  sound: {
    enabled: true
  },
  events: {
    onTurnEnd: true,
    onQuestion: true,
    onApproval: true,
    onError: true
  },
  webhook: {
    enabled: false,
    provider: "generic",
    url: "",
    secret: ""
  }
};
var VALID_PROVIDERS = /* @__PURE__ */ new Set(["feishu", "dingtalk", "wecom", "bark", "generic"]);
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
  const minDuration = typeof desktopRaw.minDurationSeconds === "number" ? Math.max(0, Math.floor(desktopRaw.minDurationSeconds)) : DEFAULT_CONFIG.desktop.minDurationSeconds;
  const provider = VALID_PROVIDERS.has(webhookRaw.provider) ? webhookRaw.provider : DEFAULT_CONFIG.webhook.provider;
  return {
    desktop: {
      enabled: typeof desktopRaw.enabled === "boolean" ? desktopRaw.enabled : DEFAULT_CONFIG.desktop.enabled,
      minDurationSeconds: minDuration
    },
    sound: {
      enabled: typeof soundRaw.enabled === "boolean" ? soundRaw.enabled : DEFAULT_CONFIG.sound.enabled
    },
    events: {
      onTurnEnd: typeof eventsRaw.onTurnEnd === "boolean" ? eventsRaw.onTurnEnd : DEFAULT_CONFIG.events.onTurnEnd,
      onQuestion: typeof eventsRaw.onQuestion === "boolean" ? eventsRaw.onQuestion : DEFAULT_CONFIG.events.onQuestion,
      onApproval: typeof eventsRaw.onApproval === "boolean" ? eventsRaw.onApproval : DEFAULT_CONFIG.events.onApproval,
      onError: typeof eventsRaw.onError === "boolean" ? eventsRaw.onError : DEFAULT_CONFIG.events.onError
    },
    webhook: {
      enabled: typeof webhookRaw.enabled === "boolean" ? webhookRaw.enabled : DEFAULT_CONFIG.webhook.enabled,
      provider,
      url: typeof webhookRaw.url === "string" ? webhookRaw.url : DEFAULT_CONFIG.webhook.url,
      secret: typeof webhookRaw.secret === "string" ? webhookRaw.secret : DEFAULT_CONFIG.webhook.secret
    }
  };
}
var Config = Object.assign(
  function validateConfig(data) {
    return resolveConfig(data);
  },
  {
    [/* @__PURE__ */ Symbol.for("schemastery")]: true,
    type: "object",
    description: "DSH Notifier Configuration",
    dict: {
      desktop: { type: "object" },
      sound: { type: "object" },
      events: { type: "object" },
      webhook: { type: "object" }
    }
  }
);

// dsh-plugin-notifier/src/channels/desktop.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

// dsh-plugin-notifier/src/utils/xml.ts
function escapeXml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// dsh-plugin-notifier/src/channels/desktop.ts
var defaultExec = promisify(execFile);
async function sendDesktopNotification(title, message, options = {}) {
  const platform = options.platform || os.platform();
  const exec = options.execFn || ((cmd, args) => defaultExec(cmd, args));
  try {
    if (platform === "win32") {
      const escapedTitle = escapeXml(title);
      const escapedMessage = escapeXml(message);
      const xmlString = `<toast><visual><binding template="ToastGeneric"><text>${escapedTitle}</text><text>${escapedMessage}</text></binding></visual></toast>`;
      const base64Xml = Buffer.from(xmlString, "utf-8").toString("base64");
      const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$xmlText = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64Xml}'))
$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$xml.LoadXml($xmlText)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$appId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
`.trim();
      const encoded = Buffer.from(psScript, "utf16le").toString("base64");
      await exec("powershell", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
      return true;
    } else if (platform === "darwin") {
      const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
      await exec("osascript", ["-e", script]);
      return true;
    } else if (platform === "linux") {
      await exec("notify-send", [title, message]);
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

// dsh-plugin-notifier/src/channels/sound.ts
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import os2 from "node:os";
var defaultExec2 = promisify2(execFile2);
async function playNotificationSound(kind = "default", options = {}) {
  const platform = options.platform || os2.platform();
  const exec = options.execFn || ((cmd, args) => defaultExec2(cmd, args));
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
  } catch (err) {
    return false;
  }
}

// dsh-plugin-notifier/src/channels/webhook.ts
async function sendWebhookNotification(config, payload, options = {}) {
  if (!config.enabled || !config.url) {
    return false;
  }
  const fetchImpl = options.fetchFn || globalThis.fetch;
  if (!fetchImpl) {
    return false;
  }
  try {
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
        break;
      }
      case "dingtalk": {
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
          group: "DeepSeek Harness"
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
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return response.ok;
  } catch (err) {
    return false;
  }
}

// dsh-plugin-notifier/src/dispatcher.ts
function formatDuration(durationMs) {
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
    const minMs = this.config.desktop.minDurationSeconds * 1e3;
    if (info.durationMs < minMs) {
      return;
    }
    const isSuccess = info.reason.kind === "completed";
    const title = isSuccess ? "DeepSeek Harness - \u4EFB\u52A1\u5DF2\u5B8C\u6210" : "DeepSeek Harness - \u4EFB\u52A1\u5DF2\u7ED3\u675F";
    const lines = [];
    if (info.sessionTitle) {
      lines.push(`\u4F1A\u8BDD: ${info.sessionTitle}`);
    }
    lines.push(`\u8F6E\u6B21: #${info.turn} \xB7 \u8017\u65F6: ${formatDuration(info.durationMs)}`);
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
    const qList = info.questions.map((q, i) => info.questions.length > 1 ? `${i + 1}. ${q.question}` : q.question);
    lines.push(qList.join("\n"));
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

// dsh-plugin-notifier/src/index.ts
var name = "notifier";
var inject = ["sessions"];
function apply(ctx, rawConfig, options) {
  const config = resolveConfig(rawConfig);
  const dispatcher = options?.dispatcher || new NotificationDispatcher(config);
  const turnStartTimes = /* @__PURE__ */ new Map();
  function getSessionTitle(session) {
    if (!session) return void 0;
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
    }
    return void 0;
  }
  ctx.on("session/event", (session, event) => {
    if (!event || !event.type) return;
    if (event.type === "turn/start") {
      const turn = event.data?.turn ?? 0;
      const key = `${session?.id || "default"}:${turn}`;
      turnStartTimes.set(key, Date.now());
    } else if (event.type === "turn/end") {
      const turn = event.data?.turn ?? 0;
      const key = `${session?.id || "default"}:${turn}`;
      const startTime = turnStartTimes.get(key) ?? Date.now();
      turnStartTimes.delete(key);
      const durationMs = Date.now() - startTime;
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
