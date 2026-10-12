# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。

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
