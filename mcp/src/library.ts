/**
 * 核心查询逻辑：加载发布包、建索引、六个查询函数。
 *
 * 这个文件不依赖任何传输方式，也不依赖 Node 专有模块（文件、网络都经由 ReleaseSource），
 * 所以本地 stdio、Node HTTP、Cloudflare Workers 都能直接复用。
 * 发布包的格式见 ../../CONTRACT.md。
 */

/** 本程序认识的约定大版本号。 */
export const SUPPORTED_CONTRACT_MAJOR = 1;
/**
 * 认识的 kind。两种 kind 的目录结构相同，所以用同一套逻辑读取。
 * 加载哪些库只看 kind、不看库 id：manifest 里新增一个库，这里不用改代码。kind 不认识的库跳过，不报错。
 */
export const KNOWN_KINDS: readonly string[] = ['cards', 'articles'];

/** 资料库给人看的名称和项目主页，出现在 get_library_info 的返回里。 */
export const LIBRARY_NAME = '猫叔的游戏知识库';
export const LIBRARY_HOMEPAGE = 'https://github.com/mmlong818/game-mechanism-library';

export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;
export const LIST_GROUP_DEFAULT_LIMIT = 60;
export const LIST_GROUP_MAX_LIMIT = 200;

/** 发布包的读取方式：给相对路径（如 `collections/mechanism/index.json`），返回解析好的 JSON。 */
export interface ReleaseSource {
  /** 给人看的来源说明（目录或网址）。 */
  describe(): string;
  /** 读取 manifest.json 之后调用一次，让来源拿到文件校验和（可选）。 */
  setManifest?(manifest: Manifest): void;
  readJson(relPath: string): Promise<unknown>;
}

export interface ManifestCollection {
  id: string;
  name: string;
  kind: string;
  count: number;
  schema_version?: string;
}

/** 内容的授权说明（manifest.json 里的可选字段）。 */
export interface ManifestLicense {
  content?: string;
  content_url?: string;
  attribution?: string;
  notice?: string;
}

export interface Manifest {
  license?: ManifestLicense;
  contract_version: string;
  release: string;
  previous_release: string | null;
  collections: ManifestCollection[];
  files?: Record<string, string>;
}

export interface ShellLink {
  to: string;
  rel: string;
  note?: string;
}

/** 条目的外壳（约定第 3 节）。 */
export interface Shell {
  id: string;
  collection: string;
  name: string;
  summary: string;
  group: string;
  tags: string[];
  links: ShellLink[];
}

export interface Entry extends Shell {
  body: unknown;
}

export interface GroupInfo {
  id: string;
  name: string;
  count: number;
}

interface LoadedCollection {
  meta: ManifestCollection;
  groups: GroupInfo[];
  groupById: Map<string, GroupInfo>;
  entries: Shell[];
}

/** 给使用者（模型）看的错误：参数不对、条目不存在等。不是程序故障。 */
export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryError';
  }
}

export interface SearchParams {
  query: string;
  collection?: string;
  group?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asShell(raw: unknown, collection: string): Shell | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const links: ShellLink[] = [];
  if (Array.isArray(raw.links)) {
    for (const l of raw.links) {
      if (!isObject(l) || typeof l.to !== 'string') continue;
      const link: ShellLink = { to: l.to, rel: typeof l.rel === 'string' ? l.rel : 'related' };
      if (typeof l.note === 'string' && l.note) link.note = l.note;
      links.push(link);
    }
  }
  return {
    id: raw.id,
    collection: typeof raw.collection === 'string' ? raw.collection : collection,
    name: raw.name,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    group: typeof raw.group === 'string' ? raw.group : '',
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    links,
  };
}

export class Library {
  private readonly collections = new Map<string, LoadedCollection>();
  private readonly byId = new Map<string, Shell>();
  private readonly redirects = new Map<string, string | null>();
  /** 入链：目标 id → 指向它的 (来源条目, rel)。 */
  private readonly incoming = new Map<string, { from: Shell; rel: string }[]>();
  /** 已加载的 cards 文件：`<库>/<分组>` → (id → 条目)。存 Promise 以免并发时重复读取。 */
  private readonly cardsCache = new Map<string, Promise<Map<string, Entry>>>();
  /** 搜索用的小写文本，与 byId 一一对应。 */
  private readonly haystacks = new Map<string, { name: string; summary: string; other: string }>();
  readonly skipped: { id: string; reason: string }[] = [];

  private constructor(
    private readonly source: ReleaseSource,
    readonly manifest: Manifest,
  ) {}

