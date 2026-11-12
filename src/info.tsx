import { DEFAULT_CONFIG, siteUrl, useConfig } from "./config";
import { useTitle } from "./ui";

function Sample({ caption, code }: { caption: string; code: string }) {
  return (
    <figure>
      <figcaption>{caption}</figcaption>
      <pre>{code}</pre>
    </figure>
  );
}

// 接入 AI。具体的接法由站点根目录的 site-config.json 决定：
// 填了公开网址就给出“填一个网址”的步骤，填了下载地址就给出本地安装的步骤，都没填就写“即将开放”。
export function McpPage() {
  useTitle("接入 AI");
  const cfg = useConfig() ?? DEFAULT_CONFIG;
  const { mcpUrl, mcpName, localDownloadUrl } = cfg;
  const open = Boolean(mcpUrl || localDownloadUrl);
  const remoteJson = JSON.stringify({ mcpServers: { [mcpName]: { type: "http", url: mcpUrl } } }, null, 2);
  const site = siteUrl();
  const localJson = JSON.stringify(
    { mcpServers: { [mcpName]: { command: "node", args: ["<解压位置>/mcp/dist/stdio.js", "--site-url", site] } } },
    null,
    2,
  );
  return (
    <>
      <header className="phead">
        <div>
          <h1>在你的 AI 工具里直接查这些卡片</h1>
          <p>把资料库接到 Claude 这类 AI 工具上，聊设计时 AI 就能自己来查卡片。{open ? "" : "即将开放。"}</p>
        </div>
      </header>
      <div className="prose">
        <h2>接上以后你能做什么</h2>
        <ul>
          <li>聊一个设计问题时，让 AI 先在三个库里找相关的卡片，再根据卡片内容回答，而不是只凭印象。</li>
          <li>让 AI 把某张卡片的全文读出来讲给你听：设计者能调什么、哪些游戏这样做、容易做坏在哪里。</li>
          <li>让 AI 顺着卡片之间的关系往下查：想做出某种体验可以用哪些机制，某条机制又和哪些世界观搭配。</li>
          <li>AI 在回答里会写明引用的是哪一张卡片，你可以回到这个网站核对原文。</li>
        </ul>

        <h2>AI 能怎么查</h2>
        <p>接上以后，AI 查到的内容和你在这个网站上看到的完全一样。它只能读，不能改。它有这几种查法：</p>
        <ul>
          <li>看有哪几个库，每个库分成哪些主题、各有多少张。</li>
          <li>按关键词搜卡片，可以限定在某个库、某个主题里搜。</li>
          <li>取一张卡片的全文。</li>
          <li>列出某个主题下的全部卡片。</li>
          <li>查一张卡片提到了哪些卡片，又被哪些卡片提到。</li>
          <li>查资料库最近一次更新的时间和各库的卡片数量。</li>
        </ul>

        <h2>怎么接</h2>
        <p>{open ? "有两种接法：" : "会有两种接法，都即将开放："}</p>
        <div className="ways">
          <section className="way">
            <h3>填一个网址</h3>
            <p>不用安装，在 AI 工具的设置里填一个网址就能用，内容会跟着网站一起更新。适合想先试一下的人。</p>
            {mcpUrl ? (
              <>
                <Sample caption="网址" code={mcpUrl} />
                <Sample caption="Claude Code：在终端里运行这一行" code={`claude mcp add --transport http ${mcpName} ${mcpUrl}`} />
                <Sample caption="其他工具：把这一段加进它的 MCP 配置文件" code={remoteJson} />
                <p>
                  有图形界面的工具（Claude 的桌面版和网页版、Cursor 等）一般在设置里的“连接器”或“MCP”一栏新增一个服务器，类型选
                  HTTP，地址填上面的网址。不需要账号和密钥。
                </p>
              </>
            ) : (
              <p>即将开放。</p>
            )}
          </section>
          <section className="way">
            <h3>装在自己电脑上</h3>
            <p>程序装在本机，由你自己的 AI 工具启动；卡片从这个网站读取，读过的会留在本机。适合经常用的人。</p>
            {localDownloadUrl ? (
              <>
                <ol>
                  <li>
                    装好 <a href="https://nodejs.org/">Node.js</a> 20 或更高版本。
                  </li>
                  <li>
                    <a href={localDownloadUrl}>下载安装包</a>并解压，记下解压的位置。
                  </li>
                  <li>
                    在解压出来的 <code>mcp</code> 目录里打开终端，依次运行 <code>npm ci</code> 和 <code>npm run build</code>。
                  </li>
                  <li>把它加进你的 AI 工具（把下面的“解压位置”换成你实际的路径）。</li>
                </ol>
                <Sample
                  caption="Claude Code：在终端里运行这一行"
                  code={`claude mcp add ${mcpName} -- node "<解压位置>/mcp/dist/stdio.js" --site-url ${site}`}
                />
                <Sample caption="其他工具：把这一段加进它的 MCP 配置文件" code={localJson} />
              </>
            ) : (
              <p>即将开放。</p>
            )}
          </section>
        </div>
        {open ? (
          <p>接好以后，可以先问 AI 一句“游戏设计资料库里有哪几个库”，它答得出各库的卡片数量，就说明接通了。</p>
        ) : (
          <p>开放以后，具体的接法会写在这一页。</p>
        )}

        <h2>{open ? "不接也可以这样用" : "现在可以先这样用"}</h2>
        <p>直接在这个网站上查：从导航进三个库，或者用顶部的搜索框。看到有用的卡片，把卡片内容贴给 AI，也可以让它照着卡片和你讨论。</p>
      </div>
    </>
  );
}

