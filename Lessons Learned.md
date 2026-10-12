# 经验教训 (Lessons Learned)

本文档用于记录项目开发过程中的核心规范约束与反复踩坑总结。

## 1. 提交信息语言规范
- **规则**：全局规范最高优先级要求“全程使用简体中文”。约定式提交（Conventional Commits）中的类型与作用域可以使用标准前缀（如 `feat(模块):`、`fix(模块):`、`docs:` 等），但**说明描述必须全部使用简体中文**，严禁使用英文描述。

## 2. Windows WinRT Toast 自动化
- **规则**：在 PowerShell 中执行 WinRT `[Windows.UI.Notifications.ToastNotificationManager]` 时，XML 模板内容切勿直接通过字符串插值拼接，否则可能受变量展开（如 `$env`、`$`）影响。标准做法是将 XML 做 UTF-8 Base64 编码，并在 PowerShell 脚本内部解码为纯文本加载，彻底阻断注入与解析失败。

## 3. DSH 插件的 Config 必须实现 Standard Schema
- **规则**：Cordis v4 在插件启动前会执行 `runtime.Config['~standard'].validate(config)`，并同步读取 `result.issues` / `result.value`。插件导出的 `Config` 若只有 `[Symbol.for('schemastery')]`、`type`、`dict` 等描述性字段，会在加载时抛出 `Cannot read properties of undefined (reading 'validate')`，插件随之进入 `fiberPhase: 'failed'`。**每个自定义 `Config` 的 DSH 插件都必须提供 `'~standard': { version: 1, vendor: 'schemastery', validate }`，且 `validate` 必须同步返回 `{ value }`（不得返回 Promise，Cordis 会直接抛 `Async config validation is not supported`）。**

## 4. DSH 插件热更新与 Node.js ESM 模块缓存
- **规则**：DSH 宿主在运行状态下，已加载的本地插件 ESM 模块受 Node.js 内存模块图缓存限制，仅修改或重新打包磁盘上的 `index.js` 无法让正在运行的宿主进程自动换入新对象（且 Cordis 内部也会保留该插件的回调和 runtime 记录）。当插件因配置校验失败等原因进入 `fiberPhase: 'failed'` 时，修复源码并重新打包后，必须重启 DSH 服务进程（`dsh web`）以释放旧的内存缓存，使更新完全生效。

## 5. 子智能体（Subagent）派发治理与防幻觉准则
- **规则**：
  1. **严格限制并发**：每次派发不得超过 2 个子 agent，且严禁让多个子 agent 同时修改同一代码包或相同文件集合，否则极易发生无文件锁的脏写覆盖、变量幻读（如 ReferenceError）与认知脱节。
  2. **任务原子化**：单个子 agent 的目标必须极其单一聚焦（如单个函数重构或单个文件修改），严禁一次性灌注包含 5 个以上模块的大包揽 Prompt，否则模型极易在耗尽工具轮次后发生“自述已完成但磁盘 0 写入”的幻觉。
  3. **严格证据闭环**：绝对不能单凭子 agent 的自我汇报断言成功，主 Agent 必须在每个子 agent 结束后通过 `git status`、`git diff`、回读文件内容与运行真实测试套件进行强校验。

## 6. 配置文件 UTF-8 BOM 兼容性
- **规则**：Windows 环境下部分工具（如 PowerShell `Set-Content -Encoding utf8` 或记事本保存）会产生带 UTF-8 BOM（`\uFEFF`）的 JSON 文件。Node.js 原生 `JSON.parse` 遇到 BOM 会抛出语法错误，若读取器包含“解析失败静默降级”逻辑，会导致用户填写的配置被静默忽略。解析配置文件前必须显式过滤开头的 BOM 字符（`content.replace(/^\uFEFF/, '')`）。

## 7. Node ESM 在 TypeScript 源码与打包构建中的模块路径解析
- **规则**：在 Node.js 原生 `--experimental-strip-types` 运行 TypeScript 测试时，源码之间的相对 import 必须保留 `.ts` 后缀（如 `import './config.ts'`），不能写成 `.js`，否则 Node ESM 会抛出 `ERR_MODULE_NOT_FOUND`；而 esbuild 构建时能天然识别并打包带 `.ts` 后缀的模块引用，打包产物 `index.js` 内部则内联各模块，同时兼容测试执行与生产打包。
