/**
 * Streamable HTTP 的处理函数，只用 Web 标准的 Request / Response，
 * 所以 Node、Cloudflare Workers、Deno 都能用。src/http.ts 是它的 Node 外壳。
 *
 * 无状态：每个请求新建一个 MCP 服务和传输（工具全部只读，不需要会话）；
 * Library 在请求之间共用，索引只建一次。
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { Library } from './library.js';
import { createServer } from './server.js';

export interface FetchHandlerOptions {
  /** MCP 端点的路径，默认 /mcp。 */
  path?: string;
  /** 允许的 Host 请求头。不填就不检查（放在反向代理后面时，Host 由代理决定）。 */
  allowedHosts?: string[];
  /**
   * 允许的浏览器来源（Origin 请求头），形如 `https://example.com`；`'*'` 表示全部允许。
   * 不带 Origin 的请求（命令行工具、服务器端的 AI 客户端）总是放行；
   * 带 Origin 而不在名单里的请求一律拒绝，这也挡住了 DNS 重绑定。默认是空名单。
   */
  allowedOrigins?: string[] | '*';
}

const CORS_ALLOW_HEADERS = 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, last-event-id';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function rpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return json(status, { jsonrpc: '2.0', error: { code: -32000, message }, id: null }, headers);
}

const normOrigin = (o: string) => o.trim().toLowerCase().replace(/\/+$/, '');

/** library 可以是一个固定的 Library，也可以是每次请求时取当前 Library 的函数（发布包切换后不用重启）。 */
export function createFetchHandler(library: Library | (() => Library), options: FetchHandlerOptions = {}) {
  const current = typeof library === 'function' ? library : () => library;
  const mcpPath = options.path ?? '/mcp';
  const allowedHosts = options.allowedHosts?.map((h) => h.trim().toLowerCase()).filter(Boolean);
  const anyOrigin = options.allowedOrigins === '*';
  const allowedOrigins = new Set(anyOrigin ? [] : ((options.allowedOrigins as string[] | undefined) ?? []).map(normOrigin));

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (allowedHosts && allowedHosts.length) {
      const host = (request.headers.get('host') ?? url.host).toLowerCase();
      if (!allowedHosts.includes(host)) return rpcError(403, `不允许的 Host：${host}`);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      const info = current().getLibraryInfo();
      return json(
        200,
        { ok: true, release: info.release, contract_version: info.contract_version, mcp: mcpPath },
        { 'cache-control': 'no-store' },
      );
    }
    if (url.pathname !== mcpPath) return rpcError(404, `没有这个地址，MCP 端点在 ${mcpPath}`);

    const origin = request.headers.get('origin');
    let cors: Record<string, string> = {};
    if (origin !== null) {
      if (!anyOrigin && !allowedOrigins.has(normOrigin(origin))) {
        return rpcError(403, `不允许的来源（Origin）：${origin}`, { vary: 'Origin' });
      }
      cors = {
        'access-control-allow-origin': origin,
        'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
        vary: 'Origin',
      };
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': CORS_ALLOW_HEADERS,
          'access-control-max-age': '86400',
        },
      });
    }

    // 无状态模式下没有服务端推送，也没有可结束的会话，只接受 POST
    if (request.method !== 'POST') return rpcError(405, '只支持 POST', { allow: 'POST, OPTIONS', ...cors });

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createServer(current());
    try {
      await server.connect(transport);
      // 开了 enableJsonResponse，返回时响应已经完整，可以马上收尾
      const response = await transport.handleRequest(request);
      void server.close().catch(() => {});
      if (origin === null) return response;
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      return new Response(response.body, { status: response.status, headers });
    } catch (err) {
      void server.close().catch(() => {});
      console.error('[game-design-library] 处理请求出错：', err);
      return rpcError(500, '服务内部错误', cors);
    }
  };
}
