import { cover, type Core } from "./data";
import { SERIES } from "./home";
import { href } from "./router";
import { Crumbs, PageHead, useTitle } from "./ui";

const TOOLS: [string, string, string][] = [
  ["list_collections", "无", "列出有哪些库、各多少条、各自的分组"],
  ["search", "query", "按关键词搜索；可选按库、分组、标签缩小范围，可翻页。返回名称和一句话定义"],
  ["get_entry", "id", "按 id 取整张卡片（含全部正文）；旧 id 自动跳到新的"],
  ["list_group", "collection、group", "列出某个分组的全部条目"],
  ["get_links", "id", "取某张卡片指向的、以及指向它的条目，可以跨库"],
  ["get_library_info", "无", "发布编号、约定版本、各库条数"],
];

const LOCAL_EXAMPLE = `{
  "mcpServers": {
    "game-design-library": {
      "command": "npx",
      "args": ["-y", "game-design-library-mcp"]
    }
  }
}`;

export function McpPage({ core }: { core: Core }) {
  useTitle("接入 AI");
  return (
    <>
      <Crumbs items={[{ label: "接入 AI" }]} />
      <PageHead
        title="让你的 AI 工具也能查这些卡片"
        img={cover("section-mcp")}
        lead="资料库会提供 MCP 接口。两种接法都还在制作中，这一页先说明它是什么、接好以后能做什么。"
      />
      <div className="prose">
        <p className="notice">
          <b>制作中。</b>本地安装版和公开网址版都还没有上线，现在还接不了。下面的配置是示意，包名和网址以上线时的说明为准。
        </p>

        <h2>MCP 是什么</h2>
        <p>
          MCP（Model Context Protocol）是 AI 工具连接外部资料的一种通用接法。Claude 等支持 MCP 的工具接上一个 MCP
          服务以后，就能在对话中调用这个服务提供的工具，把查到的内容用在回答里。
        </p>
        <p>
          资料库的 MCP 服务读的是和这个网站同一份发布包（当前是 {core.release}，共 {core.total}{" "}
          张卡片），所以 AI 查到的内容和你在网站上看到的一致。
        </p>

        <h2>接好以后能做什么</h2>
        <ul>
          <li>聊设计问题时，让 AI 先在三个库里搜相关卡片，再根据卡片内容回答。</li>
          <li>让 AI 取某张卡片的全文，比如它的设计旋钮、真实案例和常见失误。</li>
          <li>让 AI 顺着卡片之间的链接查下去：一种体验用到哪些机制，一条机制被哪些世界观卡引用。</li>
          <li>回答里引用卡片名称和定义，你可以回到网站核对原文。</li>
        </ul>

        <h2>六个工具</h2>
        <p>全部只读，不会改动资料库。工具名称和必填参数已经定下，以后只增不改。</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>工具</th>
                <th>必填参数</th>
                <th>作用</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, args, what]) => (
                <tr key={name}>
                  <td>
                    <code>{name}</code>
                  </td>
                  <td>{args === "无" ? args : <code>{args}</code>}</td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>两种接法</h2>
        <div className="ways">
          <section className="way">
            <h3>
              本地安装<span className="tag">制作中</span>
            </h3>
            <p>卡片数据放在自己电脑上，不联网也能查。上线后的接法是在 AI 工具的 MCP 配置里加一段，大致如下：</p>
            <figure>
              <figcaption>示意，包名尚未发布，现在运行不了</figcaption>
              <pre>{LOCAL_EXAMPLE}</pre>
            </figure>
            <p>适合经常用、或者想固定在某个发布版上的情况。</p>
          </section>
          <section className="way">
            <h3>
              公开网址<span className="tag">制作中</span>
            </h3>
            <p>不用安装，在 AI 工具里填一个网址，内容随发布版更新。</p>
            <figure>
              <figcaption>示意，网址尚未开通</figcaption>
              <pre>https://（站点域名）/mcp</pre>
            </figure>
            <p>适合只想试一下，或者在网页版工具里用的情况。</p>
          </section>
        </div>

        <h2>现在可以怎么用</h2>
        <p>
          接口上线之前，可以直接用网站：<a href={href.search("")}>搜索三个库</a>，或者从
          <a href={href.collection("mechanism")}>机制</a>、<a href={href.collection("world")}>世界观</a>、
          <a href={href.collection("experience")}>体验</a>的目录进去。每张卡片页底部有它的条目 id，接口上线后可以用这个 id
          让 AI 取卡。
        </p>
      </div>
    </>
  );
}

export function ArticlesPage() {
  useTitle("专题");
  return (
    <>
      <Crumbs items={[{ label: "专题" }]} />
      <PageHead
        title="专题文章"
        img={cover("section-articles")}
        lead="筹备中，还没有发布的文章。"
      />
      <div className="prose">
        <p>
          卡片库收的是机制、世界观、体验三类，一张卡讲一件事。有些内容不适合拆成卡片，比如怎样搭一个核心循环、怎样验证一个设计是否成立，这些会写成成系列的专题文章，文章里引用到的卡片可以直接点过去。
        </p>
        <h2>计划中的七个系列</h2>
        <ul className="series">
          {SERIES.map((s) => (
            <li key={s}>
              <b>{s}</b>
              <span className="tag">筹备中</span>
            </li>
          ))}
        </ul>
        <p>
          文章发布后会出现在这一页。在那之前，可以先看<a href={href.collection("mechanism")}>机制库</a>和
          <a href={href.newList}>新机制</a>。
        </p>
      </div>
    </>
  );
}
