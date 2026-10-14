import fs from 'node:fs';
import path from 'node:path';

/** 公开基础配置文件名（随 Git 提交，存放通用默认值） */
export const BASE_CONFIG_FILENAME = 'plugins.config.json';
/** 本地私有覆盖文件名（已加入 .gitignore，存放密钥等敏感覆盖值） */
export const LOCAL_CONFIG_FILENAME = 'plugins.config.local.json';

/**
 * 环境变量占位符：同时支持 `${VAR_NAME}` 与 `${env:VAR_NAME}` 两种写法。
 *
 * 变量名限定为 `[A-Za-z_][A-Za-z0-9_]*`，避免把 `${a.b}` 这类非环境变量写法误伤。
 */
const ENV_PLACEHOLDER_PATTERN = /\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * 聚合加载器自身的配置模型。
 *
 * `plugins` 为各子插件配置切片集合，键名由子插件目录名剥离 `dsh-` 前缀推导。
 */
export interface UmbrellaLoaderConfig {
  /** 子插件配置切片：`{ [pluginKey]: { enabled?: boolean, ...业务配置 } }` */
  plugins?: Record<string, any>;
}

// ── Schemastery / Standard Schema 双契约 ────────────────────────────────────

/**
 * Schemastery 契约符号。
 *
 * 用 `Symbol.for()` 注册在全局符号表，因此 DSH 宿主内的多份 schemastery 副本
 * （ESM / CJS、不同依赖层级）都能识别同一个符号，不会因模块副本不同而失配。
 */
const SCHEMASTER_SYMBOL = Symbol.for('schemastery');

/**
 * cosmokit volatile 写入符号。
 *
 * 仅用于**识别** volatile 引用，本模块从不直接调用它；
 * DSH 侧的 `updateVolatile()` 通过该槽位把新快照灌进插件持有的旧引用，
 * 从而在不重启插件的前提下让 `ref.get()` 立刻读到新值。
 */
const VOLATILE_WRITE_SYMBOL = Symbol.for('cosmokit.volatile.write');

/** volatile 引用：稳定引用 + 只读快照读取器（与 cosmokit `Volatile<T>` 结构一致） */
export interface VolatileRef<T = any> {
  /** 读取当前不可变快照；字段缺失时为 `undefined` */
  get(): T;
}

/**
 * 识别 volatile 引用（跨 ESM / CJS 副本兼容）。
 *
 * 判据与 cosmokit `isVolatile()` 完全一致：协议由全局符号承载，不依赖 `instanceof`。
 */
export function isVolatileRef(value: unknown): value is VolatileRef {
  return typeof value === 'object' && value !== null && VOLATILE_WRITE_SYMBOL in value;
}

/**
 * 递归快照：深冻结的普通对象 / 数组，拒绝函数、类实例与循环引用。
 *
 * 与 cosmokit `snapshot()` 语义一致 —— volatile 引用一旦建立，
 * 其快照必须不可变，否则插件可以绕过引用协议就地篡改配置。
 */
function snapshotVolatile(value: unknown, ancestors = new Set<object>()): unknown {
  if (typeof value === 'function') throw new TypeError('volatile 配置不允许包含函数');
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new TypeError('volatile 配置不允许包含循环引用');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((item) => snapshotVolatile(item, ancestors)));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('volatile 配置只允许普通对象或数组');
    }
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, snapshotVolatile(item, ancestors)]),
      ),
    );
  } finally {
    ancestors.delete(value);
  }
}

/**
 * 建立 volatile 引用。
 *
 * 本模块刻意**不依赖** `@deepseek-ai/cosmokit` 包（根包未声明该依赖），
 * 而是按同一份**符号协议**就地实现：DSH 的 `isVolatile()` / `updateVolatile()` /
 * `volatileEntries()` 只检查 `Symbol.for('cosmokit.volatile.write')` 与 `get()`，
 * 因此本地实现与官方实现天然互通，无需共享同一个模块实例。
 */
