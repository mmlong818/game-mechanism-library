// 给搜索引擎和不执行脚本的读取器（各家 AI 的网页读取）生成静态页面。
//
// 网站本身是 hash 路由的单页应用：所有页面共用一个地址，正文靠脚本从 JSON 里取。
// 不执行脚本的抓取方拿到的只是一个空壳，搜索引擎也不把 # 后面的部分当成不同的页面。
// 这个脚本在 vite build 之后运行，往 dist 里补：
//   <库>/<id>/index.html   每个条目一个真实地址，正文直接写在 HTML 里
//   <库>/index.html        每个库的目录页
//   index.html             首页（在原来的空壳里填上说明和各库入口）
//   sitemap.xml、robots.txt
// 每个静态页仍然带着应用的脚本：浏览器打开时先把地址改写成对应的 hash 地址，再由应用接管，
// 所以人看到的还是原来的界面。
//
// 用法：SITE_URL=https://example.com/base/ node scripts/prerender.mjs
// 没有设 SITE_URL 时什么都不做（本地开发和相对路径构建不需要静态页）。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const siteUrl = (process.env.SITE_URL || "").replace(/\/*$/, "/");
if (siteUrl === "/") {
  console.log("没有设 SITE_URL，跳过静态页生成");
  process.exit(0);
}
const basePath = new URL(siteUrl).pathname; // 例如 /game-mechanism-library/
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const json = async (p) => JSON.parse(await readFile(path.join(root, p), "utf8"));

const SITE = "猫叔的游戏知识库";
const TAGLINE = "最全的游戏知识库";
// 首页和找不到摘要时用的说明。条数在读完发布包后填进去（见下面的 siteDesc）。
let SITE_DESC = "";
const LIB_DESC = {
  mechanism: "一条规则怎么运转：玩家做什么、受什么限制、局面怎么变，设计者能调什么，容易做坏在哪里。每张附一个带数值的设计示例。",
  world: "一个世界靠什么前提成立：规律和它的后果、空间、历史、人群、日常，以及适合搭配的机制。",
  experience: "玩家在某一刻感受到什么：要同时满足的条件、怎么起落、用哪些机制去做、什么会毁掉它。",
  book: "成体系的长篇：按做一款游戏的先后顺序，一章讲一件事。",
  article: "按主题写的专题文章：循环、经济、成长、抉择、组合、教学、验证，每篇引到相关的卡片。",
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const S = (v) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const SL = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);
const OL = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
const O = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

const { release } = await json("public/data/current.json");
const base = `public/data/release/${release}`;
const manifest = await json(`${base}/manifest.json`);
const libs = [];
const byId = new Map();
for (const col of manifest.collections.filter((c) => c.kind === "cards" || c.kind === "articles")) {
  const dir = `${base}/collections/${col.id}`;
  const groups = await json(`${dir}/groups.json`);
  const lib = { ...col, groups: [] };
  for (const g of groups) {
    const cards = await json(`${dir}/cards/${g.id}.json`);
    if (col.kind === "articles") {
      const part = (c) => Number((c.tags || []).find((t) => t.startsWith("part:"))?.slice(5) ?? 0);
      cards.sort((a, b) => part(a) - part(b));
    }
    for (const c of cards) byId.set(c.id, c);
    lib.groups.push({ ...g, cards });
  }
  if (lib.groups.every((g) => typeof g.order === "number")) lib.groups.sort((a, b) => a.order - b.order);
  libs.push(lib);
}
const countOf = (id) => libs.find((l) => l.id === id)?.count ?? 0;
SITE_DESC = `${TAGLINE}，给游戏设计者查阅：${countOf("mechanism")} 张机制卡、${countOf("world")} 张世界观卡、${countOf("experience")} 张体验卡、${countOf("article")} 篇专题文章和一本《RPG设计七卷书》，讲清一条规则怎么运转、一个世界靠什么成立、玩家在某一刻感受到什么。`;
const back = new Map();
for (const c of byId.values()) for (const l of c.links ?? []) {
  if (!byId.has(l.to)) continue;
  if (!back.has(l.to)) back.set(l.to, []);
  back.get(l.to).push(c.id);
}

