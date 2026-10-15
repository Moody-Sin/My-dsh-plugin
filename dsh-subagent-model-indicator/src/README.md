# Source Code for @local/dsh-subagent-model-indicator

本目录包含插件的源代码实现：

- `index.ts`：Node 宿主侧插件入口，负责 Cordis 生命周期管理及向前端 WebServer 注入脚本。
- `client.ts`：浏览器前端插件入口，向 `conversation.session.header.actions` 插槽注册子智能体模型徽标组件。
- `formatter.ts`：模型名称清洗、美化与推理层级组合工具函数。
- `config.ts`：子插件的配置解析与 Schema 校验。
