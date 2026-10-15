# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.6.0] - 2026-10-16

### 修复 (Fixed)
- **Webhook 报文安全长度截断保护**：在 `sendWebhookNotification` 入口增加安全截断逻辑（上限 3000 字符），防止长错误堆栈超过平台上限（Telegram 4096 字符、企微 4096 字节等）导致 HTTP 400 失败并丢失关键告警。
- **Webhook 失败可观测性日志**：网络请求失败或返回非 2xx 时，通过 `logFn` 输出清晰的包含 HTTP 状态码与响应体摘要的告警日志，便于连通性排查。
- **热重载会吞掉正在进行的那一轮通知**：轮次计时表 `turnStartTimes` 由 `apply()` 内局部变量提升为**模块级**。
  聚合总线热重载走 Cordis `restart()`（dispose 再 apply），局部计时表在重启时被清空，
  导致「turn/start 在重载前、turn/end 在重载后」的轮次耗时记为 0，被 `minDurationSeconds` 过滤后**该轮结束通知静默丢失**。
  回收改为容量淘汰（200 条）+ 24h TTL，不再依赖卸载时机。
- **声明了用不到的 `inject = ['sessions']`**：改为空数组。插件从不使用会话存储；
  把可选增强写成硬依赖会让服务缺失时 fiber 永久停在 PENDING，`apply()` 从不执行、一条通知都发不出，且无任何告警指向真正原因。
- **`onTurnEnd` 读取已废弃的阈值字段**：删除对 `desktop.minDurationSeconds` 的回退读取（该回退在生产路径上不可达），
  仅保留对残缺配置的最小 `?? 5` 兜底。

### 新增 (Added)
- **`sendTestNotification()` 连通性诊断入口**：供聚合总线设置 UI 的「⚡ 发送测试通知」按钮调用。
  此前该按钮从未接线、永远返回假成功（点一下什么都没发却显示成功）。诊断走与生产事件相同的派发路径，
  回传逐渠道结果与可读结论；支持注入 dispatcher 以便测试。
- **`NotificationDispatcher.sendRaw()`**：向渠道直接推送自定义消息，用于连通性诊断。
  诊断场景临时关闭防抖，避免连点两次被静默吞掉。
- **诊断文案进入词典**：新增 `testTitle` / `testMessage` / `testSucceeded` / `testPartialFailed` / `noChannelEnabled` 中英文键。
- **`src/utils/env.ts`**：环境变量插值共享实现，供插件运行时与 `bin/test-notify.ts` 复用，消除两份独立实现随时间漂移的风险。

### 变更 (Changed)
- **`sendRaw()` 改为单渠道明确指定**：入参由 `{ soundOnly?, webhookOnly? }` 改为必填的 `channel: 'desktop' | 'sound' | 'webhook'`。
  原设计下诊断桌面会连带派发声音与 Webhook，导致 Webhook 重复推送；且聚合返回值会让 Webhook 失败时
  （桌面弹窗明明成功）被误报为桌面失败。桌面渠道独立诊断时不再内联声音。
- **WSL 探测结果缓存**：`isWslWithPowershell()` 缓存生产路径的探测结果。一次派发中
  dispatcher / desktop / sound 三处都会调用，此前等于凭空三次文件系统探测。
  显式传参（测试用法）仍实时探测，保证用例间确定性。

## [0.5.0] - 2026-10-12

### 移除 (Removed)
- **彻底移除内置 HTTP 设置看板**（`src/server.ts`）：移除 `3088` 端口监听服务，删减 1277 行内联 HTML/CSS/JS 服务端代码，彻底消除端口占用与常驻服务开销。
- **移除 `server` 配置段**：废弃并移除 `server.enabled` 与 `server.port` 配置，插件配置统一收敛至 DSH 官方 Web GUI（3080）原生 Volatile 表单及双层配置文件（`plugins.config.json` / `plugins.config.local.json`）。
- **移除相关测试文件**：删除 `tests/server.test.ts`。

