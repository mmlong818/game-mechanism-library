# AI 工具配置示例

把示例里的 `https://mcp.example.com/mcp` 换成实际的 MCP 网址，`https://example.com` 换成网站的实际地址，`<解压位置>` 换成 `mcp` 目录所在的实际路径。

| 文件 | 用途 |
|---|---|
| `mcp-remote.json` | 公开网址版：通用的 `mcpServers` 配置（支持 HTTP 类型服务器的工具） |
| `mcp-local-site.json` | 本地安装版，数据从网站读取 |
| `mcp-local-dir.json` | 本地安装版，数据读本机的发布包目录 |

各工具的配置文件位置不同：Claude Code 是项目里的 `.mcp.json`（或用 `claude mcp add` 命令）；Claude 桌面版是设置里“开发者”一栏打开的 `claude_desktop_config.json`；Cursor 是 `.cursor/mcp.json`。有图形界面的工具一般也可以在设置的“连接器”或“MCP”里新增一个服务器，类型选 HTTP，填入网址。具体以各工具当前的文档为准。

接好后问 AI 一句“猫叔的游戏知识库里有哪几个库”，答得出各库的条数就说明通了。

## Claude Code

公开网址版（不用安装）：

```
claude mcp add --transport http game-design-library https://mcp.example.com/mcp
```

本地安装版，数据从网站读取（先在 `mcp` 目录里运行过 `npm ci` 和 `npm run build`）：

```
claude mcp add game-design-library -- node "<解压位置>/mcp/dist/stdio.js" --site-url https://example.com
```

本地安装版，数据读本机的发布包目录：

```
claude mcp add game-design-library -- node "<解压位置>/mcp/dist/stdio.js" --release-dir "<发布包目录>"
```

想在所有项目里都能用，在 `claude mcp add` 后面加 `--scope user`。查看用 `claude mcp list`，移除用 `claude mcp remove game-design-library`。
