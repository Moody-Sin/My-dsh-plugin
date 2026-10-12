import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CONFIG, resolveConfig, type NotifierConfig } from './config.ts';
import { sendDesktopNotification, type NotificationKind } from './channels/desktop.ts';
import { playNotificationSound, type SoundKind } from './channels/sound.ts';
import { sendWebhookNotification, type WebhookPayload } from './channels/webhook.ts';

/**
 * 内置轻量 HTTP 设置看板与一键测试服务。
 *
 * 全部基于 Node.js 原生 `node:http` 实现，**零额外 npm 依赖**：
 * 打包产物 `index.js` 只依赖 Node 内置模块，避免子插件引入第三方依赖污染宿主环境。
 *
 * 服务只做三件事：
 * 1. 提供单页设置面板（内联 CSS/JS，中英双语 + 深色/浅色自适应）；
 * 2. 读取与写回 `plugins.config.json` / `plugins.config.local.json`，由根总线的 300ms 热重载生效；
 * 3. 提供一键测试三个通知渠道（桌面弹窗 / 提示音 / Webhook）。
 */

/** 设置服务默认端口。 */
export const DEFAULT_PORT = 3088;

/** 端口自适应时向后探测的最大次数（含首次尝试的默认端口）。 */
const MAX_PORT_PROBE = 20;

/** 合法端口上限（65535）。 */
const MAX_VALID_PORT = 65535;

/** 插件在 `plugins.config.json` 中的配置键名，由目录名 `dsh-notifier` 剥离 `dsh-` 前缀推导。 */
export const PLUGIN_CONFIG_KEY = 'notifier';

/** 公开基础配置文件名（随 Git 提交）。 */
export const BASE_CONFIG_FILENAME = 'plugins.config.json';

/** 本地私有覆盖文件名（已加入 .gitignore，专存机密凭据）。 */
export const LOCAL_CONFIG_FILENAME = 'plugins.config.local.json';

/** 被视为机密、可分流到本地私有覆盖的字段路径。 */
const SECRET_PATHS: string[][] = [['webhook', 'secret']];

/**
 * 由设置看板托管、但**非机密**的字段路径。
 *
 * 这些字段一律以基础配置 `plugins.config.json` 为准：保存时必须从本地覆盖中清除，
 * 否则本地覆盖会以「最高权威」把看板刚写入的新值静默压掉 —— 用户点了保存却毫无变化。
 */
const MANAGED_NON_SECRET_PATHS: string[][] = [
  ['locale'],
  ['desktop', 'enabled'],
  ['sound', 'enabled'],
  ['events'],
  ['webhook', 'enabled'],
  ['webhook', 'provider'],
  ['webhook', 'url'],
];

/**
 * 设置看板表单托管的全部字段路径。
 *
 * 保存时只把这些路径从提交数据写入配置，其余字段（如 `server.port`、
 * `desktop.minDurationSeconds`）一律沿用既有配置 —— 否则 `resolveConfig` 补齐的默认值
 * 会把表单未暴露的字段静默重置，用户会发现「只改了语言，端口却变回默认值」。
 */
const FORM_MANAGED_PATHS: string[][] = [...MANAGED_NON_SECRET_PATHS, ...SECRET_PATHS];

/** 请求体大小上限，防止超大 payload 打爆内存。 */
const MAX_BODY_BYTES = 64 * 1024;

/** 单页应用的界面文案（中英双语）。 */
interface UiText {
  htmlLang: string;
  dir: string;
  title: string;
  subtitle: string;
  badge: string;
  sections: {
    general: { title: string; desc: string; locale: string; localeHint: string };
    system: { title: string; desc: string; desktop: string; desktopHint: string; sound: string; soundHint: string };
    events: {
      title: string;
      desc: string;
      turnEnd: string;
      question: string;
      approval: string;
      error: string;
      threshold: string;
      thresholdHint: string;
      thresholdUnit: string;
    };
    webhook: {
      title: string;
      desc: string;
      enabled: string;
      enabledHint: string;
      provider: string;
      url: string;
      urlPlaceholder: string;
      secret: string;
      secretPlaceholder: string;
      secretHint: string;
    };
    test: {
      title: string;
      desc: string;
      desktopBtn: string;
      soundBtn: string;
      webhookBtn: string;
      result: string;
      sending: string;
      idleHint: string;
      latency: string;
      status: string;
      ok: string;
      fail: string;
    };
    save: { title: string; desc: string; secretCheckbox: string; secretHint: string; saveBtn: string; resetBtn: string };
  };
  toast: { saved: string; saveFailed: string; needUrl: string; loaded: string; loadFailed: string };
  footer: string;
}

