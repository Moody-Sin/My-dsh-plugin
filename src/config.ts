import fs from 'node:fs';
import path from 'node:path';

/** 公开基础配置文件名（随 Git 提交，存放通用默认值） */
const BASE_CONFIG_FILENAME = 'plugins.config.json';
/** 本地私有覆盖文件名（已加入 .gitignore，存放密钥等敏感覆盖值） */
const LOCAL_CONFIG_FILENAME = 'plugins.config.local.json';

/**
 * 聚合加载器自身的配置模型。
 *
 * `plugins` 为各子插件配置切片集合，键名由子插件目录名剥离 `dsh-` 前缀推导。
 */
export interface UmbrellaLoaderConfig {
  /** 基础配置文件名，默认 `plugins.config.json` */
  configFile?: string;
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

/** 读取 JSON 配置文件；文件缺失、不可读或内容非纯对象时统一返回空对象 */
function readJsonFile(filePath: string): Record<string, any> {
  try {
    // Windows 下记事本 / PowerShell `Set-Content -Encoding utf8` 会写入 UTF-8 BOM，
    // 而 JSON.parse 无法识别 BOM，必须先剥离，否则配置会被静默判定为损坏。
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
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
 * `result.value`，因此这里严禁返回 Promise，详见 Lessons Learned #3。
 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'schemastery',
    validate(value: unknown): { value: UmbrellaLoaderConfig } {
      return { value: isPlainObject(value) ? (value as UmbrellaLoaderConfig) : {} };
    },
  },
};
