# 游戏设计资料库（网站）

猫叔整理的游戏设计卡片站，纯静态，部署在 GitHub Pages。技术栈是 Vite + React + TypeScript，没有后端。

网站本身不含卡片内容，只读“发布包”。发布包的格式由资料库仓库里的 `content/design-library/CONTRACT.md` 约定（约定版本 1.x）。目前有三个卡片库：机制、世界观、体验。

## 目录

- `public/data/current.json`：当前用哪个发布包，例如 `{"release":"2026-11-12.1"}`。
- `public/data/release/<发布编号>/`：发布包原样复制进来，不要改里面的文件。
- `public/covers/`：首页和分组页头部用的像素封面，512×512 的 jpg。文件名是 `<库>-<分组 slug>.jpg`，另有 `section-new.jpg`、`section-needs.jpg`、`section-articles.jpg`、`section-mcp.jpg`。
- `src/`：页面代码。`data.ts` 读发布包，`router.ts` 是 hash 路由，`home.tsx`、`lists.tsx`、`entry.tsx`、`info.tsx` 是各个页面，`needs.json` 是首页“按设计需求找”的六条。
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
5. 运行 `npm run check:data`。它会核对：每个库 index 里的 id 都能在对应分组的 cards 文件里找到；所有链接都指向存在的条目；首页“按设计需求找”的目标条目都在；每个分组都有封面图。
6. 如果新包里有新的分组，给它补一张封面放到 `public/covers/<库>-<分组 slug>.jpg`（可以用 `python scripts/resize-covers.py <封面源目录>` 批量缩图）。
7. 如果“按设计需求找”的目标条目被合并或删除了，改 `src/needs.json`。
8. `npm run build`，本地预览看一眼，再提交、推送。

发布包的约定大版本变了（1.x 变成 2.0）时，页面会拒绝加载并说明原因，这时需要跟着改 `src/data.ts`。

## 地址

用的是 hash 路由，GitHub Pages 上不需要服务器改写：

| 地址 | 页面 |
|---|---|
| `#/` | 首页 |
| `#/c/<库>` | 库的目录，机制库可加 `?tag=具体机制`、`机制家族`、`设计模式`、`new` |
| `#/c/<库>/<分组>` | 分组页 |
| `#/e/<库>/<id>` | 详情页 |
| `#/new` | 新机制列表 |
| `#/search?q=<词>&c=<库>` | 搜索 |
| `#/mcp` | 接入 AI 说明 |
| `#/articles` | 专题 |

旧版的地址（`#community`、`#favorites`、`m_` 开头的卡片 id 等任何不认识的地址）统一回到首页。条目按旧 id 访问时会先查发布包里的 `redirects.json`，有去向就跳过去。

## 不包含的内容

旧版的 4982 张卡片、归档索引、社区投稿导入脚本已经全部移除。仓库里只有公开的静态内容和前端代码。
