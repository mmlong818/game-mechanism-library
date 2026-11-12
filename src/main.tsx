import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import { LIBS, useCore, type Core } from "./data";
import { EntryPage } from "./entry";
import { Home } from "./home";
import { McpPage } from "./info";
import { CollectionPage, GroupPage, SearchPage } from "./lists";
import { goHome, href, replaceHash, useRoute, type Route } from "./router";
import { Status } from "./ui";

function Logo() {
  return (
    <a className="logo" href={href.home}>
      <i aria-hidden="true">
        <b />
        <b />
        <b />
        <b />
      </i>
      游戏设计资料库
    </a>
  );
}

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
  const routeLib = route.name === "collection" || route.name === "group" || route.name === "entry" ? route.lib : "";
  const current = (on: boolean) => (on ? ("page" as const) : undefined);
  const type = (value: string) => {
    const target = href.search(value, searchC);
    if (searchQ !== null) replaceHash(target);
    else if (value.trim()) location.hash = target;
  };
  return (
    <header className="in nav">
      <Logo />
      <nav aria-label="主导航">
        {LIBS.map((l) => (
          <a key={l.id} href={href.collection(l.id)} aria-current={current(routeLib === l.id)}>
            {l.name}
          </a>
        ))}
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
        <input
          ref={input}
          type="search"
          placeholder={core ? `搜 ${core.total} 张卡片` : "搜卡片"}
          aria-label="搜索卡片"
          onChange={(e) => type(e.target.value)}
        />
      </form>
    </header>
  );
}

function Footer({ core }: { core?: Core }) {
  return (
    <footer className="in">
      <div className="foot">
        <div>
          <Logo />
          <p>给做游戏的人查机制、世界观和玩家体验。</p>
          <p className="rel">
            作者：猫叔{core?.updated ? ` · 更新于 ${core.updated}` : ""}
          </p>
        </div>
        <div>
          <h3>卡片库</h3>
          <ul>
            {LIBS.map((l) => (
              <li key={l.id}>
                <a href={href.collection(l.id)}>
                  {l.name}
                  {core ? ` ${core.counts[l.id]}` : ""}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>找卡片</h3>
          <ul>
            <li>
              <a href={href.search("")}>搜索</a>
            </li>
          </ul>
        </div>
        <div>
          <h3>在 AI 里用</h3>
          <ul>
            <li>
              <a href={href.mcp}>接入 AI</a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function Page({ route, core }: { route: Route; core: Core }) {
  switch (route.name) {
    case "home":
      return <Home core={core} />;
    case "collection":
      return <CollectionPage core={core} lib={route.lib} tag={route.tag} />;
    case "group":
      return <GroupPage core={core} lib={route.lib} group={route.group} tag={route.tag} />;
    case "entry":
      return <EntryPage core={core} lib={route.lib} id={route.id} />;
    case "search":
      return <SearchPage core={core} q={route.q} c={route.c} />;
    case "mcp":
      return <McpPage core={core} />;
    default:
      return null;
  }
}

function App() {
  const route = useRoute();
  const { data: core, error } = useCore();
  // 不认识的地址统一回首页。
  useEffect(() => {
    if (route.name === "unknown") goHome();
  }, [route.name]);
  // 换页回到顶部；搜索时改词、列表页切筛选不动。
  const place =
    route.name === "entry"
      ? route.id
      : route.name === "group"
        ? `${route.lib}/${route.group}`
        : route.name === "collection"
          ? route.lib
          : route.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [place]);

  return (
    <>
      <a
        className="skip"
        href="#/"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        跳到正文
      </a>
      <Header route={route} core={core} />
      <main id="main" className={`in ${route.name === "home" ? "home" : "page"}`} tabIndex={-1}>
        {core ? <Page route={route} core={core} /> : <Status error={error} />}
      </main>
      <Footer core={core} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
