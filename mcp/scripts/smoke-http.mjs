// HTTP 入口的冒烟测试：用 SDK 客户端走 Streamable HTTP 做初始化、列工具、一次 search、一次取卡，再查健康检查和 Origin 白名单。
// 这个脚本不依赖具体的发布内容，换了发布包也能用。先 npm run build。
//
// 三种用法：
//   node scripts/smoke-http.mjs [发布包目录]             在本机起一个服务（随机端口），数据来自本地目录，测完关掉
//   node scripts/smoke-http.mjs --site-url <网站地址>    在本机起一个服务，数据来自已部署的网站（跟随 current.json）
//   node scripts/smoke-http.mjs --url <MCP 网址>         不起服务，直接测一个已经在运行的地址，例如 https://mcp.example.com/mcp
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { defaultReleaseDir } from './release-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const remoteUrl = flag('--url');
const siteUrl = flag('--site-url');
const ALLOWED_ORIGIN = 'https://allowed.example';
const EVIL_ORIGIN = 'https://evil.example';
const INIT = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'gdl-smoke-origin', version: '0.0.0' } },
});
const postInit = (url, origin) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(origin ? { origin } : {}) },
    body: INIT,
  });

let child = null;
let failed = 0;
try {
  let url = remoteUrl;
  if (!url) {
    const source = siteUrl ? ['--site-url', siteUrl] : ['--release-dir', path.resolve(args[0] ?? defaultReleaseDir())];
    // 端口填 0，让系统挑一个空闲端口；服务就绪后会在标准错误里打印实际地址
    child = spawn(process.execPath, [path.join(here, '..', 'dist', 'http.js'), ...source, '--port', '0'], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, GDL_HTTP_HOST: '127.0.0.1', GDL_ALLOWED_ORIGINS: ALLOWED_ORIGIN, GDL_ALLOWED_HOSTS: '' },
    });
    url = await new Promise((resolve, reject) => {
      let log = '';
      const timer = setTimeout(() => reject(new Error(`服务 60 秒内没有就绪：${log}`)), 60_000);
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        log += chunk;
        const m = log.match(/listening (http:\/\/\S+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      child.on('exit', (code) => reject(new Error(`服务提前退出（${code}）：${log}`)));
    });
    console.log(`服务已启动：${url}`);
  } else {
    console.log(`测试已有的服务：${url}`);
  }

  const client = new Client({ name: 'gdl-smoke-http', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  console.log(`通过  初始化  —— ${client.getServerVersion()?.name} ${client.getServerVersion()?.version}`);

  const { tools } = await client.listTools();
  if (tools.length !== 6) throw new Error(`工具应为 6 个，实际 ${tools.length}`);
  console.log(`通过  列出工具  —— ${tools.map((t) => t.name).sort().join(', ')}`);

  const text = (res) => res.content?.[0]?.text ?? '';
  const infoRes = await client.callTool({ name: 'get_library_info', arguments: {} });
  if (infoRes.isError) throw new Error(`get_library_info 出错：${text(infoRes)}`);
  const info = JSON.parse(text(infoRes));
  console.log(`通过  get_library_info  —— 发布包 ${info.release}；${info.collections.map((c) => `${c.id} ${c.count}`).join('，')}`);

  const firstGroup = (await client.callTool({ name: 'list_collections', arguments: {} }).then((r) => JSON.parse(text(r)))).collections[0];
  const listed = JSON.parse(
    text(await client.callTool({ name: 'list_group', arguments: { collection: firstGroup.id, group: firstGroup.groups[0].id, limit: 2 } })),
  );
  const sample = listed.entries[0];
  if (!sample?.id) throw new Error('list_group 没有返回条目');
  const word = sample.name.slice(0, 2);
  const res = await client.callTool({ name: 'search', arguments: { query: word, limit: 3 } });
  const data = JSON.parse(text(res));
  if (res.isError || data.total <= 0 || data.results.length < 1) throw new Error(`search 结果不对：${text(res).slice(0, 200)}`);
  console.log(`通过  search “${word}”  —— 共 ${data.total} 条，第一条 ${data.results[0].id}`);

  const entry = JSON.parse(text(await client.callTool({ name: 'get_entry', arguments: { id: sample.id } })));
  if (entry.id !== sample.id || !entry.body) throw new Error(`get_entry ${sample.id} 没有取到正文`);
  console.log(`通过  get_entry ${sample.id}  —— ${entry.name}`);

  const bad = await client.callTool({ name: 'get_entry', arguments: { id: 'mechanism/no-such-entry-xyz' } });
  if (!bad.isError) throw new Error('不存在的 id 应返回错误');
  console.log('通过  不存在的 id 返回错误信息');
  await client.close();

  const health = await fetch(new URL('/health', url)).then((r) => r.json());
  if (!health.ok || health.release !== info.release) throw new Error(`健康检查不对：${JSON.stringify(health)}`);
  console.log(`通过  健康检查  —— 发布包 ${health.release}`);

  const noOrigin = await postInit(url);
  if (noOrigin.status !== 200) throw new Error(`不带 Origin 的请求应当放行，实际 ${noOrigin.status}`);
  const evil = await postInit(url, EVIL_ORIGIN);
  if (child) {
    if (evil.status !== 403) throw new Error(`不在白名单的 Origin 应被拒绝（403），实际 ${evil.status}`);
    const good = await postInit(url, ALLOWED_ORIGIN);
    if (good.status !== 200 || good.headers.get('access-control-allow-origin') !== ALLOWED_ORIGIN) {
      throw new Error(`白名单里的 Origin 应放行并带跨域响应头，实际 ${good.status}`);
    }
    const pre = await fetch(url, { method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN, 'access-control-request-method': 'POST' } });
    if (pre.status !== 204) throw new Error(`白名单里的 Origin 的预检请求应返回 204，实际 ${pre.status}`);
    console.log('通过  Origin 白名单  —— 不带 Origin 放行；名单内放行并带跨域头；名单外 403');
  } else if (evil.status === 403) {
    console.log(`通过  Origin 白名单  —— 不带 Origin 放行；${EVIL_ORIGIN} 被拒（403）`);
  } else {
    console.log(`注意  ${EVIL_ORIGIN} 没有被拒（状态码 ${evil.status}）：服务端的 GDL_ALLOWED_ORIGINS 可能设成了 *`);
  }
} catch (err) {
  failed++;
  console.log(`失败  ${err instanceof Error ? err.message : err}`);
} finally {
  if (child) {
    child.kill();
    await new Promise((resolve) => (child.exitCode !== null || child.killed ? resolve() : child.once('exit', resolve)));
  }
}
console.log(failed ? '\nHTTP 入口有失败项' : `\nHTTP 入口全部通过${child ? '，服务进程已关闭' : ''}`);
process.exit(failed ? 1 : 0);
