// 魔搭主通道实机验收：先取创空间 iframe 的真实 URL（含 studio_token），再直开该 URL 进战斗验证。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

async function main() {
  const task = await taskSpace("naiwa-online-verify");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  // ① 取 iframe URL
  try { await p.goto("https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo", { waitUntil: "commit", timeout: 60000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 10000));
  const src = await p.evaluate(`(() => {
    const f = document.querySelector("iframe");
    return f ? (f.src || "") : "";
  })()`).catch((e) => "");
  note("iframe src = " + String(src).slice(0, 160));
  if (!src) { note("✗ 没找到 iframe"); return; }
  await p.screenshot({ path: SHOTS + "/online-v7-studio.png" });

  // ② 直开 iframe 的 URL（带 token），就是评审在创空间里看到的那个页面
  try { await p.goto(src, { waitUntil: "commit", timeout: 60000 }); } catch { note("goto iframe url 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const ok = await p.evaluate(`!!window.__npr`).catch(() => false);
    if (ok) { note(`  app 就绪（${(i + 1) * 2}s）`); break; }
  }
  await new Promise((r) => setTimeout(r, 6000));

  // ③ 进战斗
  await p.evaluate(`document.querySelector('[data-action="start"]')?.click(); true`);
  await new Promise((r) => setTimeout(r, 10000));
  await p.evaluate(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await new Promise((r) => setTimeout(r, 12000));

  const st = await p.evaluate(`(() => {
    const n = window.__npr;
    const a = n?.squad?.active;
    const d = a?.anim?.clips;
    return {
      screen: n?.screens?.current ?? null, phase: n?.battle?.phase ?? null,
      active: a?.name ?? null, hasClips: !!a?.anim?.hasClips,
      clipCount: d ? d.byName.size : 0,
      clipNames: d ? [...d.byName.keys()].slice(0, 8) : [],
      animAction: a?.anim?.action ?? null,
      clipAction: a?.anim?.clips?.currentAction ?? null,
      hasModel: !!a?.scene,
      weaponTip: (() => { const t = n?.__weaponTip?.(); return t ? [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)] : null; })(),
    };
  })()`).catch((e) => ({ err: String(e).slice(0, 90) }));
  note("=== 主通道战斗态 ===");
  note("  " + JSON.stringify(st));
  await p.screenshot({ path: SHOTS + "/online-v7-ms-battle.png" });

  // ④ 打一下
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); true`);
  await new Promise((r) => setTimeout(r, 150));
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })); true`);
  await new Promise((r) => setTimeout(r, 400));
  const hit = await p.evaluate(`(() => {
    const n = window.__npr;
    const a = n?.squad?.active;
    const t = n?.__weaponTip?.();
    return {
      animAction: a?.anim?.action ?? null, clipAction: a?.anim?.clips?.currentAction ?? null,
      oppHp: Math.round(n?.opponent?.hp ?? -1),
      weaponTip: t ? [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)] : null,
    };
  })()`).catch((e) => ({ err: String(e).slice(0, 90) }));
  note("=== 主通道攻击帧 ===");
  note("  " + JSON.stringify(hit));
  await p.screenshot({ path: SHOTS + "/online-v7-ms-attack.png" });

  await fs.writeFile(SHOTS + "/online-v7-ms.json", JSON.stringify({ src, st, hit, log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
