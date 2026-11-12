// 站点配置：站点根目录的 site-config.json。部署的人可以直接改这个文件，不用重新构建。
// 文件缺失、不是合法 JSON、字段类型不对时，一律当作没填，页面照常显示。
//   mcp_url             公开的 MCP 网址（如 https://mcp.example.com/mcp）。填了，“接入 AI”页就给出真实的接法
//   mcp_name            在 AI 工具里给这个服务起的名字，默认 game-design-library
//   local_download_url  本地安装版的下载地址。填了，“接入 AI”页就给出本地安装的步骤
//   contact             作者的联系方式（邮箱、网址或一句话）。填了，“版权”页的“请联系作者”后面就带上它
//   repo_url            项目的 GitHub 仓库地址。有值时顶栏最右侧显示“GitHub”，版权页在没填联系方式时引导到仓库提 issue；
//                       写成空字符串就都不显示。文件里没有这个字段（或整个文件读不到）时用默认的仓库地址
import { asset, useAsync } from "./data";

export type SiteConfig = { mcpUrl: string; mcpName: string; localDownloadUrl: string; contact: string; repoUrl: string };
export const DEFAULT_REPO_URL = "https://github.com/mmlong818/game-mechanism-library";
export const DEFAULT_CONFIG: SiteConfig = { mcpUrl: "", mcpName: "game-design-library", localDownloadUrl: "", contact: "", repoUrl: DEFAULT_REPO_URL };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
function httpUrl(v: unknown): string {
  const s = text(v);
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : "";
  } catch {
    return "";
  }
}

export function readConfig(raw: unknown): SiteConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_CONFIG;
  const o = raw as Record<string, unknown>;
  const name = text(o.mcp_name);
  return {
    mcpUrl: httpUrl(o.mcp_url),
    mcpName: /^[A-Za-z0-9_-]{1,40}$/.test(name) ? name : DEFAULT_CONFIG.mcpName,
    localDownloadUrl: httpUrl(o.local_download_url),
    contact: text(o.contact).slice(0, 200),
    repoUrl: "repo_url" in o ? httpUrl(o.repo_url).replace(/\/+$/, "") : DEFAULT_REPO_URL,
  };
}

let promise: Promise<SiteConfig> | undefined;
export function loadConfig(): Promise<SiteConfig> {
  promise ??= fetch(asset("site-config.json"), { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then(readConfig)
    .catch(() => DEFAULT_CONFIG);
  return promise;
}
// 还没读到时返回 undefined。
export const useConfig = () => useAsync(loadConfig, []).data;

// 这个网站自己的地址（不含 # 后面的部分），本地安装版用它作数据来源。
export const siteUrl = () => new URL(".", location.href).href;
