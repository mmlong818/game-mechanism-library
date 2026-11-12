import { useEffect } from "react";
import { LEVELS, libName, type Core, type Shell } from "./data";
import { href } from "./router";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · 游戏设计资料库` : "游戏设计资料库";
  }, [title]);
}

export function Status({ error }: { error?: Error }) {
  if (error) {
    console.warn(error);
    return (
      <p className="status" role="alert">
        这一页没有加载出来。请刷新页面再试一次。
      </p>
    );
  }
  return (
    <p className="status" aria-live="polite">
      正在加载……
    </p>
  );
}

// 只显示机制库的层级标签；发布包里的其他标签（new、thin）网站不区分。
export function Tags({ tags }: { tags: string[] }) {
  const shown = tags.filter((t) => LEVELS.includes(t));
  if (!shown.length) return null;
  return (
    <span className="tags">
      {shown.map((t) => (
        <span key={t} className="tag">
          {t}
        </span>
      ))}
    </span>
  );
}

// 面包屑：库名 / 分组名。库名链接回该库的封面墙页。
export function Crumbs({ lib, group, core, linkGroup = false }: { lib: string; group: string; core: Core; linkGroup?: boolean }) {
  const groupName = core.groupName(lib, group);
  return (
    <nav className="crumbs" aria-label="所在位置">
      <a href={href.wall(lib)}>{libName(lib)}</a>
      <span aria-hidden="true"> / </span>
      {linkGroup ? <a href={href.group(lib, group)}>{groupName}</a> : <span>{groupName}</span>}
    </nav>
  );
}

// 卡片列表：名称加开头那句话，文字为主。每张卡只有名称这一个链接。
export function EntryList({ items, core, where = false }: { items: Shell[]; core: Core; where?: boolean }) {
  return (
    <ul className="elist">
      {items.map((e) => (
        <li key={e.id}>
          <a href={href.entry(e.id)}>
            <b>{e.name}</b>
          </a>
          <Tags tags={e.tags} />
          {where && (
            <span className="where">
              {libName(e.collection)} · {core.groupName(e.collection, e.group)}
            </span>
          )}
          <p>{e.summary}</p>
        </li>
      ))}
    </ul>
  );
}

export function Chips({
  options,
  value,
  to,
  label,
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  to: (value: string) => string;
  label: string;
}) {
  return (
    <div className="filter" role="group" aria-label={label}>
      {options.map((o) => (
        <a key={o.value} href={to(o.value)} aria-current={o.value === value ? "true" : undefined}>
          {o.label}
          {o.count !== undefined && <i>{o.count}</i>}
        </a>
      ))}
    </div>
  );
}