const UI_TEXT: Record<'zh' | 'en', UiText> = {
  zh: {
    htmlLang: 'zh-CN',
    dir: 'ltr',
    title: 'DSH 通知设置',
    subtitle: '桌面弹窗 · 提示音 · Webhook 离机推送',
    badge: '看板已就绪',
    sections: {
      general: {
        title: '通用与语言',
        desc: '通知文案语言。auto 会依次读取 DSH_LOCALE、LANG、LC_ALL。',
        locale: '语言',
        localeHint: 'auto 按环境变量自动判断',
      },
      system: {
        title: '系统桌面与声音',
        desc: '操作系统原生弹窗与提示音。Windows 下提示音内联进 Toast，只启动一次子进程。',
        desktop: '桌面通知',
        desktopHint: '关闭后仅保留 Webhook 与提示音',
        sound: '系统提示音',
        soundHint: '桌面通知开启时由弹窗内联发声',
      },
      events: {
        title: '任务与事件过滤',
        desc: '按需订阅事件，并为任务完成通知设置耗时下限，避免短轮次打扰。',
        turnEnd: 'Turn 完成',
        question: '等待提问',
        approval: '权限审批',
        error: '错误异常',
        threshold: '耗时阈值',
        thresholdHint: '低于该秒数的轮次不通知',
        thresholdUnit: '秒',
      },
      webhook: {
        title: 'Webhook 离机推送',
        desc: '把通知转发到飞书、钉钉、企微、Bark、Telegram、Discord 或任意 HTTP 端点。',
        enabled: '启用推送',
        enabledHint: '关闭后不再发起任何网络请求',
        provider: '提供商',
        url: '地址 URL',
        urlPlaceholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/...',
        secret: 'Secret 密钥',
        secretPlaceholder: '签名密钥（可选）；telegram 下为 chat_id',
        secretHint: '凭据仅在你勾选下方「保存到本地私有覆盖」时写入 plugins.config.local.json',
      },
      test: {
        title: '一键测试区',
        desc: '无需先保存即可即时验证三个渠道。Webhook 使用上方当前填写的值。',
        desktopBtn: '发送测试弹窗',
        soundBtn: '播放测试提示音',
        webhookBtn: '测试 Webhook 发送',
        result: '测试结果',
        sending: '正在发送…',
        idleHint: '点击任意按钮开始测试',
        latency: '耗时',
        status: '服务端响应',
        ok: '成功',
        fail: '失败',
      },
      save: {
        title: '保存选项',
        desc: '保存后由根总线热重载，约 300ms 自动生效，无需重启 DSH。',
        secretCheckbox: '将机密凭据保存至本地私有覆盖 (plugins.config.local.json)',
        secretHint: '勾选后 Secret 写入已 gitignore 的本地文件，其余字段写入 plugins.config.json',
        saveBtn: '保存配置',
        resetBtn: '重新载入',
      },
    },
    toast: {
      saved: '配置已保存，热重载约 300ms 后生效',
      saveFailed: '保存失败',
      needUrl: '请先填写 Webhook 地址 URL',
      loaded: '已重新载入当前配置',
      loadFailed: '载入配置失败',
    },
    footer: '本地轻量设置服务 · 仅监听 127.0.0.1',
  },
  en: {
    htmlLang: 'en',
    dir: 'ltr',
    title: 'DSH Notifier Settings',
    subtitle: 'Desktop · Sound · Webhook',
    badge: 'Dashboard ready',
    sections: {
      general: {
        title: 'General & Language',
        desc: 'Notification language. auto reads DSH_LOCALE, LANG, then LC_ALL.',
        locale: 'Language',
        localeHint: 'auto follows environment variables',
      },
      system: {
        title: 'Desktop & Sound',
        desc: 'Native OS notifications and alert sounds. On Windows the sound is inlined into the Toast.',
        desktop: 'Desktop notification',
        desktopHint: 'When off, only webhook and sound remain',
        sound: 'System sound',
        soundHint: 'Inlined into the popup when desktop is on',
      },
      events: {
        title: 'Events & Filtering',
        desc: 'Subscribe to events and set a minimum duration for task-completion notices.',
        turnEnd: 'Turn completed',
        question: 'Waiting for answer',
        approval: 'Approval request',
        error: 'Error',
        threshold: 'Duration threshold',
        thresholdHint: 'Turns shorter than this are ignored',
        thresholdUnit: 'sec',
      },
      webhook: {
        title: 'Webhook push',
        desc: 'Forward notices to Feishu, DingTalk, WeCom, Bark, Telegram, Discord or any HTTP endpoint.',
        enabled: 'Enable push',
        enabledHint: 'No network request is made when off',
        provider: 'Provider',
        url: 'URL',
        urlPlaceholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/...',
        secret: 'Secret',
        secretPlaceholder: 'Signing secret (optional); chat_id for telegram',
        secretHint: 'Credentials are written to plugins.config.local.json only when you tick the box below',
      },
      test: {
        title: 'One-click test',
        desc: 'Verify all three channels without saving first. Webhook uses the values above.',
        desktopBtn: 'Send test popup',
        soundBtn: 'Play test sound',
        webhookBtn: 'Test webhook',
        result: 'Result',
        sending: 'Sending…',
        idleHint: 'Click any button to start',
        latency: 'Latency',
        status: 'Server response',
        ok: 'success',
        fail: 'failed',
      },
      save: {
        title: 'Save options',
        desc: 'Saving triggers a root hot reload within ~300ms, no DSH restart needed.',
        secretCheckbox: 'Save credentials to local private override (plugins.config.local.json)',
        secretHint: 'When ticked, the secret goes to the gitignored local file; other fields go to plugins.config.json',
        saveBtn: 'Save config',
        resetBtn: 'Reload',
      },
    },
    toast: {
      saved: 'Config saved; hot reload applies it in ~300ms',
      saveFailed: 'Save failed',
      needUrl: 'Please fill in the webhook URL first',
      loaded: 'Current config reloaded',
      loadFailed: 'Failed to reload config',
    },
    footer: 'Local lightweight settings service · bound to 127.0.0.1 only',
  },
};