  /** 读 manifest、核对约定版本、加载各库的 index / groups / redirects 并建索引。 */
  static async load(source: ReleaseSource): Promise<Library> {
    let raw: unknown;
    try {
      raw = await source.readJson('manifest.json');
    } catch (err) {
      throw new Error(`读不到发布包的 manifest.json（来源：${source.describe()}）：${errorText(err)}`);
    }
    if (!isObject(raw) || typeof raw.contract_version !== 'string' || !Array.isArray(raw.collections)) {
      throw new Error(`manifest.json 格式不对：缺少 contract_version 或 collections（来源：${source.describe()}）`);
    }
    const major = Number.parseInt(raw.contract_version.split('.')[0] ?? '', 10);
    if (major !== SUPPORTED_CONTRACT_MAJOR) {
      throw new Error(
        `发布包的约定版本是 ${raw.contract_version}，本程序只认识大版本 ${SUPPORTED_CONTRACT_MAJOR}.x，拒绝加载。` +
          `请升级 game-design-library-mcp，或改用约定 ${SUPPORTED_CONTRACT_MAJOR}.x 的发布包。`,
      );
    }
    const manifest = raw as unknown as Manifest;
    source.setManifest?.(manifest);

    const lib = new Library(source, manifest);
    for (const meta of manifest.collections) {
      if (!isObject(meta) || typeof meta.id !== 'string') continue;
      if (!KNOWN_KINDS.includes(meta.kind)) {
        lib.skipped.push({ id: meta.id, reason: `不认识的 kind：${String(meta.kind)}` });
        continue;
      }
      await lib.loadCollection(meta);
    }
    lib.buildIncoming();
    return lib;
  }

  private async loadCollection(meta: ManifestCollection): Promise<void> {
    const base = `collections/${meta.id}`;
    const [indexRaw, groupsRaw, redirectsRaw] = await Promise.all([
      this.source.readJson(`${base}/index.json`),
      this.source.readJson(`${base}/groups.json`),
      // redirects.json 缺失时按“没有跳转”处理
      this.source.readJson(`${base}/redirects.json`).catch(() => ({})),
    ]);
    if (!Array.isArray(indexRaw)) throw new Error(`${base}/index.json 不是数组`);

    const groups: GroupInfo[] = [];
    if (Array.isArray(groupsRaw)) {
      for (const g of groupsRaw) {
        if (isObject(g) && typeof g.id === 'string') {
          groups.push({
            id: g.id,
            name: typeof g.name === 'string' ? g.name : g.id,
            count: typeof g.count === 'number' ? g.count : 0,
          });
        }
      }
    }
    const groupById = new Map(groups.map((g) => [g.id, g]));

    const entries: Shell[] = [];
    for (const item of indexRaw) {
      const shell = asShell(item, meta.id);
      if (!shell || this.byId.has(shell.id)) continue;
      entries.push(shell);
      this.byId.set(shell.id, shell);
      const groupName = groupById.get(shell.group)?.name ?? '';
      this.haystacks.set(shell.id, {
        name: shell.name.toLowerCase(),
        summary: shell.summary.toLowerCase(),
        other: `${groupName}\n${shell.group}\n${shell.id}`.toLowerCase(),
      });
    }
    if (isObject(redirectsRaw)) {
      for (const [from, to] of Object.entries(redirectsRaw)) {
        if (typeof to === 'string' || to === null) this.redirects.set(from, to);
      }
    }
    this.collections.set(meta.id, { meta, groups, groupById, entries });
  }

  private buildIncoming(): void {
    for (const shell of this.byId.values()) {
      for (const link of shell.links) {
        let list = this.incoming.get(link.to);
        if (!list) this.incoming.set(link.to, (list = []));
        list.push({ from: shell, rel: link.rel });
      }
    }
  }

  // ---------- 六个查询 ----------

  getLibraryInfo() {
    return {
      name: LIBRARY_NAME,
      homepage: LIBRARY_HOMEPAGE,
      release: this.manifest.release,
      contract_version: this.manifest.contract_version,
      previous_release: this.manifest.previous_release ?? null,
      total: this.byId.size,
      collections: [...this.collections.values()].map((c) => ({
        id: c.meta.id,
        name: c.meta.name,
        kind: c.meta.kind,
        count: c.entries.length,
        schema_version: c.meta.schema_version ?? null,
      })),
      source: this.source.describe(),
      ...(this.manifest.license ? { license: this.manifest.license } : {}),
    };
  }

  /** 给书的章节用的一句授权提示；发布包没写授权时为 null。 */
  private licenseNotice(): string | null {
    const lic = this.manifest.license;
    if (!lic || typeof lic !== 'object') return null;
    const parts = [
      lic.attribution ? `作者：${lic.attribution}` : '',
      lic.content ? `授权：${lic.content}` : '',
      lic.notice ?? '',
      lic.content_url ?? '',
    ].filter(Boolean);
    return parts.length ? parts.join('。').replace(/。。/g, '。') : null;
  }

