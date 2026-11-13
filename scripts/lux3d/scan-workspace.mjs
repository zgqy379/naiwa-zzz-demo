// 点开 Aholo 工作台，找「今日免费额度 / 领取 / 签到 / 任务」等字样。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{2,}/g, "\\n");
  const els = [...document.querySelectorAll("button,a,[role='button'],li,div,span,em,p,i,label")]
    .filter(e => e.offsetParent !== null && e.children.length === 0)
    .map(e => (e.innerText || e.getAttribute("aria-label") || e.title || "").replace(/\\s+/g, " ").trim())
    .filter(s => s && s.length < 40 && /免费|额度|领取|签到|任务|奖励|每日|试用|积分|魔粒/.test(s));
  const nums = [...new Set((t.match(/[\\d,]+\\s*(积分|魔粒值|次)/g) || []))];
  const navs = [...document.querySelectorAll("a,li,button,span,div")]
    .filter(e => e.offsetParent !== null && e.children.length === 0 && e.innerText)
    .map(e => e.innerText.replace(/\\s+/g," ").trim())
    .filter(s => s && s.length < 16 && /工作台|功能|资产|场景|资源|开发者|定价|控制台|控制台|我的/.test(s));
  return { url: location.href.slice(0,140), title:(document.title||"").slice(0,60), nums, hits: [...new Set(els)].slice(0,30), navs: [...new Set(navs)].slice(0,20), text: t.slice(0,1200) };
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

  // ① 首页：列出导航，找「工作台」的链接
  try { await p.goto("https://3d.aholo.cn/", { waitUntil: "commit", timeout: 45000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 7000));
  const d0 = await p.evaluate(DUMP).catch(() => ({}));
  note("首页导航: " + (d0.navs || []).join(" | "));

  // ② 点「工作台」
  const clicked = await p.evaluate(`(() => {
    const el = [...document.querySelectorAll("a,button,span,div,li")].find(e => (e.innerText||"").trim() === "工作台");
    if (!el) return "not-found";
    (el.closest("a") || el).click();
    return "clicked";
  })()`).catch(() => "?");
  note("点工作台 = " + clicked);
  await new Promise((r) => setTimeout(r, 9000));
  const d1 = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0,90) }));
  note("工作台 url = " + (d1.url || d1.err));
  note("  额度类 = " + JSON.stringify(d1.nums || []));
  note("  命中 = " + (d1.hits || []).join(" | "));
  note("  文本 = " + String(d1.text || "").replace(/\n/g, " / ").slice(0, 700));
  try { await p.screenshot({ path: SHOTS + "/aholo-workspace.png" }); } catch { /* noop */ }

  await fs.writeFile(SHOTS + "/workspace-scan.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
