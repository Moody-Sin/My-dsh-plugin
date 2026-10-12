# My-dsh-plugin

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> DeepSeek Harness (DSH) 聚合插件总线 (Umbrella Loader) 与本地定制插件合集仓库。

## 目录

- [背景](#背景)
- [核心架构：聚合总线模式](#核心架构聚合总线模式)
- [统一配置指南](#统一配置指南)
- [插件列表](#插件列表)
- [开发指南](#开发指南)
- [维护日志](#维护日志)
- [维护者](#维护者)
- [使用许可](#使用许可)

## 背景

在 DeepSeek Harness (DSH) 中开发多个本地插件时，传统方式需要频繁修改 DSH 官方 Profile 配置文件（`package.json` 与 `cordis.patch.yml`），且插件配置分散、难以版本受控。

本仓库采用**聚合插件总线 (Umbrella Loader)** 架构：DSH 官方 Profile 仅需在首次接入时挂载一次 `@local/my-dsh-plugins`，后续在当前仓库增删任何插件或修改业务参数，**官方配置文件完全 0 修改**。

## 核心架构：聚合总线模式

1. **单入口挂载**：根目录作为唯一 Cordis Bundle 接入 DSH。
2. **自动扫描与动态加载**：启动时自动扫描仓库内所有以 `dsh-*` 命名的子目录，基于 ESM 动态加载并注入 Cordis 容器。
3. **安全沙箱隔离**：各子插件独立挂载与捕获异常，单个子插件初始化失败仅记录告警，绝不拖垮 DSH 宿主与其它兄弟插件。
4. **防重复挂载**：内置 Cordis 注册表去重机制，防止多途径挂载冲突。

## 统一配置指南

仓库采用**双层配置架构**，彻底实现配置本地化与机密凭据安全隔离：

1. **基础配置文件 (`plugins.config.json`)**：
   - 随 Git 提交，统一管理所有子插件的默认参数与开关。
2. **本地私有覆盖 (`plugins.config.local.json`)**：
   - 纳入 `.gitignore`，专门用于保存个人 Webhook Secret、私有 Token 等机密字段。
   - 启动时自动与基础配置执行深层合并（Deep Merge），本地私有配置享有最高权威。

### 配置示例

在 `plugins.config.json` 中：
```json
{
  "plugins": {
    "notifier": {
      "enabled": true,
      "desktop": { "enabled": true },
      "sound": { "enabled": true },
      "events": {
        "onTurnEnd": true,
        "onQuestion": true,
        "onApproval": true,
        "onError": true,
        "minDurationSeconds": 5
      },
      "webhook": {
        "enabled": false,
        "provider": "generic",
        "url": "",
        "secret": ""
      }
    }
  }
}
```

- **快捷禁用**：设置 `"enabled": false` 可在模块导入前直接跳过该插件加载。
- **配置剥离**：加载器透传给子插件前会自动剥离 `enabled` 字段，确保符合子插件的原生 Schema。

## 插件列表

| 插件名称 | 目录 | 版本 | 简介 |
| :--- | :--- | :--- | :--- |
| **`@local/my-dsh-plugins`** | 根目录 (`./`) | `v0.4.0` | 聚合插件总线 Loader，提供自动扫描、双层配置与隔离装载。 |
| **`@local/dsh-notifier`** | [`dsh-notifier/`](./dsh-notifier) | `v0.2.1` | 跨平台系统原生桌面弹窗、提示音及飞书/钉钉/企微/Bark/通用 Webhook 离机通知插件。 |

## 开发指南

- 遵循 [约定式提交 (Conventional Commits)](https://www.conventionalcommits.org/zh-hans/)。
- 遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。
- 所有新插件必须分配在以 **`dsh-*`** 命名的独立目录下，配备完整的 `package.json`、`README.md` 与单元测试。
- **首次使用必须先执行 `npm install`**：本仓库采用 npm workspaces，构建与类型检查工具链的 `node_modules/.bin` 由根 `node_modules` 提供，克隆仓库后必须先安装一次，否则 `build` / `typecheck` 均无法运行。这是 npm workspaces 的固有约束（依赖被提升到根，子包副本会被删除）。
- 执行构建：`npm run build`（自动构建所有子插件并打包根 Loader）。
- 类型检查：`npm run typecheck`（同时检查根 Loader 与所有子插件）。
- 运行测试：`npm test`（自动运行所有工作区及根 Loader 全套测试套件，当前规模为根 Loader **32 项** + 通知子插件 **57 项**，共 89 项）。

## 维护日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 维护者

[@DeepSeek-Harness-User](https://github.com)

## 使用许可

[MIT](./LICENSE)
