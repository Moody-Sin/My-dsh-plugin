# DSH 通知插件 (dsh-plugin-notifier) 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 DSH 跨平台通知插件 `dsh-plugin-notifier`，基于 Cordis 事件机制实现任务完成、等待提问、等待审批及错误异常的原生系统桌面弹窗、音效与 Webhook（飞书/钉钉/企微/Bark/通用）离机推送。

**Architecture:** 采用 DSH 规范的 Host 宿主插件架构。核心逻辑由 Cordis 插件驱动，订阅 `session/event`、`user-questions/request`、`approval/request` 与 `agent/error`，经过防打扰与配置过滤后，通过操作系统命令（Windows WinRT/PowerShell、macOS osascript、Linux notify-send）与 Node 24 原生 `fetch` 并发分发桌面通知、系统音效及 Webhook。

**Tech Stack:** TypeScript / Node.js (>= 18.0.0, Native fetch & child_process), `@deepseek-ai/cordis` (v4.x), `@deepseek-ai/schemastery` / `zod`, Vitest / Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-12-dsh-plugin-notifier-design.md`

## Global Constraints

- **语言规范**：全程使用简体中文沟通与输出文档；称呼用户为“老大”。
- **工程规范**：约定式提交 (Conventional Commits)、语义化版本 (SemVer)、维护更新日志 (Keep a Changelog)、标准 README.md。
- **依赖限制**：零编译型重型依赖，严禁使用 `node-notifier`、`snoretoast` 等原生二进制编译包；统一使用 Node.js 内置模块（`child_process`、`fetch`）。
- **非阻塞保证**：通知分发绝不阻塞 Cordis waterfall 主流程（`await next()` 必须立即交还控制权）。
- **日志安全性**：不向 `session.append` 注入未定义的事件类型。

## Review Focus

1. **短任务频繁弹窗扰民**：当任务耗时小于 `minDurationSeconds`（默认 5s）时，`turn/end` 必须被抑制，不得发送完成通知。
2. **网络超时或 Webhook 错误导致 Agent 挂死**：Webhook 推送失败或超时必须被隔离捕获并打出警告日志，严禁抛出未捕获异常。
3. **Waterfall 钩子死锁**：在 `user-questions/request` 和 `approval/request` 中，通知必须异步触发，必须同步/无阻调用 `return await next()`。
4. **Windows Toast 特殊字符转义失效**：XML 模板中的 XML 实体字符（如 `&`, `<`, `>`, `"`, `'`）必须正确转义，避免 PowerShell WinRT 报错。
5. **插件热重载 (HMR) 资源泄漏**：插件卸载或重载时，所有监听器与内部状态必须随 Context 干净销毁。

---

### Task 1: 插件工程脚手架与元数据清单 (Scaffolding & Manifest)

**Files:**
- Create: `dsh-plugin-notifier/package.json`
- Create: `dsh-plugin-notifier/cordis.patch.yml`
- Create: `dsh-plugin-notifier/locale/zh.json`
- Create: `dsh-plugin-notifier/locale/en.json`
- Create: `dsh-plugin-notifier/icon.svg`
- Create: `dsh-plugin-notifier/tsconfig.json`
- Test: `dsh-plugin-notifier/tests/manifest.test.ts`

**Interfaces:**
- Consumes: None
- Produces: DSH 标准 Bundle 包结构、元数据规范及 TypeScript 编译配置

- [ ] **Step 1: 编写清单元数据测试**

创建 `dsh-plugin-notifier/tests/manifest.test.ts`，校验 `package.json` 的 `dsh.bundle.patch` 声明、`exports` 字段、多语言字段完整性（`meta.title`、`meta.description`）以及 `icon.svg` 存在性。

- [ ] **Step 2: 运行测试验证失败**

运行: `npx tsx dsh-plugin-notifier/tests/manifest.test.ts`
预期结果: FAIL (文件尚不存在)

- [ ] **Step 3: 实现插件元数据与配置文件**

创建:
1. `dsh-plugin-notifier/package.json`: 声明包名 `@local/dsh-plugin-notifier`、`type: module`、`exports` (`.`, `./locale/*.json`, `./icon`)，以及 `dsh.bundle.patch: "./cordis.patch.yml"`。
2. `dsh-plugin-notifier/cordis.patch.yml`: 声明插件条目 `notifier`。
3. `dsh-plugin-notifier/locale/zh.json` 与 `en.json`: 提供中英文描述。
4. `dsh-plugin-notifier/icon.svg`: 符合规范的原生通知铃铛矢量图标（< 256KB）。
5. `dsh-plugin-notifier/tsconfig.json`: TypeScript 配置。

- [ ] **Step 4: 运行测试验证通过**

运行: `npx tsx dsh-plugin-notifier/tests/manifest.test.ts`
预期结果: PASS

- [ ] **Step 5: 提交更改**

```bash
git add dsh-plugin-notifier/
git commit -m "feat(notifier): initialize package scaffolding and bundle manifest"
```

