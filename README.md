# 游戏设计资料库（网站）

猫叔整理的游戏设计卡片站，纯静态，部署在 GitHub Pages。技术栈是 Vite + React + TypeScript，没有后端。

网站本身不含卡片内容，只读“发布包”。发布包的格式由资料库仓库里的 `content/design-library/CONTRACT.md` 约定（约定版本 1.x）。目前有三个卡片库：机制、世界观、体验；另有一个“书”库，按章节收整本书的正文。

## 目录

- `public/data/current.json`：当前用哪个发布包，例如 `{"release":"2026-11-13.1"}`。
- `public/data/release/<发布编号>/`：发布包原样复制进来，不要改里面的文件。
- `public/covers/`：封面墙和分组页头部用的像素封面，512×512 的 jpg，每个分组一张，文件名是 `<库>-<分组 slug>.jpg`。
- `src/`：页面代码。`data.ts` 读发布包，`router.ts` 是 hash 路由，`lists.tsx` 是封面墙页、分组页和搜索，`entry.tsx` 是详情页，`book.tsx` 是书的三栏阅读界面，`info.tsx` 是接入 AI 说明。
- `scripts/check-data.mjs`：核对发布包。`scripts/resize-covers.py`：把封面缩到 512×512。`scripts/preview-pages.mjs`：按 GitHub Pages 的子路径预览 `dist`。

## 本地构建

需要 Node.js 22 以上。

```sh
npm ci
npm run check:data
npm run build
```

部署到 GitHub Pages 项目路径时，用 `VITE_BASE_PATH=/game-mechanism-library/` 构建（工作流里已经设好，不设时默认也是这个路径）。本地预览：

```sh
VITE_BASE_PATH=/game-mechanism-library/ npm run preview:pages
# 打开 http://127.0.0.1:4399/game-mechanism-library/
```

推送到 `main` 后由 `.github/workflows/pages.yml` 构建并部署 `dist`。

## 怎样更新发布包

换发布包不用改代码。

1. 在资料库仓库生成新的发布包（见 CONTRACT.md 第 8 节），得到 `release/<新编号>/` 目录。
2. 把这个目录整个复制到本仓库的 `public/data/release/<新编号>/`。
3. 把 `public/data/current.json` 改成 `{"release":"<新编号>"}`。
4. 旧的发布包目录可以删掉，也可以留着以便回退；留着会一起部署，每个约 13 MB。回退时只需把 `current.json` 改回旧编号。
5. 运行 `npm run check:data`。它会核对：每个库 index 里的 id 都能在对应分组的 cards 文件里找到；所有链接都指向存在的条目；卡片库的每个分组都有封面图；书的每章正文是非空的 markdown，章节序号不重复。
6. 如果新包里有新的分组，给它补一张封面放到 `public/covers/<库>-<分组 slug>.jpg`（可以用 `python scripts/resize-covers.py <封面源目录>` 批量缩图）。
7. `npm run build`，本地预览看一眼，再提交、推送。

发布包的约定大版本变了（1.x 变成 2.0）时，页面会拒绝加载并说明原因，这时需要跟着改 `src/data.ts`。

## 地址

用的是 hash 路由，GitHub Pages 上不需要服务器改写：

| 地址 | 页面 |
|---|---|
| `#/` | 首页，也就是机制的主题封面墙（`#/c/mechanism` 会跳到这里） |
| `#/c/world`、`#/c/experience` | 世界观、体验的分组封面墙 |
| `#/c/<库>/<分组>` | 分组页，机制可加 `?tag=具体机制`、`机制家族`、`设计模式` |
| `#/e/<库>/<id>` | 详情页 |
| `#/c/book` | 书。库里只有一本书时跳到这本书的第 1 章；有多本时是书单，`#/c/book/<书>` 跳到那本书的第 1 章 |
| `#/e/book/<id>` | 章节阅读页（三栏） |
| `#/search?q=<词>&c=<库>` | 搜索 |
| `#/mcp` | 接入 AI 说明 |

每个页面只有一条浏览路径：导航进库的封面墙，封面墙进分组页，分组页进详情页。书从导航直接进阅读界面，左栏是全书目录，页尾有上一章、下一章；没有单独的目录页。接入 AI 只从导航进。页脚不放链接。

旧版的地址（`#community`、`#favorites`、`m_` 开头的卡片 id 等任何不认识的地址）统一回到首页。专题文章还没有内容，`#/articles` 暂时也回首页，等有文章了再加回导航和首页。旧的 `#/new` 同样回首页。

界面文案是写给访客的：发布包里的 `new`、`thin` 标签网站一律忽略，所有机制一视同仁，只显示层级标签；页面上不出现发布编号和卡片 id，页脚只写“更新于某年某月某日”（从发布编号里取日期）。条目按旧 id 访问时会先查发布包里的 `redirects.json`，有去向就跳过去。

## 书

书在发布包里是 `kind` 为 `articles` 的库（`collections/book/`）：分组是一本书，条目是一章，`body.text` 是整章的 markdown。书没有封面图，页面上不放图。

阅读界面分三栏：左栏是书名、简介和全书目录（当前章高亮，栏内单独滚动），中栏是正文，右栏是本章的二、三级标题（随滚动标出当前小节）；左右两栏固定在视口内。全站内容区最宽 1560px；书的左栏 280px、右栏 240px，中栏占其余空间。宽度不到 1240 时收起右栏，不到 900 时目录收成正文上方可展开的“目录”按钮。

章节正文用 `marked` 转成 HTML。正文里的 HTML 一律当普通文字显示，链接只保留 http、https 和 mailto，所以书稿里即使混进了标签也不会被执行。正文一行最多 48 个汉字；表格放不下时可以横向滚动；代码块里用制表符画的框图靠 `globals.css` 里几条 `@font-face` 把本机等宽字体的西文缩到半个汉字宽来对齐。

搜索按章节标题、开头一段和书名查，结果里标出所属的书。

## 不包含的内容

旧版的 4982 张卡片、归档索引、社区投稿导入脚本已经全部移除。仓库里只有公开的静态内容和前端代码。
