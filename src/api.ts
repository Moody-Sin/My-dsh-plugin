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

export interface ApiHandlerContext {
  projectRoot: string;
  logger: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void };
  onConfigSaved?: () => void;
  triggerTestNotify?: () => Promise<any>;
}

/**
 * 处理本地插件设置相关的 HTTP REST API 请求。
 * 返回 true 表示该请求已被捕获并处理；false 表示非目标路由。
 */
export async function handleApiRequest(
  req: any,
  res: any,
  ctx: ApiHandlerContext,
): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = url.pathname;

  // 1. 获取配置与插件信息
  if (pathname === '/api/local-plugins/config' && req.method === 'GET') {
    try {
      const configData = readMergedConfig(ctx.projectRoot);
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(configData));
    } catch (err: any) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    }
    return true;
  }

  // 2. 保存配置并触发热重载
  if (pathname === '/api/local-plugins/config' && req.method === 'POST') {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = JSON.parse(raw || '{}');
      const target = body.target === 'base' ? 'base' : 'local';
      const config = body.config || {};

      writeConfigFile(ctx.projectRoot, target, config);
      ctx.onConfigSaved?.();

      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify({ ok: true, target }));
    } catch (err: any) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    }
    return true;
  }

  // 3. 触发通知连通性测试
  if (pathname === '/api/local-plugins/test-notify' && req.method === 'POST') {
    try {
      let result: any = { ok: true, message: '通知测试已发送' };
      if (typeof ctx.triggerTestNotify === 'function') {
        result = await ctx.triggerTestNotify();
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    }
    return true;
  }

  return false;
}

/**
 * 将标准 Web Request 适配并转发至 REST API 处理。
 * 供 `connection.fetch.register` 注册的标准 Fetch API 调用。
 */
export async function handleFetchRequest(
  request: Request,
  ctx: ApiHandlerContext,
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === '/api/local-plugins/config' && request.method === 'GET') {
    try {
      const configData = readMergedConfig(ctx.projectRoot);
      return new Response(JSON.stringify(configData), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ ok: false, error: err?.message || String(err) }),
        {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        },
      );
    }
  }

  if (pathname === '/api/local-plugins/config' && request.method === 'POST') {
    try {
      const body = (await request.json()) as any;
      const target = body?.target === 'base' ? 'base' : 'local';
      const config = body?.config || {};

      writeConfigFile(ctx.projectRoot, target, config);
      ctx.onConfigSaved?.();

      return new Response(JSON.stringify({ ok: true, target }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ ok: false, error: err?.message || String(err) }),
        {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        },
      );
    }
  }

  if (pathname === '/api/local-plugins/test-notify' && request.method === 'POST') {
    try {
      let result: any = { ok: true, message: '通知测试已发送' };
      if (typeof ctx.triggerTestNotify === 'function') {
        result = await ctx.triggerTestNotify();
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ ok: false, error: err?.message || String(err) }),
        {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        },
      );
    }
  }

  return new Response('Not Found', { status: 404 });
}
