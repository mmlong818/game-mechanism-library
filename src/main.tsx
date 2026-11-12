import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import { BookPage, ChapterPage } from "./book";
import { useConfig } from "./config";
import { BOOK_NAME, LIBS, useCore, type Core } from "./data";
import { BrowsePage, EntryRedirect } from "./browse";
import { LicensePage, McpPage } from "./info";
import { SearchPage } from "./lists";
import { goHome, href, replaceHash, useRoute, type Route } from "./router";
import { Status } from "./ui";

// 导航：站名、三个卡片库、书、接入 AI、搜索框。当前所在的库高亮。
// 库里只有一本书时，书这一项直接显示书名；有多本时显示“书”，进书单。
function Header({ route, core }: { route: Route; core?: Core }) {
  const input = useRef<HTMLInputElement>(null);
  // 仓库地址来自 site-config.json；还没读到配置时先不显示，读到后留空也不显示。
  const repoUrl = useConfig()?.repoUrl ?? "";
  const searchQ = route.name === "search" ? route.q : null;
  const searchC = route.name === "search" ? route.c : "";
  // 从别处进入搜索页（比如点了示例词）时，把搜索框同步成地址里的词。
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    if (searchQ === null) el.value = "";
    else if (document.activeElement !== el) el.value = searchQ;
  }, [searchQ]);
  const routeLib = route.name === "browse" || route.name === "entry" ? route.lib : "";
  const current = (on: boolean) => (on ? ("page" as const) : undefined);
  const type = (value: string) => {
    const target = href.search(value, searchC);
    if (searchQ !== null) replaceHash(target);
    else if (value.trim()) location.hash = target;
  };
  // 顶栏固定在视口顶部。把它的实际高度写进 --top，固定在视口内的侧栏和标题的停靠位置据此让出空间。
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--top", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="top" ref={bar}>
    <header className="in nav">
      <a className="logo" href="#/">
        <i aria-hidden="true">
          <b />
          <b />
          <b />
          <b />
        </i>
        猫叔的游戏知识库
      </a>
      <nav aria-label="主导航">
        {LIBS.map((l) => (
          <a key={l.id} href={href.lib(l.id)} aria-current={current(routeLib === l.id)}>
            {l.name}
          </a>
        ))}
        {core && core.books.length > 0 && (
          <a href={href.book()} aria-current={current(route.name === "book" || route.name === "chapter")}>
            {core.books.length === 1 ? core.books[0].name : BOOK_NAME}
          </a>
        )}
        <a href={href.mcp} aria-current={current(route.name === "mcp")}>
          接入 AI
        </a>
      </nav>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          location.hash = href.search(input.current?.value ?? "", searchC);
        }}
      >
        <input ref={input} type="search" placeholder="搜卡片和书" aria-label="搜索卡片和书" onChange={(e) => type(e.target.value)} />
      </form>
      <span className="lic">
        <a href={href.license} aria-current={current(route.name === "license")}>
          版权
        </a>
        {repoUrl && (
          <a href={repoUrl} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        )}
      </span>
    </header>
    </div>
  );
}

function Page({ route, core }: { route: Route; core: Core }) {
  switch (route.name) {
    case "browse":
      return <BrowsePage core={core} lib={route.lib} group={route.group} card={route.card} />;
    case "entry":
      return <EntryRedirect lib={route.lib} id={route.id} />;
    case "book":
      return <BookPage core={core} slug={route.slug} />;
    case "chapter":
      return <ChapterPage core={core} id={route.id} />;
    case "search":
      return <SearchPage core={core} q={route.q} c={route.c} />;
    case "mcp":
      return <McpPage />;
    case "license":
      return <LicensePage />;
    default:
      return null;
  }
}

function App() {
  const route = useRoute();
  const { data: core, error } = useCore();
  // 不认识的地址统一回首页（#/c/mechanism 也在这里跳到 #/）。
  useEffect(() => {
    if (route.name === "unknown") goHome();
  }, [route.name]);
  // 换页回到顶部；搜索时改词不动。卡片库的三栏界面各栏自己滚动，页面本身不滚。
  const place = route.name === "chapter" ? route.id : route.name;
  // 三栏界面占满视口，不放页脚；署名和更新日期只在搜索页、接入 AI 页和版权页底部。
  const fill = route.name === "browse";
  const foot = route.name === "search" || route.name === "mcp" || route.name === "license";
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [place]);

  return (
    <>
      <button type="button" className="skip" onClick={() => document.getElementById("main")?.focus()}>
        跳到正文
      </button>
      <Header route={route} core={core} />
      <main id="main" className={route.name === "chapter" ? "bookpage" : `in page${fill ? " fill" : ""}`} tabIndex={-1}>
        {core ? <Page route={route} core={core} /> : <Status error={error} />}
      </main>
      {foot && <footer className="in foot">猫叔{core?.updated ? ` · 更新于 ${core.updated}` : ""}</footer>}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