const url = (id) => `${basePath}${id.split("/").map(encodeURIComponent).join("/")}/`;
const abs = (p) => new URL(p, siteUrl).href;
const link = (id, text) => `<a href="${url(id)}">${esc(text ?? byId.get(id)?.name ?? id)}</a>`;

// ---------- 条目正文 ----------
const p = (s) => (s ? `<p>${esc(s)}</p>` : "");
const ul = (items) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");
const pairs = (items) => {
  const rows = items.filter(([, v]) => v);
  return rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "";
};

function cardBody(card) {
  const b = card.body;
  const lib = card.collection;
  const shown = new Set();
  const out = [];
  const add = (label, html) => { if (html) out.push(`<section><h2>${esc(label)}</h2>${html}</section>`); };
  const ref = (targetLib, id, name) => {
    const gid = `${targetLib}/${id}`;
    if (!id || !byId.has(gid)) return `<b>${esc(name)}</b>`;
    shown.add(gid);
    return link(gid, name || byId.get(gid).name);
  };
  const refList = (items, targetLib, noteKeys) =>
    ul(items.map((v) => `${ref(targetLib, S(v.id), S(v.name))}${(() => { const n = noteKeys.map((k) => S(v[k])).find(Boolean); return n ? `：${esc(n)}` : ""; })()}`));
  const named = (items, a, bKey) => ul(items.map((v) => `<b>${esc(S(v[a]))}</b>：${esc(S(v[bKey]))}`));
  const fixes = (items, a = "problem", bKey = "fix", tag = "改法") =>
    ul(items.map((v) => `${esc(S(v[a]))}${S(v[bKey]) ? ` <i>${tag}：</i>${esc(S(v[bKey]))}` : ""}`));
  const examples = (items) =>
    items.map((ex) => `<h3>${esc(S(ex.game))}</h3>${pairs([["规则", S(ex.rule)], ["效果", S(ex.effect)], ["做法", S(ex.how)]])}`).join("");
  const str = (key, label) => add(label, ul(SL(b[key]).map(esc)));

  add("边界", p(S(b.boundary)));
  if (lib === "mechanism") {
    str("purpose", "为什么用它");
    const how = O(b.how_it_works);
    add("怎么运作", pairs([["玩家做什么", S(how.action)], ["限制与代价", S(how.constraint)], ["局面怎么变", S(how.state_change)], ["玩家看到什么", S(how.feedback)]]));
    add("玩家在这里权衡什么", p(S(b.decision)));
    add("设计者能调什么", ul(OL(b.tuning).map((t) => `<b>${esc(S(t.knob))}</b>：${esc(S(t.effect))}${S(t.seen_in) ? ` <i>见于：</i>${esc(S(t.seen_in))}` : ""}`)));
    add("由哪些机制组成", refList(OL(b.components), "mechanism", ["role"]));
    add("有哪些变体", ul(OL(b.variants).map((v) => `<b>${esc(S(v.name))}</b>：${esc(S(v.rule))}${SL(v.games).length ? `（${esc(SL(v.games).join("、"))}）` : ""}`)));
    add("设计示例", OL(b.designs).map((d) => pairs([["设定", S(d.premise)], ["规则", S(d.rule)], ["一局里", S(d.play)]])).join(""));
    add("哪些游戏这样做", examples(OL(b.examples)));
    add("容易做坏的地方", fixes(OL(b.pitfalls)));
    add("相关的机制", refList(OL(b.related), "mechanism", ["relation"]));
  } else if (lib === "world") {
    add("这个世界的规律", OL(b.axioms).map((a) => `<p><b>${esc(S(a.statement))}</b></p>${ul([...SL(a.consequences).map((c) => `<i>后果：</i>${esc(c)}`), ...SL(a.limits).map((c) => `<i>限度：</i>${esc(c)}`)])}`).join(""));
    str("space", "空间怎样安排");
    add("历史留下了什么", fixes(OL(b.history), "turn", "traces", "痕迹"));
    str("society", "人群与制度");
    str("daily_life", "日常生活");
    str("tensions", "内在的矛盾");
    str("unknowns", "留给你来定的");
    str("read_by_player", "玩家怎样看出来");
    add("玩家是谁", p(S(b.player_seat)));
    add("适合搭配的机制", refList(OL(b.mechanisms), "mechanism", ["why", "how"]));
    add("设计者能调什么", named(OL(b.dials), "dial", "effect"));
    add("有哪些变体", named(OL(b.variants), "name", "twist"));
    add("哪些游戏这样做", examples(OL(b.examples)));
    add("容易写坏的地方", fixes(OL(b.pitfalls)));
    add("相关的世界观", refList(OL(b.related), "world", ["relation"]));
  } else {
    str("why_wanted", "为什么想要它");
    str("not_for", "代价和不适合的情况");
    str("conditions", "要同时满足的条件");
    const arc = O(b.arc);
    add("怎么起落", pairs([["铺垫", S(arc.setup)], ["触发", S(arc.trigger)], ["回落", S(arc.aftermath)]]));
    str("signs", "怎么看出玩家感受到了");
    add("用哪些机制去做", refList(OL(b.mechanisms), "mechanism", ["why", "how"]));
    add("设计者能调什么", named(OL(b.dials), "dial", "effect"));
    add("什么会毁掉它", fixes(OL(b.killers)));
    add("有哪些变体", named(OL(b.variants), "name", "twist"));
    add("哪些游戏这样做", examples(OL(b.examples)));
    add("相关的体验", refList(OL(b.related), "experience", ["relation"]));
  }
  const rest = (card.links ?? []).filter((l) => !shown.has(l.to) && byId.has(l.to));
  for (const l of rest) shown.add(l.to);
  add("还和这些卡片有关", ul(rest.map((l) => `${link(l.to)}${l.note ? `：${esc(l.note)}` : ""}`)));
  const backs = [...new Set(back.get(card.id) ?? [])].filter((id) => !shown.has(id));
  add("哪些卡片提到了它", ul(backs.map((id) => link(id))));
  return out.join("\n");
}

