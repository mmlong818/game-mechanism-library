import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const configuredBase = process.env.VITE_BASE_PATH || "/";
const segments = configuredBase.split("/").filter(Boolean);
const base = segments.length ? `/${segments.join("/")}/` : "/";
const host = process.env.PREVIEW_HOST || "127.0.0.1";
const port = Number(process.env.PREVIEW_PORT || 4399);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end("bad path"); return; }
  if (pathname === base.slice(0, -1) && base !== "/") { res.writeHead(308, { Location: base }).end(); return; }
  if (!pathname.startsWith(base)) { res.writeHead(404).end("not found"); return; }
  const relative = pathname.slice(base.length).replace(/^\/+/, "");
  let file = path.resolve(root, relative || "index.html");
  if (!file.startsWith(root + path.sep) && file !== path.join(root, "index.html")) { res.writeHead(403).end("forbidden"); return; }
  let status = 200;
  try { if ((await stat(file)).isDirectory()) file = path.join(file, "index.html"); }
  catch { file = path.join(root, "404.html"); status = 404; }
  try {
    const body = await readFile(file);
    res.writeHead(status, { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": body.length, "Cache-Control": "no-store" });
    if (req.method === "HEAD") res.end(); else res.end(body);
  } catch { res.writeHead(500).end("preview read failed"); }
});
server.listen(port, host, () => console.log(`GitHub Pages path preview: http://${host}:${port}${base}`));
