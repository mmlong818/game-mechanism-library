// 书：目录页和章节阅读页。发布包里书是 kind 为 articles 的库，分组是一本书，条目是一章。
// 库里只有一本书时，#/c/book 直接是这本书的目录，不再隔一层书单。
import { useEffect, useMemo } from "react";
import { Marked, type Tokens } from "marked";
import { BOOK, BOOK_NAME, loadChapters, loadGroupCards, useAsync, type Core, type Group, type Shell } from "./data";
import { goHome, href, replaceHash } from "./router";
import { Status, useTitle } from "./ui";

const bookHref = (core: Core, slug: string) => (core.books.length > 1 ? href.book(slug) : href.book());
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

function ChapterList({ items }: { items: Shell[] }) {
  return (
    <ol className="elist chapters">
      {items.map((e) => (
        <li key={e.id}>
          <a href={href.entry(e.id)}>
            <b>{e.name}</b>
          </a>
          <p>{e.summary}</p>
        </li>
      ))}
    </ol>
  );
}

function BookToc({ core, book }: { core: Core; book: Group }) {
  useTitle(book.name);
  const { data: chapters, error } = useAsync(loadChapters, []);
  const mine = chapters?.filter((e) => e.group === book.id) ?? [];
  const main = mine.filter((e) => !isAppendix(e));
  const appendix = mine.filter(isAppendix);
  return (
    <>
      {core.books.length > 1 && (
        <nav className="crumbs" aria-label="所在位置">
          <a href={href.book()}>{BOOK_NAME}</a>
        </nav>
      )}
      <header className="phead">
        <div>
          <h1>{book.name}</h1>
          {book.author && <p className="byline">{book.author} 著</p>}
          {book.description && <p>{book.description}</p>}
        </div>
      </header>
      {!chapters ? (
        <Status error={error} />
      ) : (
        <>
          <ChapterList items={main} />
          {appendix.length > 0 && (
            <>
              <h2 className="chapters-sub">附录</h2>
              <ChapterList items={appendix} />
            </>
          )}
        </>
      )}
    </>
  );
}

// #/c/book 和 #/c/book/<书>。只有一本书时两者都落到这本书的目录，地址统一成 #/c/book。
export function BookPage({ core, slug }: { core: Core; slug: string }) {
  const single = core.books.length === 1;
  const book = single ? core.books[0] : core.books.find((b) => b.id === slug);
  const bad = !core.books.length || (slug !== "" && !book);
  useEffect(() => {
    if (bad) goHome();
    else if (single && slug) replaceHash(href.book());
  }, [bad, single, slug]);
  if (bad) return null;
  if (!book) return <BookList books={core.books} />;
  return <BookToc core={core} book={book} />;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeUrl = (u: string) => /^(https?:|mailto:)/i.test(u.trim());

type Section = { id: string; text: string };

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
        if (depth !== 2) return `<h${depth}>${inner}</h${depth}>\n`;
        const id = `sec-${sections.length + 1}`;
        sections.push({ id, text: this.parser.parseInline(tokens, this.parser.textRenderer) });
        return `<h2 id="${id}">${inner}</h2>\n`;
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

// 章节阅读页：页头是书名（回目录）和章节标题，正文，页尾是上一章、下一章。
export function ChapterPage({ core, id }: { core: Core; id: string }) {
  const { data: chapters, error } = useAsync(loadChapters, []);
  const index = chapters?.findIndex((e) => e.id === id) ?? -1;
  const shell = index >= 0 ? chapters![index] : undefined;
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
  const jump = (sec: string) => document.getElementById(sec)?.scrollIntoView({ block: "start" });

  return (
    <div className="reading">
      <article className="read">
        <header className="read-head">
          <a className="read-book" href={bookHref(core, shell.group)}>
            {core.groupName(BOOK, shell.group)}
          </a>
          <h1>{shell.name}</h1>
        </header>
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
      {page && page.sections.length > 1 && (
        <nav className="toc" aria-label="本章小节">
          <div>本章小节</div>
          {page.sections.map((s) => (
            <button key={s.id} type="button" onClick={() => jump(s.id)}>
              {s.text}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
