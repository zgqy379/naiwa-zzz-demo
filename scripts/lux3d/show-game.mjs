// 打开线上定版 Demo 并交还用户操作（真实浏览器 ego）。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const URL_DIRECT = "https://zgqy379.github.io/naiwa-zzz-demo/";
const URL_STUDIO = "https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo";

async function main() {
  const task = await taskSpace("naiwa-show-game");
  const tabs = await task.tabs();
  note("当前标签页: " + JSON.stringify(tabs.map((t) => ({ label: t.label, url: String(t.url).slice(0, 80), openedBy: t.openedBy }))));

  // ① 直连页
  let direct = null;
  for (const t of tabs) {
    if (String(t.url).includes("github.io/naiwa-zzd-demo") || String(t.url).includes("github.io/naiwa-zzz-demo")) {
      direct = t.label ? task.page(t.label) : await task.adopt(t.page);
    }
  }
  if (!direct) {
    direct = await task.newPage();
    try { await direct.goto(URL_DIRECT, { waitUntil: "commit", timeout: 60000 }); } catch { note("直连 goto 超时"); }
  }
  try { await direct.cdp("Page.bringToFront"); } catch { /* noop */ }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const ok = await direct.evaluate("!!window.__npr").catch(() => false);
    if (ok) { note("直连 · app 就绪（" + (i + 1) * 2 + "s）"); break; }
  }
  note("直连：入口脚本 = " + await direct.evaluate("[...document.querySelectorAll('script[src]')].map(s=>s.src.split('/').pop()).join(',')").catch(() => "?"));
  try { await direct.screenshot({ path: SHOTS + "/show-direct.png" }); } catch { /* noop */ }

  // ② 创空间页（官网提交地址）
  const studio = await task.newPage();
  try { await studio.goto(URL_STUDIO, { waitUntil: "commit", timeout: 60000 }); } catch { note("创空间 goto 超时"); }
  try { await studio.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 9000));
  const src = await studio.evaluate("(() => { const f = document.querySelector('iframe'); return f ? f.src : '(no iframe)'; })()").catch(() => "?");
  note("创空间 iframe = " + String(src).slice(0, 140));
  try { await studio.screenshot({ path: SHOTS + "/show-studio.png" }); } catch { /* noop */ }

  // ③ 把两个页面都交还用户（release 用永久标签 p1/p2…）
  const managed = await task.pages();
  for (const p of managed) {
    try { await task.release(p.label); note("已交还：" + p.label); } catch (e) { note("release " + p.label + " 失败: " + String(e).slice(0, 80)); }
  }
  await fs.writeFile(SHOTS + "/show-game.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
