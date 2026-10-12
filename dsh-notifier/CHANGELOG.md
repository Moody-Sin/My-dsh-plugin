# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。

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
