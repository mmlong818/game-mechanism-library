import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArchiveNotice, MechanismReader, type ArchiveEntry, type PublicCard, type V2Card } from "./mechanism-reader";
import "./globals.css";

const BASE = import.meta.env.BASE_URL;
const REPO = "https://github.com/mmlong818/game-mechanism-library";
const FAVORITES_KEY = "game-mechanism-library:favorites:v1";
type IndexItem = { id: string; title: string; type?: string; scope: "public" | "community"; position: number };
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
function readFavorites(): Set<string> {
  try { const value = localStorage.getItem(FAVORITES_KEY); const ids: unknown = value ? JSON.parse(value) : []; return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []); }
  catch { return new Set(); }
}
function FavoriteButton({ id, favorites, toggle }: { id: string; favorites: Set<string>; toggle: (id: string) => void }) {
  const saved = favorites.has(id);
  return <button className="favoriteButton" type="button" aria-pressed={saved} aria-label={saved ? "取消收藏" : "收藏机制"} title={saved ? "取消收藏" : "收藏机制"} onClick={event => { event.stopPropagation(); toggle(id); }}>{saved ? "★" : "☆"}</button>;
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
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavorites());
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [slide, setSlide] = useState(0);
  const perPage = 18;

  useEffect(() => {
    let active = true;
    Promise.all([
      json<Omit<IndexItem, "scope" | "position">[]>("data/index.json"),
      json<{ chunkSize?: number }>("data/catalog-meta.json"),
      json<ArchiveEntry[]>("data/archive-index.json"),
      json<{ id: string; status: "deleted" }[]>("data/deleted-index.json"),
      json<CommunityIndex>("community-index.json"),
    ]).then(([index, meta, archiveRows, deletedRows, communityRows]) => {
      if (!active) return;
      setPublicIndex(index); setArchive(archiveRows); setDeleted(deletedRows); setCommunityIndex(communityRows);
      if (Number.isInteger(meta.chunkSize) && meta.chunkSize! > 0) setChunkSize(meta.chunkSize!);
      setCatalogLoaded(true);
    }).catch(() => { if (active) { setError("目录暂时无法载入，请稍后重试。"); setCatalogLoaded(true); } });
    const onHash = () => { setRoute(routeId()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => { active = false; window.removeEventListener("hashchange", onHash); };
  }, []);

  useEffect(() => { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites].sort())); } catch { /* Storage can be unavailable in private browsing. */ } }, [favorites]);
  function toggleFavorite(id: string) { setFavorites(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  const index = useMemo<IndexItem[]>(() => [
    ...publicIndex.map((item, position) => ({ ...item, scope: "public" as const, position })),
    ...communityIndex.map((item, position) => ({ ...item, scope: "community" as const, position })),
  ], [publicIndex, communityIndex]);
  const normalizedQuery = query.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
  const filtered = useMemo(() => {
    let result = index;
    if (onlyFavorites) result = result.filter(item => favorites.has(item.id));
    if (!normalizedQuery) return result;
    if (normalizedQuery.length === 1) return result.filter(item => item.title.normalize("NFKC").toLocaleLowerCase().includes(normalizedQuery));
    if (!searchIds || searchQuery !== normalizedQuery) return [];
    return result.filter(item => searchIds.has(item.id));
  }, [index, normalizedQuery, searchIds, searchQuery, onlyFavorites, favorites]);
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
    {detail.kind === "card" && <div className="detailReaderWrap"><div className="detailActions"><FavoriteButton id={route} favorites={favorites} toggle={toggleFavorite} /></div><MechanismReader card={detail.card} page community={detail.community} /></div>}
    {detail.kind === "archive" && <ArchiveNotice entry={detail.entry} />}
    {detail.kind === "deleted" && <article className="reader archiveReader"><a className="readerBack" href={`${BASE}#catalog`}>← 返回机制百科</a><span className="kicker">条目状态　/　已删除</span><h1>这条旧条目已删除</h1><p className="archiveMessage">该条目不再出现在公开目录中。此入口仅说明原 ID 的状态，不提供已撤下内容。</p><p className="archiveId">原条目 ID：{route}</p></article>}
    {detail.kind === "missing" && <article className="reader archiveReader"><a className="readerBack" href={`${BASE}#catalog`}>← 返回机制百科</a><span className="kicker">条目入口</span><h1>暂时找不到这条资料</h1><p className="archiveMessage">这个旧链接可能已失效，或者当前发布版本还没有包含对应条目。</p><p className="archiveId">请求的条目 ID：{route}</p></article>}
  </main>;

  const spotlight = [
    { eyebrow: "精选焦点　/　设计问题", title: "找到让选择真正产生影响的机制", summary: "从设计问题出发，阅读完整规则、配套条件、原创案例与验证方法。", cta: "浏览全部机制" },
    { eyebrow: "本周专题　/　风险与取舍", title: "选择如何改变下一步", summary: "观察风险提示、路径变化与玩家行动之间的关系，寻找可迁移的设计做法。", cta: "探索风险机制" },
    { eyebrow: "资料专题　/　成长与构筑", title: "成长怎样改变玩家的决策", summary: "从资源、约束与长期承诺出发，查看完整机制与原创设计案例。", cta: "探索成长机制" },
  ][slide];
  const communityCount = communityIndex.length;
  const favoritesVisible = favorites.size ? `　·　${favorites.size} 个收藏` : "";
  return <>
    <header className="topbar"><a className="brand" href={`${BASE}`}>机制百科</a><nav><a className="active" href="#discover">发现</a><a href="#catalog">全部机制</a><a href="#topics">设计问题</a><a href="#catalog" onClick={() => setOnlyFavorites(true)}>我的收藏</a><a href="#upload">社区投稿</a></nav><a className="searchShortcut" href="#catalog">⌕　搜索设计问题或机制</a></header>
    <main>
      <div className="introLine"><span>游戏设计机制 · 完整规则 · 可迁移案例</span><span>{catalogLoaded ? `${publicIndex.length.toLocaleString()} 条正式机制${communityCount ? ` · ${communityCount} 条已审核社区投稿` : ""}` : "正在载入目录…"}</span></div>
      <section id="discover" className="hero" aria-roledescription="carousel" aria-label="机制精选"><div className="heroArt" aria-label="战术空间、风险区域与路径的机制图示"><svg viewBox="0 0 820 360" role="img"><defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#ffffff18" strokeWidth="1"/></pattern><linearGradient id="field" x1="0" x2="1"><stop stopColor="#263c3c"/><stop offset="1" stopColor="#405b57"/></linearGradient></defs><rect width="820" height="360" fill="url(#field)"/><rect width="820" height="360" fill="url(#grid)"/><path d="M82 236C182 226 203 100 334 131s170 165 286 100 125-81 156-67" fill="none" stroke="#d9c08c" strokeWidth="4" strokeDasharray="8 8"/><circle cx="148" cy="228" r="18" fill="#e7f0ee"/><circle cx="390" cy="150" r="24" fill="#d9c08c"/><circle cx="620" cy="224" r="20" fill="#e0b8a9"/><text x="70" y="54" fill="#e8f0ef" fontSize="12" letterSpacing="3">DESIGN FIELDNOTE / SYSTEMS &amp; CHOICES</text><text x="602" y="275" fill="#f0d9d2" fontSize="13">风险区域</text><text x="89" y="306" fill="#e3efec" fontSize="13">可行路径</text></svg><span className="artCaption">空间、信息与选择如何相互作用</span></div><div className="heroCopy"><span className="kicker">{spotlight.eyebrow}</span><h1>{spotlight.title}</h1><p>{spotlight.summary}</p><a className="primary" href="#catalog">{spotlight.cta} <span>→</span></a><div className="heroFoot"><span>完整规则　/　原创案例</span><div className="carouselControls"><button aria-label="上一条精选" onClick={() => setSlide((slide + 2) % 3)}>←</button>{[0,1,2].map(i => <button key={i} aria-label={`第${i + 1}条精选`} aria-current={slide === i} onClick={() => setSlide(i)}>{String(i + 1).padStart(2, "0")}</button>)}<button aria-label="下一条精选" onClick={() => setSlide((slide + 1) % 3)}>→</button></div></div></div></section>
      <section id="topics" className="topicBand"><div className="sectionTitle"><div><span className="kicker">设计问题</span><h2>从你正在解决的问题出发</h2></div><a href="#catalog">进入全部机制 →</a></div><div className="topics"><a href="#catalog" onClick={() => { setQuery("选择"); setPage(0); }}><b>01</b><span>让选择更有张力</span><small>风险 · 取舍 · 路径</small></a><a href="#catalog" onClick={() => { setQuery("成长"); setPage(0); }}><b>02</b><span>让成长改变玩法</span><small>构筑 · 承诺 · 反馈</small></a><a href="#catalog" onClick={() => { setQuery("信息"); setPage(0); }}><b>03</b><span>让信息影响判断</span><small>观察 · 不确定 · 推理</small></a><a href="#catalog" onClick={() => { setQuery("循环"); setPage(0); }}><b>04</b><span>让世界规则参与玩法</span><small>循环 · 环境 · 系统</small></a></div></section>
      <section className="featured"><div className="sectionTitle"><div><span className="kicker">编辑精选　/　完整条目</span><h2>机制如何改变玩家的下一步</h2></div><span>{catalogLoaded ? `${publicIndex.length.toLocaleString()} 个正式条目` : "正在载入目录…"}</span></div><div className="featuredRow">{publicIndex.slice(0,4).map((item,i)=><button className="featureCard" key={item.id} onClick={()=>openCard(item.id)}><span className={`featureNumber n${i}`}>0{i+1}</span><b>{item.title}</b><span>阅读完整机制　↗</span></button>)}</div></section>
      <section id="catalog" className="catalog"><div className="sectionTitle"><div><span className="kicker">资料库　/　机制变体</span><h2>{onlyFavorites ? "我的收藏" : "全部机制"}</h2></div><div className="catalogControls"><span>规则摘要、可选结构与原创设计示例</span><button type="button" className="favoriteFilter" aria-pressed={onlyFavorites} onClick={() => { setOnlyFavorites(value => !value); setPage(0); }}>{onlyFavorites ? "显示全部条目" : "只看收藏 ☆"}</button></div></div><label className="searchbox"><span>⌕</span><input value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}} placeholder="搜索机制、规则或设计问题" /><kbd>⌘ K</kbd></label><div className="catalogMeta"><span>{!catalogLoaded ? "正在载入目录…" : searching?"正在全文检索…":`${filtered.length.toLocaleString()} 条匹配机制${favoritesVisible}`}</span><span>搜索包含完整规则、结构、案例与标签　·　按需载入卡片</span></div>{error&&<p className="notice">{error}</p>}<div className="resultList">{visible.map((item,i)=>{const card=pageCards.find(value=>value.id===item.id);const summary=card&&"summary" in card?card.summary:"打开条目，查看完整机制规则与原创案例。";return <div className="resultRow" key={item.id}><span className="rowNo">{String(page*perPage+i+1).padStart(3,"0")}</span><button className="rowOpen" onClick={()=>openCard(item.id)}><span className="rowContent"><small>{item.scope==="community"?"已审核社区投稿":item.type==="system"?"系统机制":"机制卡"}</small><b>{item.title}</b><em>{summary}</em></span></button><FavoriteButton id={item.id} favorites={favorites} toggle={toggleFavorite} /><button className="arrow" aria-label={`阅读${item.title}`} onClick={()=>openCard(item.id)}>↗</button></div>;})}</div>{visible.length===0&&!searching&&normalizedQuery.length>=2&&<p className="notice">没有找到匹配内容。</p>}<div className="pagination"><button disabled={page===0} onClick={()=>setPage(page-1)}>←　上一页</button><span>{page+1} / {pageCount}</span><button disabled={page+1>=pageCount} onClick={()=>setPage(page+1)}>下一页　→</button></div></section>
      <section className="submitBand" id="upload"><div><span className="kicker">社区投稿　/　经审核后入库</span><h2>分享一条新的机制分析</h2><p>Issue 内容会公开展示并记录 GitHub 账号。审核通过后才会进入社区条目；投稿不会立即改变正式目录。</p></div><a className="outline" href={`${REPO}/issues/new?template=new-mechanism.yml`} target="_blank" rel="noreferrer">通过 GitHub Issue 投稿　↗</a></section>
    </main><footer><b>机制百科</b><span>按设计问题寻找机制。完整阅读，独立审核，正式发布。</span></footer>
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);

