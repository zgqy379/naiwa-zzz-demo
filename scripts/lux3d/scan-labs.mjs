// 查 labs.aholo.cn 的「使用情况 / 定价 / 数据分析」：积分余额、每日额度、免费试用、增购入口。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{2,}/g, "\\n");
  const els = [...document.querySelectorAll("button,a,[role='button'],li,div,span,em,p,i,label,td,th")]
    .filter(e => e.offsetParent !== null && e.children.length === 0)
    .map(e => (e.innerText || e.getAttribute("aria-label") || e.title || "").replace(/\\s+/g, " ").trim())
    .filter(s => s && s.length < 44 && /免费|额度|领取|签到|任务|奖励|每日|试用|积分|魔粒|充值|增购|套餐|余额|赠送/.test(s));
  const nums = [...new Set((t.match(/[\\d,]+\\s*(积分|魔粒值|次|张|元|天)/g) || []))];
  return { url: location.href.slice(0,140), nums, hits: [...new Set(els)].slice(0,40), text: t.slice(0,1600) };
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

  for (const [tag, url] of [
    ["usage", "https://labs.aholo.cn/usage?from=lux3d"],
    ["pricing", "https://labs.aholo.cn/pricing?from=lux3d"],
    ["analysis", "https://labs.aholo.cn/analysis?from=lux3d"],
  ]) {
    try { await p.goto(url, { waitUntil: "commit", timeout: 45000 }); } catch { note(tag + " goto 超时"); }
    try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 8000));
    const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0,90) }));
    note("");
    note("########## " + tag + "  " + url + " ##########");
    note("  url = " + (d.url || d.err));
    note("  额度类 = " + JSON.stringify(d.nums || []));
    note("  命中 = " + (d.hits || []).join(" | "));
    note("  文本 = " + String(d.text || "").replace(/\n/g, " / ").slice(0, 800));
    try { await p.screenshot({ path: SHOTS + "/labs-" + tag + ".png" }); } catch { /* noop */ }
  }
  await fs.writeFile(SHOTS + "/labs-scan.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
