/**
 * 发布包的来源（Node 版）：本地目录；网址前缀（按需抓取，缓存到缓存目录）；
 * 网站地址（读 <网站地址>/data/current.json 得到当前发布编号，再按网址前缀的方式取）。
 * 以后部署到 Workers 时另写一个不落盘的来源即可，library.ts 不用动。
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Manifest, ReleaseSource } from './library.js';

/**
 * 默认的发布包网址前缀。可以在这里填入，形如 `https://<域名>/data/release/2026-11-13.1`
 * （该地址下应能直接取到 manifest.json）。留空表示必须由使用者指定来源。
 */
export const DEFAULT_RELEASE_URL = '';

const FETCH_TIMEOUT_MS = 30_000;

function safeRel(relPath: string): string {
  if (relPath.startsWith('/') || relPath.split('/').some((seg) => seg === '..' || seg === '' || seg.includes('\\'))) {
    throw new Error(`不合法的发布包内路径：${relPath}`);
  }
  return relPath;
}

export class DirSource implements ReleaseSource {
  readonly dir: string;
  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }
  describe(): string {
    return this.dir;
  }
  async readJson(relPath: string): Promise<unknown> {
    const text = await readFile(path.join(this.dir, ...safeRel(relPath).split('/')), 'utf8');
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  }
}

/** 用户缓存目录：Windows 用 %LOCALAPPDATA%，macOS 用 ~/Library/Caches，其余用 $XDG_CACHE_HOME 或 ~/.cache。 */
export function defaultCacheDir(): string {
  const name = 'game-design-library-mcp';
  if (process.env.GDL_CACHE_DIR) return path.resolve(process.env.GDL_CACHE_DIR);
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), name, 'Cache');
  }
  if (process.platform === 'darwin') return path.join(homedir(), 'Library', 'Caches', name);
  return path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), '.cache'), name);
}

/**
 * 网址来源。manifest.json 每次启动都从网上取（取不到时退回缓存）；
 * 其余文件先看缓存，缓存没有或与 manifest 里的 sha256 对不上才下载，下载后同样核对。
 * 发布包一经生成不再修改，所以缓存按“网址前缀 + 发布编号”分目录，不需要过期。
 */
export class UrlSource implements ReleaseSource {
  readonly baseUrl: string;
  private readonly prefixDir: string;
  private manifest: Manifest | null = null;

