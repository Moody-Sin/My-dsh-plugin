# @local/dsh-notifier

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> DeepSeek Harness (DSH) 跨平台系统原生桌面弹窗、提示音及多渠道 Webhook 通知插件。

在 Agent 长时间执行任务、等待用户提问回答、等待危险操作权限审批或遇到执行错误时，提供毫秒级、跨设备的多端即时通知能力。

## 目录

- [背景](#背景)
- [特性](#特性)
- [安装与接入](#安装与接入)
- [配置说明](#配置说明)
- [支持渠道](#支持渠道)
- [事件列表](#事件列表)
- [维护者](#维护者)
- [更新日志](#更新日志)
- [使用许可](#使用许可)

## 背景

在使用 DeepSeek Harness 执行多步骤复杂自动化工程任务时，用户往往切屏进行其他工作。当 Agent 跑完流程、或者因调用 `ask_user_question` 与权限审批而挂起等待时，缺乏外部打扰机制会导致任务长时间停滞。

本插件为 DSH 提供轻量、高可靠的旁路通知服务，零侵入、零编译型三方依赖，完全兼容 DSH 的 Cordis 微内核架构。

## 特性

- **全平台系统原生桌面通知**：
  - Windows：调用 WinRT 原生 Toast 通知（带大标题与会话名，无需额外 npm 依赖）。会话名取自 DSH 的 `sessionTitle` 服务；该服务不可用时回退显示会话工作目录（`session.header.cwd`），两者皆无时才省略标题，不影响通知送达。
  - macOS：调用 `osascript` 系统通知。
  - Linux：调用 `notify-send` 系统通知。
- **系统音效提示**：关键事件触发清脆系统提示音（Windows SystemSounds / macOS Glass 音效）。
- **主流 Webhook 离机推送**：支持 **飞书**、**钉钉**、**企业微信**、**Bark (iOS)** 以及 **通用 JSON Webhook**，手机锁屏秒级触达。Bark 渠道支持点击通知直接跳转 DSH 控制台，高优先级事件具备自动网络重试。
- **智能防打扰**：支持 `events.minDurationSeconds` 耗时过滤，短时日常问答不触发完成弹窗，且与桌面通知开关彻底解耦。
- **高可用与非阻塞**：完全异步派发，网络波动与超时绝不影响 Agent 主流程执行。

## 安装与接入

### 方式一：通过 DSH Plugin CLI 安装到指定 Profile（推荐）

```bash
dsh plugin --profile web add D:/Project/My-dsh-plugin/dsh-notifier
```

### 方式二：在 Profile `cordis.patch.yml` 中挂载

在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`（如 `~/.dsh/profiles/web/cordis.patch.yml`）中添加：

```yaml
- insert:
    - id: notifier
      name: '@local/dsh-notifier'
      config:
        desktop:
          enabled: true
          minDurationSeconds: 5
        sound:
          enabled: true
        events:
          onTurnEnd: true
          onQuestion: true
          onApproval: true
          onError: true
          minDurationSeconds: 5
        webhook:
          enabled: false
          provider: 'feishu'
          url: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxxx'
```

## 配置说明

| 配置字段 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `desktop.enabled` | `boolean` | `true` | 是否启用操作系统原生桌面弹窗通知 |
| `desktop.minDurationSeconds` | `number` | `5` | **`[兼容字段]`** 旧版遗留阈值，已废弃仅为向后兼容保留；仅在未提供 `events.minDurationSeconds` 时作为回退读取来源，请改用 `events.minDurationSeconds` |
| `sound.enabled` | `boolean` | `true` | 是否在通知时播放系统提示音 |
| `events.onTurnEnd` | `boolean` | `true` | 是否在轮次/任务完成时触发通知 |
| `events.onQuestion` | `boolean` | `true` | 是否在 Agent 调用 `ask_user_question` 等待回答时触发通知 |
| `events.onApproval` | `boolean` | `true` | 是否在 Agent 申请工具权限审批时触发通知 |
| `events.onError` | `boolean` | `true` | 是否在 Agent 发生执行错误时触发通知 |
| `events.minDurationSeconds` | `number` | `5` | 任务完成耗时过滤阈值（秒），与桌面通知开关解耦。耗时低于此值的轮次不发送完成通知；优先于 `desktop.minDurationSeconds` |
| `webhook.enabled` | `boolean` | `false` | 是否开启 Webhook 远端推送 |
| `webhook.provider` | `string` | `'generic'` | Webhook 渠道类型：`feishu` \| `dingtalk` \| `wecom` \| `bark` \| `generic` |
| `webhook.url` | `string` | `''` | Webhook 机器人 Webhook URL |
| `webhook.secret` | `string` | `''` | 签名密钥（可选） |

## 支持渠道

### 1. 飞书 (Feishu)
配置 `provider: 'feishu'`，将以富文本卡片形式推送，卡片按通知等级高亮标题栏颜色（成功：蓝色，审批/提问：橙色，错误：红色）。

### 2. 钉钉 (DingTalk)
配置 `provider: 'dingtalk'`，以 Markdown 格式推送。

### 3. 企业微信 (WeCom)
配置 `provider: 'wecom'`，以 Markdown 格式推送。

### 4. Bark (iOS)
配置 `provider: 'bark'`，URL 为你的 Bark 服务端地址（如 `https://api.day.app/your_key`）。

- **点击直达控制台**：Payload 携带跳转 URL，默认为 DSH 控制台 `http://127.0.0.1:3080`，在手机上点击通知即可直接跳转回 DSH Web GUI（`metadata.url` 可覆盖为更具体的地址）。
- **角标提示**：根据通知等级自动携带 `badge` 角标（错误类为 `2`，其余为 `1`）。
- **关键事件自动重试**：提问、审批与告警类高优先级事件在网络抖动或超时时会短退避自动重试 1 次，普通 `turn/end` 完成通知不重试以避免重复打扰。

### 5. 通用 HTTP Webhook
配置 `provider: 'generic'`，将以标准 JSON POST 请求发送 `{ title, message, event, kind, timestamp }`。

## 事件列表

- `turn/end`：监听 `session/event` 中轮次结束，统计轮次耗时与状态。
- `user-questions/request`：无阻拦截提问请求并派发等待回答提醒。
- `approval/request`：无阻拦截审批请求并派发权限申请提醒。
- `agent/error`：监听 Agent 运行异常并派发告警。

## 维护者

[@DeepSeek-Harness-User](https://github.com)

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 使用许可

[MIT](../LICENSE)