### 新增 (Added)
- **轻量 CLI 测试工具**（`bin/test-notify.ts`）：提供命令行测试能力平替原有看板的一键测试功能，支持 `--type=desktop`、`--type=sound`、`--type=webhook` 及 `--type=all`，支持临时参数覆盖并实时显示响应耗时。
- 新增 `npm run test:notify` 快捷执行脚本。

### 变更 (Changed)
- **架构与产物瘦身**：构建产物 `index.js` 体积缩减超过 50%，运行时回归纯粹的事件驱动通知分发器，完全零网络端口监听。

## [0.4.0] - 2026-10-12

### 新增 (Added)
- **内置轻量 HTTP 设置看板与一键测试服务**（`src/server.ts`）：基于 **Node.js 原生 `node:http`** 实现，**零额外 npm 依赖**，不引入任何第三方包。
  - `GET /`：单页设置应用（内联 CSS/JS，无外部资源引用），中英双语、`prefers-color-scheme` 深色/浅色自适应。卡片化布局：通用与语言、系统桌面与声音、任务与事件过滤、Webhook 离机推送、**一键测试区**、保存选项。
  - `GET /api/config`：返回归一化后的配置、原始切片与默认值，供前端回填。
  - `POST /api/config`：写入 `plugins.config.json`，可选把机密凭据分流到 `plugins.config.local.json`，由根总线 300ms 热重载生效。
  - `POST /api/test`：一键测试 `desktop` / `sound` / `webhook` 三个渠道；Webhook 使用前端**当前填写的临时配置**（无需先保存），并返回 `latencyMs` 发送耗时与结果状态。
- **端口自适应**：默认 `3088`，被占用时自动向后探测（最多 20 个）；`strictPort` 可强制失败；端口传 `0` 时交由系统分配空闲端口。
- `startSettingsServer()` / `stopSettingsServer()` 优雅启停接口，服务句柄统一 `unref`，绝不把宿主进程钉死。
- 新增 `server` 配置段（`{ enabled: true, port: 3088 }`），插件启动时输出 `[dsh-notifier] 设置看板已就绪: http://127.0.0.1:<port>`。
- **一键测试区**三个按钮：发送测试弹窗、播放测试提示音、测试 Webhook 发送（实时展示耗时与服务端响应状态）。
- 保存区提供【将机密凭据保存至本地私有覆盖 (plugins.config.local.json)】复选框。

### 变更 (Changed)
- `SCHEMA_DICT` 的可编辑节点（语言、桌面/声音开关、事件开关与阈值、Webhook 全字段）标注 `meta: { volatile: true }`，所有节点仍保证带 `meta`，满足 DSH `volatileForm()` / `isVolatilePath()` 的递归读取要求。
- 保存配置采用「表单托管字段叠加」策略：只覆盖看板实际暴露的字段，`server.port` 等表单未暴露的配置不会被 `resolveConfig` 的默认值静默重置。

### 修复 (Fixed)
- 保存时清除本地私有覆盖中的受管非机密字段：此前本地覆盖以最高权威存在时，会静默压掉看板刚写入的新值，导致「点了保存却毫无变化」。
- 未勾选「保存到本地私有覆盖」时凭据正常落基础配置（此前会被静默丢弃）。
- 空/纯空格 Webhook URL 的测试请求明确返回 400 而非发起无效请求。
- 非法 JSON 请求体返回 400（此前为 500），便于前端区分客户端与服务端错误。
- 设置服务监听句柄 `unref`，修复仅剩该句柄时进程无法退出的问题。

### 测试 (Tests)
- 新增 `tests/server.test.ts`（19 项）：HTML 内联与零外部资源、配置渲染与转义、`/api/config` 读写、三渠道测试分派、机密隔离与本地残留清除、兄弟插件配置不被覆盖、端口探测与 `strictPort`、启停与端口释放、404/400/413 边界。
- 新增 e2e 用例：打包产物按配置启动看板、就绪日志格式、`dispose` 后端口释放、`server.enabled: false` 时不启动。
- 新增 manifest 用例：打包产物不得 import/require 任何第三方模块（零依赖硬约束）。
- 测试套件扩充至 104 项。

