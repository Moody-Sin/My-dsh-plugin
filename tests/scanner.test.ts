import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { scanPlugins } from '../src/scanner.ts';

/** 夹具中应被识别的子插件目录，同时即字母序期望值（创建顺序与之不同，可验证排序生效） */
const MATCHED_DIRS = ['dsh-bar', 'dsh-exports', 'dsh-foo', 'dsh-priority'];

let rootDir = '';

/** 在夹具根目录写入文件（自动创建父目录），返回绝对路径 */
function writeFile(relativePath: string, content = 'export default {};'): string {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

/** 写入子插件 package.json */
function writePackage(dirName: string, pkg: unknown): void {
  writeFile(path.join(dirName, 'package.json'), JSON.stringify(pkg, null, 2));
}

before(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umbrella-scanner-'));

  // 命中：根级 index.js
  writeFile('dsh-foo/index.js');
  // 命中：package.json 的 main 指向入口
  writeFile('dsh-bar/lib/entry.js');
  writePackage('dsh-bar', { name: '@local/dsh-bar', main: './lib/entry.js' });
  // 命中：package.json 的 exports 条件对象指向入口
  writeFile('dsh-exports/dist/index.js');
  writePackage('dsh-exports', { exports: { '.': { import: './dist/index.js' } } });
  // 命中：index.js 优先于 package.json 声明的入口
  writeFile('dsh-priority/index.js');
  writeFile('dsh-priority/main.js');
  writePackage('dsh-priority', { main: './main.js' });

  // 忽略：缺少 dsh- 前缀
  writeFile('other-dir/index.js');
  // 忽略：同名文件而非目录
  writeFile('dsh-notes.md', '# 备注');
  // 忽略：目录为空，无有效入口
  fs.mkdirSync(path.join(rootDir, 'dsh-empty'), { recursive: true });
  // 忽略：package.json 声明的入口文件并不存在
  writePackage('dsh-missing', { main: './lib/gone.js' });
  // 忽略：保留目录；node_modules 内即使存在 dsh-* 目录也不得递归命中（workspaces 软链场景）
  writeFile('node_modules/dsh-nested/index.js');
  for (const dirName of ['.git', '.superpowers']) {
    fs.mkdirSync(path.join(rootDir, dirName), { recursive: true });
  }
});

after(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

test('scanPlugins: 仅识别以 dsh- 开头且含有效入口的目录', () => {
  const dirNames = scanPlugins(rootDir).map((plugin) => plugin.dirName);

  assert.deepEqual(dirNames, MATCHED_DIRS);
});

test('scanPlugins: pluginKey 由目录名剥离 dsh- 前缀推导', () => {
  const keys = Object.fromEntries(scanPlugins(rootDir).map((plugin) => [plugin.dirName, plugin.pluginKey]));

  assert.deepEqual(keys, {
    'dsh-bar': 'bar',
    'dsh-exports': 'exports',
    'dsh-foo': 'foo',
    'dsh-priority': 'priority',
  });
});

test('scanPlugins: 入口解析遵循 index.js 优先，其次 package.json 的 main / exports', () => {
  const byDir = new Map(scanPlugins(rootDir).map((plugin) => [plugin.dirName, plugin]));

  assert.equal(byDir.get('dsh-foo')?.entryPath, path.join(rootDir, 'dsh-foo', 'index.js'));
  assert.equal(byDir.get('dsh-bar')?.entryPath, path.join(rootDir, 'dsh-bar', 'lib', 'entry.js'));
  assert.equal(byDir.get('dsh-exports')?.entryPath, path.join(rootDir, 'dsh-exports', 'dist', 'index.js'));
  assert.equal(
    byDir.get('dsh-priority')?.entryPath,
    path.join(rootDir, 'dsh-priority', 'index.js'),
    'index.js 必须优先于 package.json 声明的入口',
  );
});

test('scanPlugins: entryUrl 为跨平台安全的 file:/// URL', () => {
  for (const plugin of scanPlugins(rootDir)) {
    assert.equal(plugin.entryUrl, pathToFileURL(plugin.entryPath).href);
    assert.ok(plugin.entryUrl.startsWith('file:///'), `${plugin.dirName} 的 entryUrl 必须为 file:/// 协议`);
    assert.equal(plugin.entryUrl.includes('\\'), false, 'URL 中严禁出现 Windows 反斜杠');
    assert.equal(fileURLToPath(plugin.entryUrl), plugin.entryPath, 'entryUrl 必须可无损还原为物理路径');
    assert.equal(plugin.dirPath, path.join(rootDir, plugin.dirName));
    assert.ok(path.isAbsolute(plugin.dirPath) && path.isAbsolute(plugin.entryPath));
  }
});

test('scanPlugins: 结果按 dirName 字母序稳定排列', () => {
  const first = scanPlugins(rootDir).map((plugin) => plugin.dirName);
  const second = scanPlugins(rootDir).map((plugin) => plugin.dirName);

  assert.deepEqual(first, MATCHED_DIRS, '结果必须按 dirName 字母序排列');
  assert.deepEqual(second, first, '多次扫描的结果顺序必须稳定');
});

test('scanPlugins: package.json 损坏时跳过该目录并输出中文告警', (t) => {
  writeFile('dsh-broken/package.json', '{ "main": ');
  t.after(() => fs.rmSync(path.join(rootDir, 'dsh-broken'), { recursive: true, force: true }));

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    const dirNames = scanPlugins(rootDir).map((plugin) => plugin.dirName);

    assert.deepEqual(dirNames, MATCHED_DIRS, '损坏的 package.json 不得导致目录被误识别，也不得中断整体扫描');
    assert.equal(warnings.length, 1, '损坏的 package.json 必须输出告警，杜绝静默跳过');
    assert.match(warnings[0], /dsh-broken/);
  } finally {
    console.warn = originalWarn;
  }
});

