# src/ — 聚合总线源码

本目录是根**聚合插件总线 (Umbrella Loader)** 的 TypeScript 源码，经 `esbuild` 打包为仓库根 `index.js`，作为唯一 Cordis Bundle 接入 DSH。接入与配置方式见[仓库根 README](../README.md)。

## 文件职责

| 文件 | 职责 |
| :--- | :--- |
| [`index.ts`](./index.ts) | Cordis 插件入口：导出 `name`（`my-dsh-plugins`）、`Config` 与 `apply()`；`resolveProjectRoot()` 定位仓库根。 |
| [`config.ts`](./config.ts) | 双层配置加载与深合并，输出子插件配置切片，暴露 Standard Schema `Config`。 |
| [`scanner.ts`](./scanner.ts) | 扫描 `dsh-*` 子目录并解析入口，产出供动态 `import()` 使用的元数据。 |

## 关键设计

**index.ts**
- `resolveProjectRoot()`：按「本文件所在目录 → 上级目录」取首个含 `package.json` 的候选；全部未命中时回落 `process.cwd()`，保证始终返回非空路径。
- `apply()` 流程：文件配置经 `deepMerge` 覆盖传入配置（**文件层权威最高**）→ 扫描 → 逐个子插件做 `enabled` 过滤、`registry.has()` 去重、`import()` 加 `ctx.plugin()`。
- 扫描为空、`fiber.state !== 2`（未进入 ACTIVE）、单插件装载异常，一律只输出中文告警，不中断宿主与兄弟插件。

**config.ts**
- `loadUmbrellaConfig()`：`plugins.config.json` 为基底、`plugins.config.local.json` 深层覆盖；两者缺失或损坏均平稳降级，至少返回 `{ plugins: {} }`。
- `deepMerge()`：递归合并纯对象，数组整体替换，不修改任何入参。
- `readJsonFile()`：读取前剥离 UTF-8 BOM（Windows 记事本 / `Set-Content -Encoding utf8` 会写入）；文件不存在（`ENOENT`）静默忽略，**解析失败则输出带绝对路径的告警**。
- `getPluginConfig()`：剥离加载器保留字段 `enabled`，避免污染子插件自身 Schema；未配置时默认 `{ enabled: true, config: {} }`。
- `Config`：Standard Schema v1 同步实现，`validate` **严禁返回 Promise** —— Cordis v4 在插件启动前同步调用并读取 `result.value`。

**scanner.ts**
- 仅单层扫描 `dsh-*` 目录（`pluginKey` 为剥离前缀后的目录名），不递归进入 `node_modules`。
- 入口优先级：`index.js` → `package.json` 的 `exports['.']`（含条件对象）→ `main`；声明了却不存在的入口视为无效。
- `package.json` 损坏时输出告警并跳过该目录，不中断整体扫描。
- 结果按 `dirName` 字母序稳定排列，`entryUrl` 经 `pathToFileURL` 转换，规避 Windows 反斜杠路径导致的 ESM 导入异常。
