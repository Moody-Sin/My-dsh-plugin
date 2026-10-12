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

/** 判断是否为可递归合并的纯对象（排除 null 与数组） */
function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 深拷贝纯对象，避免合并结果与入参共享引用 */
function clonePlain(value: any): any {
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
 * - 变量未定义时**原样保留占位符**，便于用户直观发现漏配的变量，
 *   而不是被静默替换成空串导致凭据以空值下发。
 *
 * 替换值经函数返回，因此变量内容中的 `$&` / `$1` 不会被当作替换模式二次解释。
 */
export function interpolateEnvVariables(raw: string): string {
  return raw.replace(ENV_PLACEHOLDER_PATTERN, (placeholder, varName: string) => {
    const value = process.env[varName];
    return value === undefined ? placeholder : value;
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

/**
 * 根插件配置校验器（Standard Schema v1，同步实现）。
 *
 * Cordis v4 在插件启动前同步调用 `Config['~standard'].validate(config)` 并读取
 * `result.value`，因此这里严禁返回 Promise，否则 Cordis 会直接抛
 * `Async config validation is not supported`。
 *
 * 返回类型显式声明 `issues`：Cordis 会同步读取 `result.issues`（Standard Schema v1 契约）。
 * 本校验器是宽松降级实现，永远返回合法的 `{ value }`、从不产生 issues，故用 `undefined`
 * 精确表达，同时保持 `value` 必填以不削弱调用方类型安全。
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'schemastery',
    validate(value: unknown): { value: UmbrellaLoaderConfig; issues?: undefined } {
      return { value: isPlainObject(value) ? (value as UmbrellaLoaderConfig) : {} };
    },
  },
};
