// 核对 public/data 里的当前发布包：
// 1. 每个库 index 里的 id 都能在对应分组的 cards 文件里找到，条数与 manifest、groups 一致；
// 2. 所有 links 都指向存在的条目；
// 3. 卡片库的每个分组都有封面图；
// 4. 书（kind 为 articles 的库）每章的正文是非空的 markdown，章节序号齐全且不重复，每本书有书名。
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = async (p) => JSON.parse(await readFile(path.join(root, p), "utf8"));
const errors = [];

const { release } = await json("public/data/current.json");
const base = `public/data/release/${release}`;
const manifest = await json(`${base}/manifest.json`);
if (String(manifest.contract_version).split(".")[0] !== "1") errors.push(`约定版本 ${manifest.contract_version} 不认识`);
if (manifest.release !== release) errors.push(`current.json 写的是 ${release}，manifest 里是 ${manifest.release}`);

const all = new Set();
const links = [];
for (const col of manifest.collections.filter((c) => c.kind === "cards" || c.kind === "articles")) {
  const isCards = col.kind === "cards";
  const dir = `${base}/collections/${col.id}`;
  const index = await json(`${dir}/index.json`);
  const groups = await json(`${dir}/groups.json`);
  if (index.length !== col.count) errors.push(`${col.id}: index 有 ${index.length} 条，manifest 写 ${col.count}`);
  const inCards = new Map();
  for (const g of groups) {
    const cards = await json(`${dir}/cards/${g.id}.json`);
    if (cards.length !== g.count) errors.push(`${col.id}/${g.id}: cards 有 ${cards.length} 条，groups 写 ${g.count}`);
    for (const c of cards) {
      inCards.set(c.id, g.id);
      if (!c.body || typeof c.body !== "object") errors.push(`${c.id}: 没有 body`);
      else if (!isCards && (c.body.format !== "markdown" || typeof c.body.text !== "string" || !c.body.text.trim())) errors.push(`${c.id}: 正文不是非空的 markdown`);
    }
    if (!isCards) {
      if (!g.name) errors.push(`${col.id}/${g.id}: 没有书名`);
      const parts = cards.map((c) => (c.tags || []).find((t) => t.startsWith("part:")));
      if (parts.some((p) => !p)) errors.push(`${col.id}/${g.id}: 有章节缺 part 标签`);
      if (new Set(parts).size !== parts.length) errors.push(`${col.id}/${g.id}: 章节序号有重复`);
      continue;
    }
    try { await access(path.join(root, `public/covers/${col.id}-${g.id}.jpg`)); }
    catch { errors.push(`缺封面 public/covers/${col.id}-${g.id}.jpg`); }
  }
  for (const e of index) {
    if (all.has(e.id)) errors.push(`${e.id}: id 重复`);
    all.add(e.id);
    if (inCards.get(e.id) !== e.group) errors.push(`${e.id}: 在 cards/${e.group}.json 里找不到`);
    for (const l of e.links || []) links.push([e.id, l.to]);
  }
  console.log(`${col.id}: ${index.length} 条，${groups.length} 个分组`);
}
for (const [from, to] of links) if (!all.has(to)) errors.push(`${from}: 链接指向不存在的 ${to}`);

console.log(`links: ${links.length} 条`);

if (errors.length) {
  console.error(errors.slice(0, 50).join("\n"));
  console.error(`共 ${errors.length} 处问题`);
  process.exit(1);
}
console.log(`发布包 ${release} 核对通过`);
