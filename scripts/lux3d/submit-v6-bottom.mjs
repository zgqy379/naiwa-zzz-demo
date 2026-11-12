// 滚到表单底部并截图（提交前的最后核对）
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

async function main() {
  const task = await taskSpace("naiwa-submit-v6");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();
  try { await p.goto("https://www.aholo3d.cn/hackathon/my", { waitUntil: "commit", timeout: 60000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 9000));
  await p.evaluate(`(() => {
    const el = [...document.querySelectorAll("button,a,[role='button'],div,span")].find(e => (e.innerText||"").trim() === "修改提交");
    if (el) (el.closest("button,a,[role='button']") || el).click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 8000));
  // 滚到底
  await p.evaluate(`(() => { window.scrollTo(0, document.body.scrollHeight); return true; })()`);
  await new Promise((r) => setTimeout(r, 2500));
  await p.screenshot({ path: SHOTS + "/v6-3-bottom.png" });
  note("底部截图已存");

  // 确认按钮存在且可点
  const btns = await p.evaluate(`(() => [...document.querySelectorAll("button")]
    .filter(b=>b.offsetParent!==null)
    .map(b=>(b.innerText||"").replace(/\\s+/g," ").trim()).filter(Boolean))()`);
  note("底部可见按钮 = " + JSON.stringify(btns));
  await fs.writeFile(SHOTS + "/v6-bottom.json", JSON.stringify({ btns, log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