  listCollections() {
    return {
      release: this.manifest.release,
      collections: [...this.collections.values()].map((c) => ({
        id: c.meta.id,
        name: c.meta.name,
        kind: c.meta.kind,
        count: c.entries.length,
        groups: c.groups,
      })),
    };
  }

  /** 书（kind 为 articles 的库）按正文全文搜索：第一次搜索时把各章正文读进来，之后留在内存里。读不到就只搜标题和摘要。 */
  private articleText: Promise<Map<string, string>> | null = null;
  private loadArticleText(): Promise<Map<string, string>> {
    this.articleText ??= (async () => {
      const out = new Map<string, string>();
      for (const col of this.collections.values()) {
        if (col.meta.kind !== 'articles') continue;
        for (const g of col.groups) {
          try {
            for (const [id, entry] of await this.loadCards(col.meta.id, g.id)) {
              const text = (entry.body as { text?: unknown } | null)?.text;
              if (typeof text === 'string') out.set(id, text.toLowerCase());
            }
          } catch {
            this.articleText = null; // 下次搜索再试
          }
        }
      }
      return out;
    })();
    return this.articleText;
  }

  async search(params: SearchParams) {
    const terms = params.query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) throw new LibraryError('query 不能为空：请给出至少一个关键词。');
    const limit = clamp(params.limit ?? SEARCH_DEFAULT_LIMIT, 1, SEARCH_MAX_LIMIT);
    const offset = Math.max(0, params.offset ?? 0);

    let pool: Shell[];
    if (params.collection !== undefined) {
      const col = this.requireCollection(params.collection);
      if (params.group !== undefined) this.requireGroup(col, params.group);
      pool = col.entries;
    } else {
      pool = [...this.byId.values()];
      if (params.group !== undefined && ![...this.collections.values()].some((c) => c.groupById.has(params.group!))) {
        throw new LibraryError(`没有叫“${params.group}”的分组。用 list_collections 查看各库的分组 id。`);
      }
    }

    const articleText = await this.loadArticleText();
    const hits: { shell: Shell; nameHits: number; summaryHits: number; order: number }[] = [];
    let order = 0;
    for (const shell of pool) {
      order++;
      if (params.group !== undefined && shell.group !== params.group) continue;
      if (params.tag !== undefined && !shell.tags.includes(params.tag)) continue;
      const hay = this.haystacks.get(shell.id)!;
      const bodyText = articleText.get(shell.id);
      let nameHits = 0;
      let summaryHits = 0;
      let all = true;
      for (const t of terms) {
        const inName = hay.name.includes(t);
        const inSummary = hay.summary.includes(t);
        if (inName) nameHits++;
        if (inSummary) summaryHits++;
        if (!inName && !inSummary && !hay.other.includes(t) && !bodyText?.includes(t)) {
          all = false;
          break;
        }
      }
      if (all) hits.push({ shell, nameHits, summaryHits, order });
    }
    // 名称命中的排最前，其次定义命中，最后是只命中分组名、id 或书的正文的；同档保持库内原有顺序
    hits.sort((a, b) => b.nameHits - a.nameHits || b.summaryHits - a.summaryHits || a.order - b.order);

