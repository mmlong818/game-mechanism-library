import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import { BookPage, ChapterPage } from "./book";
import { BOOK_NAME, LIBS, useCore, type Core } from "./data";
import { EntryPage } from "./entry";
import { McpPage } from "./info";
import { GroupPage, SearchPage, WallPage } from "./lists";
import { goHome, href, replaceHash, useRoute, type Route } from "./router";
import { Status } from "./ui";

// 导航：站名、三个卡片库、书、接入 AI、搜索框。当前所在的库高亮。
function Header({ route, core }: { route: Route; core?: Core }) {
  const input = useRef<HTMLInputElement>(null);
  const searchQ = route.name === "search" ? route.q : null;
  const searchC = route.name === "search" ? route.c : "";
  // 从别处进入搜索页（比如点了示例词）时，把搜索框同步成地址里的词。
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    if (searchQ === null) el.value = "";
    else if (document.activeElement !== el) el.value = searchQ;
  }, [searchQ]);
  const routeLib = route.name === "wall" || route.name === "group" || route.name === "entry" ? route.lib : "";
  const current = (on: boolean) => (on ? ("page" as const) : undefined);
  const type = (value: string) => {
    const target = href.search(value, searchC);
    if (searchQ !== null) replaceHash(target);
    else if (value.trim()) location.hash = target;
  };
  return (
    <header className="in nav">
      <a className="logo" href="#/">
        <i aria-hidden="true">
          <b />
          <b />
          <b />
          <b />
        </i>
        游戏设计资料库
      </a>
      <nav aria-label="主导航">
        {LIBS.map((l) => (
          <a key={l.id} href={href.wall(l.id)} aria-current={current(routeLib === l.id)}>
            {l.name}
          </a>
        ))}
        {core && core.books.length > 0 && (
          <a href={href.book()} aria-current={current(route.name === "book" || route.name === "chapter")}>
            {BOOK_NAME}
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
    </header>
  );
}

function Page({ route, core }: { route: Route; core: Core }) {
  switch (route.name) {
    case "wall":
      return <WallPage core={core} lib={route.lib} />;
    case "group":
      return <GroupPage core={core} lib={route.lib} group={route.group} tag={route.tag} />;
    case "entry":
      return <EntryPage core={core} lib={route.lib} id={route.id} />;
    case "book":
      return <BookPage core={core} slug={route.slug} />;
    case "chapter":
      return <ChapterPage core={core} id={route.id} />;
    case "search":
      return <SearchPage core={core} q={route.q} c={route.c} />;
    case "mcp":
      return <McpPage />;
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
  // 换页回到顶部；搜索时改词、分组页切筛选不动。
  const place =
    route.name === "entry"
      ? route.id
      : route.name === "chapter"
        ? route.id
        : route.name === "book"
          ? `book/${route.slug}`
          : route.name === "group"
        ? `${route.lib}/${route.group}`
        : route.name === "wall"
          ? route.lib
          : route.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [place]);

  return (
    <>
      <button type="button" className="skip" onClick={() => document.getElementById("main")?.focus()}>
        跳到正文
      </button>
      <Header route={route} core={core} />
      <main id="main" className="in page" tabIndex={-1}>
        {core ? <Page route={route} core={core} /> : <Status error={error} />}
      </main>
      <footer className="in foot">猫叔{core?.updated ? ` · 更新于 ${core.updated}` : ""}</footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
