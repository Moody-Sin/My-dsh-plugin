# @local/dsh-subagent-model-indicator

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> 在 DeepSeek Harness (DSH) Web 对话页面顶部操作区为子智能体展示当前正在使用的模型名称及推理层级（Reasoning Effort）。

## 目录

- [背景](#背景)
- [特性](#特性)
- [配置说明](#配置说明)
- [维护者](#维护者)
- [使用许可](#使用许可)

## 背景

DeepSeek Harness 原生的模型选择组件仅挂载在主会话的输入栏中。由于子智能体不支持在运行中切换模型，原生界面对其直接屏蔽了模型选择组件；同时，子智能体顶部导航条（Breadcrumbs）与 Presets 区域未展示模型名称，导致用户进入子智能体对话页面时无法直观得知其正在运行哪一个模型。

本插件通过在会话头部插槽 `conversation.session.header.actions` 挂载轻量模型徽标组件，精准读取子智能体会话投影中的 `modelSelection` 数据并进行友好格式化展示。

## 特性

- **智能识别**：仅在当前会话为子智能体（`origin === 'subagent'` 或存在 `subagent` 投影）时显示，主会话自动隐藏，不与原生模型选择器冲突。
- **美观对齐**：采用 DSH 原生 Design Tokens 规范，对齐 Standard mode 标签的圆角、高度与颜色主题。
- **模型格式化**：自动精简复杂路径（如 `remote-magpie/antigravity/gemini-3.8-flash` 格式化为 `Gemini 3.8-Flash`），并突出展示 `HIGH`、`MEDIUM` 等思考推理层级。
- **完整 Tooltip**：鼠标悬停可查看完整的 `provider/model` 路径与配置详情。
- **0 破坏侵入**：纯增量插槽扩展，不修改 DSH 官方源码与核心逻辑。

## 配置说明

在聚合总线 `plugins.config.json` 中配置：

```json
{
  "plugins": {
    "subagent-model-indicator": {
      "enabled": true
    }
  }
}
```

## 维护者

@local/my-dsh-plugins

## 使用许可

MIT © 2026
