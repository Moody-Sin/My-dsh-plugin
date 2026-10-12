# src/ — 聚合总线源码

本目录是根**聚合插件总线 (Umbrella Loader)** 的 TypeScript 源码，经 `esbuild` 打包为仓库根 `index.js`，作为唯一 Cordis Bundle 接入 DSH。接入与配置方式见[仓库根 README](../README.md)。

## 文件职责

| 文件 | 职责 |
| :--- | :--- |
| [`index.ts`](./index.ts) | Cordis 插件入口：导出 `name`（`my-dsh-plugins`）、`Config` 与 `apply()`；`resolveProjectRoot()` 向上查找仓库根；负责未知插件告警、Cordis Logger 对接与配置热重载。 |
| [`config.ts`](./config.ts) | 双层配置加载、环境变量插值与深合并，输出子插件配置切片，暴露 Standard Schema `Config`。 |
| [`scanner.ts`](./scanner.ts) | 扫描 `dsh-*` 子目录（含目录软链）并解析入口，产出供动态 `import()` 使用的元数据。 |

## 关键设计

**index.ts**
- `resolveProjectRoot()`：从本文件所在目录起**逐级向上查找**，直到文件系统根（`path.dirname(current) === current`）。命中条件为「`package.json` 的 `name` 等于 `@local/my-dsh-plugins`」或「目录下存在 `plugins.config.json`」。
  - **全部未命中时抛出 `[my-dsh-plugins] 无法定位项目根目录…`，绝不回落 `process.cwd()`** —— DSH 运行时的 cwd 是用户的目标工程目录，一旦回落就会被误判为插件根，导致扫描与配置读写污染用户工程。
- `apply()` 流程：`resolveProjectRoot()` → 取 logger → 文件配置经 `deepMerge` 覆盖传入配置（**文件层权威最高**）→ 扫描 → **未知插件键告警** → 逐个子插件做 `enabled` 过滤、`registry.has()` 去重、`import()` 加 `ctx.plugin()` → 启动配置热重载监听。
- 未知插件键告警：比对 `mergedConfig.plugins` 的键与 `scanned.map(p => p.pluginKey)`，每个未识别键单独输出中文告警并列出已检测到的子插件名。扫描为空时**提前返回**，只提示「未扫描到子插件」——此时逐个罗列未知键只会淹没真正的病因。
- **Cordis Logger 对接**：优先 `ctx.logger?.('my-dsh-plugins')`，并按级别降级到 `console`。`ctx` 是 Cordis Proxy，读取未声明 `inject` 的服务属性会**直接抛错**，因此取 logger 必须包在 `try` 中。
- **配置热重载**：`fs.watch` 监听**根目录本身**（而非具体文件，否则「新建 `plugins.config.local.json`」这一最常见场景无法被捕获），300ms 防抖合并编辑器连续写入，并按文件名白名单过滤无关变更。变更后重新 `loadUmbrellaConfig()`，逐插件执行三分支：
  | 状态迁移 | 动作 |
  | :--- | :--- |
  | 启用 → 禁用 | `forks.get(key)` 取出 fiber → `delete` → `fiber.dispose?.()` |
  | 禁用 → 启用 | `ctx.plugin()` 动态补挂并登记到 `forks` |
  | 持续启用 | `fiber.update?.(conf.config)` 原地热更新，**不销毁重建**（避免监听器抖动与通知丢失） |
- 监听器与定时器均 `unref()`，不阻止宿主进程退出；`ctx.on('dispose')` 注销 watcher 并置 `active = false`，杜绝句柄与定时器长期驻留（内存泄漏），同时防止 dispose 与重载竞态导致「宿主已卸载却仍在补挂插件」。
- 扫描为空、`fiber.state !== 2`（未进入 ACTIVE）、单插件装载 / 热重载异常，一律只输出中文告警，不中断宿主与兄弟插件。

**config.ts**
- `loadUmbrellaConfig()`：`plugins.config.json` 为基底、`plugins.config.local.json` 深层覆盖；两者缺失或损坏均平稳降级，至少返回 `{ plugins: {} }`。
- `deepMerge()`：递归合并纯对象，数组整体替换，不修改任何入参。
- `readJsonFile()`：读取 → 剥离 UTF-8 BOM → **环境变量插值** → `JSON.parse`（顺序不可调换，BOM 会挡住首字符 `$` 的匹配）；文件不存在（`ENOENT`）静默忽略，**解析失败则输出带绝对路径的告警**。
- `interpolateEnvVariables()`：支持 `${VAR_NAME}` 与 `${env:VAR_NAME}` 两种占位符，变量名限定 `[A-Za-z_][A-Za-z0-9_]*`。
  - `process.env[varName]` 存在且非 `undefined` 时替换为对应值（**空串是合法取值，照常替换**）；不存在则**原样保留占位符**，便于用户直观发现漏配，而非被静默替换为空串导致凭据以空值下发。
  - 替换值经函数返回，变量内容中的 `$&` / `$1` 不会被 `String.replace` 当作替换模式二次解释。
- `getPluginConfig()`：剥离加载器保留字段 `enabled`，避免污染子插件自身 Schema；未配置时默认 `{ enabled: true, config: {} }`。
- `Config`：Standard Schema v1 同步实现，`validate` **严禁返回 Promise** —— Cordis v4 在插件启动前同步调用并读取 `result.value`。

**scanner.ts**
- 仅单层扫描 `dsh-*` 目录（`pluginKey` 为剥离前缀后的目录名），不递归进入 `node_modules`。
- **目录软链支持**：判据为 `entry.isDirectory() || (entry.isSymbolicLink() && statSync(...)?.isDirectory())`。Node.js 在 Windows 上对 junction 返回 `isDirectory() === false` 而 `isSymbolicLink() === true`，只看 `isDirectory()` 会让 workspaces 软链出来的子插件整片漏扫；`statSync` 对悬空链接 / 无权限 / 竞态删除会抛错，必须捕获并保守判为非目录。
- 入口优先级：`index.js` → `package.json` 的 `exports['.']`（含条件对象）→ `main`；声明了却不存在的入口视为无效。
- `package.json` 损坏时输出告警并跳过该目录，不中断整体扫描。
- 结果按 `dirName` 字母序稳定排列，`entryUrl` 经 `pathToFileURL` 转换，规避 Windows 反斜杠路径导致的 ESM 导入异常。
