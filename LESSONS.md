# 经验教训 (Lessons Learned)

简短记录反复踩坑与高价值工程化教训，避免文档冗余。

## 1. JavaScript / Node.js 运行时陷阱
- **`Map.delete(key)` 返回的是 `boolean` 而非被删除的元素**：若写成 `map.delete(key)?.dispose?.()`，可选链在 boolean 上恒为 undefined，导致资源无法正常释放。必须先 `const val = map.get(key); map.delete(key); val?.dispose?.();`。
- **`fs.watch` 的 `'error'` 事件必须显式捕获**：Node.js EventEmitter 未处理的 `'error'` 会被提升为未捕获异常并直接拖垮进程。监听 watcher 时必须始终附加 `watcher.on('error', () => {})`。

## 2. Cordis 微内核与 Proxy 上下文约束
- **Cordis `ctx` 是 Proxy 对象**：读取未在 `inject` 中声明的服务属性（例如 `ctx.logger` 或 `ctx.sessionTitle`）会**直接抛出异常**，而非返回 `undefined`。普通可选链 `ctx.logger?.()` 无法拦截属性访问时的抛错，必须使用 `try/catch` 保护或经由 `ctx.get('serviceName')` 安全读取。

## 3. 根目录查找与环境隔离
- **绝对不要将 `process.cwd()` 作为项目根目录的默认回落**：在宿主环境（如 DSH）运行期间，`process.cwd()` 代表用户目标工作区，而非插件自身仓库。向根查找失败应显式抛出具名异常，否则会污染用户工作区且掩盖测试夹具缺陷。

## 4. 国际化与测试套件确定性
- **引入 `locale: 'auto'` 时测试必须显式锁定语言**：动态从系统环境变量（`LANG`/`DSH_LOCALE`）推导语言会导致断言硬编码文案的测试在不同机器或 CI 语言环境下发生漂移。涉及文案断言的单元测试应显式注入 `locale: 'zh'` 或 `locale: 'en'`。

## 5. DSH 设置表单（Schemastery / volatile 引用）
- **`toJSON()` 必须返回深拷贝**：DSH `plainSchema()` 对返回值只做**浅层** `Object.assign`，随后 `walk()` **就地** `delete node.meta.volatile`。返回共享引用会在**第一次**渲染就抹掉模块级 Schema 的标记，第二次渲染表单整片消失。跨模块共享的 Schema 常量尤其危险。
- **`[Symbol.for('schemastery')]: true` 的对象不是真 schema**：DSH 会对**每个** volatile 节点调用 `new z(node.toJSON())`，因此叶子节点也必须挂 `toJSON()`，否则抛 `toJSON is not a function`。
- **`meta` 必须用字面量声明**：`Object.assign` 会**整体覆盖** `meta` 的值。同一节点若既在字面量提供 `meta: {}`、又在后置赋值里设置 `meta: {...}`，后者会静默抹掉前者。同理，`Object.assign` 对 `toJSON` 这类方法也是整体替换，不会保留原型方法。
- **不含 volatile 的子树的表单会被整棵剪除**，但**层级节点自身不得标记 volatile** —— 一旦标记，`volatileForm()` 会走 `plainSchema()` 跳过剪枝，层级也会变成可编辑控件。
- **必须为「用户未填写」的字段也建立 volatile 引用**：`LoaderEntry._commitVolatile()` 首行是 `volatileEntries(fiber.config)`，引用集合为空会**立即返回**，导致整次表单保存被**静默丢弃**、界面毫无反应。这是最难定位的一类缺陷 —— 无报错、无日志。
- **volatile 引用协议由 `Symbol.for('cosmokit.volatile.write')` 承载，不依赖模块实例**：因此无需引入 `@deepseek-ai/cosmokit` 依赖即可与官方实现互通（`isVolatile` / `volatileEntries` / `updateVolatile` 全部可用）。
- **引用必须在透传给子插件前解引用**：子插件做的是 `typeof x === 'boolean'` 之类的原始值判断，收到 `{ get() {} }` 会全部落空、配置整体回落默认值。解引用要深入 `deepMerge` 与 `clonePlain`，否则句柄会悄悄混进配置树。
- **`loader/volatile-update` 是 `emit` 而非 `waterfall`**：监听器**不得**声明第三个 `next` 参数，否则 `next` 会被误当作变更数据。

## 6. 插件职责收敛与端口解耦
- **后台通知类插件避免常驻 HTTP 服务**：插件若非必须提供对外 Webhook Receiver 等被动接收能力，不应在初始化时默认占用 TCP 端口。辅助类调试/连通性验证工具应收敛为按需触发的 CLI 脚本（如 `bin/test-notify.ts`），既避免端口冲突与常驻开销，又将配置入口唯一收敛至宿主原生表单。

