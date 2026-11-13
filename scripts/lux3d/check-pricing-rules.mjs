// 抓定价页的「积分消耗规则」表 + 「积分增购」入口与价格。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "");
  const i = t.indexOf("积分消耗规则");
  const tail = i >= 0 ? t.slice(i, i + 2600) : t.slice(-2600);
  const btns = [...document.querySelectorAll("button,a,[role='button'],li,div,span")]
    .filter(b => b.offsetParent !== null && b.children.length === 0)
    .map(b => (b.innerText || "").replace(/\\s+/g, " ").trim())
    .filter(s => s && s.length < 30 && /增购|购买|充值|积分|套餐|升级|立即/.test(s));
  return { tail: tail.replace(/\\n{2,}/g, "\\n"), btns: [...new Set(btns)].slice(0, 40) };
})()`;

async function main() {
  const task = await taskSpace("naiwa-credits2");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();
  try { await p.goto("https://lux3d.aholo3d.cn/pricing", { waitUntil: "commit", timeout: 45000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 10000));
  // 滚到积分消耗规则
  await p.evaluate(`(() => {
    const el = [...document.querySelectorAll("div,h2,h3,span,p")].find(e => (e.innerText||"").trim() === "积分消耗规则");
    if (el) el.scrollIntoView({ block: "start" });
    return true;
  })()`).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 90) }));
  note("=== 积分消耗规则段 ===");
  note(d.tail || d.err);
  note("=== 可点入口 ===");
  note((d.btns || []).join(" | "));
  try { await p.screenshot({ path: SHOTS + "/cr2-pricing-rules.png" }); } catch { /* noop */ }
  await fs.writeFile(SHOTS + "/pricing-rules.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