/** Webhook 提供商展示名（值与 `WebhookProvider` 一致，顺序即下拉顺序）。 */
const PROVIDER_IDS = ['feishu', 'dingtalk', 'wecom', 'bark', 'telegram', 'discord', 'generic'] as const;

const PROVIDER_LABELS: Record<string, { zh: string; en: string }> = {
  feishu: { zh: '飞书', en: 'Feishu' },
  dingtalk: { zh: '钉钉', en: 'DingTalk' },
  wecom: { zh: '企业微信', en: 'WeCom' },
  bark: { zh: 'Bark (iOS)', en: 'Bark (iOS)' },
  telegram: { zh: 'Telegram', en: 'Telegram' },
  discord: { zh: 'Discord', en: 'Discord' },
  generic: { zh: '通用 JSON', en: 'Generic JSON' },
};

/** 语言选项列表。 */
const LOCALE_IDS = ['auto', 'zh', 'en'] as const;

const LOCALE_LABELS: Record<string, { zh: string; en: string }> = {
  auto: { zh: '自动 (auto)', en: 'Auto' },
  zh: { zh: '中文', en: 'Chinese' },
  en: { zh: 'English', en: 'English' },
};

/** 设置服务的启动选项。 */
export interface SettingsServerOptions {
  /** 项目根目录（写配置文件的目标目录）；缺省时自动向上查找。 */
  rootDir?: string;
  /** 期望端口；被占用时自动向后探测（除非 `strictPort`）。 */
  port?: number;
  /** 为 true 时端口被占用直接启动失败，不做探测。 */
  strictPort?: boolean;
  /** 监听地址，默认 `127.0.0.1`（仅本机可访问）。 */
  host?: string;
  /** 当前生效配置（由插件传入），缺省用 `DEFAULT_CONFIG`。 */
  config?: NotifierConfig;
  /** 日志输出器；缺省静默（插件侧会传入 logger）。 */
  logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
  /** 测试注入：桌面弹窗实现。 */
  desktopFn?: (title: string, message: string, options?: Record<string, unknown>) => Promise<boolean>;
  /** 测试注入：提示音实现。 */
  soundFn?: (kind: SoundKind) => Promise<boolean>;
  /** 测试注入：Webhook 实现，返回 `{ ok, status, latencyMs }`。 */
  webhookFn?: (config: NotifierConfig['webhook'], payload: WebhookPayload) => Promise<boolean>;
}

/** 启动结果的公开描述。 */
export interface SettingsServerHandle {
  /** 实际监听端口（端口自适应后可能与期望值不同）。 */
  port: number;
  /** 监听地址。 */
  host: string;
  /** 可直接打开的 URL。 */
  url: string;
  /** 关闭服务；可重复调用。 */
  close: () => Promise<void>;
}

/** 当前活跃的服务实例（模块级单例，便于 `stopSettingsServer()` 无参关闭）。 */
let activeHandle: SettingsServerHandle | undefined;
/** 活跃实例的 HTTP server，单独保存以便等待 `close` 事件与解绑错误监听。 */
let activeServer: http.Server | undefined;

/**
 * 规整端口为 0~65535 的整数，非法值回落默认端口。
 *
 * `0` 是合法入参，表示交由操作系统分配一个空闲端口（测试与临时调试用）；
 * 配置文件里的 `0` 会在 `config.ts` 的 `normalizePort` 处被规整回默认端口。
 */
export function normalizePort(value: unknown, fallback: number = DEFAULT_PORT): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  const port = Math.floor(num);
  return port >= 0 && port <= MAX_VALID_PORT ? port : fallback;
}

/** 是否为可递归合并的纯对象。 */
function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 深拷贝纯对象，避免与入参共享引用。 */
function clonePlain(value: any): any {
  if (!isPlainObject(value)) return value;
  const copy: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = clonePlain(item);
  }
  return copy;
}

