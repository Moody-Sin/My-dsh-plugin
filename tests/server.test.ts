import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { handleApiRequest, handleFetchRequest } from '../src/api.ts';

describe('API Route Handlers', () => {
  it('should handle GET /api/local-plugins/config', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-server-'));
    fs.writeFileSync(
      path.join(tmpDir, 'plugins.config.json'),
      JSON.stringify({ plugins: { notifier: { enabled: true } } }),
    );

    let statusCode = 0;
    let headers: any = {};
    let body = '';

    const req = { method: 'GET', url: '/api/local-plugins/config' };
    const res = {
      writeHead(code: number, h: any) {
        statusCode = code;
        headers = h;
      },
      end(data?: string) {
        body = data || '';
      },
    };

    const handled = await handleApiRequest(req as any, res as any, {
      projectRoot: tmpDir,
      logger: console,
      onConfigSaved: () => {},
    });

    assert.equal(handled, true);
    assert.equal(statusCode, 200);
    assert.equal(headers['content-type'], 'application/json; charset=utf-8');
    const data = JSON.parse(body);
    assert.equal(data.merged.plugins.notifier.enabled, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should handle POST /api/local-plugins/config and trigger callback', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-server-'));
    let callbackTriggered = false;

    let statusCode = 0;
    let body = '';
    const postPayload = JSON.stringify({
      target: 'local',
      config: { plugins: { notifier: { desktop: { enabled: true } } } },
    });

    const req = {
      method: 'POST',
      url: '/api/local-plugins/config',
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(postPayload);
      },
    };
    const res = {
      writeHead(code: number) {
        statusCode = code;
      },
      end(data?: string) {
        body = data || '';
      },
    };

    const handled = await handleApiRequest(req as any, res as any, {
      projectRoot: tmpDir,
      logger: console,
      onConfigSaved: () => {
        callbackTriggered = true;
      },
    });

    assert.equal(handled, true);
    assert.equal(statusCode, 200);
    assert.equal(callbackTriggered, true);
    const data = JSON.parse(body);
    assert.equal(data.ok, true);

    const savedLocal = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'plugins.config.local.json'), 'utf8'),
    );
    assert.equal(savedLocal.plugins.notifier.desktop.enabled, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should ignore non-api routes', async () => {
    const req = { method: 'GET', url: '/index.html' };
    const res = { writeHead() {}, end() {} };
    const handled = await handleApiRequest(req as any, res as any, {
      projectRoot: process.cwd(),
      logger: console,
      onConfigSaved: () => {},
    });
    assert.equal(handled, false);
  });

  describe('Fetch Handler (connection.fetch adapter)', () => {
    it('should handle GET /api/local-plugins/config via Request/Response', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-fetch-'));
      fs.writeFileSync(
        path.join(tmpDir, 'plugins.config.json'),
        JSON.stringify({ plugins: { notifier: { enabled: true } } }),
      );

      const request = new Request('http://127.0.0.1:3080/api/local-plugins/config', {
        method: 'GET',
      });

      const response = await handleFetchRequest(request, {
        projectRoot: tmpDir,
        logger: console,
        onConfigSaved: () => {},
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      const data = await response.json();
      assert.equal(data.merged.plugins.notifier.enabled, true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should handle POST /api/local-plugins/config via Request/Response and trigger callback', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-test-fetch-'));
      let callbackTriggered = false;

      const request = new Request('http://127.0.0.1:3080/api/local-plugins/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target: 'local',
          config: { plugins: { notifier: { desktop: { enabled: true } } } },
        }),
      });

      const response = await handleFetchRequest(request, {
        projectRoot: tmpDir,
        logger: console,
        onConfigSaved: () => {
          callbackTriggered = true;
        },
      });

      assert.equal(response.status, 200);
      assert.equal(callbackTriggered, true);
      const data = await response.json();
      assert.equal(data.ok, true);

      const savedLocal = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'plugins.config.local.json'), 'utf8'),
      );
      assert.equal(savedLocal.plugins.notifier.desktop.enabled, true);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('should return 404 for unmatched routes in handleFetchRequest', async () => {
      const request = new Request('http://127.0.0.1:3080/api/nonexistent', {
        method: 'GET',
      });

      const response = await handleFetchRequest(request, {
        projectRoot: process.cwd(),
        logger: console,
      });

      assert.equal(response.status, 404);
    });
  });
});
