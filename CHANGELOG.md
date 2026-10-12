# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.4.0] - 2026-10-12

### 新增 (Added)
- **全仓库类型检查工具链**：此前 `typescript` 虽在 `devDependencies` 中却无任何脚本调用，`tsc --noEmit` 报 21 个错误。现已补齐根与子包 `tsconfig.json`（`types: ["node"]`、`allowImportingTsExtensions`、`noEmit`）、安装 `@types/node` 并新增 `typecheck` 脚本，错误降至 **0**。
- **根 `package-lock.json`**：根目录此前缺失 lockfile，`npm ci` 直接以 `EUSAGE` 失败，现已生成。
- **测试隔离夹具**：根 `tests/loader.test.ts` 改为在 `os.tmpdir()` 下用 `mkdtempSync` 构造隔离根目录（复制 `src/` 后动态 `import()`），彻底杜绝测试对仓库真实文件的 `rename`/覆写；因根目录由 `resolveProjectRoot()` 基于 `import.meta.url` 推导，该方案同时把项目根定位逻辑一并纳入隔离验证，**生产代码 0 改动**。
- **源码目录说明文档**：为 `src/`、`tests/`、`dsh-notifier/src/`、`dsh-notifier/tests/` 补齐 `README.md`。

### 变更 (Changed)
- **删除死字段 `configFile`**（`src/config.ts`）：该字段仅有声明而无任何代码读取，已移除。
- **`sessionTitle` 服务的注入策略固化**：插件 `inject` 保持 `['sessions']`，统一改用 Cordis 公开 API `ctx.get('sessionTitle')` 安全读取。对旁路通知插件而言「没标题但能通知」严格优于「彻底不通知」，此决策已写入源码注释与测试说明。
- **清理工作区子包 lockfile**：`git rm dsh-notifier/package-lock.json`（与 workspace 根 lock 冲突），并在 `.gitignore` 追加 `dsh-*/package-lock.json` 防止复发。

### 修复 (Fixed)
- **配置优先级倒置**（`src/index.ts`）：原 `deepMerge(fileConfig, config)` 使 DSH Profile Patch 反而覆盖本地 `plugins.config.json`，与设计文档「本地文件最高权威」相反，已改为 `deepMerge(config || {}, fileConfig)`。
- **去重判定恒假并误吞同名插件**（`src/index.ts`）：原判据 `r.callback === pluginDef` 恒为 `false`（Cordis 注册表存的是 `模块.apply`，而 `pluginDef` 是模块命名空间），实际只靠 `name` 字符串比较，导致两个**不同**插件若同名会被静默跳过。已改用 Cordis 原生 `ctx.registry?.has?.(pluginDef)`。
- **配置文件解析错误被静默吞掉**（`src/config.ts`）：JSON 语法错误会静默回退空对象，用户配置被无声忽略。现改为：ENOENT（文件不存在）不告警，其余解析失败一律输出**带绝对路径**的中文告警。
- **感知不到卡住的插件**（`src/index.ts`）：`inject` 未满足时 `ctx.plugin` 立即返回、fiber 停在 PENDING，插件永不生效却无任何提示。已增加 `fiber.state !== 2` 的中文告警。
- **扫描结果为空无提示**（`src/index.ts`）：已增加带 `rootDir` 的中文告警。
- **Standard Schema 契约不完整**（`src/config.ts`）：`validate` 返回类型缺少 `issues` 字段，与 Cordis 读取 `result.issues` 的契约不符，已补可选 `issues?: undefined`。
- **会话标题永远取不到**（`dsh-notifier/src/index.ts`）：`inject` 未声明 `sessionTitle`，而 Cordis 的 `ctx` 是 Proxy——读取未声明 `inject` 的服务属性会**直接抛错**，可选链 `ctx.sessionTitle?.` 挡不住该抛错；异常被 `catch` 吞掉后连 `session.header.cwd` 兜底都走不到，导致通知正文永远没有会话名。已改用 `ctx.get('sessionTitle')` 安全读取。
- **不可达的回退链缺少说明**（`dsh-notifier/src/dispatcher.ts`）：补充注释，说明后两层 `??` 回退仅为兼容绕过 `resolveConfig` 的调用方。
- **`types` 字段指向不存在的文件**（`dsh-notifier/package.json`）：`"types": "./lib/index.d.ts"` 指向从未生成的目录，已删除。
- **根构建脚本硬编码子包依赖路径**（根 `package.json`）：原 `build:self` 写死 `node dsh-notifier/node_modules/esbuild/bin/esbuild`。npm workspaces 会把依赖**提升到根**并**删除子包副本**，一旦执行根 `npm install` 该路径即消失、构建彻底崩溃。已改为裸 `esbuild`，并在根 `devDependencies` 补齐 `esbuild`、`typescript`、`@types/node`。
- **`typecheck` 脚本同类硬编码**：同上，已改为裸 `tsc`。
- **README 承诺的 MIT LICENSE 不存在**：已新建根 `LICENSE`，并修正 `dsh-notifier/README.md` 中错误的 `./package.json` 链接为 `../LICENSE`。
- **README 会话名描述不准确**（`dsh-notifier/README.md`）：原称通知「带大标题、会话名、图标」，实际 WinRT Toast 模板**不含图标节点**，且会话名在服务缺失时会回退显示 cwd 路径，已修正措辞。

