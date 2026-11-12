// 在 ego 宿主里复现 E2E 环境，测角色归一化系数与相机状态。
import fs from "node:fs/promises";

const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const n = window.__npr;
  const V3 = n.camera.position.constructor;
  const members = [];
  for (const m of n.squad.members) {
    const w = m.group.getObjectByName("model-wrapper");
    if (!w) continue;
    const s = w.scale.x;
    members.push({
      id: m.id,
      wrapperScale: +s.toFixed(4),
      sizeY_used: +((m.scale * (m.visualScale || 1)) / (s || 1)).toFixed(4),
      memberScale: m.scale,
    });
  }
  const ow = n.scene.getObjectByName("opponent")?.getObjectByName("model-wrapper");
  const cam = n.camera;
  return {
    members,
    opponentScale: ow ? +ow.scale.x.toFixed(4) : null,
    camPos: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    camFov: cam.fov,
    screen: n.screens?.current ?? null,
  };
})()`;

async function main() {
  const task = await taskSpace("naiwa-scale-ego");
  const p = await task.newPage();
  try { await p.goto("http://127.0.0.1:5291/"); } catch { note("goto timeout"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 14000));
  note("app ready = " + (await p.evaluate("!!window.__npr")));
  await p.evaluate(`document.querySelector('[data-action="start"]')?.click(); true`);
  await new Promise((r) => setTimeout(r, 9000));
  await p.evaluate(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await new Promise((r) => setTimeout(r, 1200));
  note("=== 确认出战 1.2s 后（E2E 同款时机）===");
  note(JSON.stringify(await p.evaluate(DUMP), null, 1));
  await p.screenshot({ path: "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots/ego-battle-1s.png" });
  await new Promise((r) => setTimeout(r, 6000));
  note("=== 7.2s 后 ===");
  note(JSON.stringify(await p.evaluate(DUMP), null, 1));
  await p.screenshot({ path: "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots/ego-battle-7s.png" });

  await fs.writeFile("C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots/ego-scale.json", JSON.stringify({ log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