// ── 目录符号链接（含 Windows junction）────────────────────────────────────

/**
 * 创建目录软链；平台不支持（无权限 / 需开发者模式）时返回 `false`，
 * 由调用方诚实跳过而非误报失败。
 *
 * Windows 上 junction 无需管理员权限，因此优先使用；失败再退回 dir 类型。
 */
function trySymlinkDir(targetPath: string, linkPath: string): boolean {
  for (const type of ['junction', 'dir'] as const) {
    try {
      fs.symlinkSync(targetPath, linkPath, type);
      return true;
    } catch {
      // 换下一种类型重试
    }
  }
  return false;
}

test('scanPlugins: 目录软链（含 Windows junction）同样能被扫描到', (t) => {
  // 真实插件放在仓库外层的普通目录，通过软链接挂进根目录 —— 正是 workspaces 软链场景
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umbrella-symlink-target-'));
  fs.writeFileSync(path.join(realDir, 'index.js'), 'export default {};', 'utf8');

  const linkPath = path.join(rootDir, 'dsh-linked');
  if (!trySymlinkDir(realDir, linkPath)) {
    fs.rmSync(realDir, { recursive: true, force: true });
    t.skip('当前环境不允许创建目录软链（需开发者模式或管理员权限）');
    return;
  }
  t.after(() => {
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(realDir, { recursive: true, force: true });
  });

  const scanned = scanPlugins(rootDir);
  const linked = scanned.find((plugin) => plugin.dirName === 'dsh-linked');

  assert.ok(linked, '目录软链必须被识别为子插件目录，否则 Windows junction 场景会整片漏扫');
  assert.equal(linked.pluginKey, 'linked');
  // dirPath / entryPath 保持软链路径形态，与 readdir 得到的目录项一致
  assert.equal(linked.dirPath, linkPath);
  assert.equal(linked.entryPath, path.join(linkPath, 'index.js'));
  assert.ok(fs.existsSync(linked.entryPath), '解析出的入口必须真实可读');
  // 排序仍须稳定
  assert.deepEqual(
    scanned.map((plugin) => plugin.dirName),
    [...MATCHED_DIRS, 'dsh-linked'].sort((a, b) => a.localeCompare(b)),
  );
});

test('scanPlugins: 悬空软链被安全跳过，不中断整体扫描', (t) => {
  const linkPath = path.join(rootDir, 'dsh-dangling');
  if (!trySymlinkDir(path.join(os.tmpdir(), 'umbrella-not-exist-target'), linkPath)) {
    t.skip('当前环境不允许创建目录软链');
    return;
  }
  t.after(() => fs.rmSync(linkPath, { force: true }));

  // statSync 对悬空链接会抛 ENOENT，必须被捕获并保守判为非目录
  const dirNames = scanPlugins(rootDir).map((plugin) => plugin.dirName);

  assert.deepEqual(dirNames, MATCHED_DIRS, '悬空软链必须被跳过，且不得影响其余目录');
});

test('scanPlugins: 指向文件的软链不被误判为插件目录', (t) => {
  const targetFile = path.join(rootDir, 'plain-entry.js');
  fs.writeFileSync(targetFile, 'export default {};', 'utf8');

  const linkPath = path.join(rootDir, 'dsh-file-link');
  try {
    fs.symlinkSync(targetFile, linkPath, 'file');
  } catch {
    fs.rmSync(targetFile, { force: true });
    t.skip('当前环境不允许创建文件软链');
    return;
  }
  t.after(() => {
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(targetFile, { force: true });
  });

  const dirNames = scanPlugins(rootDir).map((plugin) => plugin.dirName);

  assert.deepEqual(dirNames, MATCHED_DIRS, '指向文件的软链不是目录，严禁被当作子插件');
});
