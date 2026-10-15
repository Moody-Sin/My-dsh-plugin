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
- **子智能体模型感知机制**：DSH 会话投影中记录了 `modelSelection`（含 `lastUsed` 与 `next`），但原生 `ui-model-selection` 限制子智能体不挂载输入栏模型控件。通过在 `conversation.session.header.actions` 挂载徽标并校验 `session.origin === 'subagent'`，可优雅补齐模型名称与推理层级（Reasoning Effort）的展示，且完全不干扰主会话。


