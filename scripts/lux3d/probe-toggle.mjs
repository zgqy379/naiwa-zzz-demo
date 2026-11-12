// ego 宿主：逐个关掉「描边壳」「武器」「主题饰带」并截图，定位炸开的部分。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

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

  // ① 列出挂在手骨下的对象（武器）
  const attached = await p.evaluate(`(() => {
    const n = window.__npr;
    const out = [];
    n.scene.traverse((c) => {
      let p = c, chain = [];
      while (p && p !== n.scene) { chain.unshift(p.name || p.type); p = p.parent; }
      const cc = chain.join("/");
      if (/RightHand/i.test(cc) && c.isMesh) {
        const s = new (n.camera.position.constructor)();
        c.getWorldPosition(s);
        out.push({ chain: cc.slice(0, 130), type: c.type, mat: c.material?.type, world: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)], scale: [+c.scale.x.toFixed(2), +c.scale.y.toFixed(2), +c.scale.z.toFixed(2)] });
      }
    });
    return out;
  })()`);
  note("=== 挂在手骨下的网格（武器候选）===");
  (attached || []).forEach((r) => note("  " + JSON.stringify(r)));

  const shot = async (tag) => { await p.screenshot({ path: SHOTS + "/toggle-" + tag + ".png" }); note("shot " + tag); };

  await shot("0-all");

  // ② 关掉武器（手骨下所有非骨骼 mesh）
  await p.evaluate(`(() => {
    const n = window.__npr;
    window.__hidden = [];
    n.scene.traverse((c) => {
      let p = c, chain = [];
      while (p && p !== n.scene) { chain.unshift(p.name || p.type); p = p.parent; }
      const cc = chain.join("/");
      if (c.isMesh && /RightHand/i.test(cc)) { c.visible = false; window.__hidden.push(cc); }
    });
    return window.__hidden.length;
  })()`);
  await new Promise((r) => setTimeout(r, 900));
  await shot("1-no-weapon");

  // ③ 再关掉描边壳
  await p.evaluate(`(() => {
    const n = window.__npr;
    n.scene.traverse((c) => { if (c.userData.__isOutline) c.visible = false; });
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 900));
  await shot("2-no-weapon-no-outline");

  // ④ 恢复武器，只关描边
  await p.evaluate(`(() => {
    const n = window.__npr;
    n.scene.traverse((c) => {
      let p = c, chain = [];
      while (p && p !== n.scene) { chain.unshift(p.name || p.type); p = p.parent; }
      const cc = chain.join("/");
      if (c.isMesh && /RightHand/i.test(cc)) c.visible = true;
    });
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 900));
  await shot("3-no-outline");

  await fs.writeFile(SHOTS + "/toggle.json", JSON.stringify({ attached, log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
