/**
 * 把六个只读工具注册到 MCP 服务。与传输方式无关：stdio 和 HTTP 入口都调用 createServer。
 * 工具名称和必填参数由 CONTRACT.md 第 9 节定死，以后只增不改。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  Library,
  LibraryError,
  LIST_GROUP_DEFAULT_LIMIT,
  LIST_GROUP_MAX_LIMIT,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  errorText,
} from './library.js';

export const SERVER_NAME = 'game-design-library';
export const SERVER_VERSION = '0.2.0';
/** 给人看的名称；SERVER_NAME 是给程序认的标识，不改。 */
export const SERVER_TITLE = '猫叔的游戏知识库';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/** 统一的出错处理：给模型一段说得清楚的文字，不让服务崩溃。 */
async function run(fn: () => unknown | Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    const text = err instanceof LibraryError ? err.message : `读取资料库时出错：${errorText(err)}`;
    return { content: [{ type: 'text', text }], isError: true };
  }
}

export function createServer(library: Library): McpServer {
  const info = library.getLibraryInfo();
  const summary = info.collections.map((c) => `${c.name}（${c.id}）${c.count} 条`).join('、');

  const server = new McpServer(
    { name: SERVER_NAME,
      title: SERVER_TITLE, version: SERVER_VERSION },
    {
      instructions:
        `猫叔的游戏知识库（发布包 ${info.release}），只读。现有：${summary}。` +
        '条目的全局 id 形如 mechanism/remove-cards-to-thin-deck。' +
        '常用路径：search 按关键词找条目 → get_entry 读正文 → get_links 顺着关系找相关条目（可跨库）。' +
        '想按主题浏览时先 list_collections 看分组，再 list_group。',
    },
  );

  server.registerTool(
    'list_collections',
    {
      title: '列出各库与分组',
      description: '列出资料库里有哪些库（机制、世界观、体验等）、各多少条、各自的分组（分组 id、中文名、条数）。',
      annotations: READ_ONLY,
    },
    () => run(() => library.listCollections()),
  );

  server.registerTool(
    'search',
    {
      title: '按关键词搜索',
      description:
        '按关键词搜索条目。在名称、一句话定义、分组名里做不区分大小写的子串匹配，书的章节另外搜正文全文；多个词用空格分开，要全部命中；' +
        '名称命中的排在前面。中文不分词，请用较短的词（如“牌组”“冷却”）。' +
        '返回条目外壳（id、名称、一句话定义、分组、标签、链接，不含正文）和总命中数；正文用 get_entry 取。',
      inputSchema: {
        query: z.string().min(1).describe('关键词；多个词用空格分开，要全部命中'),
        collection: z.string().optional().describe('只搜这个库，如 mechanism、world、experience'),
        group: z.string().optional().describe('只搜这个分组（分组 id，如 deckbuilding）'),
        tag: z.string().optional().describe('只要带这个标签的条目，如 new、thin、具体机制、机制家族、设计模式'),
        limit: z.number().int().min(1).max(SEARCH_MAX_LIMIT).optional().describe(`返回条数，默认 ${SEARCH_DEFAULT_LIMIT}，上限 ${SEARCH_MAX_LIMIT}`),
        offset: z.number().int().min(0).optional().describe('跳过前面多少条，用于翻页，默认 0'),
      },
      annotations: READ_ONLY,
    },
    (args) => run(() => library.search(args)),
  );

  server.registerTool(
    'get_entry',
    {
      title: '取整个条目',
      description:
        '按全局 id 取整个条目：外壳加正文 body（机制卡的运作方式、决策、调节旋钮、案例等）。' +
        '旧 id 会自动跳转到新条目，此时结果里带 redirected_from。书的章节还带 license_notice（授权提示）。',
      inputSchema: {
        id: z.string().min(1).describe('全局 id，形如 mechanism/remove-cards-to-thin-deck'),
      },
      annotations: READ_ONLY,
    },
    (args) => run(() => library.getEntry(args.id)),
  );

  server.registerTool(
    'list_group',
    {
      title: '列出一个分组',
      description:
        `列出某个库某个分组的条目外壳（不含正文）。分组 id 用 list_collections 查。` +
        `一次默认返回 ${LIST_GROUP_DEFAULT_LIMIT} 条；分组更大时结果里的 next_offset 不为 null，用它作 offset 继续取。`,
      inputSchema: {
        collection: z.string().min(1).describe('库 id，如 mechanism'),
        group: z.string().min(1).describe('分组 id，如 deckbuilding'),
        limit: z.number().int().min(1).max(LIST_GROUP_MAX_LIMIT).optional().describe(`返回条数，默认 ${LIST_GROUP_DEFAULT_LIMIT}，上限 ${LIST_GROUP_MAX_LIMIT}`),
        offset: z.number().int().min(0).optional().describe('跳过前面多少条，默认 0'),
      },
      annotations: READ_ONLY,
    },
    (args) => run(() => library.listGroup(args.collection, args.group, args.limit, args.offset)),
  );

  server.registerTool(
    'get_links',
    {
      title: '取条目的关系',
      description:
        '取某个条目指向的条目（outgoing，带关系 rel、一句话说明 note、目标名称）和指向它的条目（incoming，带 rel 和来源名称），可跨库。' +
        'rel：related 库内相关；component 设计模式的组成机制；uses-mechanism 世界观卡或体验卡用到的机制；其他取值按 related 理解。',
      inputSchema: {
        id: z.string().min(1).describe('全局 id，形如 mechanism/remove-cards-to-thin-deck'),
      },
      annotations: READ_ONLY,
    },
    (args) => run(() => library.getLinks(args.id)),
  );

  server.registerTool(
    'get_library_info',
    {
      title: '资料库版本信息',
      description: '返回当前发布包的发布编号、约定版本、各库条数、数据来源，以及内容的授权说明 license（发布包里有才带）。',
      annotations: READ_ONLY,
    },
    () => run(() => library.getLibraryInfo()),
  );

  return server;
}
