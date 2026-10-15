# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- 修复 `webserver/index-inject` 重复事件触发导致前端脚本被多次注入的问题。
- 修复客户端 bundle 中 `window.__ModuleLoader__.load` 在脚本重复执行时触发 `duplicate factory registration` 报错的问题，增加多层防重执行保护与 pending 队列查重。
- 完善 Cordis v4 `ctx.effect` 生命周期清理钩子，杜绝监听器悬空。

## [0.1.0] - 2026-10-15

### Added
- 初始化子智能体模型指示器插件 `@local/dsh-subagent-model-indicator`。
- 实现子智能体对话页面头部模型徽标显示与 Reasoning Effort 渲染。
- 提取中英文国际化与模型名称智能规范化解析工具。
