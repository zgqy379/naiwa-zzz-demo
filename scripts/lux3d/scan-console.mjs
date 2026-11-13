// 点「控制台」查账单/额度页；再点「定价」看积分增购入口与是否有每日领取。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{2,}/g, "\\n");
  const els = [...document.querySelectorAll("button,a,[role='button'],li,div,span,em,p,i,label,td")]
    .filter(e => e.offsetParent !== null && e.children.length === 0)
    .map(e => (e.innerText || e.getAttribute("aria-label") || e.title || "").replace(/\\s+/g, " ").trim())
    .filter(s => s && s.length < 44 && /免费|额度|领取|签到|任务|奖励|每日|试用|积分|魔粒|充值|增购|套餐|账单/.test(s));
  const nums = [...new Set((t.match(/[\\d,]+\\s*(积分|魔粒值|次|张|元)/g) || []))];
  return { url: location.href.slice(0,140), nums, hits: [...new Set(els)].slice(0,40), text: t.slice(0,1500) };
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

  for (const [tag, label] of [["console", "控制台"], ["pricing", "定价"], ["developer", "开发者"]]) {
    const clicked = await p.evaluate(`(() => {
      const el = [...document.querySelectorAll("button,a,span,div,li")].find(e => (e.innerText||"").trim() === "${label}");
      if (!el) return "not-found";
      (el.closest("a,button") || el).click();
      return "clicked";
    })()`).catch(() => "?");
    note("");
    note("########## 点「" + label + "」= " + clicked + " ##########");
    await new Promise((r) => setTimeout(r, 9000));
    const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0,90) }));
    note("  url = " + (d.url || d.err));
    note("  额度类 = " + JSON.stringify(d.nums || []));
    note("  命中 = " + (d.hits || []).join(" | "));
    note("  文本 = " + String(d.text || "").replace(/\n/g, " / ").slice(0, 900));
    try { await p.screenshot({ path: SHOTS + "/aholo-" + tag + ".png" }); } catch { /* noop */ }
  }
  await fs.writeFile(SHOTS + "/console-scan.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