### 测试 (Tests)
- 根 Loader 测试由 24 项扩充至 **32 项**（新增配置解析告警、fiber 非 ACTIVE 告警、空扫描告警、隔离根下的 `resolveProjectRoot()` 等用例）。
- 通知子插件测试由 52 项扩充至 **57 项**（新增 `ctx` Proxy 语义下 `ctx.get` 取值与多种降级路径的锁定用例）。
- 当前全量 **32 + 57 = 89 项**测试全绿。

## [0.3.0] - 2026-10-12

### 新增 (Added)
- **聚合插件总线 (Umbrella Loader)** `@local/my-dsh-plugins`：
  - 启动时全自动扫描 `dsh-*` 子目录，支持 ESM 动态挂载进 Cordis 容器。
  - 单入口接入 DSH 官方 Profile，实现后续新增/删除插件对 DSH 官方配置文件 **0 修改**。
  - 独立沙箱容错与异常隔离，单个插件加载失败不拖垮宿主及兄弟插件。
  - Cordis 注册表自查与去重，杜绝重复挂载与事件重复监听。
- **集中化双层配置架构**：
  - `plugins.config.json`：随版本库提交的公共默认配置与模板。
  - `plugins.config.local.json`：纳入 `.gitignore` 的本地私密覆盖配置（支持 Webhook Secret、私有 Token 等机密凭据安全隔离）。
  - 支持快捷 `"enabled": false` 跳过模块导入，透传子配置前自动剥离控制元字段。
  - 自主修复 Windows UTF-8 BOM 导致 JSON.parse 崩溃的兼容性缺陷。

### 变更 (Changed)
- 子插件目录与命名规范化：`dsh-plugin-notifier` 统一重命名为 `dsh-notifier`（包名 `@local/dsh-notifier`）。
- 根目录 `package.json` 的 `workspaces` 通配规则更新为 `["dsh-*"]`。
- DSH 官方 Profile（`~/.dsh/profiles/web/`）平滑迁移至聚合包 `@local/my-dsh-plugins`。

### 测试 (Tests)
- 全量自动化测试用例扩充至 76 项（根目录扫描器、双层配置器、聚合加载器 24 项 + 通知子插件 52 项），100% 绿色通过。

## [0.2.0] - 2026-10-12

### 新增 (Added)
- 根目录引入 npm workspaces 统一工作区配置（`package.json`），支持全局联动执行 `test` 与 `build`。
- `@local/dsh-notifier`（原 `@local/dsh-plugin-notifier`）升级至 `0.2.0`：
  - 新增 `events.minDurationSeconds` 全局/事件级耗时过滤阈值，彻底解耦桌面通知开关与 Webhook 离机推送过滤。
  - Bark 渠道 Payload 增加跳转链接（默认 `http://127.0.0.1:3080`）与 `badge` 角标。
  - Webhook 针对高优先级提问、审批与告警事件增加网络抖动自动退避重试（1 次重试）。
  - Windows WinRT Toast 原生弹窗增加系统 AppID 注册缺失时的默认通知器降级容错。

### 变更 (Changed)
- `desktop.minDurationSeconds` 标记为向后兼容保留字段，优先使用 `events.minDurationSeconds`。

### 测试 (Tests)
- `@local/dsh-notifier` 测试套件扩充至 52 项，覆盖阈值解耦、向后兼容继承、网络超时重试、Bark 属性与降级容错。

## [0.1.1] - 2026-10-12

### 修复 (Fixed)
- 修复插件在 DSH 中加载失败（`fiberPhase: 'failed'`）的问题：为插件 `Config` 补充 Standard Schema 规范的 `['~standard']` 校验接口与 `toJSON()` 方法，兼容 Cordis v4 的 `runtime.Config['~standard'].validate(config)` 配置校验流程。

## [0.1.0] - 2026-10-12

### 新增 (Added)
- 初始化仓库架构，遵循 Standard README 与 Cordis 插件规范。
- 新增通知插件 `@local/dsh-plugin-notifier`（支持 Windows/macOS/Linux 原生桌面弹窗、系统音效及飞书/钉钉/企微/Bark/通用 Webhook 离机推送，含超时防护与 HMAC-SHA256 签名鉴权）。
