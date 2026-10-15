import fs from 'node:fs';
import path from 'node:path';
import {
  BASE_CONFIG_FILENAME,
  LOCAL_CONFIG_FILENAME,
  deepMerge,
  type UmbrellaLoaderConfig,
} from './config.ts';

export interface ConfigReadResult {
  base: UmbrellaLoaderConfig;
  local: UmbrellaLoaderConfig;
  merged: UmbrellaLoaderConfig;
}

/**
 * 读取当前目录下的公开基础配置与本地覆盖配置，并执行深层合并。
 */
export function readMergedConfig(projectRoot: string): ConfigReadResult {
  let base: UmbrellaLoaderConfig = {};
  let local: UmbrellaLoaderConfig = {};

  const basePath = path.join(projectRoot, BASE_CONFIG_FILENAME);
  const localPath = path.join(projectRoot, LOCAL_CONFIG_FILENAME);

  if (fs.existsSync(basePath)) {
    try {
      const raw = fs.readFileSync(basePath, 'utf8').replace(/^\uFEFF/, '');
      base = JSON.parse(raw);
    } catch {
      base = {};
    }
  }

  if (fs.existsSync(localPath)) {
    try {
      const raw = fs.readFileSync(localPath, 'utf8').replace(/^\uFEFF/, '');
      local = JSON.parse(raw);
    } catch {
      local = {};
    }
  }

  const merged = deepMerge(base, local) as UmbrellaLoaderConfig;
  return { base, local, merged };
}

/**
 * 将部分配置写入指定的配置文件（'base' 对应 plugins.config.json，'local' 对应 plugins.config.local.json）。
 * 采用原子写入方式（先写临时文件后 rename），避免进程中断导致损坏。
 */
export function writeConfigFile(
  projectRoot: string,
  target: 'base' | 'local',
  partialConfig: Record<string, any>,
): void {
  const filename = target === 'base' ? BASE_CONFIG_FILENAME : LOCAL_CONFIG_FILENAME;
  const filePath = path.join(projectRoot, filename);

  let existing: Record<string, any> = {};
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      existing = JSON.parse(raw);
    } catch {
      existing = {};
    }
  }

  const next = deepMerge(existing, partialConfig);
  const serialized = JSON.stringify(next, null, 2) + '\n';

  const tmpPath = path.join(projectRoot, `.${filename}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmpPath, serialized, 'utf8');
  fs.renameSync(tmpPath, filePath);
}
