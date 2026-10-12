# DSH 通知插件 (dsh-plugin-notifier) 设计文档

## 1. 背景与意图 (Intent and Why)

DeepSeek Harness (DSH) 是基于 Cordis 微内核架构的智能体 Harness。用户在让 Agent 执行多步骤、长耗时的复杂开发任务时，往往会切屏处理其他工作或离开电脑。当前痛点：
1. **任务完成无感知**：长跑任务结束时静默停下，用户无法及时获知结果。
2. **需要交互时卡顿停滞**：当 Agent 触发提问（`ask_user_question`）或权限审批（`approval`）时，Agent 处于挂起等待状态，缺乏即时打断提醒，导致任务停滞。
3. **异常中断无告警**：遇到非重试性错误或终止条件时，用户无法第一时间获悉。

本设计旨在打造一个轻量、稳定、低侵入且开箱即用的 DSH 通知插件 `dsh-plugin-notifier`，支持跨平台系统原生桌面通知、系统提示音以及多种常用 Webhook（飞书、钉钉、企微、Bark 等）。

---

## 2. 目标、非目标与反向目标 (Goals, Non-Goals, and Anti-Goals)

### 2.1 目标 (Goals)
- **Host 级核心监听**：基于 Cordis 核心事件机制，覆盖 `web`、`headless` 等多种运行模式。
- **系统原生桌面通知**：
  - Windows：使用 WinRT XML 模板触发原生 Toast 通知（带大标题、文本及图标），零额外编译型 npm 依赖。
  - macOS：通过 `osascript` 触发原生系统通知。
  - Linux：通过 `notify-send` 触发系统通知。
- **系统音效提示**：在关键事件（提问/审批/任务完成）时播放系统短促提示音。
- **主流 Webhook 离机推送**：
  - 飞书 (Feishu) Webhook 机器人消息。
  - 钉钉 (DingTalk) Webhook 机器人消息。
  - 企业微信 (WeCom) Webhook 机器人消息。
  - Bark (iOS 轻量推送)。
  - 通用 HTTP Webhook (Generic JSON POST)。
- **智能防打扰**：
  - 最小任务耗时阈值（`minDurationSeconds`，默认 5 秒）：短时问答不触发完成通知，仅长耗时任务完成时通知。
  - 各类事件开关独立可配（任务完成、等待提问、等待审批、任务异常）。
- **标准插件规范**：符合 DSH 插件规范（`package.json` 导出、`cordis.patch.yml`、`locale/*.json` 多语言元数据、`icon.svg` 图标、Schemastery `Config` 模型）。

### 2.2 非目标 (Non-Goals)
- Phase 1 不实现侵入式 Web UI 视图或弹窗覆盖层，确保极简稳定、零编译开销。
- 不接管或代理用户的提问/审批决策，仅充当只读的旁路观察与通知分发者。

### 2.3 反向目标 (Anti-Goals)
- **严禁引入重量级或需编译的外部依赖**（如 `node-notifier`、`node-gyp`、重型 HTTP 库），必须利用 Node 24 原生 `fetch` 与系统级轻量脚本。
- **严禁阻塞主执行流程**：通知发送失败或网络超时绝不能导致 Agent 执行流程挂起或报错。
- **严禁违背会话日志规范**：不向 `session.append` 注入未定义的事件类型。

---

## 3. 约束与运行环境 (Constraints)

- **Node.js 版本**：>= 18.0.0 (当前宿主运行环境为 Node v24.19.0，具备原生 global `fetch`)。
- **DSH 架构**：`@deepseek-ai/cordis` (v4.x) 及 DSH 核心包事件机制。
- **配置持久化**：通过 `@deepseek-ai/schemastery` 定义类型化 Schema，用户在 profile 的 `cordis.patch.yml` 中配置即可持久化。

---

## 4. 架构与设计决策 (Architecture & Decisions)

### 4.1 核心事件监听点
1. **任务完成与轮次结束**：
   - 监听 `session/event`，匹配 `event.type === 'turn/end'`。
   - 读取 `turn/start` 记录的时间戳计算耗时；当 `耗时 >= minDurationSeconds` 时触发。
   - 依据 `event.data.reason.kind`（`completed` / `error` / `blocked` 等）确定通知标题与文案。
2. **等待用户提问**：
   - 监听 `user-questions/request` waterfall 钩子。
   - 提取首个问题或问题列表摘要。
   - 异步触发高优先级通知，同时直接 `return await next()`，绝不阻塞下游。
3. **等待权限审批**：
   - 监听 `approval/request` waterfall 钩子。
   - 提取 `req.toolName` 与 `req.reason`。
   - 异步触发高优先级通知，同时直接 `return await next()`。
4. **任务异常**：
   - 监听 `agent/error` 事件，提取错误信息并报警。

### 4.2 渠道分发层
- 模块化设计：`DesktopChannel`、`SoundChannel`、`WebhookChannel`。
- 异步派发：统一通过安全包装函数执行，捕获所有异常并做日志记录，互不干扰。

---

## 5. 配置 Schema 规范 (`Config`)

```typescript
export interface NotifierConfig {
  desktop: {
    enabled: boolean;
    minDurationSeconds: number; // 默认 5
  };
  sound: {
    enabled: boolean;
  };
  events: {
    onTurnEnd: boolean;       // 默认 true
    onQuestion: boolean;      // 默认 true
    onApproval: boolean;      // 默认 true
    onError: boolean;         // 默认 true
  };
  webhook: {
    enabled: boolean;
    provider: 'feishu' | 'dingtalk' | 'wecom' | 'bark' | 'generic';
    url: string;
    secret?: string;
  };
}
```