    const page = hits.slice(offset, offset + limit).map((h) => h.shell);
    const next = offset + page.length;
    return {
      query: params.query,
      total: hits.length,
      offset,
      limit,
      next_offset: next < hits.length ? next : null,
      results: page,
    };
  }

  async getEntry(id: string) {
    const { shell, redirectedFrom } = this.resolve(id);
    const cards = await this.loadCards(shell.collection, shell.group);
    const entry = cards.get(shell.id);
    if (!entry) {
      throw new LibraryError(
        `条目 ${shell.id} 在索引里，但 collections/${shell.collection}/cards/${shell.group}.json 里找不到它的正文，发布包可能不完整。`,
      );
    }
    // 书的章节是整段原文，带上一句授权提示，提醒引用时署名、不得商用和改编
    const notice = this.collections.get(shell.collection)?.meta.kind === 'articles' ? this.licenseNotice() : null;
    return {
      ...(redirectedFrom ? { redirected_from: redirectedFrom } : {}),
      ...entry,
      ...(notice ? { license_notice: notice } : {}),
    };
  }

  listGroup(collection: string, group: string, limit?: number, offset?: number) {
    const col = this.requireCollection(collection);
    const info = this.requireGroup(col, group);
    const all = col.entries.filter((e) => e.group === group);
    const lim = clamp(limit ?? LIST_GROUP_DEFAULT_LIMIT, 1, LIST_GROUP_MAX_LIMIT);
    const off = Math.max(0, offset ?? 0);
    const page = all.slice(off, off + lim);
    const next = off + page.length;
    return {
      collection: col.meta.id,
      group: { id: info.id, name: info.name },
      total: all.length,
      offset: off,
      limit: lim,
      next_offset: next < all.length ? next : null,
      entries: page,
    };
  }

  async getLinks(id: string) {
    const { shell, redirectedFrom } = this.resolve(id);
    // 出链的 note 只在 cards 文件里有；读不到时退回索引里不带 note 的版本
    let links = shell.links;
    try {
      const entry = (await this.loadCards(shell.collection, shell.group)).get(shell.id);
      if (entry) links = entry.links;
    } catch {
      /* 用索引里的 links */
    }
    const outgoing = links.map((l) => {
      const target = this.lookup(l.to);
      return {
        to: target?.id ?? l.to,
        rel: l.rel,
        note: l.note ?? null,
        name: target?.name ?? null,
        ...(target ? {} : { missing: true }),
      };
    });
    const incoming = (this.incoming.get(shell.id) ?? []).map((i) => ({
      from: i.from.id,
      rel: i.rel,
      name: i.from.name,
    }));
    return {
      ...(redirectedFrom ? { redirected_from: redirectedFrom } : {}),
      id: shell.id,
      name: shell.name,
      outgoing,
      incoming,
    };
  }

  // ---------- 内部工具 ----------

  /** 按 id 找外壳；找不到时按 redirects 跳转（不抛错，找不到返回 null）。 */
  private lookup(id: string): Shell | null {
    let cur = id;
    for (let hop = 0; hop < 20; hop++) {
      const shell = this.byId.get(cur);
      if (shell) return shell;
      const next = this.redirects.get(cur);
      if (typeof next !== 'string') return null;
      cur = next;
    }
    return null;
  }

  /** 按 id 找外壳，旧 id 自动跳转；找不到时抛出说明清楚的 LibraryError。 */
  private resolve(rawId: string): { shell: Shell; redirectedFrom?: string } {
    const id = rawId.trim();
    const direct = this.byId.get(id);
    if (direct) return { shell: direct };

    let cur = id;
    for (let hop = 0; hop < 20 && this.redirects.has(cur); hop++) {
      const next = this.redirects.get(cur);
      if (next === null || next === undefined) {
        throw new LibraryError(`条目 ${id} 已被删除（旧 id，没有替代条目）。可以用 search 找相近的条目。`);
      }
      const shell = this.byId.get(next);
      if (shell) return { shell, redirectedFrom: id };
      cur = next;
    }

    let hint = '';
    if (!id.includes('/')) {
      const candidates = [...this.collections.keys()].map((c) => `${c}/${id}`).filter((c) => this.byId.has(c));
      hint = candidates.length
        ? `id 要带库名前缀，你要找的可能是：${candidates.join('、')}。`
        : `id 的形式是“库名/库内 id”，例如 mechanism/remove-cards-to-thin-deck。`;
    } else {
      const col = id.slice(0, id.indexOf('/'));
      if (!this.collections.has(col)) hint = `没有叫“${col}”的库，现有的库：${[...this.collections.keys()].join('、')}。`;
    }
    throw new LibraryError(`找不到条目 ${id}。${hint}可以先用 search 按关键词查到正确的 id。`);
  }

  private requireCollection(id: string): LoadedCollection {
    const col = this.collections.get(id);
    if (!col) {
      throw new LibraryError(`没有叫“${id}”的库。现有的库：${[...this.collections.keys()].join('、')}。`);
    }
    return col;
  }

  private requireGroup(col: LoadedCollection, group: string): GroupInfo {
    const info = col.groupById.get(group);
    if (!info) {
      const list = col.groups.map((g) => `${g.id}（${g.name}）`).join('、');
      throw new LibraryError(`库 ${col.meta.id} 里没有叫“${group}”的分组（要用分组 id，不是中文名）。现有分组：${list}。`);
    }
    return info;
  }

  private loadCards(collection: string, group: string): Promise<Map<string, Entry>> {
    const key = `${collection}/${group}`;
    let pending = this.cardsCache.get(key);
    if (!pending) {
      pending = this.source.readJson(`collections/${collection}/cards/${group}.json`).then((raw) => {
        const map = new Map<string, Entry>();
        if (Array.isArray(raw)) {
          for (const item of raw) {
            const shell = asShell(item, collection);
            if (shell) map.set(shell.id, { ...shell, body: (item as Record<string, unknown>).body ?? null });
          }
        }
        return map;
      });
      // 读取失败不留在缓存里，下次可以重试
      pending.catch(() => this.cardsCache.delete(key));
      this.cardsCache.set(key, pending);
    }
    return pending;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
