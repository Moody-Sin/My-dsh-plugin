# src/ — 聚合总线源码

本目录是根**聚合插件总线 (Umbrella Loader)** 的 TypeScript 源码，经 `esbuild` 打包为仓库根 `index.js`，作为唯一 Cordis Bundle 接入 DSH。接入与配置方式见[仓库根 README](../README.md)。

## 文件职责

| 文件 | 职责 |
| :--- | :--- |
| [`index.ts`](./index.ts) | Cordis 插件入口：导出 `name`（`my-dsh-plugins`）、`Config` 与 `apply()`；`resolveProjectRoot()` 向上查找仓库根；负责未知插件告警、Cordis Logger 对接、配置热重载与 **DSH 设置表单联动**。 |
| [`config.ts`](./config.ts) | 双层配置加载、环境变量插值与深合并，输出子插件配置切片；承载 **Schemastery + Standard Schema 双契约 `Config`** 与 volatile 引用协议。 |
| [`scanner.ts`](./scanner.ts) | 扫描 `dsh-*` 子目录（含目录软链）并解析入口，产出供动态 `import()` 使用的元数据。 |

## 关键设计

**index.ts**
- `resolveProjectRoot()`：从本文件所在目录起**逐级向上查找**，直到文件系统根（`path.dirname(current) === current`）。命中条件为「`package.json` 的 `name` 等于 `@local/my-dsh-plugins`」或「目录下存在 `plugins.config.json`」。
  - **全部未命中时抛出 `[my-dsh-plugins] 无法定位项目根目录…`，绝不回落 `process.cwd()`** —— DSH 运行时的 cwd 是用户的目标工程目录，一旦回落就会被误判为插件根，导致扫描与配置读写污染用户工程。
- `apply()` 流程：`resolveProjectRoot()` → 取 logger → 扫描 → 文件配置经 `deepMerge` 覆盖**解引用后的**传入配置（**文件层权威最高**）→ **未知插件键告警** → 逐个子插件做 `enabled` 过滤、`registry.has()` 去重、`import()` 加 `ctx.plugin()` → 启动配置热重载与设置表单联动监听。
- `resolveLatest()`：把 DSH Profile 传入配置**先解引用**再与文件配置融合。volatile 引用是运行时句柄而非配置值，直接透传会让子插件 `typeof x === 'boolean'` 之类的判断全部落空、配置整体回落默认值。
- 未知插件键告警：比对 `mergedConfig.plugins` 的键与 `scanned.map(p => p.pluginKey)`，每个未识别键单独输出中文告警并列出已检测到的子插件名。扫描为空时**提前返回**，只提示「未扫描到子插件」——此时逐个罗列未知键只会淹没真正的病因。
- **Cordis Logger 对接**：优先 `ctx.logger?.('my-dsh-plugins')`，并按级别降级到 `console`。`ctx` 是 Cordis Proxy，读取未声明 `inject` 的服务属性会**直接抛错**，因此取 logger 必须包在 `try` 中。
- **配置变更统一协调**：`reload(source)` 同时服务两条触发路径（`source` 仅用于日志区分），逐插件执行三分支：
  | 状态迁移 | 动作 |
  | :--- | :--- |
  | 启用 → 禁用 | `forks.get(key)` 取出 fiber → `delete` → `fiber.dispose?.()` |
  | 禁用 → 启用 | `ctx.plugin()` 动态补挂并登记到 `forks` |
  | 持续启用 | `fiber.update?.(conf.config)` 更新配置。**注意：Cordis 的 `update()` 内部是 `restart()`（dispose 再 apply），并非原地热更新**，子插件不得在 `apply()` 内持有跨重启才有效的状态 |
  1. **配置文件被编辑**：`fs.watch` 监听**根目录本身**（而非具体文件，否则「新建 `plugins.config.local.json`」这一最常见场景无法被捕获），300ms 防抖合并编辑器连续写入，并按文件名白名单过滤无关变更。
  2. **DSH 设置表单被保存**：监听 `loader/volatile-update`（见下）。
