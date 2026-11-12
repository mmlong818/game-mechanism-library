// 冒烟测试：用官方 SDK 的客户端通过 stdio 启动服务，把六个工具各走一遍。
// 用法：node scripts/smoke.mjs [发布包目录]   （先 npm run build）
// 注意：这里的断言是照发布包 2026-11-13.2 的内容写的（条数、具体的卡片 id）。换了更新的发布包后，
// 个别断言可能因内容变化而不过，不代表服务有问题；与内容无关的检查请用 smoke-http.mjs。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { defaultReleaseDir } from './release-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.resolve(process.argv[2] ?? defaultReleaseDir());
const EXPECTED_TOOLS = ['get_entry', 'get_library_info', 'get_links', 'list_collections', 'list_group', 'search'];
const EXPECTED_COUNTS = { mechanism: 1384, world: 132, experience: 148, book: 36 };

let failed = 0;
async function step(name, fn) {
  try {
    const detail = await fn();
    console.log(`通过  ${name}${detail ? `  —— ${detail}` : ''}`);
  } catch (err) {
    failed++;
    console.log(`失败  ${name}  —— ${err instanceof Error ? err.message : err}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const client = new Client({ name: 'gdl-smoke', version: '0.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, '..', 'dist', 'stdio.js'), '--release-dir', releaseDir],
  stderr: 'inherit',
});
await client.connect(transport);

/** 调用工具并把返回的 JSON 文本解析出来；工具报错时抛出。 */
async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.[0]?.text ?? '';
  if (res.isError) throw new Error(`工具返回错误：${text}`);
  return JSON.parse(text);
}

await step('列出工具（正好六个，都标了只读）', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert(JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS), `实际是 ${names.join(', ')}`);
  assert(tools.every((t) => t.annotations?.readOnlyHint === true), '有工具没标 readOnlyHint');
  const search = tools.find((t) => t.name === 'search');
  assert(JSON.stringify(search.inputSchema.required) === '["query"]', 'search 的必填参数应只有 query');
  return names.join(', ');
});

await step('get_library_info（条数 1384 / 132 / 148，书 36 篇；带授权说明）', async () => {
  const info = await call('get_library_info');
  assert(info.release === path.basename(releaseDir), `发布编号 ${info.release}`);
  assert(info.name === '猫叔的游戏知识库' && info.homepage.startsWith('https://github.com/'), `名称或主页不对：${info.name} ${info.homepage}`);
  assert(info.contract_version.startsWith('1.'), `约定版本 ${info.contract_version}`);
  for (const [id, n] of Object.entries(EXPECTED_COUNTS)) {
    const c = info.collections.find((x) => x.id === id);
    assert(c && c.count === n, `${id} 应为 ${n}，实际 ${c?.count}`);
  }
  assert(info.license?.content === 'CC-BY-NC-ND-4.0' && info.license.attribution === '猫叔', `授权说明不对：${JSON.stringify(info.license)}`);
  return `${info.release}，约定 ${info.contract_version}，授权 ${info.license.content}`;
});

await step('list_collections（三个卡片库加书，各带分组）', async () => {
  const { collections } = await call('list_collections');
  assert(collections.length === 4, `库的数量 ${collections.length}`);
  for (const c of collections) {
    assert(c.groups.length > 0, `${c.id} 没有分组`);
    const sum = c.groups.reduce((a, g) => a + g.count, 0);
    assert(sum === c.count, `${c.id} 各分组条数之和 ${sum} 不等于 ${c.count}`);
  }
  return collections.map((c) => `${c.id} ${c.groups.length} 组`).join('，');
});

await step('search “牌组”（名称命中在前，不带 body）', async () => {
  const r = await call('search', { query: '牌组' });
  assert(r.total > 0 && r.results.length === Math.min(20, r.total), `total ${r.total}，返回 ${r.results.length}`);
  assert(r.results.every((e) => !('body' in e)), '结果里不该有 body');
  assert(r.results[0].name.includes('牌组'), `第一条名称没命中：${r.results[0].name}`);
  const firstMiss = r.results.findIndex((e) => !e.name.includes('牌组'));
  assert(firstMiss === -1 || r.results.slice(firstMiss).every((e) => !e.name.includes('牌组')), '名称命中没有排在前面');
  return `共 ${r.total} 条，第一条 ${r.results[0].id}`;
});

await step('search 带 collection: "world"', async () => {
  const r = await call('search', { query: '世界', collection: 'world', limit: 5 });
  assert(r.total > 0 && r.results.length <= 5, `total ${r.total}，返回 ${r.results.length}`);
  assert(r.results.every((e) => e.collection === 'world'), '混进了别的库');
  return `共 ${r.total} 条`;
});

await step('search 多个词、大小写、tag、翻页、上限', async () => {
  const both = await call('search', { query: '牌组  移除' });
  assert(both.results.some((e) => e.id === 'mechanism/remove-cards-to-thin-deck'), '多词搜索没找到删牌');
  const upper = await call('search', { query: 'DECKBUILDING', limit: 50 });
  assert(upper.total === 45 && upper.results.length === 45, `按分组 id 大写搜索应得 45，实际 ${upper.total}`);
  const tagged = await call('search', { query: '牌', tag: '设计模式' });
  assert(tagged.total > 0 && tagged.results.every((e) => e.tags.includes('设计模式')), 'tag 过滤不对');
  const p1 = await call('search', { query: '牌', limit: 3 });
  const p2 = await call('search', { query: '牌', limit: 3, offset: 3 });
  assert(p1.next_offset === 3 && p2.results[0].id !== p1.results[0].id, '翻页不对');
  const over = await client.callTool({ name: 'search', arguments: { query: '牌', limit: 51 } }).catch((e) => ({ isError: true, thrown: e }));
  assert(over.isError, 'limit 超过 50 应被拒绝');
  return `多词 ${both.total} 条，tag ${tagged.total} 条`;
});

let linkTarget;
for (const id of ['mechanism/remove-cards-to-thin-deck', 'world/abundance-here-drains-there', 'experience/abilities-taken-away-gradually']) {
  await step(`get_entry ${id}（带 body）`, async () => {
    const e = await call('get_entry', { id });
    assert(e.id === id && e.name && e.summary, '外壳不完整');
    assert(e.body && typeof e.body === 'object' && Object.keys(e.body).length > 0, '没有 body');
    if (id.startsWith('mechanism/')) linkTarget = e.links[0]?.to;
    return `${e.name}，body 字段 ${Object.keys(e.body).length} 个`;
  });
}

await step('书：search 能搜到章节，get_entry 取到整章正文', async () => {
  const r = await call('search', { query: '玩测', collection: 'book' });
  assert(r.total > 0 && r.results.every((e) => e.collection === 'book' && e.group === 'rpg-seven-volumes'), `书里搜“玩测”得到 ${r.total} 条`);
  assert(r.results[0].id === 'book/rpg-seven-volumes-24', `第一条应是第 24 章，实际 ${r.results[0].id}`);
  const e = await call('get_entry', { id: 'book/rpg-seven-volumes-24' });
  assert(e.body.format === 'markdown' && e.body.text.startsWith('# 第 24 章') && e.body.text.length > 5000, '正文不对');
  assert(e.body.series_title === 'RPG设计七卷书' && e.body.part === 24, '书名或序号不对');
  const g = await call('list_group', { collection: 'book', group: 'rpg-seven-volumes' });
  assert(g.total === 36 && g.entries[0].id === 'book/rpg-seven-volumes-00' && g.entries[0].name === '前言', '章节列表不对：应为 36 条，第一条是前言');
  assert(typeof e.license_notice === 'string' && e.license_notice.includes('猫叔') && e.body.volume === '卷六 · 验证', '章节应带授权提示和所属卷名');
  const card = await call('get_entry', { id: 'mechanism/remove-cards-to-thin-deck' });
  assert(!('license_notice' in card), '卡片不带 license_notice');
  const pre = await call('search', { query: '账城' });
  assert(pre.results.some((x) => x.collection === 'book'), '搜“账城”应能搜到书里的条目');
  return `搜到 ${r.total} 条；${e.name} 正文 ${e.body.text.length} 字；全书 ${g.total} 条`;
});

await step('list_group mechanism / deckbuilding', async () => {
  const r = await call('list_group', { collection: 'mechanism', group: 'deckbuilding' });
  assert(r.total === 45 && r.entries.length === 45, `应为 45 条，实际 total ${r.total}、返回 ${r.entries.length}`);
  assert(r.entries.every((e) => e.group === 'deckbuilding' && !('body' in e)), '条目不对');
  const big = await call('list_group', { collection: 'mechanism', group: 'combat' });
  assert(big.total === 196 && big.entries.length === 60 && big.next_offset === 60, '大分组的分页不对');
  return `${r.group.name} ${r.total} 条；combat 196 条分页正常`;
});

await step('get_links（出链带 rel、note、名称；入链反查）', async () => {
  assert(linkTarget, '前一步没拿到链接目标');
  const src = await call('get_links', { id: 'mechanism/remove-cards-to-thin-deck' });
  assert(src.outgoing.length > 0, '没有出链');
  assert(src.outgoing.every((l) => l.rel && l.note && l.name), '出链缺 rel、note 或名称');
  const dst = await call('get_links', { id: linkTarget });
  assert(dst.incoming.some((l) => l.from === 'mechanism/remove-cards-to-thin-deck' && l.name), `${linkTarget} 的入链里没有删牌`);
  const cross = await call('get_links', { id: 'mechanism/finite-resource-world' });
  assert(cross.incoming.some((l) => l.from.startsWith('world/') && l.rel === 'uses-mechanism'), '没查到跨库入链');
  return `${linkTarget} 入链 ${dst.incoming.length} 条；跨库入链正常`;
});

await step('不存在的 id（返回错误信息，不崩溃）', async () => {
  for (const [tool, args] of [
    ['get_entry', { id: 'mechanism/no-such-entry-xyz' }],
    ['get_links', { id: 'nowhere/nothing' }],
    ['list_group', { collection: 'mechanism', group: 'no-such-group' }],
    ['search', { query: '牌', collection: 'no-such-collection' }],
  ]) {
    const res = await client.callTool({ name: tool, arguments: args });
    assert(res.isError === true, `${tool} 应返回错误`);
    assert(res.content[0].text.length > 0, `${tool} 的错误信息是空的`);
  }
  const res = await client.callTool({ name: 'get_entry', arguments: { id: 'remove-cards-to-thin-deck' } });
  assert(res.isError && res.content[0].text.includes('mechanism/remove-cards-to-thin-deck'), '漏了库名前缀时应提示正确的 id');
  const info = await call('get_library_info');
  assert(info.release, '出错之后服务不可用了');
  return res.content[0].text;
});

await client.close();
console.log(failed ? `\n有 ${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
