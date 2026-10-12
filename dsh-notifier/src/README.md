# dsh-notifier/src/ — 通知插件源码

`@local/dsh-notifier` 的 TypeScript 源码，经 `esbuild` 打包为上级目录的 `index.js`。用户向的特性与配置见[插件 README](../README.md)。

## 文件职责

| 文件 | 职责 |
| :--- | :--- |
| [`index.ts`](./index.ts) | Cordis 插件入口：注册四类监听器，解析会话标题，事件驱动通知派发。 |
| [`config.ts`](./config.ts) | 配置模型、`DEFAULT_CONFIG`、`resolveConfig()` 归一化、Standard Schema `Config` 与设置面板 Schema。 |
| [`dispatcher.ts`](./dispatcher.ts) | `NotificationDispatcher`：事件开关、耗时阈值过滤、i18n 文案、事件去重、多渠道并发派发。 |
| [`channels/`](./channels/) | `desktop.ts`（桌面弹窗）、`sound.ts`（提示音）、`webhook.ts`（Webhook 推送）。 |
| [`utils/xml.ts`](./utils/xml.ts) | `escapeXml()`：WinRT Toast XML 转义。 |
| [`utils/i18n.ts`](./utils/i18n.ts) | `resolveLocale()` 语言判定、中英文词典 `t()` / `label()`。 |

## index.ts

- `inject = ['sessions']` 为历史兼容保留，插件实际不使用会话存储。
- **`sessionTitle` 故意不写进 `inject`**：它是可选增强，一旦声明，服务缺失时 Cordis 会把 fiber 永久挂在 PENDING，一条通知都发不出。改由 `getSessionTitle()` 经 `ctx.get('sessionTitle')` 安全读取 —— Cordis 的 `ctx` 是 Proxy，读取未声明在 `inject` 中的服务属性会直接抛错，可选链挡不住。
- 标题依次尝试 `get(session).title` → `titleOf()` → `title()`，再回退 `session.header.cwd`，最终可为 `undefined`（少一行标题，不影响送达）。
- 四类监听器：`session/event`（`turn/start` 记起始时间、`turn/end` 算耗时）、`user-questions/request` 与 `approval/request`（waterfall，非阻塞派发后必调 `next()`）、`agent/error`；回调内均 `try/catch` 兜底，绝不阻断主流程。
- `turnStartTimes` 上限 `MAX_TRACKED_TURNS = 200`（超限淘汰最旧键），`ctx.on('dispose')` 时清空。
- 纯事件驱动模型：不占用任何网络端口，零常驻 HTTP 服务。

## config.ts

- `resolveConfig()` 逐字段降级：类型不符即回落默认值，`minDurationSeconds` 经 `normalizeDurationSeconds()` 规整为非负整数，`locale` 经白名单校验（非法值回落 `auto`）。
- 耗时阈值优先级：`events.minDurationSeconds` → 旧版 `desktop.minDurationSeconds`（已废弃，仅作回退）→ `5`，**与桌面渠道开关彻底解耦**；`provider` 经白名单校验，非法值回落 `generic`。
- `Config` 同时携带 `Symbol.for('schemastery')` 与 `~standard`（同步 `validate`），并暴露 `toJSON()` 供设置面板渲染。
- **`SCHEMA_DICT` 每个节点都必须带 `meta: {}`** —— DSH 的 `volatileForm()` / `isVolatilePath()` 会无条件递归读取 `node.meta.volatile`，缺失会让面板崩溃。
- 可编辑节点（`locale`、桌面/声音开关、事件开关与阈值、Webhook 全字段）标注 `meta: { volatile: true }`。

## bin/test-notify.ts (CLI 诊断工具)

- 独立命令行工具，经 `npm run test:notify` 执行，无需启动 DSH 即可直接验证当前主机的通知连通性与响应耗时。
- 支持 `--type=desktop|sound|webhook|all` 及临时覆盖参数 `--url`、`--provider`、`--secret`。