const CC_URL = "https://creativecommons.org/licenses/by-nc-nd/4.0/deed.zh-hans";
const CODE_URL = "https://polyformproject.org/licenses/noncommercial/1.0.0";

// 联系方式可以是邮箱、网址或一句话；能做成链接的做成链接。
function Contact({ value }: { value: string }) {
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return <a href={value}>{value.replace(/^mailto:/i, "")}</a>;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return <a href={`mailto:${value}`}>{value}</a>;
  return <>{value}</>;
}

export function LicensePage() {
  useTitle("版权");
  const contact = useConfig()?.contact ?? "";
  return (
    <>
      <header className="phead">
        <div>
          <h1>版权</h1>
          <p>这个网站上的内容可以读、可以原样分享，但不能拿去商用，也不能改编。</p>
        </div>
      </header>
      <div className="prose">
        <h2>作者</h2>
        <p>这里的全部内容，包括机制、世界观、体验三个库的卡片文字，《RPG设计七卷书》，以及各分组的封面图，作者都是猫叔。</p>

        <h2>你可以做什么</h2>
        <ul>
          <li>在这个网站上阅读，或者通过 AI 工具查阅。</li>
          <li>原样分享：转发链接，或者把卡片、章节原文转载到别处。转载时请写明作者“猫叔”，并附上这个网站的地址。</li>
          <li>在自己的设计工作里参考这些内容。</li>
        </ul>

        <h2>你不可以做什么</h2>
        <ul>
          <li>商用：不能把这些内容拿去卖，也不能放进收费的产品、课程或服务里。</li>
          <li>改编后再发布：不能删改、改写、翻译、拆开重新编排之后再发布出去。</li>
          <li>去掉署名，或者让人以为内容是别人写的。</li>
        </ul>

        <h2>想商用或改编</h2>
        <p>
          请联系作者{contact ? "：" : "。"}
          {contact && <Contact value={contact} />}
        </p>

        <h2>协议</h2>
        <p>
          内容采用“知识共享 署名—非商业性使用—禁止演绎 4.0 国际”许可协议（CC BY-NC-ND 4.0）。以上是通俗的说法，以协议原文为准：
          <a href={CC_URL}>{CC_URL}</a>
        </p>
        <p>
          这个网站的程序和配套的 AI 接入程序是另一回事，采用 PolyForm Noncommercial License 1.0.0，版权人猫叔，同样不得商用：
          <a href={CODE_URL}>{CODE_URL}</a>
        </p>
      </div>
    </>
  );
}
