# 猫叔的游戏知识库 MCP 服务

让 AI 工具（Claude Code、Claude 桌面版、Cursor 等）直接查“猫叔的游戏知识库”：机制、世界观、体验三个卡片库，以及《RPG设计七卷书》。

服务本身不含任何内容，只读“发布包”（一个目录，里面有 `manifest.json` 和各库的 JSON 文件）。资料库加卡、出新发布包，都不需要改这里的代码。全部工具只读，服务无状态、不需要登录。

有两个入口：

- `dist/stdio.js`：本地安装版，由使用者自己的 AI 工具启动。
- `dist/http.js`：公开网址版（Streamable HTTP），部署在服务器上，访客在 AI 工具里填一个网址就能用。

项目主页：<https://github.com/mmlong818/game-mechanism-library>

## 六个工具

| 工具 | 必填参数 | 作用 |
|---|---|---|
| `list_collections` | 无 | 列出有哪些库、各多少条、各自的分组（分组 id、中文名、条数） |
| `search` | `query` | 按关键词搜索，返回条目外壳（不含正文）和总命中数。可选 `collection`、`group`、`tag`、`limit`（默认 20，上限 50）、`offset` |
| `get_entry` | `id` | 按全局 id 取整个条目（外壳加正文 `body`）。旧 id 自动跳转，结果里带 `redirected_from`。书的章节另带 `license_notice`（一句授权提示） |
| `list_group` | `collection`、`group` | 列出某个分组的条目外壳。可选 `limit`（默认 60，上限 200）、`offset` |
| `get_links` | `id` | 取某个条目指向的条目（带关系 `rel`、说明 `note`、目标名称）和指向它的条目，可跨库 |
| `get_library_info` | 无 | 名称、项目主页、发布编号、约定版本、各库条数、数据来源；发布包的 `manifest.json` 里有 `license`（内容的授权说明）时原样带上 |

几点说明：

- 全局 id 形如 `mechanism/remove-cards-to-thin-deck`（库名加斜杠加库内 id）。
- `search` 在名称、一句话定义、分组名（以及分组 id、条目 id）里做不区分大小写的子串匹配；书的章节另外搜正文全文。多个词用空格分开，要全部命中。名称命中的排前面，其次是定义命中。中文不分词，用短词效果好（“牌组”“冷却”）。
- `list_group` 默认一次返回 60 条。结果里的 `next_offset` 不为 `null` 时，用它作 `offset` 继续取。
- 找不到条目、库或分组时，工具返回一段说明原因的错误文字，服务不会退出。

## 构建

需要 Node.js 20 或更高版本。

```
npm ci
npm run build
```

## 数据来源怎么指定

三种方式，stdio 和 HTTP 两个入口通用。命令行参数优先于环境变量；同一级里按下表的顺序取第一个有值的。

| 方式 | 命令行 | 环境变量 | 说明 |
|---|---|---|---|
| 本地目录 | `--release-dir <目录>` | `GDL_RELEASE_DIR` | 某个发布包的目录（里面有 `manifest.json`）。不联网 |
| 发布包网址 | `--release-url <网址>` | `GDL_RELEASE_URL` | 某个发布包的网址前缀，例如 `https://example.com/data/release/2026-11-13.2` |
| 网站地址 | `--site-url <网站地址>` | `GDL_SITE_URL` | 已部署的网站的地址。读 `<网站地址>/data/current.json` 得到当前发布编号，再从 `<网站地址>/data/release/<编号>/` 取数据 |
| 固定发布编号 | `--release-id <编号>` | `GDL_RELEASE_ID` | 和网站地址一起用：不读 `current.json`，固定用这个编号 |

用“网站地址”时，MCP 和网站只需要维护一份数据：网站换了发布包（改 `data/current.json`），MCP 跟着换。

- stdio 入口在每次启动时读一次 `current.json`。
- HTTP 入口启动时读一次，之后每隔 `GDL_REFRESH_SECONDS` 秒（默认 300）再读一次；发现编号变了，先在后台把新包加载好再切换，加载失败就继续用旧包并在日志里记一行。设成 `0` 表示只在启动时读。

