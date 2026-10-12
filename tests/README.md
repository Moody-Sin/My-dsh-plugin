# tests/ — 聚合总线测试

根加载器的测试目录，使用 Node 原生 `node --test` 与 `--experimental-strip-types` 直接运行 TypeScript 用例，无需预编译。

## 运行

```bash
npm test
```

仓库根的 `npm test` 先运行全部工作区测试，再执行 `node --experimental-strip-types --test tests/*.test.ts`。

## 测试文件

| 文件 | 覆盖范围 |
| :--- | :--- |
| [`config.test.ts`](./config.test.ts) | 双层配置加载、`deepMerge` 语义与入参不可变、BOM 容忍、损坏降级、`getPluginConfig` 的剥离与默认值、告警契约、Standard Schema 契约，以及一条源码文本反向断言（`config.ts` 不得再出现死字段 `configFile`）。 |
| [`scanner.test.ts`](./scanner.test.ts) | `dsh-*` 目录识别、`pluginKey` 推导、入口解析优先级、字母序稳定排序、`file:///` URL 转换、损坏 `package.json` 告警。 |
| [`loader.test.ts`](./loader.test.ts) | 聚合装载、文件配置优先级、注册表去重、异常隔离、fiber 非 ACTIVE 告警、空扫描告警、`resolveProjectRoot()` 定位。 |

## 关键设计约束

**测试全程使用 `os.tmpdir()` 下的隔离临时根目录，绝不修改仓库内任何真实文件。**

- `loader.test.ts` 的 `makeIsolatedRoot()` 用 `mkdtempSync` 建临时根，复制 `src/` 并补齐 `package.json`、配置文件与最小 `dsh-notifier` 目录，再动态 `import()` 该副本 —— `apply()` 的根目录由 `resolveProjectRoot()` 基于 `import.meta.url` 推导，复制源码即可得到完全独立的场景根。
- 由于文件配置优先级最高，涉及 `enabled` 的场景必须在临时根自己的文件层表达，**严禁覆写仓库根的 `plugins.config.json`**。
- `config.test.ts` 与 `scanner.test.ts` 同样在 `os.tmpdir()` 下建夹具，用例结束经 `t.after()` 清理，测试中断也不留残留。
