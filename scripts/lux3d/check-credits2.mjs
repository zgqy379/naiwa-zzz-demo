// 查 Aholo/Lux3D 控制台：积分入口、每日签到、API Key 页面、定价页（找免费积分来源）。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText || "").replace(/\\n{3,}/g, "\\n\\n");
  const btns = [...document.querySelectorAll("button,a,[role='button'],li,div")]
    .filter(b => b.offsetParent !== null && b.children.length <= 2)
    .map(b => (b.innerText || "").replace(/\\s+/g, " ").trim())
    .filter(s => s && s.length < 24 && /积分|领取|奖励|签到|每日|魔粒|额度|充值|购买|API ?Key|定价|套餐|免费/.test(s));
  const nums = [...new Set((t.match(/[\\d,]+\\s*(积分|魔粒值|元|点)/g) || []))];
  return {
    url: location.href.slice(0, 150),
    title: (document.title || "").slice(0, 80),
    nums,
    btns: [...new Set(btns)].slice(0, 30),
    text: t.slice(0, 1800),
  };
})()`;

async function main() {
  const task = await taskSpace("naiwa-credits2");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  for (const [tag, url] of [
    ["lux3d-home", "https://lux3d.aholo3d.cn/"],
    ["lux3d-pricing", "https://lux3d.aholo3d.cn/pricing"],
    ["apikey", "https://lux3d.aholo3d.cn/apikey"],
    ["apikey2", "https://lux3d.aholo3d.cn/console/apikey"],
    ["aholo-home", "https://www.aholo3d.cn/"],
  ]) {
    note("");
    note("########## " + tag + "  " + url + " ##########");
    try { await p.goto(url, { waitUntil: "commit", timeout: 45000 }); } catch { note(tag + " goto 超时"); }
    try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
    await new Promise((r) => setTimeout(r, 9000));
    const d = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 90) }));
    note("  url = " + (d.url || d.err));
    note("  数字/积分 = " + JSON.stringify(d.nums || []));
    note("  相关入口 = " + (d.btns || []).join(" | "));
    try { await p.screenshot({ path: SHOTS + "/cr2-" + tag + ".png" }); } catch { /* noop */ }
  }
  await fs.writeFile(SHOTS + "/credits2.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