---

### Task 2: 配置模型与 Schema 定义 (`src/config.ts`)

**Files:**
- Create: `dsh-plugin-notifier/src/config.ts`
- Test: `dsh-plugin-notifier/tests/config.test.ts`

**Interfaces:**
- Consumes: `@deepseek-ai/schemastery` / `zod`
- Produces: `NotifierConfig` 接口、`Config` 校验 Schema 及默认配置常量 `DEFAULT_CONFIG`

- [ ] **Step 1: 编写配置 Schema 单元测试**

在 `dsh-plugin-notifier/tests/config.test.ts` 中编写测试：
- 校验默认值解析（`desktop.enabled = true`, `desktop.minDurationSeconds = 5`, `sound.enabled = true`, 各事件开关为 `true`）。
- 校验自定义覆盖参数解析。
- 校验非法输入防护（如负数耗时被修正或拒绝）。

- [ ] **Step 2: 运行测试验证失败**

运行: `npx tsx dsh-plugin-notifier/tests/config.test.ts`
预期结果: FAIL (模块尚不存在)

- [ ] **Step 3: 实现 `src/config.ts`**

实现 `NotifierConfig` 类型定义与 Zod/Schemastery `Config` 构造器，设置默认参数并支持类型推断。

- [ ] **Step 4: 运行测试验证通过**

运行: `npx tsx dsh-plugin-notifier/tests/config.test.ts`
预期结果: PASS

- [ ] **Step 5: 提交更改**

```bash
git add dsh-plugin-notifier/src/config.ts dsh-plugin-notifier/tests/config.test.ts
git commit -m "feat(notifier): implement configuration schema and validation"
```

---

### Task 3: 通知渠道分发器实现 (`src/channels/`)

**Files:**
- Create: `dsh-plugin-notifier/src/channels/desktop.ts`
- Create: `dsh-plugin-notifier/src/channels/sound.ts`
- Create: `dsh-plugin-notifier/src/channels/webhook.ts`
- Create: `dsh-plugin-notifier/src/utils/xml.ts`
- Test: `dsh-plugin-notifier/tests/channels.test.ts`

**Interfaces:**
- Consumes: `NotifierConfig`
- Produces:
  - `sendDesktopNotification(title: string, message: string): Promise<boolean>`
  - `playNotificationSound(kind?: 'default' | 'alert' | 'success'): Promise<boolean>`
  - `sendWebhookNotification(config: WebhookConfig, payload: NotificationPayload): Promise<boolean>`
  - `escapeXml(text: string): string`

- [ ] **Step 1: 编写各渠道发送逻辑测试**

在 `dsh-plugin-notifier/tests/channels.test.ts` 中编写测试：
- 模拟 Windows / macOS / Linux 平台调用命令验证。
- 验证 XML 特殊字符转义（`&`, `<`, `>`, `"`, `'`）。
- 模拟 `fetch` 请求验证飞书、钉钉、企微、Bark 与通用 Webhook 的数据构造。
- 验证当网络抛错或外部命令失败时，函数安全返回 `false` 且不崩溃。

- [ ] **Step 2: 运行测试验证失败**

运行: `npx tsx dsh-plugin-notifier/tests/channels.test.ts`
预期结果: FAIL (模块尚不存在)

- [ ] **Step 3: 实现 `src/utils/xml.ts` 与渠道分发逻辑**

1. `src/utils/xml.ts`: XML 字符串转义函数。
2. `src/channels/desktop.ts`: 基于操作系统类型分发 Windows PowerShell Toast、macOS osascript、Linux notify-send。
3. `src/channels/sound.ts`: 操作系统原生音效播放。
4. `src/channels/webhook.ts`: 针对飞书、钉钉、企业微信、Bark 及 Generic 构造标准 JSON payload 并调用原生 `fetch()` 发送。

- [ ] **Step 4: 运行测试验证通过**

运行: `npx tsx dsh-plugin-notifier/tests/channels.test.ts`
预期结果: PASS

- [ ] **Step 5: 提交更改**

```bash
git add dsh-plugin-notifier/src/ dsh-plugin-notifier/tests/channels.test.ts
git commit -m "feat(notifier): implement desktop, sound and webhook notification channels"
```

---

### Task 4: 通知协调调度引擎 (`src/dispatcher.ts`)

**Files:**
- Create: `dsh-plugin-notifier/src/dispatcher.ts`
- Test: `dsh-plugin-notifier/tests/dispatcher.test.ts`

**Interfaces:**
- Consumes: `NotifierConfig`, 渠道分发函数
- Produces: `NotificationDispatcher` 类，提供：
  - `onTurnEnd(info: { turn: number; reason: any; durationMs: number; sessionTitle?: string })`
  - `onUserQuestion(info: { questions: string[]; sessionTitle?: string })`
  - `onApproval(info: { toolName: string; reason?: string; sessionTitle?: string })`
  - `onError(info: { error: string; sessionTitle?: string })`

