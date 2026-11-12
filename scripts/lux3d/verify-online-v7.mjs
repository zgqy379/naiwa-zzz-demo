// 线上 Demo 实机验收（真实浏览器 ego）：直连 gh-pages（同版构建）→ 进战斗 → 确认骨骼动画与武器在跑。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

async function main() {
  const task = await taskSpace("naiwa-online-verify");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  try { await p.goto("https://zgqy379.github.io/naiwa-zzz-demo/", { waitUntil: "commit", timeout: 60000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  // 等 app 真正启动（16 只蒙皮角色 + 2 个动画库 ≈ 9.4MB，首屏要下载）
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const ok = await p.evaluate(`!!window.__npr && !!document.querySelector('[data-action="start"]')`).catch(() => false);
    if (ok) { note(`  app 就绪（${(i + 1) * 2}s）`); break; }
    if (i % 5 === 0) note(`  等待中 ${(i + 1) * 2}s…`);
  }

  const entry = await p.evaluate(`(() => {
    const s = [...document.querySelectorAll("script[src]")].map(x => x.src).filter(x => x.includes("index-"));
    return { scripts: s, app: !!window.__npr, screen: window.__npr?.screens?.current ?? null };
  })()`).catch((e) => ({ err: String(e).slice(0, 80) }));
  note("=== 线上入口 ===");
  note("  " + JSON.stringify(entry));
  await p.screenshot({ path: SHOTS + "/online-v7-title.png" });

  // 进战斗
  await p.evaluate(`document.querySelector('[data-action="start"]')?.click(); true`);
  await new Promise((r) => setTimeout(r, 9000));
  await p.evaluate(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await new Promise((r) => setTimeout(r, 9000));

  const state = await p.evaluate(`(() => {
    const n = window.__npr;
    const a = n?.squad?.active;
    const d = a?.anim?.clips;
    return {
      app: !!n, screen: n?.screens?.current ?? null, phase: n?.battle?.phase ?? null,
      active: a?.name ?? null, hasClips: !!a?.anim?.hasClips,
      clipCount: d ? d.byName.size : 0,
      clipNames: d ? [...d.byName.keys()].slice(0, 10) : [],
      animAction: a?.anim?.action ?? null,
      clipAction: a?.anim?.clips?.currentAction ?? null,
      hud: {
        phase: !!document.querySelector(".timer-num"),
        stagger: !!document.querySelector("[id*=stagger], .bar-fill"),
      },
    };
  })()`).catch((e) => ({ err: String(e).slice(0, 90) }));
  note("=== 线上战斗态 ===");
  note("  " + JSON.stringify(state));
  await p.screenshot({ path: SHOTS + "/online-v7-battle.png" });

  // 打一下，看动作与武器
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); true`);
  await new Promise((r) => setTimeout(r, 120));
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })); true`);
  await new Promise((r) => setTimeout(r, 320));
  const hit = await p.evaluate(`(() => {
    const n = window.__npr;
    const a = n?.squad?.active;
    const t = n?.__weaponTip?.();
    return {
      animAction: a?.anim?.action ?? null,
      clipAction: a?.anim?.clips?.currentAction ?? null,
      oppHp: Math.round(n?.opponent?.hp ?? -1),
      weaponTip: t ? [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)] : null,
    };
  })()`).catch((e) => ({ err: String(e).slice(0, 90) }));
  note("=== 线上攻击帧 ===");
  note("  " + JSON.stringify(hit));
  await p.screenshot({ path: SHOTS + "/online-v7-attack.png" });

  await fs.writeFile(SHOTS + "/online-v7-verify.json", JSON.stringify({ entry, state, hit, log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
