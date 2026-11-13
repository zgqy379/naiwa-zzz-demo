// 点「开始生成」进工作台，找免费额度/领取入口；并试探常见工作台路径。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{2,}/g, "\\n");
  const els = [...document.querySelectorAll("button,a,[role='button'],li,div,span,em,p,i,label")]
    .filter(e => e.offsetParent !== null && e.children.length === 0)
    .map(e => (e.innerText || e.getAttribute("aria-label") || e.title || "").replace(/\\s+/g, " ").trim())
    .filter(s => s && s.length < 40 && /免费|额度|领取|签到|任务|奖励|每日|试用|积分|魔粒|剩余/.test(s));
  const nums = [...new Set((t.match(/[\\d,]+\\s*(积分|魔粒值|次|张)/g) || []))];
  return { url: location.href.slice(0,140), nums, hits: [...new Set(els)].slice(0,30), text: t.slice(0,1400) };
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

  try { await p.goto("https://3d.aholo.cn/", { waitUntil: "commit", timeout: 45000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 6000));

  const clicked = await p.evaluate(`(() => {
    const el = [...document.querySelectorAll("button,a,span,div")].find(e => (e.innerText||"").trim() === "开始生成");
    if (!el) return "not-found";
    (el.closest("button,a") || el).click();
    return "clicked";
  })()`).catch(() => "?");
  note("点「开始生成」= " + clicked);
  await new Promise((r) => setTimeout(r, 10000));
  const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0,90) }));
  note("url = " + (d.url || d.err));
  note("额度类 = " + JSON.stringify(d.nums || []));
  note("命中 = " + (d.hits || []).join(" | "));
  note("文本 = " + String(d.text || "").replace(/\n/g, " / ").slice(0, 900));
  try { await p.screenshot({ path: SHOTS + "/aholo-workspace2.png" }); } catch { /* noop */ }
  await fs.writeFile(SHOTS + "/workspace2.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
