import { useEffect, useMemo, useState } from "react";
import { BOOK, BOOK_NAME, LEVELS, LIBS, cover, loadIndex, useAll, useAsync, type Core, type LibId, type Shell } from "./data";
import { goHome, href } from "./router";
import { Chips, Crumbs, EntryList, Status, useTitle } from "./ui";

// 封面墙页：一个库的全部分组，一排五张小方图，图下是分组名和条数。
// 机制的封面墙就是首页；世界观、体验各一页。顶部只有一行说明。
export function WallPage({ core, lib }: { core: Core; lib: LibId }) {
  const meta = LIBS.find((l) => l.id === lib)!;
  useTitle(meta.name);
  const groups = [...core.groups[lib]].sort((a, b) => b.count - a.count);
  return (
    <>
      <h1 className="wall-intro">
        <b>{meta.name}</b>：{meta.intro}
      </h1>
      <ul className="covers">
        {groups.map((g) => (
          <li key={g.id}>
            <a href={href.group(lib, g.id)}>
              <img className="px" src={cover(`${lib}-${g.id}`)} alt="" width={512} height={512} loading="lazy" />
              <span className="cap">
                <b>{g.name}</b>
                <i className="num">{g.count} 张</i>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

const MECH_FILTERS = [{ value: "", label: "全部" }, ...LEVELS.map((l) => ({ value: l, label: l }))];
const LEVEL_HINT = "具体机制是一条可以直接照做的规则；机制家族是同一思路下的一组做法；设计模式由几条机制组合而成。";
const match = (e: Shell, tag: string) => !tag || e.tags.includes(tag);

// 分组页：该分组全部卡片，名称加开头那句话。头部用一次该分组的封面。机制可按层级筛选。
export function GroupPage({ core, lib, group, tag: rawTag }: { core: Core; lib: LibId; group: string; tag: string }) {
  const meta = LIBS.find((l) => l.id === lib)!;
  const g = core.groups[lib].find((x) => x.id === group);
  const tag = lib === "mechanism" && LEVELS.includes(rawTag) ? rawTag : "";
  const [text, setText] = useState("");
  useEffect(() => {
    if (!g) goHome();
  }, [g]);
  useEffect(() => setText(""), [lib, group]);
  useTitle(g ? `${g.name} · ${meta.name}` : "");
  const { data: index, error } = useAsync(() => loadIndex(lib), [lib]);
  if (!g) return null;
  const inGroup = index?.filter((e) => e.group === group) ?? [];
  const needle = text.trim().toLowerCase();
  const items = inGroup.filter(
    (e) => match(e, tag) && (!needle || e.name.toLowerCase().includes(needle) || e.summary.toLowerCase().includes(needle)),
  );

  return (
    <>
      <Crumbs lib={lib} group={group} core={core} />
      <header className="phead has-img">
        <img className="px" src={cover(`${lib}-${g.id}`)} alt="" width={512} height={512} />
        <div>
          <h1>{g.name}</h1>
          <p>{g.count} 张卡片，点名称看全文。</p>
        </div>
      </header>
      <div className="tools">
        {lib === "mechanism" && (
          <Chips
            label="按层级筛选"
            value={tag}
            to={(v) => href.group(lib, group, v)}
            options={MECH_FILTERS.map((f) => ({ ...f, count: inGroup.filter((e) => match(e, f.value)).length })).filter(
              (f) => f.value === "" || f.count > 0,
            )}
          />
        )}
        {g.count > 12 && (
          <label className="mini-search">
            <span className="sr">在这一页里找</span>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="在这一页里找" />
          </label>
        )}
      </div>
      {lib === "mechanism" && <p className="hint">{LEVEL_HINT}</p>}
      {!index ? (
        <Status error={error} />
      ) : items.length ? (
        <EntryList items={items} core={core} />
      ) : (
        <p className="status">没有符合的卡片。换个词或换一个筛选看看。</p>
      )}
    </>
  );
}

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
