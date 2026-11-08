import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

async function main() {
  const args = process.argv.slice(2);
  function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
  const input = arg("--input");
  const output = arg("--output") || "community-approved.json";
  const repo = arg("--repo") || "mmlong818/game-mechanism-library";
  const dryRun = args.includes("--dry-run");
  if (!input) throw new Error("usage: node scripts/import-approved-issues.mjs --input issues.json [--output community-approved.json] [--repo owner/name] [--dry-run]");
  const issues = JSON.parse(await readFile(input, "utf8"));
  const existing = await readFile(output, "utf8").then(JSON.parse).catch(error => { if (error.code === "ENOENT") return []; throw error; });
  const baseIndex = JSON.parse(await readFile("public/data/index.json", "utf8"));
  const result = importApprovedIssues({ issues, existing, baseIds: new Set(baseIndex.map(item => item.id)), repo });
  console.log(JSON.stringify({ imported: result.added.length, total: result.cards.length, ids: result.added.map(card => card.id), dryRun }));
  if (!dryRun && result.added.length) await writeFile(output, `${JSON.stringify(result.cards, null, 2)}\n`);
}

export function importApprovedIssues({ issues, existing = [], baseIds = new Set(), repo }) {
  if (!Array.isArray(issues) || !Array.isArray(existing) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo)) throw new Error("invalid import input");
  const knownIssueNumbers = new Set(existing.map(card => card.issue_number));
  const ids = new Set(baseIds);
  for (const card of existing) { if (!card?.id || ids.has(card.id)) throw new Error("existing community ID overlaps public catalog"); ids.add(card.id); }
  const added = [];
  for (const issue of issues) {
    if (!issue || !Number.isSafeInteger(issue.number) || issue.number < 1) throw new Error("invalid issue number");
    const labels = Array.isArray(issue.labels) ? issue.labels.map(label => typeof label === "string" ? label : label?.name) : [];
    const state = String(issue.state || "").toLowerCase();
    if (state !== "closed" || !labels.includes("approved-for-catalog")) continue;
    if (knownIssueNumbers.has(issue.number)) continue;
    const fields = parseIssueBody(issue.body || "");
    const title = fields.title.trim();
    const summary = fields.summary.trim();
    const narrative = fields.example.trim();
    if (!title || title.length > 180 || !summary || summary.length > 30_000 || !narrative || narrative.length > 16_000) throw new Error(`approved issue #${issue.number} has invalid required fields`);
    const type = fields.type.trim() === "系统机制" || fields.type.trim().toLowerCase() === "system" ? "system" : fields.type.trim() === "机制" || fields.type.trim().toLowerCase() === "mechanic" ? "mechanic" : null;
    if (!type) throw new Error(`approved issue #${issue.number} has invalid type`);
    const tags = fields.tags.split(/[，,、\n]/u).map(value => value.trim()).filter(Boolean);
    if (tags.length > 12 || tags.some(tag => tag.length > 32) || new Set(tags).size !== tags.length) throw new Error(`approved issue #${issue.number} has invalid tags`);
    const structure = fields.supporting.split(/\r?\n/u).map(value => value.trim().replace(/^[-*]\s*/u, "")).filter(Boolean);
    if (structure.length > 20 || structure.some(value => value.length > 1200)) throw new Error(`approved issue #${issue.number} has invalid supporting elements`);
    const id = `community-${repo.split("/")[1].toLowerCase()}-${issue.number}`;
    if (ids.has(id)) throw new Error(`approved issue #${issue.number} collides with an existing ID`);
    ids.add(id); knownIssueNumbers.add(issue.number);
    const issueUrl = issue.html_url || issue.url;
    if (typeof issueUrl !== "string" || issueUrl !== `https://github.com/${repo}/issues/${issue.number}`) throw new Error(`approved issue #${issue.number} has invalid URL`);
    added.push({ id, issue_number: issue.number, type, title, summary, structure, example: { kind: "design_example", title: "社区原创案例", narrative }, tags, revision: 1, communitySource: { issue_number: issue.number, issue_url: issueUrl } });
  }
  return { cards: [...existing, ...added], added };
}

export function parseIssueBody(body) {
  const fields = { title: "", summary: "", example: "", supporting: "", tags: "", type: "" };
  const headings = { "机制名称": "title", "机制介绍": "summary", "原创案例": "example", "配合要素（可选）": "supporting", "标签（可选）": "tags", "条目类型": "type" };
  const lines = body.replace(/\r\n/gu, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^###\s+(.+?)\s*$/u);
    if (!match || !headings[match[1]]) continue;
    const key = headings[match[1]];
    const values = [];
    for (i++; i < lines.length && !/^###\s+/u.test(lines[i]); i++) values.push(lines[i]);
    fields[key] = values.join("\n").trim().replace(/^_No response_$/u, "");
    i--;
  }
  return fields;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
