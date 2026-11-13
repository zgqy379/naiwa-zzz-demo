// 打开用户给的飞书文档并提取正文（真实浏览器 ego）。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const URL = process.argv[2] || "https://zhangqi.feishu.cn/docx/LQXOdudK5o4Mq9xsx83c5Doznof";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{3,}/g, "\\n\\n");
  const arts = [...document.querySelectorAll("main, article, [data-block-id], .docx-render-block, .doc-content, #content, .note-content")]
    .map(e => (e.innerText || "").trim()).filter(Boolean);
  return {
    url: location.href.slice(0, 160),
    title: (document.title || "").slice(0, 120),
    len: t.length,
    body: t.slice(0, 9000),
    longest: arts.sort((a,b)=>b.length-a.length)[0]?.slice(0, 9000) || "",
    frames: [...document.querySelectorAll("iframe")].map(f=>f.src).slice(0,6),
  };
})()`;

async function main() {
  const task = await taskSpace("naiwa-doc-read");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  try { await p.goto(URL, { waitUntil: "commit", timeout: 60000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 12000));

  const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 100) }));
  note("=== url = " + (d.url || d.err));
  note("=== title = " + d.title);
  note("=== 正文长度 = " + d.len);
  note("=== frames = " + JSON.stringify(d.frames));
  note("--- body ---");
  note(d.body || "");
  if (d.longest && d.longest.length > (d.body || "").length) {
    note("--- longest block ---");
    note(d.longest);
  }
  try { await p.screenshot({ path: SHOTS + "/feishu-doc.png" }); note("shot -> feishu-doc.png"); } catch { /* noop */ }

  await fs.writeFile(SHOTS + "/feishu-doc.json", JSON.stringify({ d, log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
