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
2. **自动扫描与动态加载**：启动时自动扫描仓库内所有以 `dsh-*` 命名的子目录（含目录软链 / Windows junction），基于 ESM 动态加载并注入 Cordis 容器。
3. **根目录向上查找**：从加载器自身所在目录逐级上溯，以包名或 `plugins.config.json` 判定仓库根；**定位失败直接抛错，绝不回落 `process.cwd()`**，避免在 DSH 中误把用户的目标工程目录当作插件根。
4. **安全沙箱隔离**：各子插件独立挂载与捕获异常，单个子插件初始化失败仅记录告警，绝不拖垮 DSH 宿主与其它兄弟插件。
5. **防重复挂载**：内置 Cordis 注册表去重机制，防止多途径挂载冲突。
6. **配置热重载**：监听配置文件变更，**无需重启 DSH** 即可启用 / 禁用子插件或热更新其参数。
7. **原生 Logger 对接**：优先使用 Cordis `ctx.logger`，缺失时优雅降级到控制台。

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
- **环境变量插值**：配置值中支持 `${VAR_NAME}` 与 `${env:VAR_NAME}` 占位符，由 `process.env` 在加载时替换，**机密凭据无需落盘**：

  ```json
  {
    "plugins": {
      "notifier": {
        "webhook": { "secret": "${NOTIFIER_WEBHOOK_SECRET}" }
      }
    }
  }
  ```

  变量未定义时**原样保留占位符**（不会被静默替换为空串），便于直观发现漏配。
- **未知插件告警**：配置中若存在无法对应到任何已扫描子插件的键（改名、拼写错误或未安装），加载器会输出中文告警并列出当前已检测到的子插件名，避免配置被静默忽略。
- **配置热重载**：保存 `plugins.config.json` 或 `plugins.config.local.json` 后约 300ms 自动生效 —— 启用 / 禁用的子插件会被动态挂载或销毁，持续启用的子插件则原地热更新参数，**无需重启 DSH**。

## Bundle 资源清单

根包同时是 DSH 官方 Bundle，随包提供图标与本地化文案，供宿主界面展示：

| 资源 | 路径 | 说明 |
| :--- | :--- | :--- |
| 图标 | [`icon.svg`](./icon.svg) | 总线 / 插件主题矢量图标，经 `exports['./icon']` 暴露。 |
| 中文文案 | [`locale/zh.json`](./locale/zh.json) | `meta.title` / `meta.description`。 |
| 英文文案 | [`locale/en.json`](./locale/en.json) | 与中文保持同构键集合。 |

## 插件列表

| 插件名称 | 目录 | 版本 | 简介 |
| :--- | :--- | :--- | :--- |
| **`@local/my-dsh-plugins`** | 根目录 (`./`) | `v0.5.0` | 聚合插件总线 Loader，提供自动扫描、双层配置、环境变量插值、配置热重载与隔离装载。 |
| **`@local/dsh-notifier`** | [`dsh-notifier/`](./dsh-notifier) | `v0.3.0` | 跨平台系统原生桌面弹窗、提示音及飞书/钉钉/企微/Bark/Telegram/Discord/通用 Webhook 离机通知插件。 |

## 开发指南

- 遵循 [约定式提交 (Conventional Commits)](https://www.conventionalcommits.org/zh-hans/)。
- 遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。
- 所有新插件必须分配在以 **`dsh-*`** 命名的独立目录下，配备完整的 `package.json`、`README.md` 与单元测试。
- **首次使用必须先执行 `npm install`**：本仓库采用 npm workspaces，构建与类型检查工具链的 `node_modules/.bin` 由根 `node_modules` 提供，克隆仓库后必须先安装一次，否则 `build` / `typecheck` 均无法运行。这是 npm workspaces 的固有约束（依赖被提升到根，子包副本会被删除）。
- 执行构建：`npm run build`（自动构建所有子插件并打包根 Loader）。
- 清理产物：`npm run clean`（删除根与子插件的 `index.js` 构建产物）。
- 类型检查：`npm run typecheck`（同时检查根 Loader 与所有子插件）。
- 运行测试：`npm test`（自动运行所有工作区及根 Loader 全套测试套件，当前规模为根 Loader **69 项** + 通知子插件 **80 项**，共 149 项）。

## 维护日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 维护者

[@DeepSeek-Harness-User](https://github.com)

## 使用许可

[MIT](./LICENSE)