  constructor(baseUrl: string, cacheDir: string = defaultCacheDir()) {
    const url = new URL(baseUrl); // 不是合法网址时在这里报错
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`发布包网址只支持 http 和 https：${baseUrl}`);
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    const key = createHash('sha256').update(this.baseUrl).digest('hex').slice(0, 16);
    this.prefixDir = path.join(cacheDir, key);
  }

  describe(): string {
    return this.baseUrl;
  }

  setManifest(manifest: Manifest): void {
    this.manifest = manifest;
  }

  async readJson(relPath: string): Promise<unknown> {
    safeRel(relPath);
    if (relPath === 'manifest.json') return this.readManifest();

    const release = this.manifest?.release ?? '_unknown';
    const expected = this.manifest?.files?.[relPath];
    const cachePath = path.join(this.prefixDir, release.replace(/[^\w.-]/g, '_'), ...relPath.split('/'));

    const cached = await readFile(cachePath).catch(() => null);
    if (cached && (!expected || sha256(cached) === expected)) return parse(cached);

    const data = await this.download(relPath);
    if (expected && sha256(data) !== expected) {
      throw new Error(`${relPath} 下载后的校验和与 manifest.json 不一致，文件可能不完整或被改动。`);
    }
    await writeCache(cachePath, data);
    return parse(data);
  }

  private async readManifest(): Promise<unknown> {
    const cachePath = path.join(this.prefixDir, 'manifest.json');
    try {
      const data = await this.download('manifest.json');
      const parsed = parse(data);
      await writeCache(cachePath, data);
      return parsed;
    } catch (err) {
      const cached = await readFile(cachePath).catch(() => null);
      if (cached) {
        console.error(`[game-design-library] 取不到线上的 manifest.json，改用本机缓存：${String(err)}`);
        return parse(cached);
      }
      throw err;
    }
  }

  private async download(relPath: string): Promise<Buffer> {
    const url = `${this.baseUrl}/${relPath}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      throw new Error(`请求 ${url} 失败：${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) throw new Error(`请求 ${url} 失败：HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function parse(data: Buffer): unknown {
  const text = data.toString('utf8');
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/** 缓存写不进去不影响使用，只是下次还要下载。 */
async function writeCache(file: string, data: Buffer): Promise<void> {
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
  } catch {
    /* 忽略 */
  }
}

/** 网站地址来源：发布包在 `<网站地址>/data/release/<发布编号>/`，当前编号写在 `<网站地址>/data/current.json`。 */
export function siteReleaseUrl(siteUrl: string, release: string): string {
  if (!/^[\w.-]+$/.test(release)) throw new Error(`发布编号不对：${release}`);
  return `${siteUrl.replace(/\/+$/, '')}/data/release/${release}`;
}

/**
 * 读 `<网站地址>/data/current.json` 里的发布编号。
 * allowCache 为真时，取不到就退回上次缓存的编号（供启动时用）；为假时取不到直接报错（供定时检查用）。
 */
export async function readCurrentRelease(
  siteUrl: string,
  allowCache = true,
  cacheDir: string = defaultCacheDir(),
): Promise<string> {
  const base = siteUrl.replace(/\/+$/, '');
  const parsedUrl = new URL(base);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`网站地址只支持 http 和 https：${siteUrl}`);
  }
  const url = `${base}/data/current.json`;
  const key = createHash('sha256').update(base).digest('hex').slice(0, 16);
  const cachePath = path.join(cacheDir, `site-${key}`, 'current.json');
  const pick = (data: Buffer): string => {
    const release = (parse(data) as { release?: unknown }).release;
    if (typeof release !== 'string' || !/^[\w.-]+$/.test(release)) throw new Error(`${url} 里没有合法的 release 字段`);
    return release;
  };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const release = pick(data);
    await writeCache(cachePath, data);
    return release;
  } catch (err) {
    const message = `请求 ${url} 失败：${err instanceof Error ? err.message : String(err)}`;
    if (allowCache) {
      const cached = await readFile(cachePath).catch(() => null);
      if (cached) {
        console.error(`[game-design-library] ${message}；改用本机缓存的发布编号`);
        return pick(cached);
      }
    }
    throw new Error(message);
  }
}

export interface CliOptions {
  releaseDir?: string;
  releaseUrl?: string;
  siteUrl?: string;
  releaseId?: string;
  port?: number;
  host?: string;
  help: boolean;
}

const VALUE_OPTIONS = ['--release-dir', '--release-url', '--site-url', '--release-id', '--port', '--host'];

/** 解析命令行：支持 `--name value` 和 `--name=value`。 */
export function parseArgs(argv: string[]): CliOptions {
  const out: CliOptions = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    if (!VALUE_OPTIONS.includes(name)) throw new Error(`不认识的参数：${arg}`);
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (!value) throw new Error(`参数 ${name} 缺少取值`);
    if (name === '--release-dir') out.releaseDir = value;
    else if (name === '--release-url') out.releaseUrl = value;
    else if (name === '--site-url') out.siteUrl = value;
    else if (name === '--release-id') out.releaseId = value;
    else if (name === '--host') out.host = value;
    else {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`端口号不对：${value}`);
      out.port = port;
    }
  }
  return out;
}

export interface ResolvedSource {
  source: ReleaseSource;
  /** 只有“跟随网站的 current.json”这种来源才有：供长期运行的 HTTP 入口定时检查有没有新发布。 */
  follow?: { siteUrl: string; release: string };
}

async function fromSite(siteUrl: string, pinned: string | undefined): Promise<ResolvedSource> {
  if (pinned) return { source: new UrlSource(siteReleaseUrl(siteUrl, pinned)) };
  const release = await readCurrentRelease(siteUrl);
  return { source: new UrlSource(siteReleaseUrl(siteUrl, release)), follow: { siteUrl, release } };
}

/**
 * 按优先级选数据来源：命令行的目录、发布包网址、网站地址；环境变量的目录、发布包网址、网站地址；内置默认网址。
 * 用网站地址时，给了发布编号（--release-id 或 GDL_RELEASE_ID）就固定用它，没给就读 current.json 跟随网站。
 */
export async function resolveSourceInfo(opts: CliOptions, env: NodeJS.ProcessEnv = process.env): Promise<ResolvedSource> {
  const pinned = opts.releaseId || env.GDL_RELEASE_ID || undefined;
  if (opts.releaseDir) return { source: new DirSource(opts.releaseDir) };
  if (opts.releaseUrl) return { source: new UrlSource(opts.releaseUrl) };
  if (opts.siteUrl) return fromSite(opts.siteUrl, pinned);
  if (env.GDL_RELEASE_DIR) return { source: new DirSource(env.GDL_RELEASE_DIR) };
  if (env.GDL_RELEASE_URL) return { source: new UrlSource(env.GDL_RELEASE_URL) };
  if (env.GDL_SITE_URL) return fromSite(env.GDL_SITE_URL, pinned);
  if (DEFAULT_RELEASE_URL) return { source: new UrlSource(DEFAULT_RELEASE_URL) };
  throw new Error(
    '没有指定发布包的来源。三种方式任选一种：' +
      '--release-dir <目录> 或环境变量 GDL_RELEASE_DIR，指向一个本地发布包目录（里面有 manifest.json）；' +
      '--site-url <网站地址> 或 GDL_SITE_URL，指向已部署的网站（自动读 data/current.json）；' +
      '--release-url <网址> 或 GDL_RELEASE_URL，直接指向某个发布包的网址前缀。',
  );
}

export async function resolveSource(opts: CliOptions, env: NodeJS.ProcessEnv = process.env): Promise<ReleaseSource> {
  return (await resolveSourceInfo(opts, env)).source;
}

export const USAGE = `猫叔的游戏知识库 MCP 服务（只读）

数据来源（命令行优先于环境变量；同一级里按下面的顺序取第一个有值的）：
  --release-dir <目录>    本地发布包目录（里面有 manifest.json）       环境变量 GDL_RELEASE_DIR
  --release-url <网址>    某个发布包的网址前缀（其下有 manifest.json）  环境变量 GDL_RELEASE_URL
  --site-url <网站地址>   已部署的网站地址；读 <网站地址>/data/current.json
                          得到当前发布编号，启动时自动用最新的发布包    环境变量 GDL_SITE_URL
  --release-id <编号>     和网站地址一起用：固定用这个发布编号          环境变量 GDL_RELEASE_ID
  环境变量 GDL_CACHE_DIR   改变缓存位置（只对网址来源有用）

HTTP 入口（dist/http.js）另有：
  --host <地址>           监听地址，默认 127.0.0.1                      环境变量 GDL_HTTP_HOST
  --port <端口>           监听端口，默认 8787                           环境变量 GDL_HTTP_PORT
  环境变量 GDL_ALLOWED_ORIGINS   允许的浏览器来源（Origin），逗号分隔；* 表示全部；默认不允许任何浏览器来源
  环境变量 GDL_ALLOWED_HOSTS     允许的 Host 请求头，逗号分隔；默认不检查
  环境变量 GDL_REFRESH_SECONDS   跟随网站时每隔多少秒检查一次 current.json，默认 300，0 表示只在启动时读
  环境变量 GDL_ACCESS_LOG        设为 1 时每个请求记一行（方法、路径、状态码、耗时）
`;
