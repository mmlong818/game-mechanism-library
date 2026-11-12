#!/usr/bin/env node
/**
 * 本地安装版入口：通过 stdio 与 AI 工具通信。
 * 标准输出只能走 MCP 协议，所有日志都写到标准错误。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Library, errorText } from './library.js';
import { createServer } from './server.js';
import { USAGE, parseArgs, resolveSource } from './sources.js';

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.error(USAGE);
    return;
  }
  const library = await Library.load(await resolveSource(opts));
  const info = library.getLibraryInfo();
  console.error(
    `[game-design-library] 已加载发布包 ${info.release}（约定 ${info.contract_version}）：` +
      info.collections.map((c) => `${c.id} ${c.count}`).join('，') +
      `；来源 ${info.source}`,
  );
  for (const s of library.skipped) console.error(`[game-design-library] 跳过库 ${s.id}：${s.reason}`);

  const server = createServer(library);
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error(`[game-design-library] 启动失败：${errorText(err)}`);
  process.exit(1);
});
