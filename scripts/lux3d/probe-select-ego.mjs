// 在 ego 宿主里复现「选人页点卡片 → 展示台名字不更新」。
import fs from "node:fs/promises";

const log = [];
const note = (s) => { log.push(s); console.log(s); };

async function main() {
  const task = await taskSpace("naiwa-e2e-select");
  const p = await task.newPage();
  try { await p.goto("http://127.0.0.1:5291/"); } catch (e) { note("goto timeout"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 12000));

  const ready = await p.evaluate(`!!window.__npr`);
  note("app ready = " + ready);
  await p.evaluate(`document.querySelector('[data-action="start"]')?.click(); true`);
  await new Promise((r) => setTimeout(r, 9000));

  const before = await p.evaluate(`(() => ({
    cards: document.querySelectorAll(".char-card").length,
    name: document.getElementById("showcase-name")?.textContent,
    card5: document.querySelectorAll(".char-card")[5]?.querySelector(".cc-name")?.textContent,
    activeIdx: [...document.querySelectorAll(".char-card")].findIndex(c => c.classList.contains("active")),
    live3d: !!window.__npr?.screens?.live3d,
    listHTML: document.getElementById("select-list")?.children.length,
  }))()`);
  note("点击前 = " + JSON.stringify(before));

  // 用真实鼠标点击（E2E 用的是 .click() 合成事件）
  const r1 = await p.evaluate(`(() => {
    try { document.querySelectorAll(".char-card")[5]?.click(); return "synthetic-ok"; } catch (e) { return "throw:" + e.message; }
  })()`);
  note("合成 click = " + r1);
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const st = await p.evaluate(`(() => ({
      name: document.getElementById("showcase-name")?.textContent,
      activeIdx: [...document.querySelectorAll(".char-card")].findIndex(c => c.classList.contains("active")),
    }))()`);
    note(`  t+${(i + 1) * 0.5}s = ${JSON.stringify(st)}`);
    if (st.name === "奶狗") break;
  }

  // 再试真实鼠标点击
  const box = await p.evaluate(`(() => {
    const c = document.querySelectorAll(".char-card")[5];
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
  note("card5 box = " + JSON.stringify(box));
  if (box) {
    await p.cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
    await p.cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
    await new Promise((r) => setTimeout(r, 1200));
    note("err = " + await p.evaluate("window.__live3dErr || null"));
  note("真实鼠标点击后 = " + JSON.stringify(await p.evaluate(`(() => ({
      name: document.getElementById("showcase-name")?.textContent,
      activeIdx: [...document.querySelectorAll(".char-card")].findIndex(c => c.classList.contains("active")),
    }))()`)));
  }

  await fs.writeFile("C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots/e2e-select.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