用网址时，文件按需抓取并缓存到缓存目录（Windows 是 `%LOCALAPPDATA%\game-design-library-mcp\Cache`，macOS 是 `~/Library/Caches/game-design-library-mcp`，其余是 `~/.cache/game-design-library-mcp`；可用环境变量 `GDL_CACHE_DIR` 改）。`manifest.json` 和 `current.json` 每次启动都从网上取，取不到时用缓存；其余文件下载后按 `manifest.json` 里的 sha256 核对，缓存按发布编号分开存放。除这个缓存目录外，服务不写任何文件；缓存目录不可写也不影响使用，只是每次启动都要重新下载。

启动时会核对 `manifest.json` 里 `contract_version` 的大版本号，不是 1 就拒绝加载并说明原因。加载哪些库只看 `manifest.json`：凡是 `kind` 为 `cards` 或 `articles` 的库都会加载，其他的跳过。

## 本地安装版（stdio）

没有发布到 npm，用本地路径接入。先按上面“构建”一节在本目录里 `npm ci`、`npm run build`，然后在 AI 工具里把它指向 `node <本目录>/dist/stdio.js`，再加上数据来源。下面的 `<mcp 目录>` 请换成本目录在你机器上的实际位置。

数据来源的两种配法：

**配法一：读已部署的网站（推荐）。** 不用自己保存数据，网站更新后重启 AI 工具就是新内容。

```
claude mcp add game-design-library -- node "<mcp 目录>/dist/stdio.js" --site-url https://example.com
```

**配法二：读本地的发布包目录。** 不联网也能用，更新内容时要自己换目录。

```
claude mcp add game-design-library -- node "<mcp 目录>/dist/stdio.js" --release-dir "<发布包目录>"
```

想在所有项目里都能用，在 `claude mcp add` 后面加 `--scope user`。

其他工具（Claude 桌面版、Cursor 等）通用的 `mcpServers` 配置：

```json
{
  "mcpServers": {
    "game-design-library": {
      "command": "node",
      "args": ["<mcp 目录>/dist/stdio.js", "--site-url", "https://example.com"]
    }
  }
}
```

也可以不写命令行参数，改用环境变量：

```json
{
  "mcpServers": {
    "game-design-library": {
      "command": "node",
      "args": ["<mcp 目录>/dist/stdio.js"],
      "env": { "GDL_RELEASE_DIR": "<发布包目录>" }
    }
  }
}
```

Windows 路径在 JSON 里用正斜杠最省事；用反斜杠的话每个都要写成两个。

接好后调用 `get_library_info`，能看到发布编号和各库条数就说明通了。

## 公开网址版（Streamable HTTP）

```
node dist/http.js
```

MCP 端点是 `/mcp`（只接受 POST；无状态，每个请求独立，响应是普通的 JSON）。`/health`（以及 `/`）是健康检查，返回 `{"ok":true,"release":"…","contract_version":"…","mcp":"/mcp"}`。

全部设置由环境变量决定（示例见 `.env.example`）：

| 环境变量 | 默认 | 作用 |
|---|---|---|
| `GDL_SITE_URL` / `GDL_RELEASE_ID` / `GDL_RELEASE_URL` / `GDL_RELEASE_DIR` | 无 | 数据来源，见上一节。必须给一种 |
| `GDL_HTTP_HOST` | `127.0.0.1` | 监听地址。默认只有本机能连；在容器里设成 `0.0.0.0` |
| `GDL_HTTP_PORT` | `8787` | 监听端口 |
| `GDL_ALLOWED_ORIGINS` | 空 | 允许的浏览器来源（`Origin` 请求头），逗号分隔，如 `https://example.com`；`*` 表示全部。带 `Origin` 而不在名单里的请求返回 403。不带 `Origin` 的请求（命令行工具、各家 AI 服务的服务器）不受影响 |
| `GDL_ALLOWED_HOSTS` | 空（不检查） | 允许的 `Host` 请求头，逗号分隔。设了以后反向代理要把原始 `Host` 传过来 |
| `GDL_REFRESH_SECONDS` | `300` | 跟随网站时多久检查一次 `current.json`；`0` 表示只在启动时读 |
| `GDL_CACHE_DIR` | 用户缓存目录 | 网址来源的缓存位置 |
| `GDL_ACCESS_LOG` | `0` | 设为 `1` 时每个请求记一行：方法、路径、状态码、耗时 |

