// 卡片库的三栏界面（机制、世界观、体验共用）。
// 左栏是分组，中栏是当前分组的卡片，右栏是当前这张卡的全文。三栏各自滚动，页面本身不滚动。
// 窄一些时左栏收成中栏顶部的下拉选择；再窄只留右栏，分组和卡片列表收进正文上方的抽屉。
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LIBS, cover, loadAll, loadIndex, loadRedirects, useAsync, type Core, type LibId, type Shell } from "./data";
import { CardPane } from "./entry";
import { goHome, href, replaceHash } from "./router";
import { Status, useTitle } from "./ui";

// 让栏里的当前项保持可见：只滚这一栏，不动别处。
function reveal(box: HTMLElement | null) {
  const now = box?.querySelector<HTMLElement>("[aria-current]");
  if (!box || !now) return;
  const a = box.getBoundingClientRect();
  const b = now.getBoundingClientRect();
  if (b.top < a.top + 8 || b.bottom > a.bottom - 8) box.scrollTop += b.top - a.top - a.height / 2 + b.height / 2;
}

export function BrowsePage({ core, lib, group, card }: { core: Core; lib: LibId; group: string; card: string }) {
  const meta = LIBS.find((l) => l.id === lib)!;
  const { data: index, error } = useAsync(() => loadIndex(lib), [lib]);
  const groups = useMemo(() => [...core.groups[lib]].sort((a, b) => b.count - a.count), [core, lib]);
  const g = groups.find((x) => x.id === group) ?? (group ? undefined : groups[0]);
  const inGroup = useMemo(() => (g && index ? index.filter((e) => e.group === g.id) : []), [index, g]);
  // 地址里没写卡片时先按第一张显示，随后把地址补全。
  const shell = card ? inGroup.find((e) => e.id === `${lib}/${card}`) : inGroup[0];
  const exact = Boolean(g && shell && group === g.id && card);

  useEffect(() => {
    if (!index || exact) return;
    if (!groups.length) return goHome();
    let live = true;
    (async () => {
      if (card) {
        // 卡片写对了但分组不对，或者是合并、改名前的旧 id。
        const hit = index.find((e) => e.id === `${lib}/${card}`);
        if (hit) return replaceHash(href.card(hit));
        const to = (await loadRedirects(lib))[`${lib}/${card}`];
        const target = to ? (await loadAll()).byId.get(to) : undefined;
        if (!live) return;
        if (target) return replaceHash(href.shell(target));
      }
      const first = index.find((e) => e.group === (g ?? groups[0]).id);
      if (first) replaceHash(href.card(first));
      else goHome();
    })();
    return () => {
      live = false;
    };
  }, [index, exact, lib, group, card, g, groups]);

  useTitle(shell ? `${shell.name} · ${meta.name}` : meta.name);

  const groupBox = useRef<HTMLElement>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => reveal(groupBox.current), [g?.id, lib, Boolean(index)]);
  useEffect(() => {
    reveal(listBox.current);
    if (refocus.current) {
      refocus.current = false;
      listBox.current?.querySelector<HTMLElement>("[aria-current]")?.focus({ preventScroll: true });
    }
  }, [shell?.id, inGroup.length]);

  // 窄屏的抽屉：选了卡片就收起；换分组不收，接着选卡片。
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [lib]);

  // 焦点在中栏时，上下键换到上一张、下一张。
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const at = inGroup.findIndex((x) => x.id === shell?.id);
    const next = inGroup[at + (e.key === "ArrowDown" ? 1 : -1)];
    if (at < 0 || !next) return;
    e.preventDefault();
    refocus.current = true;
    location.hash = href.card(next);
  };

  if (!index) return <Status error={error} />;
  if (!g) return null;

  return (
    <div className={`three${open ? " open" : ""}`}>
      <nav className="col col-groups" ref={groupBox} aria-label={`${meta.name}的分组`}>
        <ul>
          {groups.map((x) => (
            <li key={x.id}>
              <a href={href.group(lib, x.id)} aria-current={x.id === g.id ? "true" : undefined}>
                <img className="px" src={cover(`${lib}-${x.id}`)} alt="" width={30} height={30} loading="lazy" />
                <b>{x.name}</b>
                <i className="num">{x.count}</i>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <button type="button" className="drawer-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>分组和卡片列表</b>
        <i>
          {g.name} · {open ? "收起" : "展开"}
        </i>
      </button>

      <section className="col col-list" aria-label={`${g.name}的卡片`}>
        <div className="list-head">
          <label className="group-select">
            <span className="sr">分组</span>
            <select value={g.id} onChange={(e) => (location.hash = href.group(lib, e.target.value))}>
              {groups.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}（{x.count}）
                </option>
              ))}
            </select>
          </label>
          <h2 className="list-title">
            {g.name}
            <i className="num">{g.count} 张</i>
          </h2>
        </div>
        <div className="list-items" ref={listBox} onKeyDown={onKey}>
          <ul>
            {inGroup.map((e) => (
              <li key={e.id}>
                <a href={href.card(e)} aria-current={e.id === shell?.id ? "true" : undefined} onClick={() => setOpen(false)}>
                  {e.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="col col-card">{shell ? <CardPane lib={lib} shell={shell} /> : <Status />}</div>
    </div>
  );
}

// 旧的详情页地址 #/e/<库>/<id>：换成这张卡的三栏地址。
export function EntryRedirect({ lib, id }: { lib: LibId; id: string }) {
  const { data: index, error } = useAsync(() => loadIndex(lib), [lib]);
  useEffect(() => {
    if (!index) return;
    const hit = index.find((e: Shell) => e.id === id);
    if (hit) return replaceHash(href.card(hit));
    let live = true;
    (async () => {
      const to = (await loadRedirects(lib))[id];
      const target = to ? (await loadAll()).byId.get(to) : undefined;
      if (!live) return;
      if (target) replaceHash(href.shell(target));
      else goHome();
    })();
    return () => {
      live = false;
    };
  }, [index, lib, id]);
  return <Status error={error} />;
}
