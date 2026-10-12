# 经验教训 (Lessons Learned)

本文档用于记录项目开发过程中的核心规范约束与反复踩坑总结。

## 1. 提交信息语言规范
- **规则**：全局规范最高优先级要求“全程使用简体中文”。约定式提交（Conventional Commits）中的类型与作用域可以使用标准前缀（如 `feat(模块):`、`fix(模块):`、`docs:` 等），但**说明描述必须全部使用简体中文**，严禁使用英文描述。

## 2. Windows WinRT Toast 自动化
- **规则**：在 PowerShell 中执行 WinRT `[Windows.UI.Notifications.ToastNotificationManager]` 时，XML 模板内容切勿直接通过字符串插值拼接，否则可能受变量展开（如 `$env`、`$`）影响。标准做法是将 XML 做 UTF-8 Base64 编码，并在 PowerShell 脚本内部解码为纯文本加载，彻底阻断注入与解析失败。
