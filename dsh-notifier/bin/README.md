# dsh-notifier/bin/ — 命令行诊断工具

`@local/dsh-notifier` 的可执行脚本目录。

## 文件职责

| 文件 | 职责 |
| :--- | :--- |
| [`test-notify.ts`](./test-notify.ts) | 通知渠道连通性诊断与延迟测量 CLI，通过根或子包 `npm run test:notify` 调用，支持 `--type=desktop\|sound\|webhook\|all` 及临时覆盖 `--url`、`--provider`、`--secret`、`--locale=zh\|en`。 |
