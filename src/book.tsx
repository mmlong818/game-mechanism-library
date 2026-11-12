// 书：三栏阅读界面。左栏是全书目录，中栏是正文，右栏是本章小节。
// 发布包里书是 kind 为 articles 的库，分组是一本书，条目是一章。
// 导航“书”（#/c/book）在库里只有一本书时直接打开这本书的第 1 章；有多本时才是书单。
import { useEffect, useMemo, useRef, useState } from "react";
import { Marked, type Tokens } from "marked";
import { BOOK, BOOK_NAME, loadChapters, loadGroupCards, useAsync, type Core, type Group, type Shell } from "./data";
import { goHome, href, replaceHash } from "./router";
import { Status, useTitle } from "./ui";

const isAppendix = (e: Shell) => e.tags.some((t) => /^part:\D/.test(t));

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

// #/c/book 和 #/c/book/<书>：落到那本书的第 1 章。库里有多本书而地址没指明哪一本时，显示书单。
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

type Section = { id: string; text: string; depth: number };

// 把一章的 markdown 转成 HTML。正文里的 HTML 一律当普通文字显示，不会被执行；
// 链接只留 http、https 和 mailto，其余只显示文字；图片只留 http、https。
function render(source: string): { html: string; sections: Section[] } {
  const sections: Section[] = [];
  const md = new Marked({
    gfm: true,
    renderer: {
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return esc(text);
      },
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        if (depth !== 2 && depth !== 3) return `<h${depth}>${inner}</h${depth}>\n`;
        const id = `sec-${sections.length + 1}`;
        sections.push({ id, depth, text: this.parser.parseInline(tokens, this.parser.textRenderer) });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
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
  const html = (md.parse(text, { async: false }) as string)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
  return { html, sections };
}

// 左栏：全书目录（书名在顶栏里，这里不重复）。宽屏固定在视口内、栏内滚动；窄屏收成正文上方的“目录”按钮。
function Contents({ chapters, current }: { chapters: Shell[]; current: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    setOpen(false);
    // 把当前章滚到栏内可见的位置，只动这一栏，不动页面。
    const el = box.current;
    const now = el?.querySelector<HTMLElement>("[aria-current]");
    if (el && now && el.scrollHeight > el.clientHeight) {
      const delta = now.getBoundingClientRect().top - el.getBoundingClientRect().top;
      el.scrollTop += delta - el.clientHeight / 2 + now.offsetHeight / 2;
    }
  }, [current]);
  const list = (items: Shell[]) => (
    <ol>
      {items.map((e) => (
        <li key={e.id}>
          <a href={href.entry(e.id)} aria-current={e.id === current ? "page" : undefined}>
            {e.name}
          </a>
        </li>
      ))}
    </ol>
  );
  const appendix = chapters.filter(isAppendix);
  return (
    <nav ref={box} className={`contents${open ? " open" : ""}`} aria-label="全书目录">
      <button type="button" className="contents-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        目录
        <i aria-hidden="true">{open ? "收起" : "展开"}</i>
      </button>
      <div className="contents-body">
        {list(chapters.filter((e) => !isAppendix(e)))}
        {appendix.length > 0 && (
          <>
            <div className="contents-sub">附录</div>
            {list(appendix)}
          </>
        )}
        <p className="contents-note">© 猫叔 · 禁止商用与改编</p>
      </div>
    </nav>
  );
}

// 右栏：本章的二、三级标题，随滚动标出当前所在的小节。
function Sections({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState("");
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const spy = () => {
      // 标题过了顶栏下沿一点就算进入这一节。
      const line = (document.querySelector<HTMLElement>(".top")?.offsetHeight ?? 64) + 32;
      let now = "";
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) now = s.id;
      }
      setActive(now);
    };
    spy();
    window.addEventListener("scroll", spy, { passive: true });
    return () => window.removeEventListener("scroll", spy);
  }, [sections]);
  // 小节多、右栏自己要滚动时，让当前小节保持在栏内可见。
  useEffect(() => {
    const el = box.current;
    const now = el?.querySelector<HTMLElement>("[aria-current]");
    if (el && now && el.scrollHeight > el.clientHeight) {
      const delta = now.getBoundingClientRect().top - el.getBoundingClientRect().top;
      if (delta < 40 || delta > el.clientHeight - 60) el.scrollTop += delta - el.clientHeight / 2;
    }
  }, [active]);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "start" });
  return (
    <nav ref={box} className="toc sections" aria-label="本章小节">
      <div>本章小节</div>
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className={s.depth === 3 ? "sub" : undefined}
          aria-current={s.id === active ? "true" : undefined}
          onClick={() => jump(s.id)}
        >
          {s.text}
        </button>
      ))}
    </nav>
  );
}

// 章节阅读页（#/e/book/<id>）。
export function ChapterPage({ core, id }: { core: Core; id: string }) {
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
  const page = useMemo(() => (source === undefined ? undefined : render(source)), [source]);
  if (!chapters || !shell) return <Status error={error} />;

  const same = chapters.filter((e) => e.group === shell.group);
  const at = same.findIndex((e) => e.id === id);
  const prev = same[at - 1];
  const next = same[at + 1];

  return (
    <div className="reading">
      <Contents chapters={same} current={id} />
      <article className="read">
        <h1>{shell.name}</h1>
        {page ? (
          <div className="md" dangerouslySetInnerHTML={{ __html: page.html }} />
        ) : (
          <Status error={cardsError ?? (cards ? new Error("chapter missing in book file") : undefined)} />
        )}
        <nav className="pager" aria-label="翻页">
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
      {page && page.sections.length > 1 && <Sections sections={page.sections} />}
    </div>
  );
}
