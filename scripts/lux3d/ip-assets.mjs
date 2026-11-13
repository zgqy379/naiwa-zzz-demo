// ① 查 Lux3D 控制台余额与「每日领取/签到」入口；② 抓真实奶蛙 IP 的参考图 URL。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{3,}/g, "\\n\\n");
  const els = [...document.querySelectorAll("button,a,[role='button'],li,div,span")]
    .filter(e => e.offsetParent !== null && e.children.length === 0)
    .map(e => (e.innerText || "").replace(/\\s+/g, " ").trim())
    .filter(s => s && s.length < 26 && /积分|领取|奖励|签到|每日|魔粒|额度|充值|套餐|会员|任务/.test(s));
  const imgs = [...document.querySelectorAll("img")].map(i => i.currentSrc || i.src).filter(u => /^https?:/.test(u));
  return {
    url: location.href.slice(0, 120), title: (document.title||"").slice(0, 60),
    balance: (t.match(/[\d,]+\\s*积分/) || [])[0] || null,
    text: t.slice(0, 1500),
    hits: [...new Set(els)].slice(0, 30),
    imgs: [...new Set(imgs)].slice(0, 30),
  };
})()`;

async function main() {
  const task = await taskSpace("naiwa-ip-assets");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  for (const [tag, url] of [
    ["lux3d", "https://lux3d.aholo3d.cn/"],
    ["lux3d-user", "https://lux3d.aholo3d.cn/user"],
    ["naiwa-world", "https://www.naiwa.world/"],
    ["neta", "https://neta.art/"],
  ]) {
    note("");
    note("########## " + tag + "  " + url + " ##########");
    try { await p.goto(url, { waitUntil: "commit", timeout: 45000 }); } catch { note(tag + " goto 超时"); }
    try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 9000));
    const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 90) }));
    note("  url = " + (d.url || d.err));
    note("  余额 = " + (d.balance || "(未解析)"));
    note("  命中 = " + (d.hits || []).join(" | "));
    if (d.imgs?.length) { note("  图片 URL:"); d.imgs.slice(0, 14).forEach((x) => note("    " + x)); }
    try { await p.screenshot({ path: SHOTS + "/ip2-" + tag + ".png" }); } catch { /* noop */ }
  }
  await fs.writeFile(SHOTS + "/ip-assets.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
