#!/usr/bin/env node
/**
 * Streamable HTTP 的 Node 入口。默认只监听 127.0.0.1；监听地址、端口、数据来源、
 * 允许的浏览器来源都由命令行或环境变量决定（见 sources.ts 里的 USAGE）。
 * 服务本身不做 TLS 和限流，对外提供时必须放在反向代理后面。
 * 真正的处理逻辑在 fetch-handler.ts；这里只把 Node 的请求和响应转成 Web 标准的 Request / Response。
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createFetchHandler } from './fetch-handler.js';
import { Library, errorText } from './library.js';
import { USAGE, UrlSource, parseArgs, readCurrentRelease, resolveSourceInfo, siteReleaseUrl } from './sources.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_REFRESH_SECONDS = 300;
const MAX_BODY_BYTES = 1024 * 1024;
const TAG = '[game-design-library]';

async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function describe(library: Library): string {
  const info = library.getLibraryInfo();
  return `发布包 ${info.release}（约定 ${info.contract_version}）：${info.collections.map((c) => `${c.id} ${c.count}`).join('，')}；来源 ${info.source}`;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.error(USAGE);
    return;
  }
  const env = process.env;
  const host = opts.host ?? (env.GDL_HTTP_HOST || DEFAULT_HOST);
  const port = opts.port ?? (env.GDL_HTTP_PORT ? Number(env.GDL_HTTP_PORT) : DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`端口号不对：${env.GDL_HTTP_PORT}`);
  const refreshSeconds = env.GDL_REFRESH_SECONDS ? Number(env.GDL_REFRESH_SECONDS) : DEFAULT_REFRESH_SECONDS;
  if (!Number.isFinite(refreshSeconds) || refreshSeconds < 0) {
    throw new Error(`GDL_REFRESH_SECONDS 不对：${env.GDL_REFRESH_SECONDS}`);
  }
  const origins = list(env.GDL_ALLOWED_ORIGINS);
  const allowedOrigins = origins.includes('*') ? ('*' as const) : origins;
  const allowedHosts = list(env.GDL_ALLOWED_HOSTS);
  const accessLog = env.GDL_ACCESS_LOG === '1' || env.GDL_ACCESS_LOG === 'true';

  const resolved = await resolveSourceInfo(opts);
  let library = await Library.load(resolved.source);
  for (const s of library.skipped) console.error(`${TAG} 跳过库 ${s.id}：${s.reason}`);

  const handle = createFetchHandler(() => library, { allowedHosts, allowedOrigins });

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    if (accessLog) {
      res.on('finish', () => {
        const pathOnly = (req.url ?? '/').split('?')[0];
        console.error(`${TAG} ${req.method} ${pathOnly} ${res.statusCode} ${Date.now() - started}ms`);
      });
    }
    void (async () => {
      try {
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const body = hasBody ? await readBody(req) : undefined;
        if (body === null) {
          res.writeHead(413, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' }).end('请求体太大');
          return;
        }
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (Array.isArray(v)) for (const item of v) headers.append(k, item);
          else if (v !== undefined) headers.set(k, v);
        }
        const request = new Request(`http://${req.headers.host ?? `127.0.0.1:${port}`}${req.url ?? '/'}`, {
          method: req.method,
          headers,
          body: body && body.length ? new Uint8Array(body) : undefined,
        });
        const response = await handle(request);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (err) {
        console.error(`${TAG} 处理请求出错：`, err);
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('服务内部错误');
      }
    })();
  });

  // 跟随网站的 current.json：定时看发布编号有没有变，变了就在后台加载新包，加载成功后再切换；失败则继续用旧包。
  let timer: NodeJS.Timeout | undefined;
  if (resolved.follow && refreshSeconds > 0) {
    const { siteUrl } = resolved.follow;
    let release = resolved.follow.release;
    let busy = false;
    timer = setInterval(() => {
      if (busy) return;
      busy = true;
      void (async () => {
        try {
          const latest = await readCurrentRelease(siteUrl, false);
          if (latest === release) return;
          const next = await Library.load(new UrlSource(siteReleaseUrl(siteUrl, latest)));
          library = next;
          release = latest;
          console.error(`${TAG} 网站换了发布包，已切换到${describe(next)}`);
        } catch (err) {
          console.error(`${TAG} 检查新发布包失败，继续用 ${release}：${errorText(err)}`);
        } finally {
          busy = false;
        }
      })();
    }, refreshSeconds * 1000);
    timer.unref();
  }

  httpServer.on('error', (err) => {
    console.error(`${TAG} HTTP 服务出错：${errorText(err)}`);
    process.exit(1);
  });
  httpServer.listen(port, host, () => {
    const addr = httpServer.address();
    const actual = typeof addr === 'object' && addr ? addr.port : port;
    const shown = host.includes(':') ? `[${host}]` : host;
    const originText =
      allowedOrigins === '*' ? '全部' : allowedOrigins.length ? allowedOrigins.join('、') : '无（不带 Origin 的请求不受影响）';
    const followText = resolved.follow
      ? refreshSeconds > 0
        ? `每 ${refreshSeconds} 秒检查一次网站的 current.json`
        : '只在启动时读 current.json'
      : '发布包固定，换包需重启';
    console.error(`${TAG} 已加载${describe(library)}`);
    console.error(
      `${TAG} 允许的浏览器来源：${originText}；Host 检查：${allowedHosts.length ? allowedHosts.join('、') : '关'}；${followText}`,
    );
    // 这一行供脚本识别服务已就绪
    console.error(`${TAG} listening http://${shown}:${actual}/mcp`);
  });

  const stop = () => {
    if (timer) clearInterval(timer);
    httpServer.close(() => process.exit(0));
    httpServer.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(`${TAG} 启动失败：${errorText(err)}`);
  process.exit(1);
});
