// 在 ego 宿主里找「炸开的巨大网格」：遍历场景，报告世界包围盒最大的对象。
import fs from "node:fs/promises";

const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const n = window.__npr;
  const V3 = n.camera.position.constructor;
  const rows = [];
  const bb = { min: new V3(), max: new V3() };
  n.scene.traverse((c) => {
    if (!c.isMesh) return;
    c.updateWorldMatrix(true, false);
    let min = Infinity, max = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const tmp = new V3();
    if (c.isSkinnedMesh && c.skeleton) {
      // 蒙皮：用骨骼节点的世界位置范围近似
      for (const b of c.skeleton.bones) {
        b.updateWorldMatrix(true, false);
        const p = new V3();
        b.getWorldPosition(p);
        min = Math.min(min, p.y); max = Math.max(max, p.y);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      }
    } else {
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      const g = c.geometry.boundingBox;
      for (const sx of [g.min.x, g.max.x]) for (const sy of [g.min.y, g.max.y]) for (const sz of [g.min.z, g.max.z]) {
        tmp.set(sx, sy, sz).applyMatrix4(c.matrixWorld);
        min = Math.min(min, tmp.y); max = Math.max(max, tmp.y);
        minX = Math.min(minX, tmp.x); maxX = Math.max(maxX, tmp.x);
        minZ = Math.min(minZ, tmp.z); maxZ = Math.max(maxZ, tmp.z);
      }
    }
    if (!isFinite(min)) return;
    const chain = [];
    let p = c;
    while (p && p !== n.scene) { chain.unshift(p.name || p.type); p = p.parent; }
    rows.push({
      chain: chain.join("/").slice(0, 120),
      type: c.type, mat: c.material?.type,
      isOutline: !!c.userData.__isOutline,
      h: +(max - min).toFixed(3),
      w: +(maxX - minX).toFixed(3),
      d: +(maxZ - minZ).toFixed(3),
      y: [+min.toFixed(2), +max.toFixed(2)],
      scale: [+c.scale.x.toFixed(3), +c.scale.y.toFixed(3), +c.scale.z.toFixed(3)],
      parentScale: c.parent ? [+c.parent.scale.x.toFixed(3), +c.parent.scale.y.toFixed(3), +c.parent.scale.z.toFixed(3)] : null,
    });
  });
  rows.sort((a, b) => (b.h * b.w) - (a.h * a.w));
  return rows.slice(0, 18);
})()`;

async function main() {
  const task = await taskSpace("naiwa-scale-ego");
  const p = await task.newPage();
  try { await p.goto("http://127.0.0.1:5291/"); } catch { note("goto timeout"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 14000));
  await p.evaluate(`document.querySelector('[data-action="start"]')?.click(); true`);
  await new Promise((r) => setTimeout(r, 9000));
  await p.evaluate(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await new Promise((r) => setTimeout(r, 7000));

  const rows = await p.evaluate(DUMP);
  note("=== 世界尺寸最大的网格（ego 宿主 · 战斗中）===");
  rows.forEach((r) => note("  " + JSON.stringify(r)));

  await fs.writeFile("C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots/ego-bigmeshes.json", JSON.stringify({ rows, log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