/** 递归合并纯对象：`source` 覆盖 `target` 的同名标量，数组整体替换。 */
function deepMerge(target: any, source: any): any {
  if (!isPlainObject(source)) return clonePlain(source);
  const merged: Record<string, any> = isPlainObject(target) ? clonePlain(target) : {};
  for (const [key, value] of Object.entries(source)) {
    merged[key] = isPlainObject(value) && isPlainObject(merged[key]) ? deepMerge(merged[key], value) : clonePlain(value);
  }
  return merged;
}

/** 按路径取值。 */
function getByPath(target: any, pathParts: string[]): any {
  return pathParts.reduce<any>((node, key) => (isPlainObject(node) ? node[key] : undefined), target);
}

/** 按路径写值，自动补齐中间对象。 */
function setByPath(target: Record<string, any>, pathParts: string[], value: unknown): void {
  let node = target;
  for (const key of pathParts.slice(0, -1)) {
    if (!isPlainObject(node[key])) node[key] = {};
    node = node[key];
  }
  node[pathParts[pathParts.length - 1]] = value;
}

/** 按路径删除值，并清理因此变空的中间对象。 */
function deleteByPath(target: Record<string, any>, pathParts: string[]): void {
  const parents: Record<string, any>[] = [];
  let node: any = target;
  for (const key of pathParts.slice(0, -1)) {
    if (!isPlainObject(node[key])) return;
    parents.push(node);
    node = node[key];
  }
  const last = pathParts[pathParts.length - 1];
  if (!(last in node)) return;
  delete node[last];
  // 自底向上清理空对象，避免留下 `webhook: {}` 这类噪声节点。
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

/**
 * 从本文件所在目录向上定位项目根目录。
 *
 * 命中条件（满足其一）：存在 `plugins.config.json`，或 `package.json` 的 `name` 为 `@local/my-dsh-plugins`。
 * 这是写回配置的唯一目标目录，必须与根总线的根目录判定保持一致。
 * 全部候选未命中时返回 `startDir`（而非抛错）：设置服务是可选增强，定位失败不应拖垮插件装载。
 */
export function resolveProjectRoot(startDir: string = path.dirname(fileURLToPath(import.meta.url))): string {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, BASE_CONFIG_FILENAME))) return current;

    const packagePath = path.join(current, 'package.json');
    if (fs.existsSync(packagePath)) {
      try {
        // Windows 下记事本 / PowerShell 常写入 UTF-8 BOM，JSON.parse 无法识别，必须先剥离。
        const raw = fs.readFileSync(packagePath, 'utf8').replace(/^\uFEFF/, '');
        if (JSON.parse(raw)?.name === '@local/my-dsh-plugins') return current;
      } catch {
        // package.json 损坏或不可读不构成致命错误，继续向上查找。
      }
    }

    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

/** 读取 JSON 配置文件；缺失或损坏时返回空对象。 */
function readJsonConfig(filePath: string): Record<string, any> {
  try {
    // 同样先剥离 BOM，否则首个字符是 `{` 之前会多出不可见字符导致解析失败。
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    // 文件不存在属正常情况（首次尚未创建本地覆盖），静默降级为空对象。
    return {};
  }
}

