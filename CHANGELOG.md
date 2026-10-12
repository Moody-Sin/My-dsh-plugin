# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.1] - 2026-10-12

### 修复 (Fixed)
- 修复 `@local/dsh-plugin-notifier` 在 DSH 中加载失败（`fiberPhase: 'failed'`）的问题：为插件 `Config` 补充 Standard Schema 规范的 `['~standard']` 校验接口与 `toJSON()` 方法，兼容 Cordis v4 的 `runtime.Config['~standard'].validate(config)` 配置校验流程。

## [0.1.0] - 2026-10-12

### 新增 (Added)
- 初始化仓库架构，遵循 Standard README 与 Cordis 插件规范。
- 新增通知插件 `@local/dsh-plugin-notifier`（支持 Windows/macOS/Linux 原生桌面弹窗、系统音效及飞书/钉钉/企微/Bark/通用 Webhook 离机推送，含超时防护与 HMAC-SHA256 签名鉴权）。