## [0.3.0] - 2026-10-12

### 新增 (Added)
- **Windows WinRT Toast 内联音效**：`sendDesktopNotification()` 新增 `soundEnabled` 与 `soundKind` 选项，弹窗与提示音合并进同一次 PowerShell 调用（`<audio src="ms-winsoundevent:Notification.Reminder"/>` / `Notification.Default`），Windows 下子进程开销削减 50%，并彻底消除两次子进程先后启动导致的声画不同步。
- **真正落地的多语言 (i18n)**：新增 `locale` 配置（`auto` | `zh` | `en`，默认 `auto`），`auto` 依次读取 `DSH_LOCALE`、`LANG`、`LC_ALL`，以 `en` 开头走英文，否则中文。标题、字段标签与耗时单位全部双语化，词典集中在新增的 `src/utils/i18n.ts`。
- **Telegram 渠道**：`provider: 'telegram'`，Markdown 正文 `*标题*\n\n正文`，`secret` 作为 `chat_id`（URL 已自带 `chat_id` 时不覆盖）。
- **Discord 渠道**：`provider: 'discord'`，Rich Embed 推送，按等级配色（错误 `#FF0000`、警告 `#FFA500`、成功 `#00FF00`、普通 `#3498DB`）并携带 ISO 时间戳。
- **事件去重频控**：`NotificationDispatcher` 新增 200ms 相同事件去重窗口（`DispatcherOptions.debounceMs` 可调，`0` 关闭），保护下游网络请求；首次通知不延迟。
- `formatDuration()` 支持小时级格式化：`1小时1分1秒` / `1h 1m 1s`。
- `locale/zh.json` 与 `locale/en.json` 新增 `notifications` 词条段，与运行时代码词典一一对应。

### 变更 (Changed)
- **Windows 声音委托策略**：`win32` 平台上 `desktop.enabled` 与 `sound.enabled` 同时为真时，由桌面渠道承载声音，不再独立执行 `soundFn`；仅 `desktop.enabled === false && sound.enabled === true` 时才单独播放提示音。非 Windows 平台维持桌面与声音分离调用。
- **Linux 通知精细化**：`warning` / `error` 级通知追加 `-u critical` 紧急度；`iconPath` 非空时追加 `-i`。
- **macOS 通知精细化**：会话名改由 AppleScript `subtitle` 承载，正文只保留轮次与耗时，避免系统通知面板重复展示同一行；无副标题时自动降级为双参数脚本。
- `DispatcherOptions` 新增 `platform` / `debounceMs` / `nowFn` 注入点，便于跨平台与时钟的确定性测试。

### 测试 (Tests)
- 测试套件扩充至 80 项：新增 WinRT 内联音频与静音回退、Linux 紧急度与图标、macOS `subtitle`、Telegram/Discord 载荷、Windows 单进程委托策略、中英文全量文案、小时级耗时、200ms 去重与窗口过期、Schema 递归 `meta` 完整性、打包产物端到端与版本/词条一致性校验。

## [0.2.1] - 2026-10-12

### 修复 (Fixed)
- **会话标题永远取不到**：`inject` 未声明 `sessionTitle`，而 Cordis 的 `ctx` 是 Proxy——读取未声明 `inject` 的服务属性会**直接抛错**，可选链 `ctx.sessionTitle?.` 挡不住该抛错，异常被 `catch` 吞掉后连 `session.header.cwd` 兜底分支都走不到，导致通知正文永远缺失会话名。已改用 Cordis 公开的安全读取 API `ctx.get('sessionTitle')`。
- 删除指向不存在文件的 `types` 字段（`./lib/index.d.ts` 从未生成）。

### 变更 (Changed)
- **`sessionTitle` 刻意不写进 `inject`**：实测若声明，该服务缺失时 Cordis 会把插件 fiber 永久挂在 PENDING，导致**一条通知都发不出**；改用 `ctx.get` 后插件照常激活，只是通知没有标题。对旁路通知插件而言「没标题但能通知」严格优于「彻底不通知」。`inject` 保持 `['sessions']` 不变。
- 补充注释说明 `dispatcher.ts` 中后两层 `??` 回退链仅为兼容绕过 `resolveConfig` 直接构造配置对象的调用方（正常路径下不可达）。