/** 以 2 空格缩进原子化写入 JSON 文件，避免写到一半被热重载读到残缺内容。 */
function writeJsonConfig(filePath: string, data: Record<string, any>): void {
  // 保留既有文件的尾部换行习惯，减少无意义 diff。
  const text = `${JSON.stringify(data, null, 2)}\n`;
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/** 读取 `plugins.config.json` 中本插件的配置切片。 */
function readBaseSlice(rootDir: string): Record<string, any> {
  const base = readJsonConfig(path.join(rootDir, BASE_CONFIG_FILENAME));
  const plugins = isPlainObject(base.plugins) ? base.plugins : {};
  return isPlainObject(plugins[PLUGIN_CONFIG_KEY]) ? clonePlain(plugins[PLUGIN_CONFIG_KEY]) : {};
}

/** 读取 `plugins.config.local.json` 中本插件的配置切片。 */
function readLocalSlice(rootDir: string): Record<string, any> {
  const local = readJsonConfig(path.join(rootDir, LOCAL_CONFIG_FILENAME));
  const plugins = isPlainObject(local.plugins) ? local.plugins : {};
  return isPlainObject(plugins[PLUGIN_CONFIG_KEY]) ? clonePlain(plugins[PLUGIN_CONFIG_KEY]) : {};
}

/**
 * 保存配置。
 *
 * - `saveSecretsLocally` 为 true：机密字段写入 `plugins.config.local.json`（已 gitignore），
 *   基础配置中不留任何凭据；
 * - 为 false：机密字段照常写入 `plugins.config.json`，并清除本地覆盖中的同名值
 *   （本地覆盖权威最高，残留会把刚保存的新值静默压掉）。
 *
 * 两个文件都只改动本插件切片，绝不覆盖兄弟插件配置。
 */
export function savePluginConfig(
  rootDir: string,
  nextSlice: Record<string, any>,
  saveSecretsLocally: boolean
): { baseFile: string; localFile: string; secretsIsolated: boolean } {
  const baseSlice = nextSlice;
  const basePath = path.join(rootDir, BASE_CONFIG_FILENAME);
  const localPath = path.join(rootDir, LOCAL_CONFIG_FILENAME);

  const baseDoc = readJsonConfig(basePath);
  if (!isPlainObject(baseDoc.plugins)) baseDoc.plugins = {};

  const secretValues: { pathParts: string[]; value: unknown }[] = [];
  if (saveSecretsLocally) {
    // 仅在用户显式勾选「保存到本地私有覆盖」时才把凭据从基础配置中摘出，
    // 否则取消勾选会变成「凭据被静默丢弃」——用户填了 Secret 却什么也没保存。
    for (const pathParts of SECRET_PATHS) {
      const value = getByPath(baseSlice, pathParts);
      if (value === undefined) continue;
      secretValues.push({ pathParts, value });
      deleteByPath(baseSlice, pathParts);
    }
  }

  (baseDoc.plugins as Record<string, any>)[PLUGIN_CONFIG_KEY] = baseSlice;
  writeJsonConfig(basePath, baseDoc);

  let secretsIsolated = false;
  const localDoc = readJsonConfig(localPath);
  if (!isPlainObject(localDoc.plugins)) localDoc.plugins = {};
  const localPlugins = localDoc.plugins as Record<string, any>;
  const localSlice = isPlainObject(localPlugins[PLUGIN_CONFIG_KEY]) ? localPlugins[PLUGIN_CONFIG_KEY] : {};

  // 非机密字段一律以基础配置为准：本地覆盖若残留同名值，会以最高权威把看板刚写入的
  // 新值静默压掉（用户点了保存却毫无变化），因此必须清除。仅保留用户手写在本地覆盖里
  // 的其它字段（例如环境变量占位符形式的凭据或未来新增的自定义项）。
  for (const pathParts of MANAGED_NON_SECRET_PATHS) {
    deleteByPath(localSlice, pathParts);
  }

  if (saveSecretsLocally) {
    for (const { pathParts, value } of secretValues) {
      if (typeof value === 'string' && value.trim() === '') continue;
      setByPath(localSlice, pathParts, value);
      secretsIsolated = true;
    }
  } else {
    // 未勾选隔离：凭据已写入基础配置，本地覆盖中的旧值必须撤掉，否则会盖住新值。
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
    // 本地覆盖已无任何内容，删除空文件更干净；文件不存在时无需处理。
    fs.rmSync(localPath, { force: true });
  }

  return { baseFile: basePath, localFile: localPath, secretsIsolated };
}

/** 读取合并后的当前配置（基础配置 + 本地覆盖），用于前端回填。 */
export function loadMergedSlice(rootDir: string): Record<string, any> {
  // 本地私有覆盖享有最高权威，必须后合并。
  return deepMerge(readBaseSlice(rootDir), readLocalSlice(rootDir));
}

/** HTML 文本转义，防止配置值里的尖括号破坏页面结构。 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 渲染单页设置面板。
 *
 * CSS/JS 全部内联：服务不允许依赖任何静态资源目录，也不做网络请求。
 * 主题经 `prefers-color-scheme` 自适应；界面语言由 `?lang=zh|en` 或 `uiLocale` 决定。
 */
export function renderSettingsPage(initialConfig: NotifierConfig, uiLocale: 'zh' | 'en' = 'zh'): string {
  const text = UI_TEXT[uiLocale];
  const providerOptions = PROVIDER_IDS.map((id) => {
    const label = escapeHtml(PROVIDER_LABELS[id][uiLocale]);
    const selected = initialConfig.webhook.provider === id ? ' selected' : '';
    return `<option value="${id}"${selected}>${label}</option>`;
  }).join('');

  const localeOptions = LOCALE_IDS.map((id) => {
    const label = escapeHtml(LOCALE_LABELS[id][uiLocale]);
    const selected = (initialConfig.locale ?? 'auto') === id ? ' selected' : '';
    return `<option value="${id}"${selected}>${label}</option>`;
  }).join('');

  // 初始配置注入到页面：用 JSON.stringify 再转义，杜绝 `</script>` 提前闭合脚本块。
  const bootConfig = JSON.stringify(initialConfig)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const switchCase = (id: string, checked: boolean, label: string, hint: string): string => `
        <label class="row" for="${id}">
          <span class="row-text">
            <span class="row-label">${escapeHtml(label)}</span>
            <span class="row-hint">${escapeHtml(hint)}</span>
          </span>
          <input class="switch" type="checkbox" id="${id}" data-field="${id}"${checked ? ' checked' : ''}>
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
    ${switchCase('desktopEnabled', initialConfig.desktop.enabled === true, text.sections.system.desktop, text.sections.system.desktopHint)}
    ${switchCase('soundEnabled', initialConfig.sound.enabled === true, text.sections.system.sound, text.sections.system.soundHint)}
  </section>

  <section class="card">
    <h2>${escapeHtml(text.sections.events.title)}</h2>
    <p class="desc">${escapeHtml(text.sections.events.desc)}</p>
    <div class="grid two">
      ${switchCase('onTurnEnd', initialConfig.events.onTurnEnd === true, text.sections.events.turnEnd, '')}
      ${switchCase('onQuestion', initialConfig.events.onQuestion === true, text.sections.events.question, '')}
      ${switchCase('onApproval', initialConfig.events.onApproval === true, text.sections.events.approval, '')}
      ${switchCase('onError', initialConfig.events.onError === true, text.sections.events.error, '')}
    </div>
    <div class="field">
      <label for="minDurationSeconds">${escapeHtml(text.sections.events.threshold)}</label>
      <input type="number" id="minDurationSeconds" data-field="minDurationSeconds" min="0" step="1" value="${Number(initialConfig.events.minDurationSeconds ?? DEFAULT_CONFIG.events.minDurationSeconds)}">
      <span class="hint">${escapeHtml(text.sections.events.thresholdHint)}（${escapeHtml(text.sections.events.thresholdUnit)}）</span>
    </div>
  </section>

  <section class="card">
    <h2>${escapeHtml(text.sections.webhook.title)}</h2>
    <p class="desc">${escapeHtml(text.sections.webhook.desc)}</p>
    ${switchCase('webhookEnabled', initialConfig.webhook.enabled === true, text.sections.webhook.enabled, text.sections.webhook.enabledHint)}
    <div class="grid two">
      <div class="field">
        <label for="provider">${escapeHtml(text.sections.webhook.provider)}</label>
        <select id="provider" data-field="provider">${providerOptions}</select>
      </div>
      <div class="field">
        <label for="url">${escapeHtml(text.sections.webhook.url)}</label>
        <input type="text" id="url" data-field="url" placeholder="${escapeHtml(text.sections.webhook.urlPlaceholder)}" value="${escapeHtml(initialConfig.webhook.url ?? '')}">
      </div>
    </div>
    <div class="field">
      <label for="secret">${escapeHtml(text.sections.webhook.secret)}</label>
      <input type="password" id="secret" data-field="secret" placeholder="${escapeHtml(text.sections.webhook.secretPlaceholder)}" value="${escapeHtml(initialConfig.webhook.secret ?? '')}">
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
  var TEXT = ${JSON.stringify(text).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')};
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

  /** 收集表单当前值，组装为插件配置切片（与 NotifierConfig 结构一致）。 */
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

  /** 把配置切片回填到表单。 */
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
      // 测试一律强制开启目标渠道：否则「先测后存」会静默什么都不发。
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

/**
 * 启动设置看板服务。
 *
 * 端口策略：先用期望端口尝试监听；`strictPort` 为 false 时遇到 `EADDRINUSE`
 * 自动向后最多探测 `MAX_PORT_PROBE` 个端口，避免端口被占导致插件整体不可用。
 */
export async function startSettingsServer(options: SettingsServerOptions = {}): Promise<SettingsServerHandle> {
  // 已有实例时先关停，保证端口与单例状态干净（热重载会重复进入 apply）。
  if (activeHandle) {
    await stopSettingsServer();
  }

  const host = options.host || '127.0.0.1';
  const rootDir = options.rootDir || resolveProjectRoot();
  const requestedPort = normalizePort(options.port ?? DEFAULT_PORT);
  const config = options.config || resolveConfig(DEFAULT_CONFIG);
  const logger = options.logger;
  const strictPort = options.strictPort === true;
  const maxAttempts = strictPort ? 1 : MAX_PORT_PROBE;

  let server: http.Server | undefined;
  let boundPort = requestedPort;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = requestedPort + attempt;
    if (candidate > MAX_VALID_PORT) break;

    const attemptServer = http.createServer((req, res) => {
      void handleRequest(req, res, { rootDir, config, options });
    });

    // 连接关闭后若仍有未完成的响应，主动销毁 socket，避免句柄泄漏。
    attemptServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error?.code === 'EADDRINUSE') return; // 由探测逻辑处理
      logger?.warn?.(`[dsh-notifier] 设置服务异常: ${error?.message ?? error}`);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException) => {
          reject(error);
        };
        attemptServer.once('error', onError);
        attemptServer.listen(candidate, host, () => {
          attemptServer.removeListener('error', onError);
          resolve();
        });
      });
      server = attemptServer;
      // 监听句柄不得把宿主进程钉死：DSH 的生命周期由宿主决定，插件只做被动响应。
      // 与根总线对 fs.watch / 定时器统一 unref 的做法保持一致；宿主自身在运行，
      // 服务照常可用，而仅剩本服务句柄时进程能正常退出（测试与 CLI 场景尤其明显）。
      attemptServer.unref?.();
      // 端口传 0 时由系统分配，必须回读真实端口，否则日志与 URL 会指向 0。
      const address = attemptServer.address();
      boundPort = typeof address === 'object' && address !== null ? address.port : candidate;
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      attemptServer.close();
      if (code !== 'EADDRINUSE' || strictPort) {
        throw error;
      }
      // 端口被占用：继续探测下一个端口。
      logger?.warn?.(`[dsh-notifier] 端口 ${candidate} 已被占用，自动尝试 ${candidate + 1}`);
    }
  }

  if (!server) {
    throw new Error(`[dsh-notifier] 无法在 ${requestedPort} ~ ${requestedPort + maxAttempts - 1} 范围内绑定设置服务端口`);
  }

  const active = server;

  const handle: SettingsServerHandle = {
    port: boundPort,
    host,
    url: `http://${host}:${boundPort}`,
    close: async () => {
      await closeServer(active);
      if (activeHandle === handle) {
        activeHandle = undefined;
        activeServer = undefined;
      }
    },
  };

  activeServer = active;
  activeHandle = handle;
  return handle;
}