## 7. Cordis v4 内部生命周期与清理机制
- **Cordis v4 不再向总线广播 `'dispose'` 事件**：v4 微内核中 Fiber 生命周期清理全面收敛至 Effect 架构（`ctx.effect(() => () => cleanup())`）。在插件卸载阶段仅执行 Effect 清理函数，`ctx.on('dispose', ...)` 恒不被触发。因此必须通过 `ctx.effect` 托管卸载清理，并兼顾旧环境降级。
- **原始文本正则插值环境变量破坏 JSON 语法**：环境变量中包含 Windows 反斜杠 `\` 或双引号 `"` 时，直接以正则代换到未解析的 JSON 字符串中会产生非法转义字符导致解析崩溃。必须通过 `JSON.stringify(val).slice(1, -1)` 对内容安全转义后再行代换。

## 8. DSH 客户端插件与模块解析协议
- **DSH 客户端插件 package.json 必须在 exports 中显式暴露 `"./package.json"`**：DSH 宿主在 `locatePkgJson` 中通过 `createRequire(baseUrl).resolve(`${expectedPackageName}/package.json`)` 寻找插件根，Node.js 默认禁止未导出 package.json 的包解析其自身 package.json，会导致无法定位客户端 bundle。
- **浏览器端 bundle 严禁在最外层产生动态 require 语句**：浏览器端通过 esbuild 的 IIFE 打包若标记 `--external:react`，会在顶层生成 `__require("react")`。而浏览器全局没有 `require`，加载即抛 `Dynamic require of "react" is not supported`，直接导致模块未能注册进 `__ModuleLoader__`，触发 `web boot: 1 entry did not activate / import failed`。必须打包为 CJS 闭包并通过 `window.__ModuleLoader__.load({ id, factory(require) { ... } })` 包装，由 factory 内部使用宿主注入的 `require('react')`，并导出包含 `{ inject: ['slots'], apply(ctx) }` 的标准 Cordis 插件对象。
- **子智能体模型感知机制**：DSH 会话投影中记录了 `modelSelection`（含 `lastUsed` 与 `next`），但原生 `ui-model-selection` 限制子智能体不挂载输入栏模型控件。通过在 `conversation.session.header.actions` 挂载徽标并校验 `session.origin === 'subagent'`，可优雅补齐模型名称与推理层级（Reasoning Effort）的展示，且完全不干扰主会话。
- **前端 Slot 兜底拦截避免全量 DOM 扫描**：在向 React Fiber Provider 寻找 Slot 服务进行 Monkey-patch 时，应从 `#root` 等高层容器定向遍历并加设深度限制（如 `depth <= 30`），避免在巨型长会话下 `document.querySelectorAll('*')` 递归扫描引发页面主线程卡顿。

## 9. Cordis 依赖注入与 DSH Web 鉴权通道
- **`export const inject` 语法是服务名数组或对象，不支持 `{ optional: [...] }`**：Cordis 内部通过 `Inject.resolve` 将 inject 结构扁平化。如果写成 `export const inject = { optional: ['webServer'] }`，Cordis 会提取键名，误认为插件依赖一个名为 `optional` 的服务，导致插件永远处于 `INACTIVE` 状态（state: 0）等待该服务，`apply()` 永远无法执行。可选服务应直接在 `apply(ctx)` 中通过 `ctx.inject(['serviceName'], callback)` 声明。
- **DSH Web 客户端请求必须走 `connection.fetch` 鉴权通道**：DSH Web 的 `/api` 前缀路由受 `client-connection` 服务接管，未经其校验的请求返回 401。插件必须通过 `ctx.inject(['connection'], connCtx => connCtx.connection.fetch.register({ path, methods, fetch }))` 注册标准 Web Request 路由，才能经 `connection.admit()` 鉴权并正确响应。
- **⚠️ 严禁在 `webServer` 上注册 `/api/*` 前缀路由（曾据此条写出高危漏洞）**：早期经验写的是「同时保留 `webServer.register` 作为双保险」，这是**错的**。DSH 的 `client-connection` 自己注册了 `/api` 前缀并在其中鉴权，而 `webServer.match()` 是「**最长前缀胜出**」——插件注册的 `/api/local-plugins` 比 `/api` 长，**必然抢在鉴权层前面命中**。后果是接口完全绕过鉴权：本机任意进程（或任意网页的跨站表单，`Content-Type: text/plain` 不触发 CORS 预检）都能读走 `plugins.config.local.json` 里的 Webhook 密钥并改写配置。同时请求体不再受宿主 `maxRequestBodyBytes` 约束。`/api/**` 路由只应经 `connection.fetch` 注册，没有例外。
- **验证方式**：`curl` 不带任何 Cookie 直连该接口，若返回 200 即为鉴权被绕过——这条检查应写进集成测试，纯函数层测不出来。

