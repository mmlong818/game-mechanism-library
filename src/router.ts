// hash 路由。每个页面只有一个正式地址：
//   #/                 机制的主题封面墙（首页）
//   #/c/world          世界观的分组封面墙
//   #/c/experience     体验的分组封面墙
//   #/c/<库>/<分组>    分组页（卡片列表）
//   #/e/<库>/<id>      详情页
//   #/c/book           书（只有一本时跳到这本书的第 1 章，有多本时是书单）
//   #/c/book/<书>      跳到那本书的第 1 章
//   #/e/book/<id>      章节阅读页（左栏全书目录，中栏正文，右栏本章小节）
//   #/search?q=&c=     搜索
//   #/mcp              接入 AI
// #/c/mechanism 跳到 #/。其余不认识的地址（旧版的 #community、#favorites、m_ 开头的卡片 id，
// 以及已经撤下的 #/new、#/articles）一律回首页。
import { useEffect, useState } from "react";
import { BOOK, isLib, type LibId } from "./data";

export type Route =
  | { name: "wall"; lib: LibId }
  | { name: "group"; lib: LibId; group: string; tag: string }
  | { name: "entry"; lib: LibId; id: string }
  | { name: "book"; slug: string }
  | { name: "chapter"; id: string }
  | { name: "search"; q: string; c: string }
  | { name: "mcp" }
  | { name: "unknown" };

export function parse(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  if (raw === "/") return { name: "wall", lib: "mechanism" };
  if (!raw.startsWith("/")) return { name: "unknown" };
  const [pathPart, queryPart = ""] = raw.split("?");
  let seg: string[];
  try {
    seg = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return { name: "unknown" };
  }
  const query = new URLSearchParams(queryPart);
  const [a, b, c] = seg;
  if (seg.length === 1) {
    if (a === "mcp") return { name: "mcp" };
    if (a === "search") return { name: "search", q: query.get("q") ?? "", c: query.get("c") ?? "" };
  }
  if (a === "c" && b === BOOK && seg.length <= 3) return { name: "book", slug: c ?? "" };
  if (a === "e" && b === BOOK && seg.length === 3) return { name: "chapter", id: `${BOOK}/${c}` };
  if (a === "c" && b && isLib(b)) {
    if (seg.length === 2 && b !== "mechanism") return { name: "wall", lib: b };
    if (seg.length === 3) return { name: "group", lib: b, group: c, tag: query.get("tag") ?? "" };
  }
  if (a === "e" && b && isLib(b) && seg.length === 3) return { name: "entry", lib: b, id: `${b}/${c}` };
  return { name: "unknown" };
}

export const href = {
  wall: (lib: string) => (lib === "mechanism" ? "#/" : `#/c/${lib}`),
  group: (lib: string, group: string, tag = "") =>
    `#/c/${lib}/${encodeURIComponent(group)}${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`,
  entry: (globalId: string) => `#/e/${globalId.split("/").map(encodeURIComponent).join("/")}`,
  search: (q: string, c = "") => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (c) p.set("c", c);
    const s = p.toString();
    return `#/search${s ? `?${s}` : ""}`;
  },
  book: (slug = "") => `#/c/${BOOK}${slug ? `/${encodeURIComponent(slug)}` : ""}`,
  mcp: "#/mcp",
};

export function replaceHash(hash: string) {
  history.replaceState(null, "", location.pathname + location.search + hash);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
export const goHome = () => replaceHash("#/");

export function useRoute(): Route {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parse(hash);
}