/** 关闭 HTTP 服务：停止接收新连接，并等待既有连接结束。 */
async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => {
    // 关闭空闲长连接，否则 keep-alive 句柄会把 close 回调一直拖住。
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

/** 关闭当前活跃的设置服务；无活跃实例时静默返回。 */
export async function stopSettingsServer(): Promise<void> {
  const handle = activeHandle;
  if (!handle) return;
  await handle.close();
}

/** 取当前活跃服务的 URL；未启动时返回 undefined。 */
export function getSettingsServerUrl(): string | undefined {
  return activeHandle?.url;
}

/** 判断内部持有的服务实例是否已真正关闭（供测试断言端口释放）。 */
export function isSettingsServerClosed(): boolean {
  return !activeServer?.listening;
}

/** 读取请求体并解析为 JSON；超限或非法 JSON 时抛出带状态码的错误。 */
async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error('请求体过大'), { statusCode: 413 });
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 请求体不是合法 JSON 属客户端错误，必须回 400 而非 500，便于前端区分定位。
    throw Object.assign(new Error('请求体不是合法的 JSON'), { statusCode: 400 });
  }
  return isPlainObject(parsed) ? parsed : {};
}

/** 统一的 JSON 响应写出。 */
function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** 从查询串或 `Accept-Language` 推断界面语言；默认中文。 */
function resolveUiLocale(req: http.IncomingMessage): 'zh' | 'en' {
  const queryLocale = new URL(req.url || '/', 'http://localhost').searchParams.get('lang');
  if (queryLocale === 'zh' || queryLocale === 'en') return queryLocale;

  const header = req.headers['accept-language'];
  if (typeof header === 'string') {
    const first = header.split(',')[0]?.trim().toLowerCase();
    if (first?.startsWith('en')) return 'en';
  }
  return 'zh';
}

