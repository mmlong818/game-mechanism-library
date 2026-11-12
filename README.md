# 猫叔的游戏知识库

给游戏设计者查阅的资料：机制、世界观、玩家体验三类卡片，加一本《RPG设计七卷书》。可以在网页上读，也可以接到 AI 工具里，让 AI 在聊设计时直接来查。

在线阅读：<https://mmlong818.github.io/game-mechanism-library/>

## 里面有什么

| 部分 | 讲什么 |
|---|---|
| 机制 | 一条规则怎么运转，玩家因此要做什么决定。每张卡写清它是什么、为什么用、怎么运作、设计者能调什么、哪些游戏这样做、容易做坏在哪里 |
| 世界观 | 一个世界靠什么前提成立，这个前提怎样落到规律、空间、历史、人群和日常生活里，又适合搭配哪些机制 |
| 体验 | 玩家在某一刻感受到什么，要同时满足哪些条件，用哪些机制去做，什么会毁掉它 |
| 《RPG设计七卷书》 | 七卷三十章加五个附录。按做游戏的真实顺序，讲每一步该想什么、填什么表、拿什么标准验收 |

卡片之间互相链接：一张体验卡会指向能做出它的机制，一张世界观卡会指向适合搭配的机制。

## 怎么用

### 在网页上读

打开上面的地址。顶栏选一个库，左边选分组，中间选卡片，右边就是全文。顶部的搜索框可以搜卡片和书的正文。

### 接到 AI 工具里

知识库提供 MCP 服务，接上以后 Claude 这类 AI 工具可以搜卡片、读全文、顺着卡片之间的链接往下查，也能读书的章节。全部只读。

装在自己电脑上的做法（需要 Node.js 20 或更高版本）：

```sh
git clone https://github.com/mmlong818/game-mechanism-library
cd game-mechanism-library/mcp
npm ci
npm run build
```

然后把它加进你的 AI 工具。以 Claude Code 为例（把路径换成你自己的）：

```sh
claude mcp add game-design-library -- node /你的路径/game-mechanism-library/mcp/dist/stdio.js --site-url https://mmlong818.github.io/game-mechanism-library/
```

其他工具的配置写法、数据来源的几种指定方式，见 [mcp/README.md](mcp/README.md)。接好以后问 AI 一句“猫叔的游戏知识库里有哪些内容”，它答得出来就说明接通了。

## 自己部署一份

网站是纯静态的，MCP 是一个只读的 Node 服务，两者读同一份数据。

- **网站**：`npm ci && npm run build`，把得到的 `dist/` 整个放到任何能放静态文件的地方，域名根目录或子路径都行。
- **MCP 服务**：在 `mcp/` 里 `npm ci && npm run build`，按 `mcp/.env.example` 配好环境变量后运行；对外提供服务时放在反向代理后面。
- **点亮“接入 AI”页**：部署好 MCP 后，把它的网址填进网站根目录的 `site-config.json`。

完整步骤、Nginx 和 systemd 的配置示例、以后怎么更新内容，见 [docs/部署说明.md](docs/部署说明.md) 和 [docs/examples/](docs/examples/)。

## 授权

- **内容**（卡片文字、《RPG设计七卷书》、封面图）：[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.zh-hans)，作者猫叔。可以阅读、原样转载并注明作者；不得商用，不得改编。
- **代码**（网站和 MCP 服务）：PolyForm Noncommercial License 1.0.0，见 [LICENSE](LICENSE)。不得商用。

想商用或改编，请在本仓库提 issue 联系作者。

## 仓库里的东西

| 路径 | 是什么 |
|---|---|
| `src/`、`public/`、`index.html` | 网站的页面代码和静态资源 |
| `public/data/` | 内容数据。网站和 MCP 都只读这里 |
| `public/site-config.json` | 站点配置，部署后可以直接改，不用重新构建 |
| `mcp/` | MCP 服务 |
| `docs/部署说明.md` | 部署网站和 MCP 的完整步骤 |
| `docs/维护说明.md` | 页面结构、地址规则、怎样更新内容，给改代码的人看 |
