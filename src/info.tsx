import { useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, siteUrl, useConfig } from "./config";
import { useTitle } from "./ui";

// 一段可以一键复制的代码。剪贴板用不了时不报错，按钮照常回到“复制”。
function Code({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // 没有剪贴板权限（或不是安全来源）时退回老办法；再不行就算了。
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand("copy");
        area.remove();
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setDone(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 1500);
  };
  return (
    <div className="code">
      <pre aria-label={label}>{text}</pre>
      <button type="button" onClick={copy} aria-label={`复制${label}`}>
        <span aria-live="polite">{done ? "已复制" : "复制"}</span>
      </button>
    </div>
  );
}

const PLACEHOLDER_URL = "https://你的域名/mcp";

// 接入 AI：按 MCP 上线后的样子把接法写清楚。真实的网址和下载地址来自站点根目录的 site-config.json；
// 还没填的地方用占位内容，并在下方用一行小字说明以上线后公布的为准。
export function McpPage() {
  useTitle("接入 AI");
  const { mcpUrl, mcpName, localDownloadUrl, repoUrl } = useConfig() ?? DEFAULT_CONFIG;
  const url = mcpUrl || PLACEHOLDER_URL;
  const site = siteUrl();
  const remoteJson = JSON.stringify({ mcpServers: { [mcpName]: { type: "http", url } } }, null, 2);
  // 本地安装：有下载地址就是“下载并解压”，没有就先用从仓库获取的写法顶上。
  const place = localDownloadUrl ? "<解压位置>" : "<仓库位置>";
  const entry = `${place}/mcp/dist/stdio.js`;
  const repo = repoUrl || "<仓库地址>";
  const folder = repoUrl ? (repoUrl.split("/").filter(Boolean).pop() ?? "").replace(/\.git$/, "") : "";
  const install = localDownloadUrl
    ? "cd mcp\nnpm ci\nnpm run build"
    : `git clone ${repo}\ncd ${folder || "<仓库目录>"}/mcp\nnpm ci\nnpm run build`;
  const localJson = JSON.stringify({ mcpServers: { [mcpName]: { command: "node", args: [entry, "--site-url", site] } } }, null, 2);
  return (
    <>
      <header className="phead">
        <div>
          <h1>把知识库接到你的 AI 工具上</h1>
          <p>把这个知识库接到你的 AI 工具（Claude 等）上，聊设计时 AI 可以直接查这里的卡片和《RPG设计七卷书》，并在回答里标明出处。</p>
        </div>
      </header>
      <div className="prose mcp">
        <h2>接法一：填一个网址（不用安装）</h2>
        <h3>第 1 步：复制这个地址</h3>
        <Code text={url} label="地址" />
        {!mcpUrl && <p className="fine">地址以上线后公布的为准。</p>}
        <h3>第 2 步：在 AI 工具里添加</h3>
        <p>用 Claude Code：在终端里运行这一行。</p>
        <Code text={`claude mcp add --transport http ${mcpName} ${url}`} label="命令" />
        <p>用其他工具：把这一段加进它的 MCP 配置文件。</p>
        <Code text={remoteJson} label="配置" />
        <p>有图形界面的工具，在设置的“连接器”或“MCP”里新增一个服务器，类型选 HTTP，填上面的地址。不需要账号和密钥。</p>

        <h2>接法二：装在自己电脑上</h2>
        <h3>第 1 步：准备 Node.js</h3>
        <p>
          装好 <a href="https://nodejs.org/">Node.js</a> 20 或更高版本。在终端里运行 <code>node -v</code> 可以查看版本。
        </p>
        <h3>第 2 步：获取程序并安装</h3>
        {localDownloadUrl ? (
          <p>
            <a href={localDownloadUrl}>下载安装包</a>并解压，在解压出来的位置打开终端，运行：
          </p>
        ) : (
          <p>在终端里运行：</p>
        )}
        <Code text={install} label="命令" />
        <h3>第 3 步：加进 AI 工具</h3>
        <p>
          把下面的 <code>{place}</code> 换成你电脑上的实际路径。
        </p>
        <p>用 Claude Code：</p>
        <Code text={`claude mcp add ${mcpName} -- node "${entry}" --site-url ${site}`} label="命令" />
        <p>用其他工具：把这一段加进它的 MCP 配置文件。</p>
        <Code text={localJson} label="配置" />
        {!localDownloadUrl && <p className="fine">下载地址以上线后公布的为准。</p>}

        <h2>接好以后试一下</h2>
        <p>问 AI 一句“猫叔的游戏知识库里有哪些内容”。它答得出各部分的条数，就说明接通了。</p>

        <h2>AI 能做什么</h2>
        <p>
          按关键词搜卡片，读一张卡片的全文，顺着卡片之间的相关链接往下查，读《RPG设计七卷书》的章节。它查到的内容和你在这个网站上看到的一样，只能读，不能改。
        </p>
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
  const cfg = useConfig();
  const contact = cfg?.contact ?? "";
  const repoUrl = cfg?.repoUrl ?? "";
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
        {contact ? (
          <p>
            请联系作者：
            <Contact value={contact} />
          </p>
        ) : repoUrl ? (
          <p>
            请到 <a href={`${repoUrl}/issues`}>GitHub 仓库</a>提 issue 联系作者。
          </p>
        ) : (
          <p>请联系作者。</p>
        )}

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
