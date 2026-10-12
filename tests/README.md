# tests/ — 聚合总线测试

根加载器的测试目录，使用 Node 原生 `node --test` 与 `--experimental-strip-types` 直接运行 TypeScript 用例，无需预编译。

## 运行

```bash
npm test
# 或仅跑根加载器
node --experimental-strip-types --test tests/*.test.ts
```

仓库根的 `npm test` 先运行全部工作区测试，再执行 `node --experimental-strip-types --test tests/*.test.ts`。

## 测试文件

| 文件 | 覆盖范围 |
| :--- | :--- |
| [`config.test.ts`](./config.test.ts) | 双层配置加载、`deepMerge` 语义与入参不可变、BOM 容忍、**环境变量插值（`${VAR}` / `${env:VAR}`、漏配保留、空串替换、非法写法不误伤、`$&` 不被二次解释、BOM 与双层合并下的插值）**、损坏降级、`getPluginConfig` 的剥离与默认值、告警契约，以及一条源码文本反向断言（`config.ts` 不得再出现死字段 `configFile`）。<br>**原生设置表单契约**：Schemastery 结构（`type` / `dict` / `meta` / `toJSON()` / `Symbol.for('schemastery')`）、每层 `meta` 齐备、13 个 volatile 叶子集合精确比对、层级节点不得标记 volatile、**`volatileForm()` 投影复刻（投影结果精确等于 13 个叶子、连续三次投影均非空、投影不得污染模块级 `SCHEMA_DICT`、每个 volatile 节点都有 `toJSON`）**、volatile 引用物化（含未填写字段占位、快照深冻结、`updateVolatile` 就地刷新、快照失败降级告警）、`resolveVolatileRefs` 递归解包、`deepMerge` 遇引用先解包。 |
| [`scanner.test.ts`](./scanner.test.ts) | `dsh-*` 目录识别、`pluginKey` 推导、入口解析优先级、字母序稳定排序、`file:///` URL 转换、损坏 `package.json` 告警，以及**目录软链（含 Windows junction）扫描、悬空软链安全跳过、指向文件的软链不被误判**。 |
| [`loader.test.ts`](./loader.test.ts) | 聚合装载、文件配置优先级、注册表去重、异常隔离、fiber 非 ACTIVE 告警、空扫描告警、**`resolveProjectRoot()` 向上查找 / 包名与 `plugins.config.json` 双命中条件 / 找不到时抛错不回落 cwd**、**未知插件配置告警**、**Cordis 原生 Logger 对接与 Proxy 抛错降级**、**配置热重载四分支（禁用销毁、启用补挂、持续启用热更新、无关变更不触发、防抖合并、dispose 注销、异常隔离）**，以及**原生设置表单联动端到端用例（引用解引用后透传、宿主刷新快照 + `loader/volatile-update` 后热更新生效、`enabled` 改写后重新协调装载、dispose 后不再响应、文件配置仍为最高权威）**。 |
| [`manifest.test.ts`](./manifest.test.ts) | 根包元数据规范：包名与 Bundle Patch 稳定、`exports` 暴露 `./icon` 与 `./locale/*.json`、`files` 白名单齐备、声明的资源真实存在、`clean` 脚本覆盖根与子插件产物，以及 `icon.svg`（< 50KB、无脚本、无外链）与 `locale/*.json`（中英文齐备且键集合一致）。 |

## 关键设计约束

**测试全程使用 `os.tmpdir()` 下的隔离临时根目录，绝不修改仓库内任何真实文件。**

- `loader.test.ts` 的 `makeIsolatedRoot()` 用 `mkdtempSync` 建临时根，复制 `src/` 并补齐根标志（`package.json` 的 `name` 为 `@local/my-dsh-plugins`）、配置文件与最小 `dsh-notifier` 目录，再动态 `import()` 该副本 —— `apply()` 的根目录由 `resolveProjectRoot()` 基于 `import.meta.url` 向上查找，复制源码即可得到完全独立的场景根。
- **根标志必须补齐**：`resolveProjectRoot()` 已不再回落 `process.cwd()`，缺少根标志时夹具会直接抛错。负向用例通过 `options.omitRootMarkers` 显式构造「找不到根」场景，并先用 `findRootMarkerAncestor()` 前置校验系统临时目录的祖先链确实不含根标志，否则诚实 `t.skip()` 而非误报。
- **热重载用例必须 dispose**：`apply()` 会注册 `fs.watch` 监听，用例结束须调用 `harness.dispose()` 触发 `ctx.on('dispose')` 注销，否则句柄与定时器会跨用例残留。等待热重载一律用 `waitFor()` 轮询（`fs.watch` + 300ms 防抖是异步的），断言「确实没发生」时才用固定 `delay()`。
- 由于文件配置优先级最高，涉及 `enabled` 的场景必须在临时根自己的文件层表达，**严禁覆写仓库根的 `plugins.config.json`**。
- 环境变量用例统一经 `withEnv()` 包裹，无论成败都还原 / 删除变量，杜绝跨用例污染。
- `config.test.ts` 与 `scanner.test.ts` 同样在 `os.tmpdir()` 下建夹具，用例结束经 `t.after()` 清理，测试中断也不留残留。
- 目录软链用例在平台不允许创建软链（需开发者模式或管理员权限）时诚实 `t.skip()`，不伪造通过。
- **`volatileForm()` 投影引擎在 `config.test.ts` 内忠实复刻**（而非引入 `@deepseek-ai/dsh-settings` 依赖）：逐行对照官方 `dsh-settings/lib/types/schema.js`，保留 `new z(...)` 的**浅层赋值**语义与 `walk()` 的**就地 `delete node.meta.volatile`** 行为 —— 正是这两点组合才能真实暴露「`toJSON()` 返回共享引用会让表单在第二次渲染时消失」这一缺陷。`z` 必须是**普通函数**而非箭头函数，否则 `new z(...)` 会抛 `z is not a constructor`。
- 根包未声明 `@deepseek-ai/*` 运行时依赖，因此测试也**不得**导入 DSH 官方模块；官方实现的真实互通性已另行在 DSH checkout 内以临时脚本端到端验证（`volatileForm` 投影出 13 个叶子、`cosmokit.isVolatile` / `volatileEntries` / `updateVolatile` 全部识别并刷新本地引用）。
- **设置表单联动用例必须复刻宿主的完整调用链**：`Config['~standard'].validate()` 物化引用 → `updateVolatile()` 就地灌入新快照 → `ctx.emit('loader/volatile-update', paths)`。只验证其中一环无法覆盖「保存被静默丢弃」这类缺陷。mock `ctx` 因此实现了 `on` / `emit` 事件登记表。
