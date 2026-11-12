import { useEffect } from "react";
import { libName, type Core, type Shell } from "./data";
import { href } from "./router";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · 猫叔的游戏知识库` : "猫叔的游戏知识库";
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

// 搜索结果列表：名称加开头那句话。卡片进三栏界面，书的章节进阅读页。
export function EntryList({ items, core, where = false }: { items: Shell[]; core: Core; where?: boolean }) {
  return (
    <ul className="elist">
      {items.map((e) => (
        <li key={e.id}>
          <a href={href.shell(e)}>
            <b>{e.name}</b>
          </a>
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