export function createVolatileRef<T>(value: T): VolatileRef<T> {
  let current = snapshotVolatile(value) as T;
  return Object.freeze({
    get: () => current,
    [VOLATILE_WRITE_SYMBOL]: (next: unknown) => {
      current = next as T;
    },
  }) as VolatileRef<T>;
}

/**
 * 解开配置树中的全部 volatile 引用，得到普通可序列化值。
 *
 * 子插件与 `deepMerge()` 都只认原始值（`typeof x === 'boolean'` 之类的判断），
 * 收到引用对象会整体回落默认值，因此**透传前必须解引用**。
 * 语义与 DSH `plainConfig()` 对齐（含数组与嵌套对象）。
 */
export function resolveVolatileRefs(value: unknown): any {
  if (isVolatileRef(value)) return resolveVolatileRefs(value.get());
  if (Array.isArray(value)) return value.map(resolveVolatileRefs);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveVolatileRefs(item)]),
    );
  }
  return value;
}

/** Schema 节点：仅描述 DSH 表单投影所需的最小字段集 */
export interface SchemaNode {
  type: 'object' | 'boolean' | 'string' | 'number';
  description?: string;
  meta: Record<string, any>;
  dict?: Record<string, SchemaNode>;
  /**
   * 返回**深拷贝**的 plain schema 结构。
   *
   * DSH `plainSchema()` 会对每个 volatile 节点调用它（`new z(schema.toJSON())`），
   * 因此**叶子节点同样必须提供**，否则设置面板会抛 `toJSON is not a function`。
   */
  toJSON?(): SchemaNode;
}

/**
 * 聚合总线的完整配置 Schema 字典（层级与 `plugins.notifier` 的配置一一对应）。
 *
 * **每一项都必须带 `meta`**：DSH 的 `volatileForm()` 与 `isVolatilePath()` 会无条件读取
 * `node.meta.volatile` 并递归遍历 `dict` 的每个子节点，缺失 `meta` 会直接抛 `TypeError`，
 * 导致整个设置面板崩溃。
 *
 * 对象节点用 `meta: {}` 承载层级（本身不可编辑），叶子节点用 `meta: { volatile: true }`
 * 声明「可在设置面板中免重启热改」。不含任何 volatile 字段的子树会被 `volatileForm()`
 * 整棵剪除，因此层级节点自身**不得**标记 volatile —— 一旦标记，
 * `volatileForm()` 会走 `plainSchema()` 直接返回整棵未剪枝的 Schema，层级也会变成可编辑控件。
 */