### 测试 (Tests)
- 新增 5 项用例，覆盖：模拟 Cordis Proxy 的 mock 上下文、`ctx.get` 取标题、`sessionTitle` 缺失时回退 `session.header.cwd`、无标题时不抛错、服务完全缺失时仍照常派发通知。测试套件扩充至 57 项。

## [0.2.0] - 2026-10-12

### 新增 (Added)
- 新增 `events.minDurationSeconds` 全局/事件级耗时过滤阈值（默认 5s），彻底解耦桌面通知开关与 Webhook 离机推送过滤。
- Bark 渠道 Payload 增加跳转链接（默认 `http://127.0.0.1:3080`，支持 `metadata.url` 覆盖）与 `badge` 角标。
- Webhook 针对高优先级提问、审批与告警事件增加网络抖动自动退避重试（1 次重试）。
- Windows WinRT Toast 原生弹窗增加系统 AppID 注册缺失时的默认通知器降级容错。

### 变更 (Changed)
- `desktop.minDurationSeconds` 标记为向后兼容保留字段，优先使用 `events.minDurationSeconds`。

### 测试 (Tests)
- 扩充测试套件至 52 项测试（涵盖阈值解耦、向后兼容继承、网络超时重试、Bark 属性与降级覆盖等）。

## [0.1.1] - 2026-10-12

### 修复 (Fixed)
- 修复插件在 DSH 中加载失败（`fiberPhase: 'failed'`）的问题：为 `Config` 补充 Standard Schema 规范要求的 `['~standard']` 属性（`version: 1`、`vendor: 'schemastery'`、同步 `validate`），避免 Cordis 调用 `runtime.Config['~standard'].validate(config)` 时抛出 `Cannot read properties of undefined (reading 'validate')`。
- 为 `Config` 补充 `toJSON()` 方法，使其在配置序列化与展示时输出可读的 schema 描述。

### 测试 (Tests)
- 新增 `Config['~standard']` 接口契约、同步校验返回值（无 `issues`）与空输入回退默认值、`toJSON()` 可序列化结构共 4 项单元测试。

## [0.1.0] - 2026-10-12

### 新增 (Added)
- 初始化 DSH 通知插件 `@local/dsh-plugin-notifier` 核心工程。
- 支持 Windows (WinRT Toast)、macOS (osascript)、Linux (notify-send) 原生桌面通知。
- 支持系统原生音效播放（Windows Asterisk/Exclamation、macOS Glass/Basso、Linux complete）。
- 支持五大常用 Webhook 推送渠道（飞书富文本卡片、钉钉 Markdown、企业微信 Markdown、Bark iOS 推送、通用 JSON Webhook）。
- 增加飞书与钉钉机器人 HmacSHA256 签名鉴权支持（配置 `secret` 自动加签）。
- 增加 Webhook 请求 5 秒超时熔断 (`AbortSignal.timeout`) 与子进程 5 秒防挂死超时保护。
- 增加 WinRT XML 非法控制字符清洗与静音标签 (`<audio silent="true"/>`)，避免 Windows 重复发声。
- 优化 DSH 核心会话标题探测逻辑，标准适配 `ctx.sessionTitle.get(session).title`。
- 优化未知耗时展示，非有限数值返回安全文案。
- 优化轮次时间追踪 Map 内存淘汰与销毁保护。
- 完整接入 DSH Cordis 生命周期事件：`turn/end` 任务完成、`user-questions/request` 提问等待、`approval/request` 审批申请、`agent/error` 运行时异常。
- 增加 `minDurationSeconds` 智能防打扰过滤，避免短时问答频繁弹窗。
- 遵循 DSH 插件规范，提供中英文 `locale` 元数据与 `icon.svg` 矢量图标。