- [ ] **Step 1: 编写调度引擎单元测试**

在 `dsh-plugin-notifier/tests/dispatcher.test.ts` 中编写测试：
- 验证耗时过滤：`durationMs < minDurationSeconds * 1000` 时跳过完成通知。
- 验证事件开关：配置为 `false` 的事件类型不触发分发。
- 验证并发分发：桌面弹窗、音效与 Webhook 并行触发，单个失败不影响其余渠道。

- [ ] **Step 2: 运行测试验证失败**

运行: `npx tsx dsh-plugin-notifier/tests/dispatcher.test.ts`
预期结果: FAIL (模块尚不存在)

- [ ] **Step 3: 实现 `src/dispatcher.ts`**

实现 `NotificationDispatcher`，封装各业务事件到通知内容（标题、正文、优先级）的映射，统一调度桌面、音效和 Webhook。

- [ ] **Step 4: 运行测试验证通过**

运行: `npx tsx dsh-plugin-notifier/tests/dispatcher.test.ts`
预期结果: PASS

- [ ] **Step 5: 提交更改**

```bash
git add dsh-plugin-notifier/src/dispatcher.ts dsh-plugin-notifier/tests/dispatcher.test.ts
git commit -m "feat(notifier): implement notification dispatcher with filtering logic"
```

---

### Task 5: Cordis 插件生命周期与事件接线 (`src/index.ts`)

**Files:**
- Create: `dsh-plugin-notifier/src/index.ts`
- Test: `dsh-plugin-notifier/tests/plugin.test.ts`

**Interfaces:**
- Consumes: `@deepseek-ai/cordis`, `NotificationDispatcher`, `Config`
- Produces: 标准 Cordis 插件导出：`name`, `inject`, `Config`, `apply(ctx, config)`

- [ ] **Step 1: 编写 Cordis 插件集成测试**

在 `dsh-plugin-notifier/tests/plugin.test.ts` 中编写集成测试：
- 创建 Mock Cordis Context。
- 加载插件并模拟触发 `session/event` (`turn/start`, `turn/end`)。
- 模拟触发 `user-questions/request`，验证 `next()` 能够正常 resolve。
- 模拟触发 `approval/request`，验证 `next()` 能够正常 resolve。
- 验证 Context 销毁时清理所有事件注册。

- [ ] **Step 2: 运行测试验证失败**

运行: `npx tsx dsh-plugin-notifier/tests/plugin.test.ts`
预期结果: FAIL (模块尚不存在)

- [ ] **Step 3: 实现 `src/index.ts`**

导出:
```typescript
export const name = 'notifier';
export const inject = ['sessions'];
export { Config } from './config.js';
export function apply(ctx: Context, config: NotifierConfig): void;
```
内部逻辑：
- 维护 `turnStartTimes` 记录轮次起始。
- 注册 `session/event`、`user-questions/request`、`approval/request`、`agent/error`。
- 在 `ctx.effect` 中妥善注册与清理。

- [ ] **Step 4: 运行测试验证通过**

运行: `npx tsx dsh-plugin-notifier/tests/plugin.test.ts`
预期结果: PASS

- [ ] **Step 5: 提交更改**

```bash
git add dsh-plugin-notifier/src/index.ts dsh-plugin-notifier/tests/plugin.test.ts
git commit -m "feat(notifier): wire Cordis plugin lifecycle and event listeners"
```

---

### Task 6: 构建输出、文档编写与端到端实测验证

**Files:**
- Create: `dsh-plugin-notifier/README.md`
- Create: `dsh-plugin-notifier/CHANGELOG.md`
- Create: `README.md` (根目录插件索引)
- Create: `CHANGELOG.md` (根目录更新日志)
- Modify: `dsh-plugin-notifier/index.js` (编译输出或入口绑定)

- [ ] **Step 1: 构建生成运行入口 `index.js`**

配置构建脚本或将 TypeScript 编译为 ES Module 原生 `index.js`。

- [ ] **Step 2: 编写标准 README 与 CHANGELOG**

1. `dsh-plugin-notifier/README.md`: 遵循 Standard README 规范，详细说明配置项、支持的通知渠道及示例。
2. `dsh-plugin-notifier/CHANGELOG.md`: 遵循 Keep a Changelog 规范，记录 v0.1.0 初始版本特性。
3. `README.md` (项目根): 记录当前仓库的插件列表，包含 `dsh-plugin-notifier` 的简介与链接。
4. `CHANGELOG.md` (项目根): 记录根仓库更新。

- [ ] **Step 3: 运行完整端到端测试套件**

运行所有测试验证整体功能稳定无回归。

- [ ] **Step 4: 本地真实环境实测通知触发**

在真实环境中触发一次桌面弹窗与音效验证。

- [ ] **Step 5: 最终提交与版本归档**

```bash
git add .
git commit -m "docs: add standard documentation, changelog and register plugin"
```
