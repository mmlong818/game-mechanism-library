// 卡片全文（三栏界面的右栏）。三类卡各一种版式；body 里不认识的字段忽略，缺字段的栏目不显示。
import { useEffect, useRef, type ReactNode } from "react";
import { LIBS, loadGroupCards, useAll, useAsync, type All, type Card, type LibId, type Shell } from "./data";
import { href } from "./router";
import { Status } from "./ui";

type Obj = Record<string, unknown>;
const S = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const SL = (v: unknown): string[] => (Array.isArray(v) ? v.map(S).filter(Boolean) : []);
const OL = (v: unknown): Obj[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Obj[]) : [];
const O = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

type Row = { key: string; label: string; node: ReactNode };

const REL_BACK: Record<string, string> = {
  related: "相关",
  component: "由它组成",
  "uses-mechanism": "用到了它",
};

function Bullets({ items }: { items: string[] }) {
  return (
    <ul>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Pairs({ items }: { items: [string, string][] }) {
  const shown = items.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <dl className="pairs">
      {shown.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Fixes({ items }: { items: Obj[] }) {
  return (
    <ul className="fixes">
      {items.map((p, i) => (
        <li key={i}>
          <span className="problem">{S(p.problem)}</span>
          {S(p.fix) && (
            <span className="fix">
              <i>改法</i>
              {S(p.fix)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Named({ items, a, b }: { items: Obj[]; a: string; b: string }) {
  return (
    <ul className="named">
      {items.map((v, i) => (
        <li key={i}>
          <b>{S(v[a])}</b>
          <span>{S(v[b])}</span>
        </li>
      ))}
    </ul>
  );
}

function host(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function buildRows(card: Card, all: All): Row[] {
  const b = card.body;
  const lib = card.collection;
  const shown = new Set<string>();
  const rows: Row[] = [];
  const add = (key: string, label: string, has: unknown, node: () => ReactNode) => {
    if (has) rows.push({ key, label, node: node() });
  };

  // 把正文里按库内 id 提到的条目渲染成站内链接；找不到的只显示名字。
  const ref = (targetLib: string, id: string, name: string) => {
    const gid = `${targetLib}/${id}`;
    const hit = id ? all.byId.get(gid) : undefined;
    if (!hit) return <b>{name}</b>;
    shown.add(gid);
    return (
      <a className="ref" href={href.shell(hit)}>
        {name || hit.name}
      </a>
    );
  };
  const refList = (items: Obj[], targetLib: string, noteKeys: string[]) => (
    <ul className="named">
      {items.map((v, i) => (
        <li key={i}>
          {ref(targetLib, S(v.id), S(v.name))}
          <span>{noteKeys.map((k) => S(v[k])).find(Boolean) ?? ""}</span>
        </li>
      ))}
    </ul>
  );
  const examples = (items: Obj[]) => (
    <div className="examples">
      {items.map((ex, i) => {
        const sources = SL(ex.sources);
        return (
          <section key={i} className="example">
            <h3>
              {S(ex.appid) ? (
                <a href={`https://store.steampowered.com/app/${S(ex.appid)}/`} target="_blank" rel="noopener noreferrer">
                  {S(ex.game)}
                </a>
              ) : (
                S(ex.game)
              )}
            </h3>
            <Pairs
              items={[
                ["规则", S(ex.rule)],
                ["效果", S(ex.effect)],
                ["做法", S(ex.how)],
              ]}
            />
            {sources.length > 0 && (
              <p className="sources">
                <span>出处</span>
                {sources.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                    {host(u)}
                  </a>
                ))}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
  const strRow = (key: string, label: string) => add(key, label, SL(b[key]).length, () => <Bullets items={SL(b[key])} />);

  if (lib === "mechanism") {
    strRow("purpose", "为什么用它");
    const how = O(b.how_it_works);
    const steps: [string, string][] = [
      ["玩家做什么", S(how.action)],
      ["限制与代价", S(how.constraint)],
      ["局面怎么变", S(how.state_change)],
      ["玩家看到什么", S(how.feedback)],
    ];
    add("how_it_works", "怎么运作", steps.some(([, v]) => v), () => <Pairs items={steps} />);
    add("decision", "玩家在这里权衡什么", S(b.decision), () => <p>{S(b.decision)}</p>);
    const tuning = OL(b.tuning);
    add("tuning", "设计者能调什么", tuning.length, () => (
      <div className="knobs">
        {tuning.map((t, i) => (
          <div className="knob" key={i}>
            <b>{S(t.knob)}</b>
            <span>{S(t.effect)}</span>
            {S(t.seen_in) && (
              <span className="seen">
                <i>见于</i>
                {S(t.seen_in)}
              </span>
            )}
          </div>
        ))}
      </div>
    ));
    const comps = OL(b.components);
    add("components", "由哪些机制组成", comps.length, () => refList(comps, "mechanism", ["role"]));
    const variants = OL(b.variants);
    add("variants", "有哪些变体", variants.length, () => (
      <ul className="named">
        {variants.map((v, i) => (
          <li key={i}>
            <b>{S(v.name)}</b>
            <span>
              {S(v.rule)}
              {SL(v.games).length > 0 && <em className="games">{SL(v.games).join("、")}</em>}
            </span>
          </li>
        ))}
      </ul>
    ));
    const ex = OL(b.examples);
    add("examples", "哪些游戏这样做", ex.length, () => examples(ex));
    const pit = OL(b.pitfalls);
    add("pitfalls", "容易做坏的地方", pit.length, () => <Fixes items={pit} />);
    const rel = OL(b.related);
    add("related", "相关的机制", rel.length, () => refList(rel, "mechanism", ["relation"]));
  } else {
    const mech = OL(b.mechanisms);
    const mechRow = () => add("mechanisms", lib === "world" ? "适合搭配的机制" : "用哪些机制去做", mech.length, () => refList(mech, "mechanism", ["why", "how"]));
    const dials = OL(b.dials);
    const dialRow = () => add("dials", "设计者能调什么", dials.length, () => <Named items={dials} a="dial" b="effect" />);
    const variants = OL(b.variants);
    const variantRow = () => add("variants", "有哪些变体", variants.length, () => <Named items={variants} a="name" b="twist" />);
    const ex = OL(b.examples);
    const exampleRow = () => add("examples", "哪些游戏这样做", ex.length, () => examples(ex));
    const rel = OL(b.related);
    const relatedRow = () => add("related", lib === "world" ? "相关的世界观" : "相关的体验", rel.length, () => refList(rel, lib, ["relation"]));

    if (lib === "world") {
      const axioms = OL(b.axioms);
      add("axioms", "这个世界的规律", axioms.length, () => (
        <div className="axioms">
          {axioms.map((a, i) => (
            <div className="axiom" key={i}>
              <p>
                <b>{S(a.statement)}</b>
              </p>
              <ul>
                {SL(a.consequences).map((c, j) => (
                  <li key={`c${j}`}>
                    <i>后果</i>
                    {c}
                  </li>
                ))}
                {SL(a.limits).map((c, j) => (
                  <li key={`l${j}`} className="limit">
                    <i>限度</i>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ));
      strRow("space", "空间怎样安排");
      const history = OL(b.history);
      add("history", "历史留下了什么", history.length, () => (
        <ul className="fixes">
          {history.map((h, i) => (
            <li key={i}>
              <span>{S(h.turn)}</span>
              {S(h.traces) && (
                <span className="fix">
                  <i>痕迹</i>
                  {S(h.traces)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ));
      strRow("society", "人群与制度");
      strRow("daily_life", "日常生活");
      strRow("tensions", "内在的矛盾");
      strRow("unknowns", "留给你来定的");
      strRow("read_by_player", "玩家怎样看出来");
      add("player_seat", "玩家是谁", S(b.player_seat), () => <p>{S(b.player_seat)}</p>);
      mechRow();
      dialRow();
      variantRow();
      exampleRow();
      const pit = OL(b.pitfalls);
      add("pitfalls", "容易写坏的地方", pit.length, () => <Fixes items={pit} />);
      relatedRow();
    } else {
      strRow("why_wanted", "为什么想要它");
      strRow("not_for", "代价和不适合的情况");
      strRow("conditions", "要同时满足的条件");
      const arc = O(b.arc);
      const beats: [string, string][] = [
        ["铺垫", S(arc.setup)],
        ["触发", S(arc.trigger)],
        ["回落", S(arc.aftermath)],
      ];
      add("arc", "怎么起落", beats.some(([, v]) => v), () => <Pairs items={beats} />);
      strRow("signs", "怎么看出玩家感受到了");
      mechRow();
      dialRow();
      const killers = OL(b.killers);
      add("killers", "什么会毁掉它", killers.length, () => <Fixes items={killers} />);
      variantRow();
      exampleRow();
      relatedRow();
    }
  }

  // links 里正文没有带到的条目，单列一栏。
  const rest = (card.links ?? []).filter((l) => !shown.has(l.to) && all.byId.has(l.to));
  for (const l of rest) shown.add(l.to);
  add("links", "还和这些卡片有关", rest.length, () => (
    <ul className="named">
      {rest.map((l) => (
        <li key={l.to}>
          <a className="ref" href={href.shell(all.byId.get(l.to)!)}>
            {all.byId.get(l.to)!.name}
          </a>
          <span>{l.note ?? ""}</span>
        </li>
      ))}
    </ul>
  ));

  // 反向链接：三个库的 index 里指向这一条的条目。
  // 已经在上面各栏出现过的卡片不再重复列出。
  const back = (all.back.get(card.id) ?? []).filter((x) => !shown.has(x.from));
  add("backlinks", "哪些卡片提到了它", back.length, () => (
    <div className="back">
      {LIBS.map((l) => {
        const items = back.filter((x) => x.from.startsWith(`${l.id}/`));
        if (!items.length) return null;
        return (
          <div key={l.id}>
            <h3>
              {l.name}
              <i className="num">{items.length}</i>
            </h3>
            <ul>
              {items.map((x) => (
                <li key={x.from}>
                  <a className="ref" href={href.shell(all.byId.get(x.from)!)}>
                    {all.byId.get(x.from)!.name}
                  </a>
                  <span>{REL_BACK[x.rel] ?? REL_BACK.related}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  ));
  return rows;
}

const LEAD: Record<LibId, string> = { mechanism: "它是什么", world: "根本事实", experience: "玩家感受到什么" };

// 右栏：一张卡的全文。名称和开头那句话来自 index，马上就能显示；其余栏目等该分组的 cards 文件。
export function CardPane({ lib, shell }: { lib: LibId; shell: Shell }) {
  const { data: all, error: allError } = useAll();
  const { data: cards, error: cardsError } = useAsync(() => loadGroupCards(lib, shell.group), [lib, shell.group]);
  const box = useRef<HTMLElement>(null);
  // 换卡片时回到顶部。
  useEffect(() => {
    box.current?.parentElement?.scrollTo(0, 0);
  }, [shell.id]);
  const card = cards?.find((c) => c.id === shell.id);
  const rows = card && all ? buildRows(card, all) : [];
  const boundary = card ? S(card.body.boundary) : "";
  const failed = allError ?? cardsError ?? (cards && !card ? new Error("card missing in group file") : undefined);

  return (
    <article className="card" ref={box}>
      <header className="card-head">
        <h1>{shell.name}</h1>
        <dl className="lead">
          <div>
            <dt>{LEAD[lib]}</dt>
            <dd className="definition">{shell.summary}</dd>
          </div>
          {boundary && (
            <div>
              <dt>不算这一条的</dt>
              <dd>{boundary}</dd>
            </div>
          )}
        </dl>
      </header>
      {rows.length ? (
        rows.map((r) => (
          <section className="row" key={r.key}>
            <h2 className="label">{r.label}</h2>
            <div className="body">{r.node}</div>
          </section>
        ))
      ) : (
        <Status error={failed} />
      )}
    </article>
  );
}