// 书和文章的正文是 markdown，里面按条目 id 写的链接换成静态页地址。
const marked = new Marked({ gfm: true });
function articleBody(card) {
  let html = marked.parse(S(card.body.text));
  html = html.replace(/href="([^"]+)"/g, (m, to) => (byId.has(to) ? `href="${url(to)}"` : /^https?:\/\//.test(to) ? m : 'href="#"'));
  if (S(card.body.text).trimStart().startsWith("# ")) html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, "");
  const rest = (card.links ?? []).filter((l) => byId.has(l.to));
  if (rest.length) html += `<section><h2>提到的条目</h2>${ul([...new Set(rest.map((l) => l.to))].map((id) => link(id)))}</section>`;
  return html;
}

// ---------- 页面外壳 ----------
const template = await readFile(path.join(dist, "index.html"), "utf8");
const STYLE = `<style>.static{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 4rem;line-height:1.75}.static nav{font-size:.9em;margin-bottom:1rem}.static h1{line-height:1.3}.static dt{font-weight:700;margin-top:.6em}.static dd{margin:0}</style>`;

// 结构化数据（schema.org）：让搜索引擎知道这一页是哪个网站的哪一篇、谁写的、按什么授权。
const ldSite = { "@type": "WebSite", "@id": `${siteUrl}#site`, name: SITE, alternateName: TAGLINE, url: siteUrl, inLanguage: "zh-CN" };
const ldAuthor = { "@type": "Person", name: manifest.license?.attribution || "猫叔" };
const day = /^\d{4}-\d{2}-\d{2}/.exec(release)?.[0];
function jsonLd({ title, desc, canonical, crumbs, type }) {
  const items = [];
  if (type === "article") {
    items.push({ "@type": "Article", headline: title.split(" · ")[0], description: desc, url: canonical, mainEntityOfPage: canonical, inLanguage: "zh-CN", author: ldAuthor, publisher: ldAuthor, isPartOf: ldSite, license: manifest.license?.content_url, ...(day ? { dateModified: day } : {}) });
  } else {
    items.push({ ...ldSite, description: desc, author: ldAuthor, license: manifest.license?.content_url });
    if (canonical !== siteUrl) items.push({ "@type": "CollectionPage", name: title.split(" · ")[0], description: desc, url: canonical, inLanguage: "zh-CN", isPartOf: { "@id": `${siteUrl}#site` } });
  }
  const trail = (crumbs ?? []).filter(([, h]) => h);
  if (trail.length) items.push({ "@type": "BreadcrumbList", itemListElement: trail.map(([t, h], i) => ({ "@type": "ListItem", position: i + 1, name: t, item: abs(h) })) });
  return `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": items }).replace(/</g, "\\u003c")}</script>`;
}

