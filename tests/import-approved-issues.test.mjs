import test from "node:test";
import assert from "node:assert/strict";
import { importApprovedIssues, parseIssueBody } from "../scripts/import-approved-issues.mjs";

const body = `### 机制名称\n资源路线选择\n\n### 机制介绍\n玩家在有限储备下选择路线。\n\n### 原创案例\n本例假设每轮补给减少两点。选择短路更快但更危险。\n\n### 配合要素（可选）\n- 路线风险\n- 补给库存\n\n### 标签（可选）\n选择，资源\n\n### 条目类型\n机制\n`;
function issue(overrides = {}) { return { number: 18, state: "CLOSED", labels: [{ name: "submission" }, { name: "approved-for-catalog" }], title: "机制投稿：资源路线选择", body, url: "https://github.com/mmlong818/game-mechanism-library/issues/18", ...overrides }; }

test("parses GitHub issue form headings", () => {
  const fields = parseIssueBody(body);
  assert.equal(fields.title, "资源路线选择");
  assert.equal(fields.summary, "玩家在有限储备下选择路线。");
  assert.equal(fields.type, "机制");
  assert.match(fields.example, /补给减少两点/u);
});

test("imports closed approved issue into isolated community card", () => {
  const result = importApprovedIssues({ issues: [issue()], existing: [], baseIds: new Set(["m_source"]), repo: "mmlong818/game-mechanism-library" });
  assert.equal(result.added.length, 1);
  assert.equal(result.cards[0].id, "community-game-mechanism-library-18");
  assert.equal(result.cards[0].type, "mechanic");
  assert.deepEqual(result.cards[0].structure, ["路线风险", "补给库存"]);
  assert.equal(result.cards[0].communitySource.issue_url, issue().url);
});

test("does not import open or unapproved issues", () => {
  const open = issue({ state: "OPEN" });
  const unapproved = issue({ number: 19, labels: [{ name: "submission" }] });
  assert.equal(importApprovedIssues({ issues: [open, unapproved], repo: "mmlong818/game-mechanism-library" }).added.length, 0);
});

test("does not duplicate already imported issue", () => {
  const first = importApprovedIssues({ issues: [issue()], repo: "mmlong818/game-mechanism-library" });
  const second = importApprovedIssues({ issues: [issue()], existing: first.cards, repo: "mmlong818/game-mechanism-library" });
  assert.equal(second.added.length, 0);
  assert.equal(second.cards.length, 1);
});

test("rejects invalid approved content and official ID collision", () => {
  assert.throws(() => importApprovedIssues({ issues: [issue({ body: "### 机制名称\n缺字段" })], repo: "mmlong818/game-mechanism-library" }), /invalid required fields/u);
  const colliding = issue({ number: 1 });
  assert.throws(() => importApprovedIssues({ issues: [colliding], baseIds: new Set(["community-game-mechanism-library-1"]), repo: "mmlonglong/game-mechanism-library" }), /collides/u);
});
