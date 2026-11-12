import { useEffect, useMemo, useState } from "react";
import { LEVELS, LIBS, RARE, cover, loadIndex, useAll, useAsync, type Core, type LibId, type Shell } from "./data";
import { goHome, href } from "./router";
import { Chips, Crumbs, EntryList, PageHead, Status, useTitle } from "./ui";

const MECH_FILTERS = [
  { value: "", label: "全部" },
  ...LEVELS.map((l) => ({ value: l, label: l })),
  { value: "new", label: RARE },
];
const cleanTag = (lib: LibId, tag: string) => (lib === "mechanism" && MECH_FILTERS.some((f) => f.value === tag) ? tag : "");
const match = (e: Shell, tag: string) => !tag || e.tags.includes(tag);

// 库的目录页：分组列表加条数；机制库另有层级和“新机制”筛选。
export function CollectionPage({ core, lib, tag: rawTag }: { core: Core; lib: LibId; tag: string }) {
  const meta = LIBS.find((l) => l.id === lib)!;
  const tag = cleanTag(lib, rawTag);
  useTitle(`${meta.name}库`);
  const { data: index, error } = useAsync(() => loadIndex(lib), [lib]);
  const groups = core.groups[lib];
  const tagCount = (t: string) => index?.filter((e) => match(e, t)).length;
  const rows = groups
    .map((g) => {
      const items = index?.filter((e) => e.group === g.id && match(e, tag)) ?? [];
      return { g, items, count: index ? items.length : g.count };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <>
      <Crumbs items={[{ label: meta.name }]} />
      <PageHead
        title={`${meta.name}库`}
        lead={`${meta.blurb}共 ${core.counts[lib]} ${meta.unit}，分 ${groups.length} 个${meta.groupWord}。点一个${meta.groupWord}看里面的卡片。`}
      />
      {lib === "mechanism" && (
        <>
          <Chips
            label="筛选"
            value={tag}
            to={(v) => href.collection(lib, v)}
            options={MECH_FILTERS.map((f) => ({ ...f, count: tagCount(f.value) }))}
          />
          <p className="hint">
            具体机制是一条可以直接照做的规则；机制家族是同一思路下的一组做法；设计模式由几条机制组合而成。{RARE}是市面上很少见到的规则，或者原创的规则设想。
          </p>
        </>
      )}
      {error && <Status error={error} />}
      <ul className="glist">
        {rows.map(({ g, items, count }) => (
          <li key={g.id}>
            <a href={href.group(lib, g.id, tag)}>
              <b>{g.name}</b>
              <i className="num">
                {count} {meta.unit}
              </i>
            </a>
            {items.length > 0 && (
              <p>
                {items
                  .slice(0, 3)
                  .map((e) => e.name)
                  .join("；")}
                {items.length > 3 && " 等"}
              </p>
            )}
          </li>
        ))}
      </ul>
      {index && rows.length === 0 && <p className="status">没有符合的卡片。换一个筛选看看。</p>}
    </>
  );
}

// 分组页：该分组全部条目，名称加一句话定义。头部用一次该分组的封面。
export function GroupPage({ core, lib, group, tag: rawTag }: { core: Core; lib: LibId; group: string; tag: string }) {
  const meta = LIBS.find((l) => l.id === lib)!;
  const g = core.groups[lib].find((x) => x.id === group);
  const tag = cleanTag(lib, rawTag);
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
      <Crumbs items={[{ label: meta.name, to: href.collection(lib) }, { label: g.name }]} />
      <PageHead
        title={g.name}
        img={cover(`${lib}-${g.id}`)}
        lead={`${g.count} ${meta.unit}${meta.name}卡片。点标题看全文。`}
      />
      <div className="tools">
        {lib === "mechanism" && (
          <Chips
            label="筛选"
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
      {!index ? (
        <Status error={error} />
      ) : items.length ? (
        <>
          {(tag || needle) && (
            <p className="hint">
              找到 {items.length} {meta.unit}。
            </p>
          )}
          <EntryList items={items} core={core} />
        </>
      ) : (
        <p className="status">没有符合的卡片。换个词或换一个筛选看看。</p>
      )}
    </>
  );
}

// 少见做法列表：带 new 标签的机制，按主题分段。
export function NewPage({ core }: { core: Core }) {
  useTitle(RARE);
  const { data: index, error } = useAsync(() => loadIndex("mechanism"), []);
  const fresh = index?.filter((e) => e.tags.includes("new")) ?? [];
  const sections = core.groups.mechanism
    .map((g) => ({ g, items: fresh.filter((e) => e.group === g.id) }))
    .filter((s) => s.items.length)
    .sort((a, b) => b.items.length - a.items.length);
  return (
    <>
      <Crumbs items={[{ label: "机制", to: href.collection("mechanism") }, { label: RARE }]} />
      <PageHead
        title={RARE}
        img={cover("section-new")}
        lead={
          index
            ? `${fresh.length} 张机制卡片，分在 ${sections.length} 个主题里。有的是市面上很少见到的规则，只在个别游戏里出现过；有的是原创的规则设想。想找没见过的点子，从这里翻。`
            : "市面上很少见到的规则，以及原创的规则设想。"
        }
      />
      {!index && <Status error={error} />}
      {sections.length > 0 && (
        <nav className="jump" aria-label="按主题跳转">
          {sections.map((s) => (
            <button
              key={s.g.id}
              type="button"
              onClick={() => document.getElementById(`new-${s.g.id}`)?.scrollIntoView({ block: "start" })}
            >
              {s.g.name}
              <i>{s.items.length}</i>
            </button>
          ))}
        </nav>
      )}
      {sections.map((s) => (
        <section key={s.g.id} id={`new-${s.g.id}`} className="lsec">
          <h2>
            <a href={href.group("mechanism", s.g.id, "new")}>{s.g.name}</a>
            <i className="num">{s.items.length} 张</i>
          </h2>
          <EntryList items={s.items} core={core} />
        </section>
      ))}
    </>
  );
}

const EXAMPLES = ["冷却", "牌组", "担保", "成长实感", "潜行"];
const PAGE = 60;

// 搜索：在三个库的 index 里查名称、一句话定义和分组名。
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
      <Crumbs items={[{ label: "搜索" }]} />
      <PageHead
        title={q.trim() ? `搜索“${q.trim()}”` : "搜索"}
        lead="可以搜卡片的名称、开头那句话和所在的分组。多个词用空格隔开，会找同时包含这些词的卡片。"
      />
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
              ...LIBS.map((l) => ({ value: l.id, label: l.name, count: hits.filter((e) => e.collection === l.id).length })),
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
            <p className="status">没有找到相关的卡片。换个更短的词试试，比如只留两三个字。</p>
          )}
        </>
      )}
    </>
  );
}