## dispatcher.ts 与 channels/

- `formatDuration(durationMs, locale = 'zh')`：`< 60` 秒显示 `N秒`/`Ns`，`< 3600` 秒显示 `N分N秒`/`Nm Ns`，否则显示 `X小时Y分Z秒`/`Xh Ym Zs`；非有限值或负数显示 `未知`/`Unknown`。
- 四个入口各查 `config.events.*` 开关；`onTurnEnd` 额外做耗时阈值过滤（短轮次直接返回）。`dispatch()` 以 `Promise.allSettled` 并发执行各渠道，单渠道异常不影响其余渠道与 Agent 主流程。
- 文案全部经 `utils/i18n.ts` 的 `t()` / `label()` 生成，语言由 `resolveLocale(config.locale)` 一次解析后缓存到实例字段。
- **Windows 声音内联**：`platform === 'win32'` 且 `desktop.enabled` 与 `sound.enabled` 同为真时，`dispatch()` 把 `soundEnabled: true` 与 `soundKind` 传给 `desktopFn`，**不再调用 `soundFn`** —— 一次 PowerShell 调用即完成弹窗与发声，子进程开销减半且声画严格同步；仅 `desktop.enabled === false && sound.enabled === true` 时才独立调用 `soundFn`。非 Windows 平台保持桌面与声音分开调用。
- **事件去重**：以 `事件名 + 标题 + 正文 + 等级 + 音效类型` 组成键，默认 200ms 窗口内重复即抑制（`DispatcherOptions.debounceMs` 可调，`0` 关闭）。首次派发不延迟；`Map` 每次判定时清理过期键并设有 `MAX_DEBOUNCE_ENTRIES` 容量上限。
- `desktop.ts`：Windows 以 `powershell -EncodedCommand` 调用 WinRT Toast（`ToastGeneric` 模板，含 AppID 回退），`<audio silent="true"/>` 与内联 `ms-winsoundevent:Notification.Reminder`/`Notification.Default` 互斥；macOS 用 `osascript`（会话名走 `subtitle`，无副标题时自动降级为双参数脚本）；Linux 用 `notify-send`，`warning`/`error` 追加 `-u critical`，`iconPath` 非空追加 `-i`。
- `sound.ts`：Windows `SystemSounds`（`alert` → Exclamation）、macOS `afplay`（`alert` → Basso.aiff）、Linux `paplay`。
- `webhook.ts`：飞书富文本卡片（按 `kind` 着色）、钉钉与企微 Markdown、Bark（跳转 DSH 控制台 + `badge` 角标）、Telegram（Markdown 正文，`secret` 作为 `chat_id`，URL 已带 `chat_id` 时不覆盖）、Discord（Rich Embed，按等级配色 + ISO 时间戳）、通用 JSON。飞书签名为 `HMAC-SHA256(key = "timestamp\nsecret", data = "")`，钉钉反之并把 sign 拼进 URL。
- `isHighPriorityEvent()` 判定提问 / 审批 / `warning` / `error`，此类事件失败后短退避重试一次（默认 400ms），普通 `turn/end` 不重试；请求统一带 `AbortSignal.timeout(5000)`，异常收敛为 `false`。
- `utils/xml.ts`：`escapeXml()` 先剥离 XML 非法控制字符（`\x00-\x08`、`\x0B`、`\x0C`、`\x0E-\x1F`、`\x7F`），再转义 `& < > " '`，用于把标题与正文安全注入 Toast XML 模板。
- `utils/i18n.ts`：`resolveLocale(setting, env)` 在 `auto` 下按 `DSH_LOCALE` → `LANG` → `LC_ALL` 取首个可用值，以 `en` 开头（忽略大小写）判为英文，否则中文；`t()` 取词条，`label()` 追加冒号。locale 文件中的 `notifications` 段与之保持一致，由 `tests/manifest.test.ts` 锁定。
