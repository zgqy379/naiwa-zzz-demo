// 查 Lux3D 控制台（3d.aholo.cn）：积分余额 + 每日领取/签到入口是否存在。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{3,}/g, "\\n\\n");
  const els = [...document.querySelectorAll("button,a,[role='button'],li,div,span,em,p")]
    .filter(e => e.offsetParent !== null && e.children.length === 0)
    .map(e => (e.innerText || "").replace(/\\s+/g, " ").trim())
    .filter(s => s && s.length < 30 && /积分|领取|奖励|签到|每日|魔粒|额度|充值|套餐|会员|福利|任务|免费/.test(s));
  return {
    url: location.href.slice(0, 120), title: (document.title||"").slice(0,60),
    balance: (t.match(/[\\d,]+\\s*积分/) || [])[0] || null,
    hits: [...new Set(els)].slice(0, 40),
    text: t.slice(0, 1200),
  };
})()`;

async function main() {
  const task = await taskSpace("naiwa-credits3");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  for (const [tag, url] of [
    ["console", "https://3d.aholo.cn/"],
    ["workspace", "https://3d.aholo.cn/workspace/text-to-3d"],
    ["ms-mine", "https://www.modelscope.cn/my/overview"],
  ]) {
    note("");
    note("########## " + tag + "  " + url + " ##########");
    try { await p.goto(url, { waitUntil: "commit", timeout: 45000 }); } catch { note(tag + " goto 超时"); }
    try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 10000));
    const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 90) }));
    note("  url = " + (d.url || d.err));
    note("  余额 = " + (d.balance || "(未解析)"));
    note("  命中 = " + (d.hits || []).join(" | "));
    note("  文本 = " + String(d.text || "").replace(/\n/g, " / ").slice(0, 500));
    try { await p.screenshot({ path: SHOTS + "/cr3-" + tag + ".png" }); } catch { /* noop */ }
  }
  await fs.writeFile(SHOTS + "/credits3.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
