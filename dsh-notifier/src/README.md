# dsh-notifier/src/ — 通知插件源码

`@local/dsh-notifier` 的 TypeScript 源码，经 `esbuild` 打包为上级目录的 `index.js`。用户向的特性与配置见[插件 README](../README.md)。

## 文件职责

| 文件 | 职责 |
| :--- | :--- |
| [`index.ts`](./index.ts) | Cordis 插件入口：注册四类监听器，解析会话标题。 |
| [`config.ts`](./config.ts) | 配置模型、`DEFAULT_CONFIG`、`resolveConfig()` 归一化、Standard Schema `Config` 与设置面板 Schema。 |
| [`dispatcher.ts`](./dispatcher.ts) | `NotificationDispatcher`：事件开关、耗时阈值过滤、多渠道并发派发。 |
| [`channels/`](./channels/) | `desktop.ts`（桌面弹窗）、`sound.ts`（提示音）、`webhook.ts`（Webhook 推送）。 |
| [`utils/xml.ts`](./utils/xml.ts) | `escapeXml()`：WinRT Toast XML 转义。 |

## index.ts

- `inject = ['sessions']` 为历史兼容保留，插件实际不使用会话存储。
- **`sessionTitle` 故意不写进 `inject`**：它是可选增强，一旦声明，服务缺失时 Cordis 会把 fiber 永久挂在 PENDING，一条通知都发不出。改由 `getSessionTitle()` 经 `ctx.get('sessionTitle')` 安全读取 —— Cordis 的 `ctx` 是 Proxy，读取未声明在 `inject` 中的服务属性会直接抛错，可选链挡不住。
- 标题依次尝试 `get(session).title` → `titleOf()` → `title()`，再回退 `session.header.cwd`，最终可为 `undefined`（少一行标题，不影响送达）。
- 四类监听器：`session/event`（`turn/start` 记起始时间、`turn/end` 算耗时）、`user-questions/request` 与 `approval/request`（waterfall，非阻塞派发后必调 `next()`）、`agent/error`；回调内均 `try/catch` 兜底，绝不阻断主流程。
- `turnStartTimes` 上限 `MAX_TRACKED_TURNS = 200`（超限淘汰最旧键），`ctx.on('dispose')` 时清空。

## config.ts

- `resolveConfig()` 逐字段降级：类型不符即回落默认值，`minDurationSeconds` 经 `normalizeDurationSeconds()` 规整为非负整数。
- 耗时阈值优先级：`events.minDurationSeconds` → 旧版 `desktop.minDurationSeconds`（已废弃，仅作回退）→ `5`，**与桌面渠道开关彻底解耦**；`provider` 经白名单校验，非法值回落 `generic`。
- `Config` 同时携带 `Symbol.for('schemastery')` 与 `~standard`（同步 `validate`），并暴露 `toJSON()` 供设置面板渲染。
- **`SCHEMA_DICT` 每个节点都必须带 `meta: {}`** —— DSH 的 `volatileForm()` / `isVolatilePath()` 会无条件递归读取 `node.meta.volatile`，缺失会让面板崩溃。

## dispatcher.ts 与 channels/

- `formatDuration()`：`< 60` 秒显示 `N秒`，否则 `N分N秒`；非有限值或负数显示 `未知`。
- 四个入口各查 `config.events.*` 开关；`onTurnEnd` 额外做耗时阈值过滤（短轮次直接返回）。`dispatch()` 以 `Promise.allSettled` 并发执行各渠道，单渠道异常不影响其余渠道与 Agent 主流程。
- `desktop.ts`：Windows 以 `powershell -EncodedCommand` 调用 WinRT Toast（`ToastGeneric` 模板 + `<audio silent="true"/>`，含 AppID 回退）；macOS 用 `osascript`；Linux 用 `notify-send`。
- `sound.ts`：Windows `SystemSounds`（`alert` → Exclamation）、macOS `afplay`（`alert` → Basso.aiff）、Linux `paplay`。
- `webhook.ts`：飞书富文本卡片（按 `kind` 着色）、钉钉与企微 Markdown、Bark（跳转 DSH 控制台 + `badge` 角标）、通用 JSON。飞书签名为 `HMAC-SHA256(key = "timestamp\nsecret", data = "")`，钉钉反之并把 sign 拼进 URL。
- `isHighPriorityEvent()` 判定提问 / 审批 / `warning` / `error`，此类事件失败后短退避重试一次（默认 400ms），普通 `turn/end` 不重试；请求统一带 `AbortSignal.timeout(5000)`，异常收敛为 `false`。
- `utils/xml.ts`：`escapeXml()` 先剥离 XML 非法控制字符（`\x00-\x08`、`\x0B`、`\x0C`、`\x0E-\x1F`、`\x7F`），再转义 `& < > " '`，用于把标题与正文安全注入 Toast XML 模板。
