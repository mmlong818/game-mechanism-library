// 读取发布包。约定见资料库的 CONTRACT.md（约定版本 1.x）。
// 先读 data/current.json 得到发布编号，再按需加载 manifest、groups、index 和单个分组的 cards 文件。
import { useEffect, useState } from "react";

export type Link = { to: string; rel: string; note?: string };
export type Shell = {
  id: string;
  collection: string;
  name: string;
  summary: string;
  group: string;
  tags: string[];
  links: Link[];
};
export type Card = Shell & { body: Record<string, unknown> };
export type Group = { id: string; name: string; count: number; description?: string; author?: string };
export type LibId = "mechanism" | "world" | "experience";

export const LIBS: { id: LibId; name: string; intro: string }[] = [
  { id: "mechanism", name: "机制", intro: "一条规则怎么运转，玩家因此要做什么决定。按主题浏览。" },
  { id: "world", name: "世界观", intro: "一个世界靠什么前提成立，这个前提给住在里面的人带来什么处境。按分组浏览。" },
  { id: "experience", name: "体验", intro: "玩家在某一刻感受到什么，这种感受由什么情境引起。按分组浏览。" },
];
export const isLib = (v: string): v is LibId => LIBS.some((l) => l.id === v);
// 书是另一种库（kind 为 articles）：分组是一本书，条目是一章，正文是 markdown。
export const BOOK = "book";
export const BOOK_NAME = "书";
export const libName = (id: string) => (id === BOOK ? BOOK_NAME : (LIBS.find((l) => l.id === id)?.name ?? id));

export type Core = {
  release: string;
  updated: string;
  contract: string;
  counts: Record<LibId, number>;
  groups: Record<LibId, Group[]>;
  books: Group[];
  groupName: (lib: string, group: string) => string;
};
export type Backlink = { from: string; rel: string };
export type All = {
  list: Shell[];
  byLib: Record<LibId, Shell[]>;
  byId: Map<string, Shell>;
  back: Map<string, Backlink[]>;
};

const BASE = import.meta.env.BASE_URL;
export const asset = (p: string) => BASE + p;
export const cover = (name: string) => asset(`covers/${name}.jpg`);

const cache = new Map<string, Promise<unknown>>();
function getJson<T>(path: string, fresh = false): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(asset(path), fresh ? { cache: "no-cache" } : undefined).then((r) => {
      if (!r.ok) throw new Error(`${path} (${r.status})`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

type Manifest = {
  contract_version: string;
  release: string;
  collections: { id: string; name: string; kind: string; count: number }[];
};

let corePromise: Promise<Core> | undefined;
export function loadCore(): Promise<Core> {
  corePromise ??= (async () => {
    const { release } = await getJson<{ release: string }>("data/current.json", true);
    const root = `data/release/${release}`;
    const manifest = await getJson<Manifest>(`${root}/manifest.json`);
    if (String(manifest.contract_version).split(".")[0] !== "1") {
      throw new Error(`unsupported contract version ${manifest.contract_version}`);
    }
    // 不认识的库或 kind 一律跳过。
    const present = LIBS.filter((l) => manifest.collections.some((c) => c.id === l.id && c.kind === "cards"));
    const groupLists = await Promise.all(present.map((l) => getJson<Group[]>(`${root}/collections/${l.id}/groups.json`)));
    const groups = { mechanism: [], world: [], experience: [] } as Record<LibId, Group[]>;
    const counts = { mechanism: 0, world: 0, experience: 0 } as Record<LibId, number>;
    present.forEach((l, i) => {
      groups[l.id] = groupLists[i];
      counts[l.id] = manifest.collections.find((c) => c.id === l.id)?.count ?? 0;
    });
    const books = manifest.collections.some((c) => c.id === BOOK && c.kind === "articles")
      ? await getJson<Group[]>(`${root}/collections/${BOOK}/groups.json`)
      : [];
    const names = new Map<string, string>();
    for (const b of books) names.set(`${BOOK}/${b.id}`, b.name);
    for (const l of present) for (const g of groups[l.id]) names.set(`${l.id}/${g.id}`, g.name);
    const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(release);
    return {
      release,
      updated: d ? `${d[1]} 年 ${Number(d[2])} 月 ${Number(d[3])} 日` : "",
      contract: manifest.contract_version,
      counts,
      groups,
      books,
      groupName: (lib, group) => names.get(`${lib}/${group}`) ?? group,
    };
  })();
  corePromise.catch(() => (corePromise = undefined));
  return corePromise;
}

const colPath = async (lib: string) => `data/release/${(await loadCore()).release}/collections/${lib}`;

export async function loadIndex(lib: LibId): Promise<Shell[]> {
  const core = await loadCore();
  if (!core.groups[lib].length) return [];
  return getJson<Shell[]>(`${await colPath(lib)}/index.json`);
}

// 书的全部章节外壳，顺序就是书里的章节顺序。
export async function loadChapters(): Promise<Shell[]> {
  const core = await loadCore();
  if (!core.books.length) return [];
  return getJson<Shell[]>(`${await colPath(BOOK)}/index.json`);
}

let allPromise: Promise<All> | undefined;
export function loadAll(): Promise<All> {
  allPromise ??= (async () => {
    const [chapters, ...lists] = await Promise.all([loadChapters(), ...LIBS.map((l) => loadIndex(l.id))]);
    const byLib = { mechanism: lists[0], world: lists[1], experience: lists[2] };
    const list = [...lists.flat(), ...chapters];
    const byId = new Map(list.map((e) => [e.id, e]));
    const back = new Map<string, Backlink[]>();
    for (const e of list) {
      for (const l of e.links ?? []) {
        if (l.to === e.id || !byId.has(l.to)) continue;
        const arr = back.get(l.to);
        if (arr) {
          if (!arr.some((b) => b.from === e.id)) arr.push({ from: e.id, rel: l.rel });
        } else back.set(l.to, [{ from: e.id, rel: l.rel }]);
      }
    }
    return { list, byLib, byId, back };
  })();
  allPromise.catch(() => (allPromise = undefined));
  return allPromise;
}

export async function loadGroupCards(lib: string, group: string): Promise<Card[]> {
  return getJson<Card[]>(`${await colPath(lib)}/cards/${group}.json`);
}

export async function loadRedirects(lib: string): Promise<Record<string, string | null>> {
  try {
    return await getJson<Record<string, string | null>>(`${await colPath(lib)}/redirects.json`);
  } catch {
    return {};
  }
}

export type Async<T> = { data?: T; error?: Error };
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<Async<T> & { key?: string }>({});
  const key = JSON.stringify(deps);
  useEffect(() => {
    let live = true;
    fn().then(
      (data) => live && setState({ data, key }),
      (error: Error) => live && setState({ error, key }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : {};
}
export const useCore = () => useAsync(loadCore, []);
export const useAll = () => useAsync(loadAll, []);