function page({ title, desc, canonical, route, crumbs, body, type = "article" }) {
  const head = [
    `<title>${esc(title)}</title>`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    jsonLd({ title, desc, canonical, crumbs, type }),
    STYLE,
    // 浏览器里交给应用：先把地址换成对应的 hash 地址（应用的数据和资源都相对站点根目录取）。
    route ? `<script>history.replaceState(null,"",${JSON.stringify(basePath)}+(location.hash||${JSON.stringify(route)}));</script>` : "",
  ].join("\n    ");
  const nav = crumbs?.length ? `<nav>${crumbs.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(" › ")}</nav>` : "";
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, () => head)
    .replace(/<meta name="description" content="[^"]*" \/>/, () => `<meta name="description" content="${esc(desc)}" />`)
    .replace('<div id="root"></div>', () => `<div id="root"><main class="static">${nav}${body}</main></div>`);
  if (!html.includes('class="static"')) throw new Error("index.html 的结构变了，找不到 #root");
  return html;
}

async function write(rel, html) {
  const file = path.join(dist, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
}

const urls = [];
const home = [SITE, basePath];
let count = 0;

for (const lib of libs) {
  const libUrl = `${basePath}${lib.id}/`;
  const single = lib.groups.length === 1;
  // 库的目录页
  const listing = lib.groups
    .map((g) => `<section><h2>${esc(g.name)}（${g.cards.length}）</h2>${g.description ? p(g.description) : ""}<ul>${g.cards.map((c) => `<li>${link(c.id, c.name)}${c.summary ? `：${esc(c.summary)}` : ""}</li>`).join("")}</ul></section>`)
    .join("\n");
  await write(`${lib.id}/index.html`, page({
    title: `${lib.name}（${lib.count} 条） · ${SITE}`,
    desc: LIB_DESC[lib.id] ?? SITE_DESC,
    canonical: abs(libUrl),
    route: `#/c/${lib.id}`,
    crumbs: [home, [lib.name]],
    body: `<h1>${esc(lib.name)}</h1>${p(LIB_DESC[lib.id])}${listing}`,
    type: "website",
  }));
  urls.push(abs(libUrl));

  for (const g of lib.groups) {
    for (const c of g.cards) {
      const isCard = lib.kind === "cards";
      const series = S(c.body.series_title);
      const body = `<article><h1>${esc(c.name)}</h1>${p(c.summary)}${isCard ? cardBody(c) : articleBody(c)}</article>`;
      await write(`${c.id}/index.html`, page({
        title: `${c.name} · ${single || !isCard ? series || lib.name : `${lib.name} · ${g.name}`} · ${SITE}`,
        desc: c.summary || SITE_DESC,
        canonical: abs(url(c.id)),
        route: `#/e/${c.id.split("/").map(encodeURIComponent).join("/")}`,
        crumbs: [home, [lib.name, libUrl], [g.name]],
        body,
      }));
      urls.push(abs(url(c.id)));
      count++;
    }
  }
}

// 首页：保留应用原来的入口行为（不改写地址），只在空壳里填上说明和各库入口。
await write("index.html", page({
  title: `${SITE} · ${TAGLINE}`,
  desc: SITE_DESC,
  canonical: siteUrl,
  route: "",
  body: `<h1>${SITE}：${TAGLINE}</h1>${p(SITE_DESC)}<p>给 AI 和爬虫的说明：<a href="${basePath}llms.txt">llms.txt</a>，全部地址：<a href="${basePath}sitemap.xml">sitemap.xml</a>。</p><ul>${libs.map((l) => `<li><a href="${basePath}${l.id}/">${esc(l.name)}（${l.count} 条）</a>：${esc(LIB_DESC[l.id] ?? "")}</li>`).join("")}</ul>${p(`内容版本 ${release}。${manifest.license?.notice ?? ""}`)}`,
  type: "website",
}));
urls.unshift(siteUrl);

await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc>${day ? `<lastmod>${day}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`);
// 站点放在域名根目录时这份 robots.txt 才会被读到；放在子路径下时要在域名根目录的 robots.txt 里另写 Sitemap 一行。
// 明确写出欢迎搜索引擎和各家 AI 的抓取器；data/ 下是同一份内容的 JSON，不必重复收录。
const BOTS = ["Googlebot", "Bingbot", "Baiduspider", "Google-Extended", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Applebot-Extended", "CCBot", "Bytespider"];
const robots = [
  `# ${SITE}：${TAGLINE}`,
  `# 欢迎抓取和引用。内容授权 ${manifest.license?.content ?? ""}：可以原样引用并注明作者，不得商用，不得改编。`,
  `# 给 AI 的站点说明见 ${abs("llms.txt")}`,
  "",
  "User-agent: *",
  "Allow: /",
  `Disallow: ${basePath}data/`,
  "",
  ...BOTS.flatMap((b) => [`User-agent: ${b}`, "Allow: /", ""]),
  `Sitemap: ${abs("sitemap.xml")}`,
  "",
].join("\n");
await write("robots.txt", robots);

// llms.txt：给 AI 读取器的站点说明（https://llmstxt.org 的格式）。讲清这里有什么、每类页面的地址规则，
// 列出各库的分组，以及全部文章和书的章节。卡片太多不逐张列，目录页和 sitemap.xml 里有全部地址。
const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const llms = [`# ${SITE}`, "", `> ${SITE_DESC}`, ""];
llms.push(
  `这是一个中文的游戏设计知识库，作者${ldAuthor.name}，内容版本 ${release}。每个条目有一个固定地址，正文直接写在网页的 HTML 里，不需要执行脚本就能读到。`,
  "",
  `- 条目地址的规则：\`${siteUrl}<库>/<条目 id>/\`，库是 ${libs.map((l) => `\`${l.id}\`（${l.name}）`).join("、")}。`,
  `- 全部地址：[sitemap.xml](${abs("sitemap.xml")})，共 ${urls.length} 条。`,
  `- 引用时请给出条目的地址并注明作者。授权 ${manifest.license?.content ?? ""}：${manifest.license?.notice ?? ""}`,
  `- 需要成批读取或让 AI 工具直接检索时，可以接 MCP 服务，做法见 [仓库说明](https://github.com/mmlong818/game-mechanism-library#readme)。`,
  "",
);
for (const lib of libs) {
  llms.push(`## ${lib.name}（${lib.count} 条）`, "", LIB_DESC[lib.id] ?? "", "", `- [${lib.name}目录](${abs(`${lib.id}/`)})：按分组列出全部条目和每条的一句话摘要`);
  if (lib.kind === "cards") {
    llms.push(`- 分组：${lib.groups.map((g) => `${g.name}（${g.cards.length}）`).join("、")}`, "");
  } else {
    llms.push("");
    for (const g of lib.groups) {
      llms.push(`### ${g.name}`, "", ...(g.description ? [md(g.description), ""] : []));
      for (const c of g.cards) llms.push(`- [${md(c.name)}](${abs(url(c.id))})：${md(c.summary)}`);
      llms.push("");
    }
  }
}
await write("llms.txt", llms.join("\n"));
console.log(`静态页 ${count} 个条目、${libs.length} 个目录页、首页；sitemap ${urls.length} 条地址`);
