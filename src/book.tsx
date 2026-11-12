// 书：阅读界面。左侧栏是按卷分组的全书目录，右边是单栏正文。版式在 book.css 里。
// 发布包里书是 kind 为 articles 的库，分组是一本书，条目是一章。
// 导航“书”（#/c/book）在库里只有一本书时直接打开这本书的第一篇（有前言就是前言）；有多本时才是书单。
import { useEffect, useMemo, useRef, useState } from "react";
import { Marked, type Tokens } from "marked";
import { BOOK, BOOK_NAME, loadChapters, loadGroupCards, useAsync, type Core, type Group, type Shell, type Volume } from "./data";
import { goHome, href, replaceHash } from "./router";
import { Status, useTitle } from "./ui";
import "./book.css";

const isAppendix = (e: Shell) => e.tags.some((t) => /^part:\D/.test(t));
// 章的序号（tags 里的 part:<数字>）；附录等不是数字的返回 NaN。
const partOf = (e: Shell) => {
  const t = e.tags.find((x) => /^part:\d+$/.test(x));
  return t ? Number(t.slice(5)) : NaN;
};

function BookList({ books }: { books: Group[] }) {
  useTitle(BOOK_NAME);
  return (
    <>
      <header className="phead">
        <div>
          <h1>{BOOK_NAME}</h1>
        </div>
      </header>
      <ul className="elist">
        {books.map((b) => (
          <li key={b.id}>
            <a href={href.book(b.id)}>
              <b>{b.name}</b>
            </a>
            {b.author && <span className="where">{b.author}</span>}
            {b.description && <p>{b.description}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

// #/c/book 和 #/c/book/<书>：落到那本书的第一篇。库里有多本书而地址没指明哪一本时，显示书单。
export function BookPage({ core, slug }: { core: Core; slug: string }) {
  const book = core.books.length === 1 && !slug ? core.books[0] : core.books.find((b) => b.id === slug);
  const bad = !core.books.length || (slug !== "" && !book);
  const { data: chapters, error } = useAsync(loadChapters, []);
  const first = book && chapters?.find((e) => e.group === book.id);
  useEffect(() => {
    if (bad || (book && chapters && !first)) goHome();
    else if (first) replaceHash(href.entry(first.id));
  }, [bad, book, chapters, first]);
  if (bad) return null;
  if (!book) return <BookList books={core.books} />;
  return <Status error={error} />;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeUrl = (u: string) => /^(https?:|mailto:)/i.test(u.trim());

// 把一章的 markdown 转成 HTML。正文里的 HTML 一律当普通文字显示，不会被执行；
// 链接只留 http、https 和 mailto，其余只显示文字；图片只留 http、https。
function render(source: string): string {
  const md = new Marked({
    gfm: true,
    renderer: {
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return esc(text);
      },
      link({ href: to, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        return safeUrl(to) ? `<a href="${esc(to)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner;
      },
      image({ href: src, text }: Tokens.Image) {
        return safeUrl(src) && !/^mailto:/i.test(src) ? `<img src="${esc(src)}" alt="${esc(text)}" loading="lazy" />` : esc(text);
      },
    },
  });
  // 章节标题已经在页头，去掉正文开头重复的一级标题。
  const text = source.replace(/^﻿?\s*# [^\n]*\n/, "");
  return (md.parse(text, { async: false }) as string)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
}

// 章节名拆成“第 5 章”“找到核心动作”两段；拆不开的（如前言）只有标题。
function splitName(name: string): [string, string] {
  const m = /^(第\s*\d+\s*章|附录\s*[A-Za-z0-9]+)\s+(.+)$/.exec(name);
  return m ? [m[1], m[2]] : ["", name];
}
// 卷名拆成“卷一”“定位”两段。
function splitVolume(title: string): [string, string] {
  const m = /^(.+?)\s*[·・:：]\s*(.+)$/.exec(title);
  return m ? [m[1], m[2]] : ["", title];
}
const inVolume = (e: Shell, v: Volume) => partOf(e) >= v.parts[0] && partOf(e) <= v.parts[1];

// 书页用的衬线和无衬线字体只在进了书页才加载，别的页面不受影响。
const FONT_ID = "bk-fonts";
function useBookFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700;900&family=Noto+Sans+SC:wght@400;500;700;900&display=swap";
    document.head.appendChild(link);
  }, []);
}

// 左侧栏：全书目录，固定在顶栏下方、栏内滚动；窄屏收成正文上方的“目录”按钮。
// 发布包里这本书带了分卷信息（volumes）时按卷分组，每卷可以折叠；
// 不属于任何一卷的（如前言）排在最前，附录排在最后单列一组。
function Contents({ chapters, current, volumes }: { chapters: Shell[]; current: string; volumes: Volume[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    setOpen(false);
    const el = box.current;
    const now = el?.querySelector<HTMLElement>("[aria-current]");
    if (!el || !now) return;
    // 当前章所在的卷如果被折叠了，把它展开。
    const vol = now.closest("details");
    if (vol && !vol.open) vol.open = true;
    // 把当前章滚到栏内可见的位置，只动这一栏，不动页面。
    if (el.scrollHeight > el.clientHeight) {
      const delta = now.getBoundingClientRect().top - el.getBoundingClientRect().top;
      el.scrollTop += delta - el.clientHeight / 2 + now.offsetHeight / 2;
    }
  }, [current]);
  const link = (e: Shell, loose = false) => {
    const [no, title] = splitName(e.name);
    return (
      <a key={e.id} href={href.entry(e.id)} className={loose ? "loose" : undefined} aria-current={e.id === current ? "page" : undefined}>
        {no && <span className="nc">{no}</span>}
        {title}
      </a>
    );
  };
  const appendix = chapters.filter(isAppendix);
  const main = chapters.filter((e) => !isAppendix(e));
  const loose = main.filter((e) => !volumes.some((v) => inVolume(e, v)));
  return (
    <aside ref={box} className={`bk-side${open ? " open" : ""}`} aria-label="全书目录">
      <button type="button" className="bk-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        目录
        <i aria-hidden="true">{open ? "收起" : "展开"}</i>
      </button>
      <nav className="bk-nav">
        {loose.map((e) => link(e, volumes.length > 0))}
        {volumes.map((v) => {
          const items = main.filter((e) => inVolume(e, v));
          const [no, name] = splitVolume(v.title);
          return items.length ? (
            <details key={v.title} open className="nav-vol">
              <summary>
                {no && <span className="nv">{no}</span>}
                {name}
              </summary>
              {items.map((e) => link(e))}
            </details>
          ) : null;
        })}
        {appendix.length > 0 && (
          <details open className="nav-vol">
            <summary>附录</summary>
            {appendix.map((e) => link(e))}
          </details>
        )}
        <p className="bk-note">© 猫叔 · 禁止商用与改编</p>
      </nav>
    </aside>
  );
}

// 章节阅读页（#/e/book/<id>）：左侧栏加单栏正文。
// 全书第一篇（前言）上方是书名页；每卷第一章上方是卷名。
export function ChapterPage({ core, id }: { core: Core; id: string }) {
  useBookFonts();
  const { data: chapters, error } = useAsync(loadChapters, []);
  const shell = chapters?.find((e) => e.id === id);
  useEffect(() => {
    if (chapters && !shell) goHome();
  }, [chapters, shell]);
  const { data: cards, error: cardsError } = useAsync(
    () => (shell ? loadGroupCards(BOOK, shell.group) : Promise.resolve(undefined)),
    [shell?.group],
  );
  useTitle(shell ? `${shell.name} · ${core.groupName(BOOK, shell.group)}` : "");
  const card = cards?.find((c) => c.id === id);
  const source = card && typeof card.body.text === "string" ? card.body.text : undefined;
  const html = useMemo(() => (source === undefined ? undefined : render(source)), [source]);
  if (!chapters || !shell) {
    return (
      <div className="bk">
        <div className="bk-content">
          <Status error={error} />
        </div>
      </div>
    );
  }

  const same = chapters.filter((e) => e.group === shell.group);
  const book = core.books.find((b) => b.id === shell.group);
  const raw = book?.volumes;
  const volumes = (Array.isArray(raw) ? raw : []).filter(
    (v) => v && typeof v.title === "string" && Array.isArray(v.parts) && v.parts.length === 2,
  );
  const at = same.findIndex((e) => e.id === id);
  const prev = same[at - 1];
  const next = same[at + 1];
  const [no, title] = splitName(shell.name);
  const volume = volumes.find((v) => partOf(shell) === v.parts[0]);
  const [volNo, volName] = volume ? splitVolume(volume.title) : ["", ""];

  return (
    <div className="bk">
      <Contents chapters={same} current={id} volumes={volumes} />
      <div className="bk-content">
        {at === 0 && book && (
          <header className="bk-hero">
            <h1>{book.name}</h1>
            <div className="bk-hero-rule" />
            {book.description && <p className="bk-hero-summary">{book.description}</p>}
            {book.author && <div className="bk-hero-author">{book.author}</div>}
          </header>
        )}
        {volume && (
          <header className="bk-vol">
            {volNo && <div className="wv-no">{volNo}</div>}
            <div className="wv-name">{volName}</div>
          </header>
        )}
        <article className="bk-ch">
          {no && <div className="ch-no">{no}</div>}
          <h1 className="ch-title">{title}</h1>
          {html !== undefined ? (
            <div className="bk-md" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <Status error={cardsError ?? (cards ? new Error("chapter missing in book file") : undefined)} />
          )}
          <nav className="bk-pager" aria-label="翻页">
            {prev ? (
              <a href={href.entry(prev.id)}>
                <i>上一章</i>
                <b>{prev.name}</b>
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a className="next" href={href.entry(next.id)}>
                <i>下一章</i>
                <b>{next.name}</b>
              </a>
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}
