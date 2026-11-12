import { LIBS, cover, useAll, type Core, type Group, type LibId, type Shell } from "./data";
import { href } from "./router";
import { useTitle } from "./ui";
import needs from "./needs.json";

export const SERIES = ["核心与局部循环", "决策", "资源经济", "成长解锁", "信息教学", "组合配方", "验证方法"];

const NEW_PICKS = [
  "失败后各人添加不可推翻的事实",
  "把照片取景放进世界成为实体空间",
  "连续否决累积至强制结算",
  "所选收益越高下轮选择顺位越靠后",
  "能量在三个碗之间单向循环才可花费",
  "前局构筑化作下一局的对手",
];

const byCount = (groups: Group[]) => [...groups].sort((a, b) => b.count - a.count);

// 封面墙：桌面一排五张小方图，图下是分组名和条数。
function CoverWall({ lib, groups }: { lib: LibId; groups: Group[] }) {
  return (
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
  );
}

function pickNew(list: Shell[]): Shell[] {
  const fresh = list.filter((e) => e.tags.includes("new"));
  const picks = NEW_PICKS.map((n) => fresh.find((e) => e.name === n)).filter((e): e is Shell => !!e);
  for (const e of fresh) {
    if (picks.length >= 6) break;
    if (!picks.includes(e) && !picks.some((p) => p.group === e.group)) picks.push(e);
  }
  return picks.slice(0, 6);
}

export function Home({ core }: { core: Core }) {
  useTitle("");
  const all = useAll().data;
  const mech = byCount(core.groups.mechanism);
  const newCount = all ? all.byLib.mechanism.filter((e) => e.tags.includes("new")).length : undefined;
  const newPicks = all ? pickNew(all.byLib.mechanism) : [];
  const leadCover: Record<LibId, string> = {
    mechanism: byCount(core.groups.mechanism)[0]?.id ?? "",
    world: byCount(core.groups.world)[0]?.id ?? "",
    experience: byCount(core.groups.experience)[0]?.id ?? "",
  };

  return (
    <>
      <section className="hero">
        <h1>查机制，找世界观，对照玩家体验</h1>
        <p>猫叔整理的 {core.total} 张游戏设计卡片。每张先用一句话说清它是什么。</p>
        <div className="acts">
          <a className="btn pri" href={href.newList}>
            看{newCount ? ` ${newCount} 张` : ""}新机制 →
          </a>
          <a className="btn" href={href.mcp}>
            接进我的 AI 工具
          </a>
        </div>
      </section>

      <section className="sec">
        <div className="shd">
          <h2>三个卡片库</h2>
          <span>发布版 {core.release}</span>
        </div>
        <div className="libs">
          {LIBS.map((l) => {
            const groups = byCount(core.groups[l.id]);
            const top = groups.slice(0, l.id === "mechanism" ? 6 : 3);
            return (
              <div className="lib" key={l.id}>
                {leadCover[l.id] && (
                  <img className="px dot" src={cover(`${l.id}-${leadCover[l.id]}`)} alt="" width={512} height={512} />
                )}
                <div className="big num">
                  {core.counts[l.id]}
                  <small>{l.unit}</small>
                </div>
                <h3>
                  <a href={href.collection(l.id)}>{l.name}</a>
                </h3>
                <p>
                  {l.blurb}分 {groups.length} 个{l.groupWord}。
                </p>
                <div className="chips">
                  {top.map((g) => (
                    <a key={g.id} href={href.group(l.id, g.id)}>
                      {g.name}
                      <i>{g.count}</i>
                    </a>
                  ))}
                  <a href={href.collection(l.id)}>
                    全部 {groups.length} 个{l.groupWord}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sec">
        <div className="shd">
          <h2>机制的 {mech.length} 个主题</h2>
          <a href={href.collection("mechanism")}>按条数排列 · 进机制库目录</a>
        </div>
        <CoverWall lib="mechanism" groups={mech} />
      </section>

      <section className="sec">
        <div className="shd">
          <h2>世界观的 {core.groups.world.length} 个分组</h2>
          <a href={href.collection("world")}>全部 {core.counts.world} 张</a>
        </div>
        <CoverWall lib="world" groups={byCount(core.groups.world)} />
      </section>

      <section className="sec">
        <div className="shd">
          <h2>体验的 {core.groups.experience.length} 个分组</h2>
          <a href={href.collection("experience")}>全部 {core.counts.experience} 张</a>
        </div>
        <CoverWall lib="experience" groups={byCount(core.groups.experience)} />
      </section>

      <section className="sec">
        <div className="camp">
          <div className="camp-side">
            <img className="px" src={cover("section-new")} alt="" width={512} height={512} loading="lazy" />
            <div className="n num">{newCount ?? "…"}</div>
            <h2>张新机制</h2>
            <p>原创的，或者新发现的机制。想找没见过的做法，从这里开始。</p>
            <a className="btn" href={href.newList}>
              看全部新机制 →
            </a>
          </div>
          <div className="nlist">
            {newPicks.map((e) => (
              <a key={e.id} href={href.entry(e.id)}>
                <i>{core.groupName(e.collection, e.group)}</i>
                <b>{e.name}</b>
                <span>{e.summary}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="shd with-img">
          <img className="px" src={cover("section-needs")} alt="" width={512} height={512} loading="lazy" />
          <h2>按设计需求找</h2>
          <span>从你手头的问题出发，三个库一起查</span>
        </div>
        <div className="needs">
          {needs.map((n) => {
            const e = all?.byId.get(n.to);
            const lib = n.to.split("/")[0];
            return (
              <a className="need" key={n.to} href={href.entry(n.to)}>
                <span className="lb">{LIBS.find((l) => l.id === lib)?.name}</span>
                <h3>{n.need}</h3>
                <div className="to">
                  <b>{e?.name ?? "…"}</b>
                  {e && core.groupName(e.collection, e.group)}
                  {e?.tags.includes("new") && " · 新机制"}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section className="sec">
        <div className="shd with-img">
          <img className="px" src={cover("section-articles")} alt="" width={512} height={512} loading="lazy" />
          <h2>专题文章</h2>
          <a href={href.articles}>筹备中，还没有发布的文章</a>
        </div>
        <div className="topics">
          {SERIES.map((s) => (
            <a key={s} href={href.articles}>
              <b>{s}</b>
              <span>筹备中</span>
            </a>
          ))}
        </div>
      </section>

      <section className="sec">
        <div className="mcp">
          <div>
            <h2>让你的 AI 也能查这些卡片</h2>
            <p>
              资料库会提供 MCP 接口。接好以后，在 Claude 等工具里聊设计时，它可以直接检索这 {core.total}{" "}
              张卡片，并在回答里引用卡片名称和定义。本地安装版和公开网址版都还在制作中。
            </p>
            <a className="btn pri" href={href.mcp}>
              看接入说明
            </a>
          </div>
          <img className="px mcp-img" src={cover("section-mcp")} alt="" width={512} height={512} loading="lazy" />
        </div>
      </section>
    </>
  );
}
