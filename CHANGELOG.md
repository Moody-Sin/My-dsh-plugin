# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.5.0] - 2026-10-12

### 新增 (Added)
- **配置热重载**（`src/index.ts`）：`fs.watch` 监听仓库根目录，编辑 `plugins.config.json` / `plugins.config.local.json` 后**无需重启 DSH** 即可生效。
  - 启用 → 禁用：销毁已挂载 fiber 并移出登记表；禁用 → 启用：动态补挂；持续启用：`fiber.update()` **原地热更新**，不销毁重建（避免监听器抖动与通知丢失）。
  - 300ms 防抖合并编辑器连续写入，并按文件名白名单过滤无关变更。
  - 监听**根目录本身**而非具体文件：文件尚不存在时监听目标会失效，而「新建 `plugins.config.local.json`」恰是最常见的本地覆盖场景。
  - 监听器与定时器均 `unref()`，不阻止宿主进程退出；`ctx.on('dispose')` 注销 watcher，杜绝句柄与定时器长期驻留。
- **环境变量插值**（`src/config.ts`）：配置值支持 `${VAR_NAME}` 与 `${env:VAR_NAME}` 占位符，由 `process.env` 在读取时替换，**机密凭据无需落盘**。变量未定义时**原样保留占位符**，便于直观发现漏配，而非被静默替换为空串导致凭据以空值下发。新增导出 `interpolateEnvVariables()` 与两个配置文件名常量。
- **未知插件配置告警**（`src/index.ts`）：配置中存在无法对应到任何已扫描子插件的键时（目录改名、拼写错误、未安装），逐个输出中文告警并列出当前已检测到的子插件名，杜绝配置被静默忽略。
- **Cordis 原生 Logger 对接**（`src/index.ts`）：优先使用 `ctx.logger('my-dsh-plugins')`，并按级别降级到 `console`；所有告警与信息统一走 logger。
- **DSH 官方 Bundle 资源清单**：新增根 [`icon.svg`](./icon.svg)（总线 / 插件主题，< 50KB，无脚本、无外链）与 [`locale/zh.json`](./locale/zh.json)、[`locale/en.json`](./locale/en.json)（`meta.title` / `meta.description`，中英文键集合一致）。
- **`clean` 脚本**（根 `package.json`）：清理根与子插件的 `index.js` 构建产物。

### 变更 (Changed)
- **根包版本提升至 `0.5.0`**（新增功能，遵循 SemVer 次版本号递增）；同步修正 `package-lock.json` 中滞后的 `0.3.0` 版本号。
- 根 `package.json` 的 `exports` 增加 `"./icon"` 与 `"./locale/*.json"`，`files` 增加 `icon.svg` 与 `locale/*.json`，供 DSH 宿主读取图标与本地化文案。
- `src/index.ts` 抽出 `mountPlugin()` 与 `importPluginDef()`，使首轮装载与热重载补挂共用同一路径，避免两条装载逻辑各自漂移。

### 修复 (Fixed)
- **根目录定位隐患**（`src/index.ts`）：原 `resolveProjectRoot()` 仅在「本文件所在目录 → 上级目录」两个候选中查找含 `package.json` 的目录，未命中即**回落 `process.cwd()`**。在 DSH 运行时 cwd 是用户的目标工程目录，一旦回落就会被误判为插件根，导致扫描与配置读写**污染用户工程**。现改为从 `import.meta.url` 所在目录起逐级**向上查找**直到文件系统根，命中条件为「`package.json` 的 `name === '@local/my-dsh-plugins'`」或「目录下存在 `plugins.config.json`」；全部未命中时抛出 `[my-dsh-plugins] 无法定位项目根目录，请确保从有效的仓库安装或运行`。
- **目录符号链接被漏扫**（`src/scanner.ts`）：原判据 `entry.isDirectory()` 在部分 Node.js 与操作系统组合下对目录软链返回 `false` —— 已实测 Windows junction 为 `isSymbolicLink() === true` 且 `isDirectory() === false`，会导致 workspaces 软链出来的子插件**整片漏扫**。现改为 `entry.isDirectory() || (entry.isSymbolicLink() && statSync(...)?.isDirectory())`，并对悬空链接 / 无权限 / 竞态删除做异常保护（保守判为非目录）。
- **禁用插件时 fiber 未被销毁**（`src/index.ts`）：热重载的禁用分支误写为 `forks.delete(key)?.dispose?.()` —— `Map.delete` 返回的是 **boolean** 而非被删的值，可选链在 `boolean` 上恒为 `undefined`，导致 `dispose()` **永远不会被调用**，被禁用的插件实例持续存活。已改为先 `get` 再 `delete` 后 `dispose`。
- **`fs.watch` 的 `'error'` 事件会拖垮宿主**（`src/index.ts`）：根目录被删除 / 权限变更时 FSWatcher 会发出 `'error'`，EventEmitter 的未处理 `'error'` 会**直接抛错**。现已就地消化为中文告警。
- **`ctx` Proxy 读取 logger 会抛错**（`src/index.ts`）：Cordis 的 `ctx` 是 Proxy，读取未声明 `inject` 的服务属性会直接抛错，`ctx.logger?.(...)` 的可选链挡不住该抛错。现已将取用包在 `try` 中并降级到控制台。

### 测试 (Tests)
- 根 Loader 测试由 **32 项扩充至 69 项**：
  - 新增 [`tests/manifest.test.ts`](./tests/manifest.test.ts)（8 项）：校验根包元数据规范（包名与 Bundle Patch 稳定、`exports` / `files` 齐备、声明资源真实存在、`clean` 脚本、`icon.svg` 体积与安全性、`locale` 中英文键集合一致）。
  - `config.test.ts` 新增 8 项环境变量插值用例（两种占位符写法、漏配保留、空串替换、非法写法不误伤、`$&` 不被二次解释、BOM 与双层合并下的插值、漏配不刷告警）。
  - `scanner.test.ts` 新增 3 项目录软链用例（junction 可被扫描、悬空软链安全跳过、指向文件的软链不被误判）。
  - `loader.test.ts` 新增 18 项（11 → 29）：`resolveProjectRoot()` 向上查找 / 双命中条件 / 找不到时抛错且 `apply` 直接上抛、未知插件告警、Cordis Logger 对接与 Proxy 抛错降级、热重载四分支（禁用销毁、启用补挂、持续启用热更新、无关变更不触发）、防抖合并、本地覆盖文件新建触发、dispose 注销 watcher、子插件重载异常隔离。
- 测试夹具 `makeIsolatedRoot()` 同步补齐根标志（`package.json` 的 `name` 为 `@local/my-dsh-plugins`）—— `resolveProjectRoot()` 不再回落 cwd 后，缺少根标志的夹具会直接抛错；负向用例通过 `omitRootMarkers` 显式构造「找不到根」场景，并前置校验系统临时目录祖先链确实不含根标志，否则诚实 `t.skip()` 而非误报。
- 当前根 Loader **69 项**测试全绿。

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
