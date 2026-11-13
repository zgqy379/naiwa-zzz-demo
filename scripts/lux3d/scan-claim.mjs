// 找「每日领取 / 签到 / 魔粒值」入口：Aholo 控制台（积分徽章）+ 魔搭社区（我的/首页）。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{2,}/g, "\\n");
  const els = [...document.querySelectorAll("button,a,[role='button'],li,div,span,em,p,i")]
    .filter(e => e.offsetParent !== null && e.children.length === 0)
    .map(e => (e.innerText || e.getAttribute("aria-label") || e.title || "").replace(/\\s+/g, " ").trim())
    .filter(s => s && s.length < 28 && /领取|签到|魔粒|积分|额度|奖励|福利|任务|签|领/.test(s));
  const nums = [...new Set((t.match(/[\\d,]+\\s*(积分|魔粒值)/g) || []))];
  return { url: location.href.slice(0,110), title: (document.title||"").slice(0,60), nums, hits: [...new Set(els)].slice(0,30), text: t.slice(0,900) };
})()`;

async function main() {
  const task = await taskSpace("naiwa-aholo-login");
  const pages = await task.pages();
  let p = null;
  for (const q of pages) {
    const u = await q.evaluate("location.href").catch(() => "");
    if (u.includes("aholo.cn")) { p = q; break; }
  }
  if (!p) p = await task.newPage();

  const targets = [
    ["aholo-home", "https://3d.aholo.cn/"],
    ["aholo-user", "https://3d.aholo.cn/user"],
    ["aholo-developer", "https://3d.aholo.cn/developer"],
    ["ms-my", "https://www.modelscope.cn/my/overview"],
    ["ms-community", "https://www.modelscope.cn/community"],
  ];

  for (const [tag, url] of targets) {
    note("");
    note("########## " + tag + "  " + url + " ##########");
    try { await p.goto(url, { waitUntil: "commit", timeout: 45000 }); } catch { note(tag + " goto 超时"); }
    try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 8000));
    const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 90) }));
    note("  url = " + (d.url || d.err));
    note("  余额类 = " + JSON.stringify(d.nums || []));
    note("  命中入口 = " + (d.hits || []).join(" | "));
    try { await p.screenshot({ path: SHOTS + "/claim-" + tag + ".png" }); } catch { /* noop */ }
  }
  await fs.writeFile(SHOTS + "/claim-scan.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
