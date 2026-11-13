// 打开 Aholo（3d.aholo.cn）登录页，交给用户登录（登录态落在 ego 浏览器 profile，之后我能查 Lux3D 余额）。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

async function main() {
  const task = await taskSpace("naiwa-aholo-login");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();
  try { await p.goto("https://3d.aholo.cn/", { waitUntil: "commit", timeout: 60000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 6000));
  const txt = await p.evaluate("(() => (document.body.innerText||'').slice(0,300))()").catch(() => "?");
  note("页面: " + String(txt).replace(/\n/g, " / "));
  try { await p.screenshot({ path: SHOTS + "/aholo-login.png" }); } catch { /* noop */ }
  note("已打开 Aholo 控制台（请在浏览器里完成登录），登录后告诉我一声即可。");
  await fs.writeFile(SHOTS + "/aholo-login.json", JSON.stringify({ log }, null, 2), "utf8");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
