import { useEffect, useMemo, useState } from "react";
import { BOOK, BOOK_NAME, LIBS, useAll, type Core, type Shell } from "./data";
import { href } from "./router";
import { Chips, EntryList, Status, useTitle } from "./ui";

const EXAMPLES = ["冷却", "牌组", "担保", "成长实感", "潜行"];
const PAGE = 60;

// 搜索：在三个卡片库里查名称、开头那句话和分组名；书按章节标题、开头和书名查。
export function SearchPage({ core, q, c }: { core: Core; q: string; c: string }) {
  useTitle(q ? `搜索“${q}”` : "搜索");
  const { data: all, error } = useAll();
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [q, c]);
  const hay = useMemo(
    () =>
      all?.list.map((e) => ({
        e,
        name: e.name.toLowerCase(),
        summary: e.summary.toLowerCase(),
        group: core.groupName(e.collection, e.group).toLowerCase(),
      })) ?? [],
    [all, core],
  );
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = useMemo(() => {
    if (!terms.length) return [];
    const out: { e: Shell; score: number }[] = [];
    for (const h of hay) {
      let score = 0;
      let ok = true;
      for (const t of terms) {
        let s = 0;
        if (h.name.includes(t)) s += h.name.startsWith(t) ? 6 : 4;
        if (h.group.includes(t)) s += 1;
        if (h.summary.includes(t)) s += 1;
        if (!s) {
          ok = false;
          break;
        }
        score += s;
      }
      if (ok) out.push({ e: h.e, score });
    }
    return out.sort((a, b) => b.score - a.score || a.e.name.length - b.e.name.length).map((x) => x.e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hay, terms.join(" ")]);
  const shown = c ? hits.filter((e) => e.collection === c) : hits;

  return (
    <>
      <header className="phead">
        <div>
          <h1>{q.trim() ? `搜索“${q.trim()}”` : "搜索"}</h1>
          <p>可以搜卡片的名称、开头那句话和所在的分组，也可以搜书里各章的标题和开头。多个词用空格隔开，会找同时包含这些词的条目。</p>
        </div>
      </header>
      {!all ? (
        <Status error={error} />
      ) : !terms.length ? (
        <p className="status">
          在页面顶部的搜索框里输入想找的词，比如一种玩法，或者你想解决的问题里的关键词。可以试试：
          {EXAMPLES.map((x) => (
            <a key={x} className="eg" href={href.search(x)}>
              {x}
            </a>
          ))}
        </p>
      ) : (
        <>
          <Chips
            label="按库筛选"
            value={c}
            to={(v) => href.search(q, v)}
            options={[
              { value: "", label: "全部", count: hits.length },
              ...[...LIBS, ...(core.books.length ? [{ id: BOOK, name: BOOK_NAME }] : [])].map((l) => ({
                value: l.id,
                label: l.name,
                count: hits.filter((e) => e.collection === l.id).length,
              })),
            ]}
          />
          {shown.length ? (
            <>
              <EntryList items={shown.slice(0, limit)} core={core} where />
              {shown.length > limit && (
                <button type="button" className="btn more" onClick={() => setLimit(limit + PAGE)}>
                  再显示 {Math.min(PAGE, shown.length - limit)} 条（还有 {shown.length - limit} 条）
                </button>
              )}
            </>
          ) : (
            <p className="status">没有找到相关的内容。换个更短的词试试，比如只留两三个字。</p>
          )}
        </>
      )}
    </>
  );
}
