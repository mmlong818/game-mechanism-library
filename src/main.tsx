import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArchiveNotice, MechanismReader, type ArchiveEntry, type PublicCard, type V2Card } from "./mechanism-reader";
import "./globals.css";

const BASE = import.meta.env.BASE_URL;
type IndexItem = { id: string; title: string; scope: "public" | "community"; position: number };
type SearchDoc = { id: string; text: string };
type CommunityIndex = { id: string; title: string; type: "mechanic" | "system" }[];
type View = { kind: "loading" } | { kind: "card"; card: PublicCard; community: boolean } | { kind: "archive"; entry: ArchiveEntry } | { kind: "deleted" } | { kind: "missing" };

function asset(path: string) { return `${BASE}${path.replace(/^\/+/, "")}`; }
function routeId() { const match = window.location.hash.match(/^#\/mechanism\/([^/?#]+)/u); return match ? decodeURIComponent(match[1]) : null; }
function openCard(id: string) { window.location.hash = `/mechanism/${encodeURIComponent(id)}`; }
async function json<T>(path: string): Promise<T> {
  const response = await fetch(asset(path), { cache: "force-cache" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return await response.json() as T;
}
let searchDocsPromise: Promise<SearchDoc[]> | null = null;
function loadSearchDocs() { searchDocsPromise ??= json<SearchDoc[]>("search-index.json"); return searchDocsPromise; }
const chunkCache = new Map<string, Promise<PublicCard[]>>();
function loadChunk(scope: "public" | "community", no: number): Promise<PublicCard[]> {
  const key = `${scope}:${no}`;
  let result = chunkCache.get(key);
  if (!result) {
    result = json<PublicCard[]>(scope === "public" ? `data/cards/${String(no).padStart(4, "0")}.json` : `community/cards/${String(no).padStart(4, "0")}.json`);
    chunkCache.set(key, result);
  }
  return result;
}
function displaySearchText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(displaySearchText).join(" ");
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(displaySearchText).join(" ");
  return "";
}
function App() {
  const [publicIndex, setPublicIndex] = useState<Omit<IndexItem, "scope" | "position">[]>([]);
  const [communityIndex, setCommunityIndex] = useState<CommunityIndex>([]);
  const [archive, setArchive] = useState<ArchiveEntry[]>([]);
  const [deleted, setDeleted] = useState<{ id: string; status: "deleted" }[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [chunkSize, setChunkSize] = useState(10);
  const [query, setQuery] = useState("");
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(0);
  const [pageCards, setPageCards] = useState<PublicCard[]>([]);
  const [error, setError] = useState("");
  const [route, setRoute] = useState<string | null>(() => routeId());
  const [detail, setDetail] = useState<View>({ kind: "loading" });
  const searchRef = useRef<HTMLInputElement>(null);

  const perPage = 18;

  useEffect(() => {
    let active = true;
    Promise.all([
      json<Omit<IndexItem, "scope" | "position">[]>("data/index.json"),
      json<{ chunkSize?: number }>("data/catalog-meta.json"),
      json<ArchiveEntry[]>("data/archive-index.json"),
      json<{ id: string; status: "deleted" }[]>("data/deleted-index.json"),
    ]).then(([index, meta, archiveRows, deletedRows]) => {
      if (!active) return;
      setPublicIndex(index); setArchive(archiveRows); setDeleted(deletedRows);
      if (Number.isInteger(meta.chunkSize) && meta.chunkSize! > 0) setChunkSize(meta.chunkSize!);
      setCatalogLoaded(true);
    }).catch(() => { if (active) { setError("目录暂时无法载入，请稍后重试。"); setCatalogLoaded(true); } });
    json<CommunityIndex>("community-index.json").then(rows => { if (active) setCommunityIndex(rows); }).catch(() => { /* Community details are optional and never block the public catalog. */ });
    const redirectLegacySectionHash = () => {
      const hash = window.location.hash.toLocaleLowerCase();
      const legacySections = new Set(["#topics", "#discover", "#featured", "#editorial", "#favorites", "#favorite", "#community", "#upload", "#contribute"]);
      if (routeId() || (!legacySections.has(hash) && !/^#\/(?:favorites?|community|upload|contribute)(?:\/.*)?$/u.test(hash))) return false;
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#catalog`);
      document.getElementById("catalog")?.scrollIntoView();
      return true;
    };
    const onHash = () => { redirectLegacySectionHash(); setRoute(routeId()); };
    redirectLegacySectionHash();
    window.addEventListener("hashchange", onHash);
    return () => { active = false; window.removeEventListener("hashchange", onHash); };
  }, []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (routeId()) window.location.hash = "catalog";
        requestAnimationFrame(() => { document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }); searchRef.current?.focus({ preventScroll: true }); });
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) searchRef.current?.blur();
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const index = useMemo<IndexItem[]>(() => publicIndex.map((item, position) => ({ id: item.id, title: item.title, scope: "public", position })), [publicIndex]);
  const normalizedQuery = query.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  const filtered = useMemo(() => {
    let result = index;
    if (!normalizedQuery) return result;
    if (normalizedQuery.length === 1) return result.filter(item => item.title.normalize("NFKC").toLocaleLowerCase().includes(normalizedQuery));
    if (!searchIds || searchQuery !== normalizedQuery) return [];
    return result.filter(item => searchIds.has(item.id));
  }, [index, normalizedQuery, searchIds, searchQuery]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const visible = filtered.slice(page * perPage, (page + 1) * perPage);

  useEffect(() => {
    if (normalizedQuery.length < 2) { setSearchIds(null); setSearching(false); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      loadSearchDocs().then(docs => {
        const terms = normalizedQuery.split(" ").filter(Boolean);
        const ids = new Set(docs.filter(doc => terms.every(term => doc.text.includes(term))).map(doc => doc.id));
        if (active) { setSearchIds(ids); setSearchQuery(normalizedQuery); setError(""); setPage(0); }
      }).catch(() => { if (active) setError("全文搜索索引暂时无法载入。"); }).finally(() => { if (active) setSearching(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [normalizedQuery]);

  const visibleKey = visible.map(item => item.id).join("|");

  useEffect(() => {
    if (!visible.length) { setPageCards([]); return; }
    let active = true;
    const groups = new Map<string, { scope: "public" | "community"; no: number }>();
    for (const item of visible) groups.set(`${item.scope}:${Math.floor(item.position / chunkSize)}`, { scope: item.scope, no: Math.floor(item.position / chunkSize) });
    Promise.all([...groups.values()].map(group => loadChunk(group.scope, group.no))).then(chunks => { if (active) setPageCards(chunks.flat()); }).catch(() => { if (active) setError("正文暂时无法载入。"); });
    return () => { active = false; };
  }, [visibleKey, chunkSize]);

  useEffect(() => {
    let active = true;
    if (!route) { setDetail({ kind: "loading" }); return; }
    setDetail({ kind: "loading" });
    async function loadDetail() {
      try {
        const publicAt = publicIndex.findIndex(item => item.id === route);
        if (publicAt >= 0) {
          const card = (await loadChunk("public", Math.floor(publicAt / chunkSize))).find(item => item.id === route);
          if (active) setDetail(card ? { kind: "card", card, community: false } : { kind: "missing" });
          return;
        }
        const communityAt = communityIndex.findIndex(item => item.id === route);
        if (communityAt >= 0) {
          const card = (await loadChunk("community", Math.floor(communityAt / chunkSize))).find(item => item.id === route);
          if (active) setDetail(card ? { kind: "card", card, community: true } : { kind: "missing" });
          return;
        }
        const archived = archive.find(item => item.id === route);
        if (archived) { if (active) setDetail({ kind: "archive", entry: archived }); return; }
        if (deleted.some(item => item.id === route)) { if (active) setDetail({ kind: "deleted" }); return; }
        if (active) setDetail({ kind: "missing" });
      } catch { if (active) setDetail({ kind: "missing" }); }
    }
    void loadDetail();
    return () => { active = false; };
  }, [route, publicIndex, communityIndex, chunkSize, archive, deleted]);

  if (route) return <main className="detailPage">
    {detail.kind === "loading" && <p>正在载入条目…</p>}
    {detail.kind === "card" && <div className="detailReaderWrap"><MechanismReader card={detail.card} page community={detail.community} /></div>}
    {detail.kind === "archive" && <ArchiveNotice entry={detail.entry} />}
    {detail.kind === "deleted" && <article className="reader archiveReader"><a className="readerBack" href={`${BASE}#catalog`}>← 返回机制百科</a><span className="kicker">条目状态　/　已删除</span><h1>这条旧条目已删除</h1><p className="archiveMessage">该条目不再出现在公开目录中。此入口仅说明原 ID 的状态，不提供已撤下内容。</p><p className="archiveId">原条目 ID：{route}</p></article>}
    {detail.kind === "missing" && <article className="reader archiveReader"><a className="readerBack" href={`${BASE}#catalog`}>← 返回机制百科</a><span className="kicker">条目入口</span><h1>暂时找不到这条资料</h1><p className="archiveMessage">这个旧链接可能已失效，或者当前发布版本还没有包含对应条目。</p><p className="archiveId">请求的条目 ID：{route}</p></article>}
  </main>;

  return <>
    <a className="skipLink" href="#catalog">跳到机制目录</a><header className="topbar"><a className="brand" href={`${BASE}`}>机制百科</a><a className="searchShortcut" href="#catalog" onClick={event => { event.preventDefault(); document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" }); searchRef.current?.focus({ preventScroll: true }); }} aria-label="搜索机制目录"><span className="searchIcon" aria-hidden="true">⌕</span><span className="searchLabel">搜索机制目录</span></a></header>
    <main className="libraryHome">
      <div className="introLine"><span>游戏设计机制 · 完整规则 · 可迁移案例</span><span>{catalogLoaded ? `${publicIndex.length.toLocaleString()} 条机制资料` : "正在载入目录…"}</span></div>
      <section id="catalog" className="catalog"><div className="sectionTitle"><div><span className="kicker">资料库　/　机制目录</span><h2>全部机制</h2></div><div className="catalogControls"><span>规则摘要、可选结构与原创设计示例</span></div></div><label className="searchbox"><span>⌕</span><input ref={searchRef} aria-label="搜索机制全文" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}} placeholder="搜索机制名称、规则或标签" /><kbd>⌘ K</kbd></label><div className="catalogMeta"><span aria-live="polite" aria-atomic="true">{!catalogLoaded ? "正在载入目录…" : searching?"正在全文检索…":`${filtered.length.toLocaleString()} 条匹配机制`}</span><span>搜索包含完整规则、结构、案例与标签　·　按需载入卡片</span></div>{error&&<p className="notice">{error}</p>}<div className="resultList">{visible.map((item,i)=>{const card=pageCards.find(value=>value.id===item.id);const summary=card&&"summary" in card?card.summary:"打开条目，查看完整机制规则与原创案例。";return <div className="resultRow" key={item.id}><span className="rowNo">{String(page*perPage+i+1).padStart(3,"0")}</span><button className="rowOpen" onClick={()=>openCard(item.id)}><span className="rowContent"><b>{item.title}</b><em>{summary}</em></span></button><button className="arrow" aria-label={`阅读${item.title}`} onClick={()=>openCard(item.id)}>↗</button></div>;})}</div>{visible.length===0&&!searching&&catalogLoaded&&<div className="emptyState"><span className="emptyMark" aria-hidden="true">⌕</span><h3>没有找到匹配内容</h3><p>试试缩短关键词，或浏览全部机制。</p><button type="button" className="outline" onClick={()=>{setQuery("");setPage(0);}}>浏览全部机制</button></div>}<div className="pagination"><button disabled={page===0} onClick={()=>setPage(page-1)}>←　上一页</button><span>{page+1} / {pageCount}</span><button disabled={page+1>=pageCount} onClick={()=>setPage(page+1)}>下一页　→</button></div></section>
    </main><footer><b>机制百科</b><span>按设计问题寻找机制。完整阅读，独立审核，正式发布。</span></footer>
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);

