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
- [多语言](#多语言)
- [事件列表](#事件列表)
- [维护者](#维护者)
- [更新日志](#更新日志)
- [使用许可](#使用许可)

## 背景

在使用 DeepSeek Harness 执行多步骤复杂自动化工程任务时，用户往往切屏进行其他工作。当 Agent 跑完流程、或者因调用 `ask_user_question` 与权限审批而挂起等待时，缺乏外部打扰机制会导致任务长时间停滞。

本插件为 DSH 提供轻量、高可靠的旁路通知服务，零侵入、零编译型三方依赖，完全兼容 DSH 的 Cordis 微内核架构。

## 特性

- **全平台系统原生桌面通知**：
  - Windows：调用 WinRT 原生 Toast 通知（带大标题与会话名，无需额外 npm 依赖）。会话名取自 DSH 的 `sessionTitle` 服务；该服务不可用时回退显示会话工作目录（`session.header.cwd`），两者皆无时才省略标题，不影响通知送达。**提示音已内联进 Toast XML**（`ms-winsoundevent:Notification.Reminder` / `Notification.Default`），一次 PowerShell 调用同时完成弹窗与发声，Windows 下子进程开销削减 50%，并彻底消除声画不同步。
  - macOS：调用 `osascript` 系统通知，会话名作为 `subtitle` 展示，轮次与耗时留在正文。
  - Linux：调用 `notify-send` 系统通知，告警/错误级通知自动使用 `-u critical` 紧急度，并提供 `iconPath` 选项以指定通知图标。
- **系统音效提示**：关键事件触发清脆系统提示音（Windows SystemSounds / macOS Glass 音效）。
- **真正落地的多语言**：`locale` 支持 `auto` / `zh` / `en`，`auto` 按 `DSH_LOCALE` → `LANG` → `LC_ALL` 自动判断，标题与全部字段标签随之切换。
- **主流 Webhook 离机推送**：支持 **飞书**、**钉钉**、**企业微信**、**Bark (iOS)**、**Telegram**、**Discord** 以及 **通用 JSON Webhook**，手机锁屏秒级触达。Bark 渠道支持点击通知直接跳转 DSH 控制台，高优先级事件具备自动网络重试。
- **智能防打扰**：支持 `events.minDurationSeconds` 耗时过滤，短时日常问答不触发完成弹窗，且与桌面通知开关彻底解耦；内置 200ms 相同事件去重窗口，网络抖动或事件重放不会重复轰炸下游渠道。
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
        locale: 'auto'
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
| `locale` | `string` | `'auto'` | 通知文案语言：`auto` \| `zh` \| `en`。`auto` 依次读取 `DSH_LOCALE`、`LANG`、`LC_ALL`，以 `en` 开头用英文，否则用中文 |
| `desktop.enabled` | `boolean` | `true` | 是否启用操作系统原生桌面弹窗通知 |
| `desktop.minDurationSeconds` | `number` | `5` | **`[兼容字段]`** 旧版遗留阈值，已废弃仅为向后兼容保留；仅在未提供 `events.minDurationSeconds` 时作为回退读取来源，请改用 `events.minDurationSeconds` |
| `sound.enabled` | `boolean` | `true` | 是否在通知时播放系统提示音。Windows 下该提示音由桌面 Toast 内联播放，不再额外启动子进程；仅在 `desktop.enabled: false` 时才单独调用声音进程 |
| `events.onTurnEnd` | `boolean` | `true` | 是否在轮次/任务完成时触发通知 |
| `events.onQuestion` | `boolean` | `true` | 是否在 Agent 调用 `ask_user_question` 等待回答时触发通知 |
| `events.onApproval` | `boolean` | `true` | 是否在 Agent 申请工具权限审批时触发通知 |
| `events.onError` | `boolean` | `true` | 是否在 Agent 发生执行错误时触发通知 |
| `events.minDurationSeconds` | `number` | `5` | 任务完成耗时过滤阈值（秒），与桌面通知开关解耦。耗时低于此值的轮次不发送完成通知；优先于 `desktop.minDurationSeconds` |
| `webhook.enabled` | `boolean` | `false` | 是否开启 Webhook 远端推送 |
| `webhook.provider` | `string` | `'generic'` | Webhook 渠道类型：`feishu` \| `dingtalk` \| `wecom` \| `bark` \| `telegram` \| `discord` \| `generic` |
| `webhook.url` | `string` | `''` | Webhook 机器人 Webhook URL |
| `webhook.secret` | `string` | `''` | 签名密钥（可选）；`telegram` 渠道下作为 `chat_id` |

> **性能提示**：Windows 下 `desktop.enabled` 与 `sound.enabled` 同时为真时，插件只启动 **一次** `powershell.exe`，由 Toast XML 的 `<audio>` 节点同时完成弹窗与发声；只有 `desktop.enabled: false && sound.enabled: true` 时才会独立调用声音进程。

> **频控提示**：相同事件（事件名 + 标题 + 正文 + 等级 + 音效类型完全一致）在 **200ms** 窗口内只会派发一次，防止事件重放或抖动重复轰炸下游渠道。首次通知始终立即派发，不做延迟。

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

### 5. Telegram
配置 `provider: 'telegram'`，URL 为 Bot API 地址（如 `https://api.telegram.org/bot<TOKEN>/sendMessage`）。

- **目标会话**：`secret` 作为 `chat_id` 传入请求体；若 URL 查询串已自带 `chat_id`，则以 URL 为准不做覆盖。
- **正文格式**：Markdown，形如 `*标题*\n\n正文`（`parse_mode: 'Markdown'`）。

### 6. Discord
配置 `provider: 'discord'`，URL 为 Discord Webhook 地址（如 `https://discord.com/api/webhooks/<id>/<token>`）。

- 以 Rich Embed 形式推送，`title` 为通知标题、`description` 为正文、`timestamp` 为 ISO 时间。
- **等级配色**：错误 `#FF0000`、警告 `#FFA500`、成功 `#00FF00`、普通 `#3498DB`。

### 7. 通用 HTTP Webhook
配置 `provider: 'generic'`，将以标准 JSON POST 请求发送 `{ title, message, event, kind, timestamp }`。

## 多语言

通知的标题与字段标签均来自 `src/utils/i18n.ts` 的词典，并由 `locale` 决定：

- `locale: 'auto'`（默认）：依次读取 `DSH_LOCALE` → `LANG` → `LC_ALL`，值以 `en` 开头（忽略大小写，兼容 `en_US.UTF-8`）使用英文，否则使用中文。
- `locale: 'zh'` / `'en'`：强制指定，不受环境变量影响。

| 场景 | 中文 | English |
| :--- | :--- | :--- |
| 任务完成 | `DeepSeek Harness - 任务已完成` | `DeepSeek Harness - Task Completed` |
| 任务结束 | `DeepSeek Harness - 任务已结束` | `DeepSeek Harness - Task Ended` |
| 等待回答 | `DeepSeek Harness - 等待您的回答` | `DeepSeek Harness - Waiting for Response` |
| 权限审批 | `DeepSeek Harness - 请求权限审批` | `DeepSeek Harness - Approval Requested` |
| 任务异常 | `DeepSeek Harness - 任务异常` | `DeepSeek Harness - Task Error` |

字段标签同样双语（`会话:`/`Session:`、`轮次:`/`Turn:`、`耗时:`/`Duration:`、`状态:`/`Status:`、`工具:`/`Tool:`、`理由:`/`Reason:`、`错误:`/`Error:`），耗时在超过一小时时格式化为 `1小时1分1秒` / `1h 1m 1s`。

`locale/zh.json` 与 `locale/en.json` 的 `notifications` 段与运行时代码词典一一对应，并由 `tests/manifest.test.ts` 校验，避免两处文案漂移。

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
