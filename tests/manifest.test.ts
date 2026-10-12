import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 根包元数据规范校验。
 *
 * 这些字段（`exports` / `files` / `icon.svg` / `locale/*.json`）是 DSH 官方 Bundle 识别
 * 图标与本地化文案的唯一入口，缺失不会导致运行时报错，只会在宿主界面静默丢图标与文案，
 * 因此必须用测试把契约钉死。
 */
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 读取并解析根 `package.json` */
function readRootPackage(): any {
  const raw = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

test('manifest: 根包名与 Bundle Patch 声明保持稳定', () => {
  const pkg = readRootPackage();

  assert.equal(pkg.name, '@local/my-dsh-plugins', '包名是 resolveProjectRoot 向上查找的唯一身份依据');
  assert.equal(pkg.type, 'module', 'ESM 动态 import 依赖 type: module');
  assert.equal(pkg.main, './index.js');
  assert.deepEqual(pkg.exports['.'], './index.js');
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml', 'DSH Bundle 接入点不得被改动');
});

test('manifest: exports 暴露图标与本地化文件子路径', () => {
  const pkg = readRootPackage();

  assert.equal(pkg.exports['./icon'], './icon.svg', '必须暴露 ./icon 子路径供 DSH 读取 Bundle 图标');
  assert.equal(
    pkg.exports['./locale/*.json'],
    './locale/*.json',
    '必须暴露 ./locale/*.json 子路径供 DSH 读取本地化文案',
  );
});

test('manifest: files 白名单包含图标与本地化文件', () => {
  const files: string[] = readRootPackage().files;

  assert.ok(Array.isArray(files));
  for (const expected of ['index.js', 'cordis.patch.yml', 'icon.svg', 'locale/*.json']) {
    assert.ok(files.includes(expected), `files 必须包含 ${expected}，否则发布产物会丢文件`);
  }
});

test('manifest: exports / files 声明的资源在磁盘上真实存在', () => {
  const pkg = readRootPackage();

  for (const relative of [pkg.exports['./icon'], 'cordis.patch.yml', pkg.main]) {
    assert.ok(fs.existsSync(path.join(rootDir, relative)), `${relative} 已声明但磁盘上不存在`);
  }
  assert.ok(fs.statSync(path.join(rootDir, 'locale')).isDirectory(), 'locale 必须是目录');
});

test('manifest: clean 脚本清理根与子插件的构建产物', () => {
  const clean: string = readRootPackage().scripts?.clean;

  assert.equal(typeof clean, 'string', '必须提供 clean 脚本');
  assert.match(clean, /index\.js/, 'clean 必须清理根 Loader 产物');
  assert.match(clean, /dsh-notifier\/index\.js/, 'clean 必须一并清理子插件产物');
});

// ── icon.svg ──────────────────────────────────────────────────────────────

test('icon.svg: 是合法且体积达标的 SVG 图标', () => {
  const iconPath = path.join(rootDir, 'icon.svg');
  const stat = fs.statSync(iconPath);
  const svg = fs.readFileSync(iconPath, 'utf8');

  assert.ok(stat.size < 50 * 1024, `icon.svg 必须小于 50KB，实际 ${stat.size} 字节`);
  assert.match(svg, /^<svg[\s>]/, '必须以 <svg> 根元素开头');
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, '必须声明 SVG 命名空间');
  assert.match(svg, /viewBox="0 0 64 64"/, '必须声明 viewBox 以保证任意尺寸下正确缩放');
  assert.ok(svg.trimEnd().endsWith('</svg>'), '标签必须闭合');
  // 宿主会以 <img> 形式加载，脚本与外部引用一律不可用
  assert.equal(/<script/i.test(svg), false, 'SVG 图标严禁内嵌脚本');
  assert.equal(/xlink:href|href="https?:/i.test(svg), false, 'SVG 图标严禁引用外部资源');
});

// ── locale ────────────────────────────────────────────────────────────────

test('locale: 中英文文案齐备且结构符合 DSH 规范', () => {
  const zh = JSON.parse(fs.readFileSync(path.join(rootDir, 'locale', 'zh.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(rootDir, 'locale', 'en.json'), 'utf8'));

  assert.equal(zh.meta?.title, '聚合插件总线');
  assert.equal(zh.meta?.description, 'DeepSeek Harness 本地定制插件合集与自动扫描总线加载器。');
  assert.equal(en.meta?.title, 'Umbrella Plugins Loader');
  assert.equal(
    en.meta?.description,
    'DeepSeek Harness umbrella loader and bundle manager for local plugins.',
  );
});

test('locale: 两份文案的 meta 键集合完全一致', () => {
  const zh = JSON.parse(fs.readFileSync(path.join(rootDir, 'locale', 'zh.json'), 'utf8'));
  const en = JSON.parse(fs.readFileSync(path.join(rootDir, 'locale', 'en.json'), 'utf8'));

  assert.deepEqual(
    Object.keys(zh.meta).sort(),
    Object.keys(en.meta).sort(),
    '任一语言缺键都会导致该语言下文案回退或留空',
  );
});
