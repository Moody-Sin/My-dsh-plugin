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
