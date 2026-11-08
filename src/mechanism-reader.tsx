export type V2Card = {
  id: string;
  title: string;
  type: "mechanic" | "system";
  summary: string;
  structure?: string[];
  example: null | { kind: "design_example"; title: string; narrative: string; parameters?: Record<string, unknown> };
  tags: string[];
  relations?: { kind: string; id: string; note?: string }[];
  revision?: number;
  communitySource?: { issue_number: number; issue_url: string };
};

export type LegacyCard = {
  id: string;
  title: string;
  mechanism: unknown;
  originalExample?: unknown;
  calibration?: unknown;
  ruleSupplements?: { title?: string; text?: string; originalExample?: unknown }[];
};

export type PublicCard = V2Card | LegacyCard;
export type ArchiveEntry = { id: string; title: string; resolution: string; public_note?: string; alias_of?: string };

export function displayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join("\n");
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}：${displayText(item)}`).join("\n");
  return "";
}

function isV2(card: PublicCard): card is V2Card { return "summary" in card; }

export function MechanismReader({ card, page = false, community = false }: { card: PublicCard; page?: boolean; community?: boolean }) {
  const v2 = isV2(card);
  return <article className={page ? "reader readerPage" : "reader"}>
    {page && <a className="readerBack" href={`${import.meta.env.BASE_URL}#catalog`}>← 返回机制百科</a>}
    <span className="kicker">{community ? "社区投稿　/　已审核" : v2 ? `${card.type === "system" ? "系统机制" : "机制卡"}　/　完整条目` : "机制卡　/　完整条目"}</span>
    <h1>{card.title}</h1>
    {v2 ? <>
      <section><h2>机制规则</h2><p className="readerSummary">{card.summary}</p></section>
      {card.structure?.length ? <section><h2>规则结构</h2><ul className="readerStructure">{card.structure.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul></section> : null}
      {card.example && <section><h2>设计示例　/　{card.example.title}</h2><p className="readerExample">{card.example.narrative}</p>{card.example.parameters && Object.keys(card.example.parameters).length > 0 && <dl className="readerParameters">{Object.entries(card.example.parameters).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{displayText(value)}</dd></div>)}</dl>}</section>}
      {card.tags.length > 0 && <div className="readerTags" aria-label="标签">{card.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
      {community && card.communitySource && <p className="communitySource"><a href={card.communitySource.issue_url} target="_blank" rel="noreferrer">查看已审核的原始 GitHub Issue ↗</a></p>}
    </> : <>
      <section><h2>机制规则与设计分析</h2><pre>{displayText(card.mechanism)}</pre></section>
      {card.originalExample && <section><h2>原创案例</h2><pre>{displayText(card.originalExample)}</pre></section>}
      {card.calibration && <section><h2>机制校准与验证</h2><pre>{displayText(card.calibration)}</pre></section>}
      {card.ruleSupplements?.map((part, i) => <section key={i}><h2>{part.title || "规则补充"}</h2><pre>{displayText(part.text)}</pre>{Boolean(part.originalExample) && <><h3>原创场景</h3><pre>{displayText(part.originalExample)}</pre></>}</section>)}
    </>}
  </article>;
}

const archiveLabels: Record<string, string> = {
  feature: "这条资料现按内容特征归档，不作为独立机制列出。",
  undetermined: "这条资料暂未能整理为可公开机制，仍保留原条目入口。",
  needs_evidence: "这条记录正在进一步整理，暂未列入机制目录。",
  needs_split: "这条记录正在进一步整理，暂未列入机制目录。",
  duplicate: "这条资料已确认与另一条规则重复，原条目入口仍保留。",
  alias: "这条旧入口已关联到整理后的条目，原ID仍可用于查找。",
};

export function ArchiveNotice({ entry }: { entry: ArchiveEntry }) {
  return <article className="reader archiveReader"><a className="readerBack" href={`${import.meta.env.BASE_URL}#catalog`}>← 返回机制百科</a><span className="kicker">旧条目入口　/　资料仍可追溯</span><h1>{entry.title}</h1><div className="archiveMessage"><p>{entry.public_note || archiveLabels[entry.resolution] || "这条资料仍保留旧条目入口。"}</p>{entry.alias_of && <p>整理后的条目：<a href={`#/mechanism/${encodeURIComponent(entry.alias_of)}`}>{entry.alias_of}</a></p>}</div><p className="archiveId">原条目 ID：{entry.id}</p></article>;
}
