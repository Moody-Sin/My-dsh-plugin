import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');

test('manifest: package.json has valid DSH bundle metadata', () => {
  const pkgPath = path.join(pkgDir, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  assert.equal(pkg.name, '@local/dsh-notifier');
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.dsh, 'pkg.dsh must be defined');
  assert.equal(pkg.dsh.bundle?.patch, './cordis.patch.yml');
  assert.equal(pkg.exports?.['.'], './index.js');
  assert.equal(pkg.exports?.['./icon'], './icon.svg');
  assert.equal(pkg.exports?.['./locale/*.json'], './locale/*.json');
});

test('manifest: cordis.patch.yml exists and declares notifier entry', () => {
  const patchPath = path.join(pkgDir, 'cordis.patch.yml');
  assert.ok(fs.existsSync(patchPath), 'cordis.patch.yml must exist');
  const content = fs.readFileSync(patchPath, 'utf-8');
  assert.match(content, /id:\s*notifier/);
  assert.match(content, /name:\s*['"]?@local\/dsh-notifier['"]?/);
});

test('manifest: locale zh and en files have valid meta titles and descriptions', () => {
  const zhPath = path.join(pkgDir, 'locale', 'zh.json');
  const enPath = path.join(pkgDir, 'locale', 'en.json');
  assert.ok(fs.existsSync(zhPath), 'locale/zh.json must exist');
  assert.ok(fs.existsSync(enPath), 'locale/en.json must exist');

  const zh = JSON.parse(fs.readFileSync(zhPath, 'utf-8'));
  const en = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
  assert.ok(zh.meta?.title, 'zh meta.title must exist');
  assert.ok(zh.meta?.description, 'zh meta.description must exist');
  assert.ok(en.meta?.title, 'en meta.title must exist');
  assert.ok(en.meta?.description, 'en meta.description must exist');
});

test('manifest: icon.svg exists and is valid svg under 256KB', () => {
  const iconPath = path.join(pkgDir, 'icon.svg');
  assert.ok(fs.existsSync(iconPath), 'icon.svg must exist');
  const stat = fs.statSync(iconPath);
  assert.ok(stat.size > 0 && stat.size < 256 * 1024, 'icon.svg must be < 256KB');
  const content = fs.readFileSync(iconPath, 'utf-8');
  assert.match(content, /<svg[^>]*>/);
  assert.match(content, /<\/svg>/);
});
