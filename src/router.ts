// hash 路由。每个页面只有一个正式地址：
//   #/c/<库>/<分组>/<卡片>  卡片库的三栏界面：左栏分组，中栏该分组的卡片，右栏这张卡的全文
//   #/c/book               书（只有一本时跳到这本书的第 1 章，有多本时是书单）
//   #/c/book/<书>          跳到那本书的第 1 章
//   #/e/book/<id>          章节阅读页（左栏全书目录，中栏正文，右栏本章小节）
//   #/c/article            专题文章：按系列列出全部文章（发布包里没有文章库时回首页）
//   #/c/article/<系列>     跳到这个系列的第 1 篇
//   #/e/article/<id>       文章阅读页（左栏各系列的篇目，中栏正文，宽屏时右栏本篇小节）
//   #/search?q=&c=         搜索
//   #/mcp                  接入 AI
//   #/license              版权
// 下面这些地址会补全成正式地址（改写当前地址，不多留一条历史）：
//   #/、#/c/mechanism       机制库的第一个分组、第一张卡
//   #/c/<库>               该库的第一个分组、第一张卡
//   #/c/<库>/<分组>        该分组的第一张卡
//   #/e/<库>/<id>          这张卡所在的三栏地址（旧的详情页地址）
//   #/articles             #/c/article（发布包里没有文章库时回首页）
// 其余不认识的地址（旧版的 #community、#favorites、m_ 开头的卡片 id，
// 以及已经撤下的 #/new）一律回首页。
import { useEffect, useState } from "react";
import { ARTICLE, BOOK, isLib, type LibId } from "./data";

export type Route =
  | { name: "browse"; lib: LibId; group: string; card: string }
  | { name: "entry"; lib: LibId; id: string }
  | { name: "book"; slug: string }
  | { name: "chapter"; id: string }
  // canonical 为 false 的是旧地址 #/articles，进页面后改写成 #/c/article。
  | { name: "articles"; series: string; canonical: boolean }
  | { name: "article"; id: string }
  | { name: "search"; q: string; c: string }
  | { name: "mcp" }
  | { name: "license" }
  | { name: "unknown" };

export function parse(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  if (raw === "/" || raw === "") return { name: "browse", lib: "mechanism", group: "", card: "" };
  if (!raw.startsWith("/")) return { name: "unknown" };
  const [pathPart, queryPart = ""] = raw.split("?");
  let seg: string[];
  try {
    seg = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return { name: "unknown" };
  }
  const query = new URLSearchParams(queryPart);
  const [a, b, c, d] = seg;
  if (seg.length === 1) {
    if (a === "mcp") return { name: "mcp" };
    if (a === "license") return { name: "license" };
    if (a === "search") return { name: "search", q: query.get("q") ?? "", c: query.get("c") ?? "" };
    if (a === "articles") return { name: "articles", series: "", canonical: false };
  }
  if (a === "c" && b === BOOK && seg.length <= 3) return { name: "book", slug: c ?? "" };
  if (a === "e" && b === BOOK && seg.length === 3) return { name: "chapter", id: `${BOOK}/${c}` };
  if (a === "c" && b === ARTICLE && seg.length <= 3) return { name: "articles", series: c ?? "", canonical: true };
  if (a === "e" && b === ARTICLE && seg.length === 3) return { name: "article", id: `${ARTICLE}/${c}` };
  if (a === "c" && b && isLib(b) && seg.length <= 4) return { name: "browse", lib: b, group: c ?? "", card: d ?? "" };
  if (a === "e" && b && isLib(b) && seg.length === 3) return { name: "entry", lib: b, id: `${b}/${c}` };
  return { name: "unknown" };
}

type Where = { id: string; collection: string; group: string };
const enc = encodeURIComponent;

export const href = {
  lib: (lib: string) => `#/c/${lib}`,
  group: (lib: string, group: string) => `#/c/${lib}/${enc(group)}`,
  // 一张卡的正式地址。
  card: (e: Where) => `#/c/${e.collection}/${enc(e.group)}/${enc(e.id.slice(e.collection.length + 1))}`,
  // 书的章节、文章（卡片的这种地址会被改写成三栏地址）。
  entry: (globalId: string) => `#/e/${globalId.split("/").map(enc).join("/")}`,
  // 任意条目：卡片进三栏界面，书的章节和文章进阅读页。
  shell: (e: Where): string => (e.collection === BOOK || e.collection === ARTICLE ? href.entry(e.id) : href.card(e)),
  search: (q: string, c = "") => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (c) p.set("c", c);
    const s = p.toString();
    return `#/search${s ? `?${s}` : ""}`;
  },
  book: (slug = "") => `#/c/${BOOK}${slug ? `/${enc(slug)}` : ""}`,
  articles: (series = "") => `#/c/${ARTICLE}${series ? `/${enc(series)}` : ""}`,
  mcp: "#/mcp",
  license: "#/license",
};

export function replaceHash(hash: string) {
  if (location.hash === hash) return;
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
