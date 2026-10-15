# My-dsh-plugin

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> DeepSeek Harness (DSH) 聚合插件总线 (Umbrella Loader) 与本地定制插件合集仓库。

## 目录

- [背景](#背景)
- [核心架构：聚合总线模式](#核心架构聚合总线模式)
- [统一配置指南](#统一配置指南)
- [原生设置表单（DSH Web GUI）](#原生设置表单dsh-web-gui)
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
- **环境变量插值**：配置值中支持 `${VAR_NAME}`、`${env:VAR_NAME}` 以及默认值写法 `${VAR_NAME:-default_value}`，由 `process.env` 在加载时替换，**机密凭据无需落盘**：

  ```json
  {
    "plugins": {
      "notifier": {
        "webhook": {
          "url": "${WEBHOOK_URL:-https://open.feishu.cn/open-apis/bot/v2/hook/...}",
          "secret": "${NOTIFIER_WEBHOOK_SECRET}"
        }
      }
    }
  }
  ```

  变量未定义且无默认值时**原样保留占位符**（不会被静默替换为空串），便于直观发现漏配。
- **未知插件告警**：配置中若存在无法对应到任何已扫描子插件的键（改名、拼写错误或未安装），加载器会输出中文告警并列出当前已检测到的子插件名，避免配置被静默忽略。
- **配置热重载**：保存 `plugins.config.json` 或 `plugins.config.local.json` 后约 300ms 自动生效 —— 启用 / 禁用的子插件会被动态挂载或销毁，持续启用的子插件会被重新装载以应用新参数，**无需重启 DSH**（由 Cordis `restart()` 完成，子插件内的跨重启状态应置于模块级）。

## 原生设置表单与可视化配置面板（DSH Web GUI）

本插件支持两种设置交互形式：

1. **设置中心专属标签页 (`settings.plugins.tab`)**：
   - 打开 DSH Web「设置」→「内置插件」分区，点击 **「参数配置」** 标签页。
   - 界面直观呈现当前所有子插件的运行状态与参数面板（桌面弹窗、系统提示音、事件触发时机、Webhook 离机配置、子智能体模型指示器）。
   - **分层编辑与持久化**：下拉框选择要编辑的**层**——`plugins.config.local.json`（私有覆盖，不进 Git）或 `plugins.config.json`（公开基础配置）。表单内容始终等于目标层自身，切换层即切换内容，**保存只会写入所选层**；local 层中的密钥绝不会被搬进随 Git 提交的 base 文件。保存后经聚合总线防抖队列**免重启秒级热生效**。
   - **一键诊断测试**：点击「⚡ 发送测试通知」会通过 `dsh-notifier` 导出的 `sendTestNotification()` 真实走一遍已启用渠道（桌面弹窗 / 提示音 / Webhook），并回传逐渠道结果；失败时展示具体原因而非成功提示。各渠道**独立触发、独立统计**（桌面诊断不带内联声音），因此 Webhook 失败不会被误报成桌面失败，也不会重复推送。
   - **密钥脱敏**：配置接口对 `secret` / `token` / `password` / `apiKey` 等字段返回掩码，前端原样回传表示「未修改」，服务端沿用磁盘真值。

2. **DSH 原生设置表单（Schemastery Schema）**：
   - 在 DSH Web GUI 的 **「插件」→「@local/my-dsh-plugins」详情页**中，表单由 DSH 官方 `dsh-settings` 依据本插件导出的 `Config` **自动生成**。
   - 表单覆盖 `plugins.notifier` 与 `plugins.subagent-model-indicator` 下的 **14 个可热改字段**。

> **⚠️ 配置优先级与表单的关系（务必知悉）**
>
> 优先级为「`plugins.config.local.json` > `plugins.config.json` > 表单 / Profile 传入值」，**文件层权威最高**。
>
> 因此**凡是在 `plugins.config.json` 中已声明的字段，表单改动都会被文件值盖回**。例如默认配置已声明 `notifier.locale`，那么在表单里修改 `locale` 不会生效。
>
> 若希望某字段由表单托管，请把它从 `plugins.config.json` 中移出（可仅保留在 `plugins.config.local.json` 作为本地默认，或直接留空交由 Schema 默认值兜底）。尚未在配置文件中声明的字段（表单仍会渲染，因为 Schema 已声明）可正常实时生效。

实现要点（均从 DSH 官方源码逐行核对）：

- `Config` 同时满足 **Schemastery**（`type` / `dict` / `meta` / `toJSON()` / `Symbol.for('schemastery')`）与 **Standard Schema v1**（`'~standard'` 同步返回 `{ value }`）双契约。
- `toJSON()` **返回深拷贝**：DSH 投影引擎会就地 `delete node.meta.volatile`，返回共享引用会让表单在第二次渲染时整片消失。
- 为 Schema 声明的**每个** volatile 路径（含用户未填写的、以及 Schema 尚未声明但配置中实际出现的）无条件建立 volatile 引用：DSH 的 `_commitVolatile()` 若发现引用集合为空会**立即返回**，导致整次保存被静默丢弃。注意 `validate()` 由 Cordis 在 `apply()` **之前**调用，因此不能依赖「先注册子插件 Schema 再物化」。
- 子插件 Schema 动态注册：根 `SCHEMA_DICT` 为空字典，字段全部由子插件导出的 `Config` 在装载时注入（单一真相）。注册器接受**函数型** `Config`（`Object.assign(fn, {...})` 是 Schemastery 常见写法），并为缺少 `meta` 的叶子补齐 `meta: {}`。
- **REST API 只经 `connection.fetch` 注册，绝不注册 `webServer` 的 `/api/*` 前缀路由**：DSH 的 `webServer.match()` 是「最长前缀胜出」，插件注册的 `/api/local-plugins` 会抢在 `client-connection` 的鉴权前缀 `/api` 之前命中，导致接口完全绕过鉴权（密钥可被本机任意进程或跨站表单读走）。
- volatile 引用协议基于 `Symbol.for('cosmokit.volatile.write')`，**不引入 `@deepseek-ai/cosmokit` 依赖**即可与官方实现完全互通。

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
| **`@local/my-dsh-plugins`** | 根目录 (`./`) | `v0.6.0` | 聚合插件总线 Loader，提供自动扫描、双层配置、环境变量插值、配置热重载、隔离装载与 **DSH 原生设置表单（Schemastery Schema）**。 |
| **`@local/dsh-notifier`** | [`dsh-notifier/`](./dsh-notifier) | `v0.5.0` | 跨平台系统原生桌面弹窗、提示音、飞书/钉钉/企微/Bark/Telegram/Discord/通用 Webhook 离机通知及 CLI 连通性诊断工具（零常驻端口）。 |
| **`@local/dsh-subagent-model-indicator`** | [`dsh-subagent-model-indicator/`](./dsh-subagent-model-indicator) | `v0.1.0` | 在子智能体对话页面头部操作区展示正在使用的模型名称与推理层级（Reasoning Effort）。 |

## 开发指南

- 遵循 [约定式提交 (Conventional Commits)](https://www.conventionalcommits.org/zh-hans/)。
- 遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。
- 所有新插件必须分配在以 **`dsh-*`** 命名的独立目录下，配备完整的 `package.json`、`README.md` 与单元测试。
- **首次使用必须先执行 `npm install`**：本仓库采用 npm workspaces，构建与类型检查工具链的 `node_modules/.bin` 由根 `node_modules` 提供，克隆仓库后必须先安装一次，否则 `build` / `typecheck` 均无法运行。这是 npm workspaces 的固有约束（依赖被提升到根，子包副本会被删除）。
- 执行构建：`npm run build`（自动构建所有子插件并打包根 Loader）。
- 清理产物：`npm run clean`（删除根与子插件的 `index.js` 构建产物）。
- 类型检查：`npm run typecheck`（同时检查根 Loader 与所有子插件）。
- 渠道诊断与测试：`npm run test:notify`（通过 CLI 一键测试桌面通知、提示音与 Webhook 连通性并测量耗时）。
- 运行测试：`npm test`（自动运行所有工作区及根 Loader 全套测试套件，当前规模为根 Loader **91 项** + 通知子插件 **85 项** + 子智能体模型指示器 **15 项**，共 191 项测试全绿通过）。

## 维护日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 维护者

[@Moody-Sin](https://github.com/Moody-Sin)

## 使用许可

[MIT](./LICENSE)
