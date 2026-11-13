// 查 Lux3D 控制台：当前积分余额 + 是否有「每日登录奖励 / 领取」入口。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{3,}/g, "\\n\\n");
  const btns = [...document.querySelectorAll("button,a,[role='button']")]
    .filter(b => b.offsetParent !== null)
    .map(b => (b.innerText || b.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim())
    .filter(Boolean);
  const m = t.match(/([\\d,]+)\\s*积分/);
  return {
    url: location.href.slice(0, 140),
    title: (document.title || "").slice(0, 80),
    balance: m ? m[0] : null,
    balanceCtx: m ? t.slice(Math.max(0, m.index - 120), m.index + 160) : null,
    bonus: [...new Set(btns.filter(b => /积分|领取|奖励|签到|魔粒|额度|充值|购买|Pro|会员/i.test(b)))].slice(0, 25),
    text: t.slice(0, 2200),
  };
})()`;

async function main() {
  const task = await taskSpace("naiwa-credits");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  for (const [tag, url] of [
    ["lux3d-console", "https://lux3d.aholo3d.cn/"],
    ["lux3d-workspace", "https://lux3d.aholo3d.cn/workspace/text-to-3d"],
    ["ms-profile", "https://www.modelscope.cn/my"],
  ]) {
    note("");
    note("########## " + tag + "  " + url + " ##########");
    try { await p.goto(url, { waitUntil: "commit", timeout: 60000 }); } catch { note(tag + " goto 超时"); }
    try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 11000));
    const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 90) }));
    note("  url = " + (d.url || d.err));
    note("  余额 = " + (d.balance || "(未解析)"));
    if (d.balanceCtx) note("  余额上下文: " + d.balanceCtx.replace(/\n/g, " / "));
    note("  相关按钮: " + (d.bonus || []).join(" | "));
    try { await p.screenshot({ path: SHOTS + "/credit-" + tag + ".png" }); } catch { /* noop */ }
  }
  await fs.writeFile(SHOTS + "/credits.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
