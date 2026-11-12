import { useEffect, type ReactNode } from "react";
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

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="所在位置">
      <a href={href.home}>首页</a>
      {items.map((it) => (
        <span key={it.label}>
          <span aria-hidden="true"> / </span>
          {it.to ? <a href={it.to}>{it.label}</a> : <span>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// 条目列表：名称加一句话定义，文字为主。
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

export function PageHead({
  title,
  lead,
  img,
  children,
}: {
  title: string;
  lead?: ReactNode;
  img?: string;
  children?: ReactNode;
}) {
  return (
    <header className={`phead ${img ? "has-img" : ""}`}>
      {img && <img className="px" src={img} alt="" width={512} height={512} />}
      <div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
        {children}
      </div>
    </header>
  );
}
