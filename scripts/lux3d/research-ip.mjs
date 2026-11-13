// 查「奶蛙 / 奶蛙族谱」真实 IP 形象：抖音 + 小红书 搜索页（真实浏览器 ego）。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText||"").replace(/\\n{3,}/g,"\\n\\n");
  const imgs = [...document.querySelectorAll("img")].map(i => (i.currentSrc||i.src||"").slice(0,160)).filter(u => /^https?:/.test(u)).slice(0, 24);
  const titles = [...document.querySelectorAll("a,div,span,h3,h4")]
    .map(e => (e.innerText||"").replace(/\\s+/g," ").trim())
    .filter(s => s && /奶蛙|奶娃|族谱|表情包/.test(s) && s.length < 60);
  return {
    url: location.href.slice(0,140), title: (document.title||"").slice(0,70),
    text: t.slice(0, 2600),
    imgs: [...new Set(imgs)].slice(0, 20),
    titles: [...new Set(titles)].slice(0, 24),
  };
})()`;

async function main() {
  const task = await taskSpace("naiwa-ip-research");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  const targets = [
    ["douyin", "https://www.douyin.com/search/%E5%A5%B6%E8%9B%99"],
    ["douyin2", "https://www.douyin.com/search/%E5%A5%B6%E8%9B%99%E6%97%8F%E8%B0%B1"],
    ["xhs", "https://www.xiaohongshu.com/search_result?keyword=%E5%A5%B6%E8%9B%99%E6%97%8F%E8%B0%B1"],
    ["xhs2", "https://www.xiaohongshu.com/search_result?keyword=%E5%A5%B6%E8%9B%99"],
  ];

  for (const [tag, url] of targets) {
    note("");
    note("########## " + tag + "  " + url + " ##########");
    try { await p.goto(url, { waitUntil: "commit", timeout: 45000 }); } catch { note(tag + " goto 超时"); }
    try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 12000));
    const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 90) }));
    note("  url = " + (d.url || d.err));
    note("  title = " + d.title);
    note("  --- 文本 ---");
    note("  " + String(d.text || "").split("\n").slice(0, 22).join(" / "));
    if (d.titles?.length) { note("  --- 命中「奶蛙/族谱」的标题 ---"); d.titles.slice(0, 14).forEach((x) => note("    " + x)); }
    if (d.imgs?.length) { note("  --- 图片 URL（前 8）---"); d.imgs.slice(0, 8).forEach((x) => note("    " + x)); }
    try { await p.screenshot({ path: SHOTS + "/ip-" + tag + ".png" }); note("  shot -> ip-" + tag + ".png"); } catch { /* noop */ }
  }

  await fs.writeFile(SHOTS + "/ip-research.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
