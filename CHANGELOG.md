# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.2.0] - 2026-10-12

### 新增 (Added)
- 根目录引入 npm workspaces 统一工作区配置（`package.json`），支持全局联动执行 `test` 与 `build`。
- `@local/dsh-plugin-notifier` 升级至 `0.2.0`：
  - 新增 `events.minDurationSeconds` 全局/事件级耗时过滤阈值，彻底解耦桌面通知开关与 Webhook 离机推送过滤。
  - Bark 渠道 Payload 增加跳转链接（默认 `http://127.0.0.1:3080`）与 `badge` 角标。
  - Webhook 针对高优先级提问、审批与告警事件增加网络抖动自动退避重试（1 次重试）。
  - Windows WinRT Toast 原生弹窗增加系统 AppID 注册缺失时的默认通知器降级容错。

### 变更 (Changed)
- `desktop.minDurationSeconds` 标记为向后兼容保留字段，优先使用 `events.minDurationSeconds`。

### 测试 (Tests)
- `@local/dsh-plugin-notifier` 测试套件扩充至 52 项，覆盖阈值解耦、向后兼容继承、网络超时重试、Bark 属性与降级容错。

## [0.1.1] - 2026-10-12

### 修复 (Fixed)
- 修复 `@local/dsh-plugin-notifier` 在 DSH 中加载失败（`fiberPhase: 'failed'`）的问题：为插件 `Config` 补充 Standard Schema 规范的 `['~standard']` 校验接口与 `toJSON()` 方法，兼容 Cordis v4 的 `runtime.Config['~standard'].validate(config)` 配置校验流程。

## [0.1.0] - 2026-10-12

### 新增 (Added)
- 初始化仓库架构，遵循 Standard README 与 Cordis 插件规范。
- 新增通知插件 `@local/dsh-plugin-notifier`（支持 Windows/macOS/Linux 原生桌面弹窗、系统音效及飞书/钉钉/企微/Bark/通用 Webhook 离机推送，含超时防护与 HMAC-SHA256 签名鉴权）。
