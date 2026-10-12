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
