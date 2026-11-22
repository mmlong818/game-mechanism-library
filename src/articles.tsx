// 专题文章：入口页和阅读页。
// 发布包里文章是 kind 为 articles 的库（id 为 article）：分组是一个系列，条目是一篇，正文是 markdown。
// 入口页（#/c/article）按系列列出全部文章；阅读页（#/e/article/<id>）沿用书的版式（book.css）：
// 左侧栏是各系列的篇目，当前系列展开；中间是正文；宽屏时右边是本篇小节。
import { useEffect, useMemo, useRef, useState } from "react";
import { ARTICLE, ARTICLE_NAME, loadArticles, loadGroupCards, loadRedirects, partOf, useAsync, type Core, type Group, type Shell } from "./data";
import { render, useBookFonts } from "./book";
import { goHome, href, replaceHash } from "./router";
import { Status, useTitle } from "./ui";

// 某个系列的文章，按系列内序号排。
const inSeries = (list: Shell[], series: string) =>
  list.filter((e) => e.group === series).sort((a, b) => (partOf(a) || 0) - (partOf(b) || 0));

// #/c/article：按系列列出全部文章。#/c/article/<系列>：跳到这个系列的第 1 篇。#/articles：改写成 #/c/article。
export function ArticlesPage({ core, series, canonical }: { core: Core; series: string; canonical: boolean }) {
  useTitle(ARTICLE_NAME);
  const none = !core.series.length;
  const { data: articles, error } = useAsync(loadArticles, [core.release]);
  useEffect(() => {
    if (none) return goHome();
    if (!canonical) return replaceHash(href.articles());
    if (!series || !articles) return;
    const first = core.series.some((s) => s.id === series) ? inSeries(articles, series)[0] : undefined;
    replaceHash(first ? href.entry(first.id) : href.articles());
  }, [none, canonical, series, articles, core]);
  if (none || !canonical || series) return null;

  return (
    <>
      <header className="phead">
        <div>
          <h1>{ARTICLE_NAME}</h1>
          <p>围绕一个设计问题写成的长文，按主题分成系列，每个系列可以从第 1 篇顺着读下去。文中提到的卡片和书里的章节都可以直接点开。</p>
        </div>
      </header>
      <div className="series">
        {core.series.map((s) => (
          <section key={s.id} aria-labelledby={`series-${s.id}`}>
            <h2 id={`series-${s.id}`}>{s.name}</h2>
            {s.description && <p>{s.description}</p>}
            {articles ? (
              <ol>
                {inSeries(articles, s.id).map((e) => (
                  <li key={e.id}>
                    <a href={href.entry(e.id)}>
                      <i className="num">{partOf(e) || ""}</i>
                      <b>{e.name}</b>
                    </a>
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ))}
      </div>
      {error && <Status error={error} />}
    </>
  );
}

// 左侧栏：各系列的篇目。当前系列展开，其余收起，点系列名展开后可以切过去。
// 固定在顶栏下方、栏内滚动；窄屏收成正文上方的“篇目”按钮。样式与书的目录相同。
function Side({ series, articles, current, group }: { series: Group[]; articles: Shell[]; current: string; group: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    setOpen(false);
    const el = box.current;
    const now = el?.querySelector<HTMLElement>("[aria-current]");
    if (!el || !now || el.scrollHeight <= el.clientHeight) return;
    const delta = now.getBoundingClientRect().top - el.getBoundingClientRect().top;
    el.scrollTop += delta - el.clientHeight / 2 + now.offsetHeight / 2;
  }, [current]);
  return (
    <aside ref={box} className={`bk-side${open ? " open" : ""}`} aria-label="专题文章目录">
      <button type="button" className="bk-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        篇目
        <i aria-hidden="true">{open ? "收起" : "展开"}</i>
      </button>
      <nav className="bk-nav">
        {series.map((s) => (
          // 换系列时重新挂载，让新的当前系列展开、旧的收起。
          <details key={s.id === group ? `${s.id}:on` : s.id} open={s.id === group} className="nav-vol">
            <summary>{s.name}</summary>
            {inSeries(articles, s.id).map((e) => (
              <a key={e.id} href={href.entry(e.id)} aria-current={e.id === current ? "page" : undefined}>
                <span className="nc">{partOf(e) || ""}</span>
                {e.name}
              </a>
            ))}
          </details>
        ))}
        <p className="bk-note">© 猫叔 · 禁止商用与改编</p>
      </nav>
    </aside>
  );
}

// 文章阅读页（#/e/article/<id>）。
export function ArticlePage({ core, id }: { core: Core; id: string }) {
  useBookFonts();
  const { data: articles, error } = useAsync(loadArticles, [core.release]);
  const shell = articles?.find((e) => e.id === id);
  // 不存在的 id：查一下 redirects.json，有去向就跳过去，否则回首页。
  useEffect(() => {
    if (!articles || shell) return;
    let live = true;
    loadRedirects(ARTICLE).then((r) => {
      if (!live) return;
      const to = r[id];
      if (to && articles.some((e) => e.id === to)) replaceHash(href.entry(to));
      else goHome();
    });
    return () => {
      live = false;
    };
  }, [articles, shell, id]);
  const { data: cards, error: cardsError } = useAsync(
    () => (shell ? loadGroupCards(ARTICLE, shell.group) : Promise.resolve(undefined)),
    [shell?.group],
  );
  const seriesName = shell ? core.groupName(ARTICLE, shell.group) : "";
  useTitle(shell ? `${shell.name} · ${seriesName}` : "");
  const card = cards?.find((c) => c.id === id);
  const source = card && typeof card.body.text === "string" ? card.body.text : undefined;
  const html = useMemo(() => (source === undefined ? undefined : render(source)), [source]);

  // 本篇小节：正文渲染出来以后，从里面的二级标题取。
  const md = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<string[]>([]);
  useEffect(() => {
    setSections([...(md.current?.querySelectorAll("h2") ?? [])].map((h) => h.textContent ?? ""));
  }, [html]);
  const jump = (i: number) => md.current?.querySelectorAll("h2")[i]?.scrollIntoView({ block: "start" });

  if (!articles || !shell) {
    return (
      <div className="bk">
        <div className="bk-content">
          <Status error={error} />
        </div>
      </div>
    );
  }

  const same = inSeries(articles, shell.group);
  const at = same.findIndex((e) => e.id === id);
  const prev = same[at - 1];
  const next = same[at + 1];
  const part = partOf(shell);

  return (
    <div className="bk">
      <Side series={core.series} articles={articles} current={id} group={shell.group} />
      <div className="bk-content ar-content">
        <article className="bk-ch">
          <div className="ch-no">
            {seriesName}
            {part ? ` · 第 ${part} 篇` : ""}
          </div>
          <h1 className="ch-title">{shell.name}</h1>
          {shell.summary && <p className="ar-summary">{shell.summary}</p>}
          {html !== undefined ? (
            <div className="bk-md" ref={md} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <Status error={cardsError ?? (cards ? new Error("article missing in series file") : undefined)} />
          )}
          <nav className="bk-pager" aria-label="翻页">
            {prev ? (
              <a href={href.entry(prev.id)}>
                <i>上一篇</i>
                <b>{prev.name}</b>
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a className="next" href={href.entry(next.id)}>
                <i>下一篇</i>
                <b>{next.name}</b>
              </a>
            )}
          </nav>
        </article>
        {sections.length > 1 && (
          <nav className="toc ar-toc" aria-label="本篇小节">
            <div>本篇小节</div>
            {sections.map((t, i) => (
              <button type="button" key={`${i}-${t}`} onClick={() => jump(i)}>
                {t}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