## 10. 配置物化与保存的静默失效
- **`validate()` 先于 `apply()` 执行**：Cordis 在 `Fiber._reload()` 中先 `this.config = this._resolveConfig(this._config)`（触发 `Config['~standard'].validate`），**之后**才 `_execute()` 调 `apply()`。因此任何「在 `apply()` 里注册子插件 Schema、再由 `validate()` 按 Schema 物化」的设计都行不通 —— 校验那一刻 Schema 还没注册。必须为配置中实际出现的字段无条件建立 volatile 引用占位，否则 `volatileEntries()` 返回空数组，宿主 `_commitVolatile()` 立即返回，整次表单保存被**静默丢弃**（无报错、无日志）。
- **Schema 未声明的字段同样需要引用**：`materializeVolatile()` 若对未声明的键原样透传，那些字段就不含引用，用户对它们的修改同样被静默丢弃。应按值的形状逐叶建立引用，保证任意形状的配置都具备热改通道。
- **`Object.assign(fn, {...})` 形态的 Config 是函数不是对象**：Schemastery 风格的 `Config` 常常是函数。判定时只写 `typeof x === 'object'` 会把它们全部漏掉，退化成兜底节点并触发上面那条静默失效。判定必须接受 `function`。
- **逐层编辑而非编辑合并视图**：设置 UI 若把「base 与 local 的合并结果」作为表单状态、再整体写回目标文件，选中「保存到 base」就会把 local 层的密钥复制进随 Git 提交的文件，彻底抵消分层意义。表单内容应始终等于目标层自身。

## 11. 热重载的语义与状态存放位置
- **Cordis `Fiber.update()` 是 `restart()`（dispose 再 apply），不是原地热更新**：`src/README.md` 曾写「原地热更新，不销毁重建」，与实现不符。子插件不得在 `apply()` 内持有跨重启才有效的状态（如 `dsh-notifier` 的轮次计时表），否则配置一改就丢事件。这类状态应置于模块级，并靠容量淘汰 + TTL 回收，不要依赖卸载时机清理。
- **未接线的回调会产生假成功**：`triggerTestNotify` 曾定义了却没有任何调用点，前端点「发送测试通知」后收到 `{ ok: true }` 却一条通知都没发。凡是「定义了可选回调」的接口，调用方必须显式接线，且 `ok === false` 时前端要展示具体原因而不是成功态。

## 11.5 诊断类接口的返回值语义
- **「批量执行 + 聚合布尔返回值」会污染诊断结论**：一次调用派发多个渠道、只返回「是否全部成功」时，任一渠道失败会把其它明明成功的渠道也标记为失败（误报）。诊断类接口必须让每个目标**独立触发、独立统计**结果。
- **布尔过滤参数要枚举完整，否则会漏成「全开」**：`{ soundOnly?, webhookOnly? }` 这种「排除型」选项缺了 `desktopOnly`，不传任何选项就变成三个渠道全开。涉及多目标的开关应改用**明确指定**（`channel: 'desktop' | 'sound' | 'webhook'`），而不是靠排除法。

## 12. 重复真相与不可达代码
- **构建产物同步校验不要用文件 mtime**：Git 在 `clone` / CI 检出时**不保留**原始修改时间，而是按检出顺序即时赋时。实测全新 clone 后 `src/` 下 9 个源文件都比 `index.js` 新，导致「源码 mtime > 产物 mtime」在完全干净的检出上误报。应改用 Git 提交次序 + 工作区脏改动这类 mtime 无关的判据；且比对粒度要是「产物对应的入口源文件」而非整个目录（一个包常有多个入口，只改 `client.ts` 时 `index.js` 无需重建）。
- **同一份 Schema 不要在两处维护**：根总线手写一份子插件字段表、子插件自己再有一份，改一处忘另一处就会让表单形态取决于装载顺序。应让一方成为唯一真相（子插件导出，总线动态注册）。
- **写「兜底路径」前先确认它可达**：`window.__DSH_SLOTS__` 这类猜想的全局变量、以及「扫 React Fiber 找 slot 服务 + 15 秒轮询」的兜底，若目标对象在官方包里全量 grep 都搜不到，就是死代码。DSH 在渲染 index.html 之前就输出了模块队列脚本，`__ModuleLoader__` 必然存在，只需这一条路径。
- **产物入库就要有同步校验**：`.gitignore` 未忽略构建产物、而测试跑的是源码时，「改了源码忘了 build」不会让任何测试变红。应加一条时间戳校验（源码比产物新即失败）。刻意不要做「重建后逐字节比对」——那会把 esbuild 版本与 tsconfig 继承上下文锁进测试，脆弱且难诊断。
