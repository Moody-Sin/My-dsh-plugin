import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readMergedConfig, writeConfigFile } from '../src/api.ts';

describe('Config Storage API', () => {
  it('should read merged configuration correctly', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-api-'));
    fs.writeFileSync(
      path.join(tmpDir, 'plugins.config.json'),
      JSON.stringify({
        plugins: { notifier: { enabled: true, locale: 'zh' } },
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'plugins.config.local.json'),
      JSON.stringify({
        plugins: { notifier: { locale: 'en' } },
      }),
    );

    const result = readMergedConfig(tmpDir);
    assert.equal(result.merged.plugins?.notifier.enabled, true);
    assert.equal(result.merged.plugins?.notifier.locale, 'en');
    assert.equal(result.base.plugins?.notifier.locale, 'zh');
    assert.equal(result.local.plugins?.notifier.locale, 'en');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write to local config without corrupting file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-api-'));
    writeConfigFile(tmpDir, 'local', {
      plugins: { notifier: { desktop: { enabled: false } } },
    });

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'plugins.config.local.json'), 'utf8'),
    );
    assert.equal(content.plugins.notifier.desktop.enabled, false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should write to base config and preserve existing fields', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-api-'));
    fs.writeFileSync(
      path.join(tmpDir, 'plugins.config.json'),
      JSON.stringify({
        plugins: { notifier: { enabled: true, locale: 'zh' } },
      }),
    );

    writeConfigFile(tmpDir, 'base', {
      plugins: { notifier: { locale: 'en' } },
    });

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'plugins.config.json'), 'utf8'),
    );
    assert.equal(content.plugins.notifier.enabled, true);
    assert.equal(content.plugins.notifier.locale, 'en');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
