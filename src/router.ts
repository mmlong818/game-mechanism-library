// hash 路由。不认识的地址（包括旧版的 #community、#favorites、m_ 开头的卡片 id）一律回首页。
import { useEffect, useState } from "react";
import { isLib, type LibId } from "./data";

export type Route =
  | { name: "home" }
  | { name: "collection"; lib: LibId; tag: string }
  | { name: "group"; lib: LibId; group: string; tag: string }
  | { name: "entry"; lib: LibId; id: string }
  | { name: "new" }
  | { name: "search"; q: string; c: string }
  | { name: "mcp" }
  | { name: "articles" }
  | { name: "unknown" };

export function parse(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  if (raw === "" || raw === "/") return { name: "home" };
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
    if (a === "new") return { name: "new" };
    if (a === "mcp") return { name: "mcp" };
    if (a === "articles") return { name: "articles" };
    if (a === "search") return { name: "search", q: query.get("q") ?? "", c: query.get("c") ?? "" };
  }
  if (a === "c" && b && isLib(b)) {
    const tag = query.get("tag") ?? "";
    if (seg.length === 2) return { name: "collection", lib: b, tag };
    if (seg.length === 3) return { name: "group", lib: b, group: c, tag };
  }
  if (a === "e" && b && isLib(b) && seg.length === 3) return { name: "entry", lib: b, id: `${b}/${c}` };
  return { name: "unknown" };
}

export const href = {
  home: "#/",
  collection: (lib: string, tag = "") => `#/c/${lib}${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`,
  group: (lib: string, group: string, tag = "") =>
    `#/c/${lib}/${encodeURIComponent(group)}${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`,
  entry: (globalId: string) => `#/e/${globalId.split("/").map(encodeURIComponent).join("/")}`,
  newList: "#/new",
  search: (q: string, c = "") => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (c) p.set("c", c);
    const s = p.toString();
    return `#/search${s ? `?${s}` : ""}`;
  },
  mcp: "#/mcp",
  articles: "#/articles",
};

export function goHome() {
  history.replaceState(null, "", location.pathname + location.search + "#/");
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function replaceHash(hash: string) {
  history.replaceState(null, "", location.pathname + location.search + hash);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRoute(): Route {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parse(hash);
}