- 监听器与定时器均 `unref()`，不阻止宿主进程退出；`ctx.on('dispose')` 注销 watcher、置 `active = false`，杜绝句柄与定时器长期驻留（内存泄漏），同时防止 dispose 与重载竞态导致「宿主已卸载却仍在补挂插件」。
- 扫描为空、`fiber.state !== 2`（未进入 ACTIVE）、单插件装载 / 热重载异常，一律只输出中文告警，不中断宿主与兄弟插件。

## DSH 原生设置表单对接（方案 A）

根插件详情页的表单由 DSH `dsh-settings` 依据 `Config` 自动生成。以下每一条都是从官方源码逐行核对后确定的**硬约束**，缺一不可。

### 1. Schemastery 结构契约

`Config` 必须具备 `type: 'object'`、`dict`、`meta`、`toJSON()` 与 `[Symbol.for('schemastery')]: true`。

- **每个节点都必须带 `meta`**：`volatileForm()` / `isVolatilePath()` 无条件读取 `node.meta.volatile` 并递归遍历 `dict`，缺失 `meta` 会抛 `TypeError` 让整个面板崩溃。
- **`meta` 必须显式赋值**：`Object.assign` 会把 `meta` 的值**整体覆盖**，因此 `SCHEMA_DICT` 的同一节点不能既通过字面量又通过赋值提供 `meta`（后者会静默覆盖前者）。本实现统一在字面量中声明。
- **层级节点不得标记 volatile**：根节点或 `plugins` 一旦标记，`volatileForm()` 会走 `plainSchema()` **跳过剪枝**，层级也会变成可编辑控件。
- **`toJSON()` 必须返回深拷贝**：`plainSchema()` 只做浅层 `Object.assign`，随后 `walk()` 会**就地** `delete node.meta.volatile`。返回共享引用会让第一次渲染就抹掉模块级 Schema 的 volatile 标记，第二次渲染表单整片消失。
- **每个 volatile 节点都要有 `toJSON()`**：`plainSchema()` 对**每个** volatile 节点调用 `new z(schema.toJSON())`，叶子缺失会抛 `toJSON is not a function`。

### 2. volatile 引用：免重启热改的唯一通道

`Config['~standard'].validate()` 会把 Schema 声明的叶子包装为 cosmokit volatile 引用。这不是可选优化，而是**表单能生效的必要条件**：

- Cordis 的 `compareConfig()` 对 `meta.volatile` 节点**直接判定为「相等」**，于是 `LoaderEntry.update()` 走 `_commitVolatile()` 分支而非重启插件。
- `_commitVolatile()` 首行是 `volatileEntries(fiber.config)`。**若当前配置里一个引用都没有，该函数立即返回**，随后变更键列表被清空 —— **整次保存被静默丢弃，界面上什么都不会发生**。
- 因此本实现为 Schema 声明的**每个** volatile 路径无条件占位（用户没填也建引用），保证引用集合恒非空、且新旧配置结构完全同构。
- 引用协议由 `Symbol.for('cosmokit.volatile.write')` 承载，**不依赖模块实例**。本模块刻意不引入 `@deepseek-ai/cosmokit` 依赖（根包未声明），而是就地实现同一份符号协议，经真实 cosmokit 的 `isVolatile()` / `volatileEntries()` / `updateVolatile()` 端到端验证互通。
- 快照深冻结，拒绝函数与循环引用；快照失败降级为原始值（该字段退化为不可热改）并告警，**绝不让插件启动失败**。

### 3. `loader/volatile-update` 监听

宿主刷新引用快照后发出该事件，而**不会**重启插件。`apply()` 监听它并复用同一条 `reload()` 路径，否则表单保存后子插件永远收不到新值。

