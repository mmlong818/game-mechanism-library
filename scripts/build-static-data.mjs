import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "public", "data");
const dist = path.join(root, "dist");
const CHUNK_SIZE = 10;
function flatten(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(flatten).filter(Boolean).join(" ");
  return "";
}
function searchable(card) {
  const values = [card.title, card.summary, card.structure, card.example, card.tags, card.relations, card.mechanism, card.originalExample, card.calibration, card.ruleSupplements];
  return values.map(flatten).filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}
const index = JSON.parse(await readFile(path.join(dataDir, "index.json"), "utf8"));
const meta = JSON.parse(await readFile(path.join(dataDir, "catalog-meta.json"), "utf8"));
if (index.length !== meta.mechanismCount || index.length !== 4982) throw new Error("public catalog index/count mismatch");
const chunkFiles = (await readdir(path.join(dataDir, "cards"))).filter(name => /^\d{4}\.json$/u.test(name)).sort();
if (chunkFiles.length !== meta.chunkCount || chunkFiles.length !== 499) throw new Error("public catalog chunk count mismatch");
const baseCards = [];
for (const name of chunkFiles) baseCards.push(...JSON.parse(await readFile(path.join(dataDir, "cards", name), "utf8")));
if (baseCards.length !== index.length || new Set(baseCards.map(card => card.id)).size !== index.length) throw new Error("public card coverage mismatch");
const byId = new Map(index.map((item, i) => [item.id, item]));
for (const card of baseCards) if (byId.get(card.id)?.title !== card.title) throw new Error(`public card/index mismatch: ${card.id}`);
const communityFile = path.join(root, "community-approved.json");
let community = [];
try { community = JSON.parse(await readFile(communityFile, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
if (!Array.isArray(community)) throw new Error("community-approved.json must be an array");
const seen = new Set(index.map(item => item.id));
for (const card of community) {
  if (!card || typeof card.id !== "string" || !card.id.startsWith("community-") || seen.has(card.id) || typeof card.title !== "string" || typeof card.summary !== "string" || !["mechanic", "system"].includes(card.type) || !Array.isArray(card.structure) || !Array.isArray(card.tags) || !card.example || card.example.kind !== "design_example" || !card.communitySource || !Number.isSafeInteger(card.communitySource.issue_number) || typeof card.communitySource.issue_url !== "string") throw new Error("invalid or duplicate approved community card");
  seen.add(card.id);
}
const communityDir = path.join(dist, "community");
await mkdir(path.join(communityDir, "cards"), { recursive: true });
const communityIndex = community.map(card => ({ id: card.id, title: card.title, type: card.type }));
await writeFile(path.join(dist, "community-index.json"), JSON.stringify(communityIndex));
for (let start = 0, chunk = 0; start < community.length; start += CHUNK_SIZE, chunk++) {
  await writeFile(path.join(communityDir, "cards", `${String(chunk).padStart(4, "0")}.json`), JSON.stringify(community.slice(start, start + CHUNK_SIZE)));
}
const docs = [...baseCards, ...community].map(card => ({ id: card.id, text: searchable(card) }));
await writeFile(path.join(dist, "search-index.json"), JSON.stringify(docs));
const indexSha = createHash("sha256").update(JSON.stringify(index.map(item => item.id))).digest("hex");
const base = process.env.VITE_BASE_PATH || "/";
const safeBase = base.endsWith("/") ? base : `${base}/`;
await writeFile(path.join(dist, "404.html"), `<!doctype html><meta charset="utf-8"><script>const b=${JSON.stringify(safeBase)};const p=location.pathname.slice(b.replace(/\\/$/,"").length);const m=p.match(/^\\/?mechanism\\/([^/]+)\\/?$/);location.replace(b+(m?"#/mechanism/"+encodeURIComponent(decodeURIComponent(m[1])):""));</script>`);
await writeFile(path.join(dist, "site-build.json"), JSON.stringify({ baseVersion: meta.baseVersion, publicCount: index.length, communityCount: community.length, archiveCount: meta.archiveCount, deletedCount: meta.deletedCount, historicalScopeCount: meta.historicalScopeCount, indexIdsSha256: indexSha }));
console.log(JSON.stringify({ publicCards: baseCards.length, searchDocs: docs.length, communityCards: community.length, searchIndexBytes: (await readFile(path.join(dist, "search-index.json"))).byteLength, baseVersion: meta.baseVersion }));
