import { LIBS, RARE, cover, useAll, type Core, type Group, type LibId, type Shell } from "./data";
import { href } from "./router";
import { useTitle } from "./ui";
import needs from "./needs.json";

const RARE_PICKS = [
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

function pickRare(list: Shell[]): Shell[] {
  const rare = list.filter((e) => e.tags.includes("new"));
  const picks = RARE_PICKS.map((n) => rare.find((e) => e.name === n)).filter((e): e is Shell => !!e);
  for (const e of rare) {
    if (picks.length >= 6) break;
    if (!picks.includes(e) && !picks.some((p) => p.group === e.group)) picks.push(e);
  }
  return picks.slice(0, 6);
}

export function Home({ core }: { core: Core }) {
  useTitle("");
  const all = useAll().data;
  const mech = byCount(core.groups.mechanism);
  const rareCount = all ? all.byLib.mechanism.filter((e) => e.tags.includes("new")).length : undefined;
  const rarePicks = all ? pickRare(all.byLib.mechanism) : [];
  const leadCover: Record<LibId, string> = {
    mechanism: byCount(core.groups.mechanism)[0]?.id ?? "",
    world: byCount(core.groups.world)[0]?.id ?? "",
    experience: byCount(core.groups.experience)[0]?.id ?? "",
  };

  return (
    <>
      <section className="hero">
        <h1>
          <span>设计卡住时，</span>
          <span>查查别的游戏</span>
          <span>是怎么做的</span>
        </h1>
        <p>
          {core.total} 张游戏设计卡片，分三类：机制讲一条规则怎么运转，世界观讲一个世界靠什么前提成立，体验讲玩家在某一刻感受到什么。每张开头用一句话说清它是什么。
        </p>
        <div className="acts">
          <a className="btn pri" href={href.collection("mechanism")}>
            从机制库看起 →
          </a>
          <a className="btn" href={href.rare}>
            看{rareCount ? ` ${rareCount} 种` : ""}
            {RARE}
          </a>
        </div>
      </section>

      <section className="sec">
        <div className="shd">
          <h2>三个卡片库</h2>
          <span>选一个进去，或者直接在上面搜</span>
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
          <a href={href.collection("mechanism")}>看机制库目录</a>
        </div>
        <CoverWall lib="mechanism" groups={mech} />
      </section>

      <section className="sec">
        <div className="shd">
          <h2>世界观的 {core.groups.world.length} 个分组</h2>
          <a href={href.collection("world")}>看全部 {core.counts.world} 张</a>
        </div>
        <CoverWall lib="world" groups={byCount(core.groups.world)} />
      </section>

      <section className="sec">
        <div className="shd">
          <h2>体验的 {core.groups.experience.length} 个分组</h2>
          <a href={href.collection("experience")}>看全部 {core.counts.experience} 张</a>
        </div>
        <CoverWall lib="experience" groups={byCount(core.groups.experience)} />
      </section>

      <section className="sec">
        <div className="camp">
          <div className="camp-side">
            <img className="px" src={cover("section-new")} alt="" width={512} height={512} loading="lazy" />
            <div className="n num">{rareCount ?? "…"}</div>
            <h2>种{RARE}</h2>
            <p>市面上很少见到的规则，以及原创的规则设想。想找没见过的点子，从这里翻。</p>
            <a className="btn" href={href.rare}>
              看全部{RARE} →
            </a>
          </div>
          <div className="nlist">
            {rarePicks.map((e) => (
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
          <h2>从你想解决的问题找起</h2>
          <span>几个例子，点进去看对应的卡片</span>
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
                  {e?.tags.includes("new") && ` · ${RARE}`}
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section className="sec">
        <div className="mcp">
          <div>
            <h2>在你的 AI 工具里直接查这些卡片</h2>
            <p>
              接上以后，你在 Claude 这类 AI 工具里聊设计时，AI 可以自己搜这 {core.total}{" "}
              张卡片、读卡片全文，并在回答里写明引用的是哪一张。即将开放。
            </p>
            <a className="btn pri" href={href.mcp}>
              看接上以后能做什么
            </a>
          </div>
          <img className="px mcp-img" src={cover("section-mcp")} alt="" width={512} height={512} loading="lazy" />
        </div>
      </section>
    </>
  );
}