宿主以 `fiber.ctx.emit(filtered, 'loader/volatile-update', paths)` 发出，其中 filter 只放行 `hook.ctx.fiber === 本插件 fiber` 的监听器 —— 因此在 `apply()` 内直接注册即可精确收到**自己**的变更，不会误收其它插件的事件。注意这是 `emit` 而非 `waterfall`，监听器**不得**声明第三个 `next` 参数（`waterfall` 的末位参数才是 next）。

### 4. 配置优先级（重要）

既定优先级「`plugins.config.local.json` > `plugins.config.json` > Profile / 表单传入值」**保持不变**。

由此产生一个必须知悉的产品级约束：**`plugins.config.json` 已声明的字段，表单改动会被文件值盖回**。例如默认配置声明了 `notifier.locale`，则表单里改 `locale` 不产生任何效果；而未在文件中声明的字段（表单仍会渲染，因为 Schema 已声明）可以正常实时生效。

若希望某字段由表单托管，请把它从 `plugins.config.json` 中移出（可移到 `plugins.config.local.json` 仅作本地默认，或直接留空由 Schema 默认值兜底）。

**config.ts**
- `loadUmbrellaConfig()`：`plugins.config.json` 为基底、`plugins.config.local.json` 深层覆盖；两者缺失或损坏均平稳降级，至少返回 `{ plugins: {} }`。
- `deepMerge()`：递归合并纯对象，数组整体替换，不修改任何入参；遇到 volatile 引用**先解引用**再合并。
- `readJsonFile()`：读取 → 剥离 UTF-8 BOM → **环境变量插值** → `JSON.parse`（顺序不可调换，BOM 会挡住首字符 `$` 的匹配）；文件不存在（`ENOENT`）静默忽略，**解析失败则输出带绝对路径的告警**。
- `interpolateEnvVariables()`：支持 `${VAR_NAME}` 与 `${env:VAR_NAME}` 两种占位符，变量名限定 `[A-Za-z_][A-Za-z0-9_]*`。
  - `process.env[varName]` 存在且非 `undefined` 时替换为对应值（**空串是合法取值，照常替换**）；不存在则**原样保留占位符**，便于用户直观发现漏配，而非被静默替换为空串导致凭据以空值下发。
  - 替换值经函数返回，变量内容中的 `$&` / `$1` 不会被 `String.replace` 当作替换模式二次解释。
- `getPluginConfig()`：剥离加载器保留字段 `enabled`，避免污染子插件自身 Schema；未配置时默认 `{ enabled: true, config: {} }`。
- `createVolatileRef()` / `isVolatileRef()` / `resolveVolatileRefs()`：volatile 引用协议的建立、识别与递归解包。
- `SCHEMA_DICT`：13 个 volatile 叶子字段的完整定义，层级与 `plugins.notifier` 配置一一对应。
- `Config`：Schemastery + Standard Schema v1 双契约。`validate` **严禁返回 Promise** —— Cordis v4 在插件启动前同步调用并读取 `result.value`。

**scanner.ts**
- 仅单层扫描 `dsh-*` 目录（`pluginKey` 为剥离前缀后的目录名），不递归进入 `node_modules`。
- **目录软链支持**：判据为 `entry.isDirectory() || (entry.isSymbolicLink() && statSync(...)?.isDirectory())`。Node.js 在 Windows 上对 junction 返回 `isDirectory() === false` 而 `isSymbolicLink() === true`，只看 `isDirectory()` 会让 workspaces 软链出来的子插件整片漏扫；`statSync` 对悬空链接 / 无权限 / 竞态删除会抛错，必须捕获并保守判为非目录。
- 入口优先级：`index.js` → `package.json` 的 `exports['.']`（含条件对象）→ `main`；声明了却不存在的入口视为无效。
- `package.json` 损坏时输出告警并跳过该目录，不中断整体扫描。
- 结果按 `dirName` 字母序稳定排列，`entryUrl` 经 `pathToFileURL` 转换，规避 Windows 反斜杠路径导致的 ESM 导入异常。