/** 单个请求的处理上下文。 */
interface RequestContext {
  rootDir: string;
  config: NotifierConfig;
  options: SettingsServerOptions;
}

/** 路由分发：只处理本插件必需的四个端点，其余一律 404。 */
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, ctx: RequestContext): Promise<void> {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;
  const method = (req.method || 'GET').toUpperCase();

  try {
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      // 每次打开页面都重新读盘，保证看到的是当前落盘配置而非启动快照。
      const merged = resolveConfig(loadMergedSlice(ctx.rootDir));
      const html = renderSettingsPage(merged, resolveUiLocale(req));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
        'Cache-Control': 'no-store',
      });
      res.end(html);
      return;
    }

    if (method === 'GET' && pathname === '/api/config') {
      const merged = resolveConfig(loadMergedSlice(ctx.rootDir));
      const raw = loadMergedSlice(ctx.rootDir);
      sendJson(res, 200, {
        success: true,
        config: merged,
        raw,
        defaults: resolveConfig(DEFAULT_CONFIG),
        files: {
          base: path.join(ctx.rootDir, BASE_CONFIG_FILENAME),
          local: path.join(ctx.rootDir, LOCAL_CONFIG_FILENAME),
        },
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/config') {
      const body = await readJsonBody(req);
      const incoming = isPlainObject(body.config) ? body.config : body;
      // 先经 resolveConfig 归一化，杜绝前端把非法值写进配置文件。
      const normalized = resolveConfig(incoming) as unknown as Record<string, any>;
      // 只取表单真正托管的字段：以既有配置为底再叠加，避免把 server.port 这类
      // 表单未暴露的字段在保存时被 resolveConfig 补出的默认值静默覆盖。
      const managed: Record<string, any> = {};
      for (const pathParts of FORM_MANAGED_PATHS) {
        const value = getByPath(normalized, pathParts);
        if (value !== undefined) setByPath(managed, pathParts, value);
      }
      const nextSlice = deepMerge(loadMergedSlice(ctx.rootDir), managed);
      const result = savePluginConfig(ctx.rootDir, nextSlice, body.saveSecretsLocally === true);
      sendJson(res, 200, {
        success: true,
        message: '配置已保存',
        secretsIsolated: result.secretsIsolated,
        files: { base: result.baseFile, local: result.localFile },
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/test') {
      const body = await readJsonBody(req);
      const result = await runChannelTest(body, ctx);
      // 参数缺失属客户端错误（400），渠道投递失败属上游错误（502）。
      const statusCode = result.success ? 200 : result.statusCode ?? 502;
      sendJson(res, statusCode, result);
      return;
    }

    sendJson(res, 404, { success: false, message: '未找到该接口' });
  } catch (error) {
    const statusCode = (error as any)?.statusCode ?? 500;
    const message = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) {
      sendJson(res, statusCode, { success: false, message });
    } else {
      res.end();
    }
  }
}

/** 构造测试用的文案（跟随界面语言，便于直观确认发送效果）。 */
function buildTestMessage(locale: 'zh' | 'en'): { title: string; message: string } {
  return locale === 'en'
    ? {
        title: 'DeepSeek Harness - Test Notification',
        message: 'This is a test notification from the DSH notifier settings dashboard.\nIf you can see it, this channel works.',
      }
    : {
        title: 'DeepSeek Harness - 测试通知',
        message: '这是一条来自 DSH 通知设置看板的测试通知。\n如果你看到了它，说明该渠道工作正常。',
      };
}

/**
 * 执行一键测试。
 *
 * - `desktop` / `sound` 直接调用对应渠道函数；
 * - `webhook` 使用请求里临时携带的配置（无需先保存），并额外回报耗时与响应状态。
 */
async function runChannelTest(
  body: Record<string, any>,
  ctx: RequestContext
): Promise<{ success: boolean; message?: string; latencyMs?: number; status?: number | null; response?: string; statusCode?: number }> {
  const type = body.type;
  const uiLocale: 'zh' | 'en' = body.locale === 'en' ? 'en' : 'zh';
  const { title, message } = buildTestMessage(uiLocale);

  if (type === 'desktop') {
    const desktopFn =
      ctx.options.desktopFn || ((t: string, m: string) => sendDesktopNotification(t, m, { kind: 'info' as NotificationKind }));
    const startedAt = Date.now();
    const ok = await desktopFn(title, message, { kind: 'info' });
    return {
      success: ok === true,
      latencyMs: Date.now() - startedAt,
      message: ok === true ? (uiLocale === 'en' ? 'Desktop popup dispatched' : '桌面弹窗已发出') : (uiLocale === 'en' ? 'Desktop popup failed' : '桌面弹窗发送失败'),
    };
  }

  if (type === 'sound') {
    const soundFn = ctx.options.soundFn || ((kind: SoundKind) => playNotificationSound(kind));
    const startedAt = Date.now();
    const ok = await soundFn('default');
    return {
      success: ok === true,
      latencyMs: Date.now() - startedAt,
      message: ok === true ? (uiLocale === 'en' ? 'Sound played' : '提示音已播放') : (uiLocale === 'en' ? 'Sound playback failed' : '提示音播放失败'),
    };
  }

  if (type === 'webhook') {
    const rawWebhook = isPlainObject(body.webhook) ? body.webhook : {};
    // 测试请求强制开启：否则关闭状态下点测试会静默什么都不发，用户无从判断。
    const webhookConfig = resolveConfig({ webhook: { ...rawWebhook, enabled: true } }).webhook;
    // URL 必须 trim 后判空：只填了空格同样是无效配置，不能拿去发请求。
    if (!webhookConfig.url || webhookConfig.url.trim() === '') {
      return { success: false, statusCode: 400, message: uiLocale === 'en' ? 'Webhook URL is empty' : 'Webhook 地址为空' };
    }

    const startedAt = Date.now();
    const webhookFn =
      ctx.options.webhookFn ||
      ((config: NotifierConfig['webhook'], payload: WebhookPayload) => sendWebhookNotification(config, payload));
    const ok = await webhookFn(webhookConfig, {
      title,
      message,
      event: 'settings/test',
      kind: 'info',
    });
    return {
      success: ok === true,
      latencyMs: Date.now() - startedAt,
      message: ok === true
        ? (uiLocale === 'en' ? 'Webhook delivered' : 'Webhook 发送成功')
        : (uiLocale === 'en' ? 'Webhook delivery failed' : 'Webhook 发送失败'),
    };
  }

  return {
    success: false,
    statusCode: 400,
    message: uiLocale === 'en' ? `Unknown test type: ${String(type)}` : `未知的测试类型: ${String(type)}`,
  };
}