export const SCHEMA_DICT: Record<string, SchemaNode> = {
  plugins: {
    type: 'object',
    description: '子插件配置集合',
    meta: {},
    dict: {
      notifier: {
        type: 'object',
        description: '通知插件配置',
        meta: {},
        dict: {
          enabled: {
            type: 'boolean',
            description: '启用通知插件',
            meta: { volatile: true },
          },
          locale: {
            type: 'string',
            description: '语言设置 (auto | zh | en)',
            meta: { volatile: true },
          },
          desktop: {
            type: 'object',
            description: '系统桌面弹窗',
            meta: {},
            dict: {
              enabled: {
                type: 'boolean',
                description: '开启桌面弹窗',
                meta: { volatile: true },
              },
            },
          },
          sound: {
            type: 'object',
            description: '系统提示音',
            meta: {},
            dict: {
              enabled: {
                type: 'boolean',
                description: '开启系统提示音',
                meta: { volatile: true },
              },
            },
          },
          events: {
            type: 'object',
            description: '事件通知与耗时过滤',
            meta: {},
            dict: {
              onTurnEnd: {
                type: 'boolean',
                description: '任务完成时通知',
                meta: { volatile: true },
              },
              onQuestion: {
                type: 'boolean',
                description: '等待提问时通知',
                meta: { volatile: true },
              },
              onApproval: {
                type: 'boolean',
                description: '权限审批时通知',
                meta: { volatile: true },
              },
              onError: {
                type: 'boolean',
                description: '任务异常时通知',
                meta: { volatile: true },
              },
              minDurationSeconds: {
                type: 'number',
                description: '任务完成过滤阈值 (秒)',
                meta: { volatile: true },
              },
            },
          },
          webhook: {
            type: 'object',
            description: 'Webhook 离机推送',
            meta: {},
            dict: {
              enabled: {
                type: 'boolean',
                description: '开启 Webhook 推送',
                meta: { volatile: true },
              },
              provider: {
                type: 'string',
                description: '渠道类型 (feishu | dingtalk | wecom | bark | telegram | discord | generic)',
                meta: { volatile: true },
              },
              url: {
                type: 'string',
                description: 'Webhook 机器人地址',
                meta: { volatile: true },
              },
              secret: {
                type: 'string',
                description: '签名密钥 / Chat ID (可选)',
                meta: { volatile: true },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * 深拷贝 Schema 节点为 plain 结构（**不带** `toJSON`）。
 *
 * **`toJSON()` 必须返回深拷贝，这是本模块最关键的一处防御。**
 * DSH `plainSchema()` 拿到 `toJSON()` 的结果后只做**浅层** `Object.assign`，
 * 紧接着 `walk()` 会**就地** `delete node.meta.volatile`。若返回共享引用，
 * 第一次渲染设置面板就会把模块级 Schema 上的 `volatile` 标记全部抹掉，
 * 第二次渲染时 `volatileForm()` 直接返回 `undefined`，表单整片消失。
 */
function cloneSchemaNode(node: SchemaNode): SchemaNode {
  const copy: SchemaNode = {
    type: node.type,
    meta: { ...node.meta },
  };
  if (node.description !== undefined) copy.description = node.description;
  if (node.dict) {
    copy.dict = Object.fromEntries(
      Object.entries(node.dict).map(([key, child]) => [key, cloneSchemaNode(child)]),
    );
  }
  return copy;
}

/**
 * 为 Schema 树中的**每个**节点挂载 `toJSON()`。
 *
 * 仅 volatile 节点会被 `plainSchema()` 调用 `toJSON()`，但统一挂载可避免
 * 「给层级节点加 volatile」或未来 DSH 扩大调用面时出现难以定位的崩溃。
 */
function attachToJSON(node: SchemaNode): SchemaNode {
  for (const child of Object.values(node.dict ?? {})) attachToJSON(child);
  node.toJSON = () => cloneSchemaNode(node);
  return node;
}

attachToJSON({
  type: 'object',
  description: 'DSH 聚合总线配置',
  meta: {},
  dict: SCHEMA_DICT,
});

/**
 * 根 Schema 的 plain 快照（`dict` 即 `SCHEMA_DICT`，节点已带 `toJSON`）。
 *
 * `meta` 为 `{}` 而非 `{ volatile: true }`：根节点一旦标记 volatile，
 * `volatileForm()` 会跳过剪枝直接返回整棵 Schema。
 */
const SCHEMA_ROOT: SchemaNode = {
  type: 'object',
  description: 'DSH 聚合总线配置',
  meta: {},
  dict: SCHEMA_DICT,
};

/**
 * 把配置值按 Schema 物化为带 volatile 引用的结构。
 *
 * **为什么必须为「用户没写的字段」也建立引用：**
 * DSH `LoaderEntry._commitVolatile()` 的第一步是 `volatileEntries(fiber.config)`；
 * 若当前配置里一个引用都没有，该函数**立即返回 true**，随后变更键列表被清空，
 * 于是 `if (!h.length && !s) return` —— **整次保存被静默丢弃，界面上什么都不会发生**。
 * 因此这里为每个 Schema 声明的 volatile 路径无条件占位，保证引用集合恒非空，
 * 且新旧配置结构完全同构（`compareConfig` 才能稳定判定为「仅 volatile 变更」）。
 *
 * Schema 未声明的键原样透传（例如尚未在 Schema 中登记的子插件配置切片），不做裁剪。
 */
function materializeVolatile(value: unknown, node: SchemaNode): any {
  if (node.meta?.volatile) {
    try {
      return createVolatileRef(value);
    } catch (error) {
      // 快照失败（函数 / 循环引用 / 类实例）不得让插件启动失败：降级为原始值，
      // 该字段退化为「不可热改」，其余字段的引用通道照常工作。
      console.warn(`[my-dsh-plugins] 配置字段快照失败，已降级为不可热改: ${String(error)}`);
      return value;
    }
  }

  if (node.type === 'object' && node.dict) {
    const source =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, any>)
        : {};
    const result: Record<string, any> = {};

    for (const [key, item] of Object.entries(source)) {
      const child = node.dict[key];
      result[key] = child ? materializeVolatile(item, child) : clonePlain(item);
    }
    // Schema 已声明但用户尚未填写的字段同样占位，避免引用集合为空导致保存被丢弃
    for (const [key, child] of Object.entries(node.dict)) {
      if (!(key in result)) result[key] = materializeVolatile(undefined, child);
    }
    return result;
  }

  return clonePlain(value);
}

/**
 * 校验并物化 DSH Profile 传入的配置（Standard Schema v1，同步实现）。
 *
 * Cordis v4 在插件启动前同步调用 `Config['~standard'].validate(config)` 并读取
 * `result.value`，因此这里严禁返回 Promise，否则 Cordis 会直接抛
 * `Async config validation is not supported`。
 *
 * 非法输入（`null` / 字符串 / 数字）降级为空对象后再物化，
 * 保持「宽松降级、永不产生 issues」的既有契约。
 */
function validateConfig(value: unknown): UmbrellaLoaderConfig {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return materializeVolatile(source, SCHEMA_ROOT) as UmbrellaLoaderConfig;
}

/**
 * 根插件配置契约对象：同时满足 Schemastery 与 Standard Schema v1。
 *
 * - **Schemastery 面**：`type` / `dict` / `meta` / `toJSON()` / `[Symbol.for('schemastery')]`，
 *   供 DSH `dsh-settings` 的 `volatileForm()` 自动投影出可视化表单。
 * - **Standard Schema 面**：`'~standard'` 同步返回 `{ value }`，供 Cordis v4 做启动前校验。
 * - 与真实 schemastery schema 一样可调用（`Config(data)` 直接返回校验结果）。
 *
 * 返回类型显式声明 `issues`：Cordis 会同步读取 `result.issues`（Standard Schema v1 契约）。
 * 本校验器是宽松降级实现，永远返回合法的 `{ value }`、从不产生 issues，故用 `undefined`
 * 精确表达，同时保持 `value` 必填以不削弱调用方类型安全。
 */
export const Config: any = Object.assign(
  function validatePluginConfig(data: unknown) {
    return validateConfig(data);
  },
  {
    [SCHEMASTER_SYMBOL]: true,
    '~standard': {
      version: 1,
      vendor: 'schemastery',
      validate(value: unknown): { value: UmbrellaLoaderConfig; issues?: undefined } {
        return { value: validateConfig(value) };
      },
    },
    /** 返回 plain schema 结构（**深拷贝**），而非 schemastery 原生的 `{ uid, refs }` 引用图 */
    toJSON(): SchemaNode {
      return cloneSchemaNode(SCHEMA_ROOT);
    },
    type: SCHEMA_ROOT.type,
    description: SCHEMA_ROOT.description,
    meta: { ...SCHEMA_ROOT.meta },
    dict: SCHEMA_DICT,
  },
);

// ── 双层配置加载 ──────────────────────────────────────────────────────────

/** 判断是否为可递归合并的纯对象（排除 null 与数组） */
function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 深拷贝纯对象，避免合并结果与入参共享引用。
 *
 * volatile 引用在此就地解包：引用是「运行时句柄」而非配置值，
 * 若被当作普通对象克隆，`get` 方法会混进配置树，彻底污染下游。
 */
function clonePlain(value: any): any {
  if (isVolatileRef(value)) return clonePlain(value.get());
  if (!isPlainObject(value)) return value;
  const copy: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = clonePlain(item);
  }
  return copy;
}

/**
 * 递归合并纯对象：`source` 覆盖 `target` 的同名标量，数组整体替换。
 *
 * 不修改任何入参，返回全新对象。
 */
export function deepMerge(target: any, source: any): any {
  if (!isPlainObject(source)) return clonePlain(source);

  const merged: Record<string, any> = isPlainObject(target) ? clonePlain(target) : {};
  for (const [key, value] of Object.entries(source)) {
    merged[key] = isPlainObject(value) && isPlainObject(merged[key])
      ? deepMerge(merged[key], value)
      : clonePlain(value);
  }
  return merged;
}

/**
 * 插值配置文本中的环境变量占位符（`${VAR_NAME}` 与 `${env:VAR_NAME}`）。
 *
 * - 变量已定义时替换为对应值（空串也是合法取值，照常替换）；
 * - 经 JSON.stringify 安全转义并剥离首尾引号，防止 Windows 路径反斜杠 `\`、双引号 `"` 等字符破坏 JSON 语法；
 * - 变量未定义时**原样保留占位符**，便于用户直观发现漏配的变量，
 *   而不是被静默替换成空串导致凭据以空值下发。
 *
 * 替换值经函数返回，因此变量内容中的 `$&` / `$1` 不会被当作替换模式二次解释。
 */
export function interpolateEnvVariables(raw: string): string {
  return raw.replace(ENV_PLACEHOLDER_PATTERN, (placeholder, varName: string) => {
    const value = process.env[varName];
    if (value === undefined) return placeholder;
    return JSON.stringify(value).slice(1, -1);
  });
}

/**
 * 读取 JSON 配置文件；文件缺失、不可读或内容非纯对象时统一返回空对象。
 *
 * 文件不存在（ENOENT）属正常情况，不告警；文件存在但解析失败则告警并带上绝对路径，
 * 避免用户填写的配置被静默忽略。
 */
function readJsonFile(filePath: string): Record<string, any> {
  try {
    // Windows 下记事本 / PowerShell `Set-Content -Encoding utf8` 会写入 UTF-8 BOM，
    // 而 JSON.parse 无法识别 BOM，必须先剥离，否则配置会被静默判定为损坏。
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    // 先剥离 BOM 再插值，最后才交给 JSON.parse：插值结果中的引号 / 反斜杠由 JSON 语法自行校验，
    // 若把插值提前到 BOM 剥离之前，BOM 会挡住首字符 `$` 的匹配。
    const parsed: unknown = JSON.parse(interpolateEnvVariables(raw));
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    // readFileSync 抛错说明文件不存在或不可读，属正常降级路径，无需打断用户。
    if ((error as any)?.code !== 'ENOENT') {
      console.warn(`[my-dsh-plugins] 配置文件解析失败，已忽略该文件: ${filePath}`, error);
    }
    return {};
  }
}

/**
 * 加载双层配置：`plugins.config.json` 为基底，`plugins.config.local.json` 深层覆盖。
 *
 * 任一文件缺失或损坏均平稳降级，最终至少返回 `{ plugins: {} }`。
 */
export function loadUmbrellaConfig(rootDir: string): UmbrellaLoaderConfig {
  const base = readJsonFile(path.join(rootDir, BASE_CONFIG_FILENAME));
  const local = readJsonFile(path.join(rootDir, LOCAL_CONFIG_FILENAME));
  const merged = deepMerge(base, local);

  return {
    ...merged,
    plugins: isPlainObject(merged.plugins) ? merged.plugins : {},
  };
}

/**
 * 提取单个子插件的配置切片。
 *
 * 返回的 `config` 已剥离加载器保留字段 `enabled`，避免污染子插件自身的 Schema 校验；
 * 未配置的插件默认 `{ enabled: true, config: {} }`。
 */
export function getPluginConfig(
  config: UmbrellaLoaderConfig,
  pluginKey: string,
): { enabled: boolean; config: Record<string, any> } {
  const section = config?.plugins?.[pluginKey];
  const { enabled, ...rest } = isPlainObject(section) ? section : {};

  return {
    enabled: enabled !== false,
    config: rest,
  };
}