监听地址和端口也可以用命令行的 `--host`、`--port` 给。

**对外提供服务时必须放在反向代理后面。** 这个服务自己不做 TLS，也不做限流；这两件事交给 Nginx、Caddy 或云厂商的负载均衡。服务只读、无状态、不存任何用户数据，可以随时重启，也可以起多个实例。请求体上限 1 MB。

日志全部写到标准错误：启动时加载了哪个发布包、数据来源、访问控制的设置；换发布包时一行；出错时一行。开了 `GDL_ACCESS_LOG` 才有逐请求的日志，其中不含请求内容，也不含来源地址。

### Docker

```
cp .env.example .env      # 按实际情况修改
docker compose up -d --build
```

`Dockerfile` 是多阶段构建，运行阶段只带编译结果和运行时依赖，以非 root 用户（`node`）运行。除缓存目录（`/tmp/gdl-cache`）外不写任何文件，`docker-compose.yml` 里已经按只读根文件系统加 `/tmp` 的内存盘来配，并只把端口绑在宿主机的 `127.0.0.1` 上。镜像自带健康检查（请求容器内的 `/health`）。

## 发布包更新后怎么切换

发布包一经生成不再修改，每次发布是一个新目录。

- 用“网站地址”并且没有固定编号：网站改了 `data/current.json` 之后，HTTP 入口最迟 `GDL_REFRESH_SECONDS` 秒后自动切换；stdio 入口在下次启动时切换。
- 其他方式：把来源（目录、网址或 `GDL_RELEASE_ID`）改成新的，然后重启服务。
- 回退：把来源改回旧的发布包即可。

改完后调用 `get_library_info` 或看 `/health`，确认 `release` 是不是预期的发布编号。

## 目录

```
src/library.ts        加载发布包、建索引、六个查询函数（纯逻辑）
src/server.ts         把六个工具注册到 MCP 服务，导出 createServer
src/sources.ts        数据来源：本地目录、网址加缓存、网站地址；命令行与环境变量的解析
src/stdio.ts          本地安装版入口
src/fetch-handler.ts  Streamable HTTP 处理函数（Web 标准的 Request / Response，可移植）；Origin 白名单在这里
src/http.ts           HTTP 入口（Node）
scripts/smoke.mjs       冒烟测试：经 stdio 把六个工具各走一遍
scripts/smoke-http.mjs  冒烟测试：HTTP 入口；也可以用来测一个已经上线的地址
Dockerfile、docker-compose.yml、.env.example   容器部署
```

## 自测

```
npm run build
npm run smoke -- <发布包目录>          # stdio，逐项打印通过或失败
npm run smoke:http -- <发布包目录>     # 在本机起 HTTP 入口测一遍，测完自动关掉
node scripts/smoke-http.mjs --site-url https://example.com        # 同上，但数据来自已部署的网站
node scripts/smoke-http.mjs --url https://mcp.example.com/mcp     # 直接测一个已经在运行的地址
```

不给发布包目录时，脚本会依次找环境变量 `GDL_RELEASE_DIR`、旁边的 `../site/data`（按 `current.json`）。

`smoke.mjs` 里的断言是照发布包 2026-11-13.2 的内容写的（各库条数、具体的卡片 id）；换了更新的发布包后个别断言可能不过，不代表服务有问题。`smoke-http.mjs` 不依赖具体内容，任何发布包都能用。

## 授权

代码采用 PolyForm Noncommercial License 1.0.0（见 `LICENSE`、`NOTICE`），版权人猫叔，不得用于商业目的。服务返回的内容（卡片文字、书）采用 CC BY-NC-ND 4.0，署名“猫叔”：可以原样转载并注明作者，不得商用，不得改编。
