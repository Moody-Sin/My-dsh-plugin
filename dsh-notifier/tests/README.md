# dsh-notifier/tests/ — 通知插件测试

`@local/dsh-notifier` 的测试目录，基于 Node 原生 `node --test` 与 `--experimental-strip-types`，直接运行 TypeScript 用例。

## 运行

在**本插件目录**下执行：

```bash
npm test
```

即 `node --experimental-strip-types --test tests/*.test.ts`。注意 `e2e.test.ts` 导入的是打包产物 `../index.js`，运行前需先 `npm run build`。

## 测试文件

| 文件 | 覆盖范围 |
| :--- | :--- |
| [`config.test.ts`](./config.test.ts) | `resolveConfig()` 默认值与深层覆盖、`minDurationSeconds` 归一化、阈值优先级与 `desktop.enabled` 解耦、`locale` 白名单、Telegram/Discord 渠道校验、`Config` 的 Schemastery 符号、Standard Schema 同步契约、`toJSON()` 与递归 `meta` 完整性。 |
| [`dispatcher.test.ts`](./dispatcher.test.ts) | `formatDuration()` 中英文边界（含小时级）、四类事件的派发与开关、耗时阈值过滤、Webhook 不被桌面开关连带过滤、阈值缺失时的 5 秒兜底、Windows 声音内联委托与单进程策略、非 Windows 分离调用、200ms 事件去重与窗口过期。 |
| [`channels.test.ts`](./channels.test.ts) | `escapeXml()` 控制字符剥离；三平台桌面通知与提示音的命令构造及失败降级；WinRT Toast 内联音频与静音回退；Linux `-u critical` 与 `-i` 图标；macOS `subtitle`；七类 Webhook 载荷、飞书/钉钉签名、Telegram `chat_id` 语义、Discord Embed 配色、重试与不重试的边界。 |
| [`plugin.test.ts`](./plugin.test.ts) | 插件入口契约、`turn/start → turn/end` 生命周期、两个 waterfall 正确委派 `next()`、`sessionTitle` 的取值与多种降级路径、新增 `locale` 与渠道配置经入口 Schema 的解析。 |
| [`e2e.test.ts`](./e2e.test.ts) | 对**打包产物** `index.js` 跑完整生命周期，覆盖 `events.minDurationSeconds` 在桌面渠道关闭时仍生效、Windows 弹窗与声音合并为单次桌面调用、英文环境下经打包代码输出英文文案与小时级耗时。 |
| [`manifest.test.ts`](./manifest.test.ts) | 插件清单校验：`package.json` 的 DSH bundle 元数据、`exports` 与版本号、`cordis.patch.yml` 入口、`locale/zh.json` 与 `locale/en.json` 的 `meta` 与 `notifications` 词条、`icon.svg` 存在且体积合规、**打包产物零第三方依赖**、`CHANGELOG` 与版本号同步。 |

## 关键设计要点

**`plugin.test.ts` 用 `createProxyLikeContext()` 模拟 Cordis 的 `ctx` Proxy 行为：读取未声明在 `inject` 中的服务属性会直接抛错。**

这是本测试目录最值得注意的设计。普通对象 mock 读任何属性都不抛错，因此测不出「可选服务缺失」这类缺陷；而真实的 Cordis `ctx` 是 Proxy，`ctx.sessionTitle` 在未注入时抛异常，普通可选链挡不住。

该 mock 同时提供不依赖 `inject` 声明的安全读取入口 `ctx.get(name)`——这正是插件取可选服务 `sessionTitle` 的方式。据此锁定的行为是：

- `inject` 含 `sessions`、**不含 `sessionTitle`**（写进去会让服务缺失时 fiber 永久 PENDING，通知全废）；
- 服务存在时经 `ctx.get` 解析出会话标题，通知正文带上 `会话: <标题>`；
- 服务缺失时回退 `session.header.cwd`，再无来源则返回 `undefined`；
- **服务完全缺失时插件仍正常激活、通知照常派发**，只是少一行标题，绝不因取标题失败而丢弃通知。

**`dispatcher.test.ts` 与 `e2e.test.ts` 通过 `DispatcherOptions.platform` / `nowFn` / `debounceMs` 注入平台与时钟，全程不触达真实子进程与网络。**
