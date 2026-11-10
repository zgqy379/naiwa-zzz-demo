/**
 * 帧成本归因探针（只读诊断）：用 gl.finish() 把 GPU 时间同步回来，判断 9fps 是填充率、
 * 阴影 pass、还是 draw call / 主线程开销造成的。
 *
 * 手法：直接调 window.__npr.renderer.render(scene,camera) 若干次并 gl.finish()，
 * 分别测：当前分辨率 / 缩到 400×250 / 关闭 shadowMap / 关闭后处理，测完全部还原。
 * 不改 dist/src；产物落 docs/evidence/。
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(HERE, "v3-run-frame-probe-20261110.json");
const LOG_PATH = path.join(HERE, "v3-run-frame-probe-20261110.log");
try { writeFileSync(LOG_PATH, ""); } catch {}
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n"; try { appendFileSync(LOG_PATH, s); } catch {} try { process.stdout.write(s); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".glb": "model/gltf-binary", ".png": "image/png" };

function startServer(root, ports) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.join(root, path.normalize(p === "/" ? "/index.html" : p).replace(/^([/\\])+/, ""));
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("nf"); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
      createReadStream(file).pipe(res);
    });
    const t = (i) => { const port = ports[i]; server.once("error", (e) => (e.code === "EADDRINUSE" && i + 1 < ports.length) ? t(i + 1) : reject(e)); server.listen(port, "127.0.0.1", () => resolve({ server, port })); };
    t(0);
  });
}
class CDP {
  constructor(ws) { this.id = 0; this.pending = new Map(); this.ws = new WebSocket(ws); this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } }; }
  ready() { return new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  close() { try { this.ws.close(); } catch {} }
}
async function ev(cdp, expr, awaitP = false) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: awaitP, timeout: 120000 });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}

/** 在页面内测量：N 次直渲 + gl.finish()（把 GPU 时间同步成墙钟时间） */
const PROBE = (iters) => `(async () => {
  const n = window.__npr;
  const gl = n.renderer.getContext();
  const time = async () => {
    await new Promise((r) => requestAnimationFrame(r));
    const t0 = performance.now();
    for (let i = 0; i < ${iters}; i++) n.renderer.render(n.scene, n.camera);
    gl.finish();
    return +( (performance.now() - t0) / ${iters} ).toFixed(2);
  };
  const msCurrent = await time();
  const prevSize = n.renderer.getSize(new (n.scene.constructor.prototype.constructor === Object ? Object : window.THREE_V2 ?? Object)?.());
  return { msPerDirectFrame: msCurrent, canvas: [n.renderer.domElement.width, n.renderer.domElement.height], calls: n.renderer.info.render.calls, triangles: n.renderer.info.render.triangles };
})()`;

async function main() {
  const result = { steps: [] };
  const srv = await startServer(DIST, [5299, 5300]);
  const url = `http://127.0.0.1:${srv.port}/`;
  let chrome = null;
  try {
    const port = 9900 + Math.floor(Math.random() * 90);
    const profile = path.join(os.tmpdir(), "naiwa-frameprobe-" + port);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    mkdirSync(profile, { recursive: true });
    const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
      "--window-size=1600,1000", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      "--mute-audio", "--hide-scrollbars", "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
      "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "about:blank"], { stdio: "ignore", windowsHide: true });
    let info = null;
    for (let i = 0; i < 80; i++) { await sleep(250); try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch {} }
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const cdp = new CDP(list.find((x) => x.type === "page").webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable");
    chrome = { kill: () => { try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch {} cdp.close(); try { rmSync(profile, { recursive: true, force: true }); } catch {} } };
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1.25, mobile: false });
    await cdp.send("Page.navigate", { url: url + "?p=" + Date.now() });
    for (let i = 0; i < 200; i++) { await sleep(100); try { if (await ev(cdp, "!!window.__npr")) break; } catch {} }
    await sleep(400);
    await ev(cdp, `(() => { document.querySelector('#screen-title [data-action="start"]')?.click(); return true; })()`);
    await sleep(400);
    await ev(cdp, `(() => { document.querySelector('#screen-select [data-action="confirm"]')?.click(); return true; })()`);
    await sleep(6000); // 预热：shader 编译收敛

    const measure = async (tag, setup, restore) => {
      const rec = { tag };
      try {
        if (setup) rec.setup = await ev(cdp, setup);
        rec.probe = await ev(cdp, `(async () => {
          const n = window.__npr; const gl = n.renderer.getContext();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

          for (let i = 0; i < 3; i++) { n.renderer.render(n.scene, n.camera); } // 预热（含可能的 shader 重编译）
          gl.finish();
          await new Promise((r) => requestAnimationFrame(r));
          const t0 = performance.now();
          for (let i = 0; i < 8; i++) { n.renderer.render(n.scene, n.camera); }
          gl.finish();
          const ms = (performance.now() - t0) / 8;
          return { msPerDirectFrame: +ms.toFixed(2), canvas: [n.renderer.domElement.width, n.renderer.domElement.height],
                   calls: n.renderer.info.render.calls, triangles: n.renderer.info.render.triangles,
                   geometries: n.renderer.info.memory.geometries, textures: n.renderer.info.memory.textures };
        })()`, true);
        rec.sceneStats = await ev(cdp, `(() => {
          const n = window.__npr; let meshes = 0, visibleMeshes = 0, casters = 0;
          n.scene.traverse((o) => { if (o.isMesh) { meshes++; if (o.visible && (!o.parent || o.parent.visible)) visibleMeshes++; if (o.castShadow) casters++; } });
          return { meshes, visibleMeshes, casters, sceneChildren: n.scene.children.length, shadowMapEnabled: n.renderer.shadowMap.enabled, shadowType: n.renderer.shadowMap.type };
        })()`);
      } catch (e) { rec.error = String(e?.message || e); }
      finally { if (restore) { try { rec.restore = await ev(cdp, restore); } catch (e) { rec.restoreError = String(e?.message || e); } } }
      log("[" + tag + "] " + JSON.stringify(rec.probe || rec.error) + " scene=" + JSON.stringify(rec.sceneStats || null));
      result.steps.push(rec);
    };

    await measure("baseline-2000x1250", null, null);
    await measure("basic-shadow-type0",
      "(() => { const n = window.__npr; window.__p_shadowType = n.renderer.shadowMap.type; n.renderer.shadowMap.type = 0; let k = 0; n.scene.traverse((o) => { if (o.isMesh && o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; k++; }); } }); return { from: window.__p_shadowType, to: 0, recompiled: k }; })()",
      "(() => { const n = window.__npr; n.renderer.shadowMap.type = window.__p_shadowType; let k = 0; n.scene.traverse((o) => { if (o.isMesh && o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; k++; }); } }); return { now: n.renderer.shadowMap.type, recompiled: k }; })()");
    await measure("shadow-off", "(() => { const n = window.__npr; window.__p_shadow = n.renderer.shadowMap.enabled; n.renderer.shadowMap.enabled = false; return { was: window.__p_shadow }; })()",
      "(() => { const n = window.__npr; n.renderer.shadowMap.enabled = window.__p_shadow; return { now: n.renderer.shadowMap.enabled }; })()");
    await measure("small-400x250", "(() => { const n = window.__npr; window.__p_size = n.renderer.getSize({ set(x,y){this.x=x;this.y=y;return this;}, x:0,y:0 }); n.renderer.setSize(400, 250); return { canvas: [n.renderer.domElement.width, n.renderer.domElement.height] }; })()",
      "(() => { const n = window.__npr; n.renderer.setSize(innerWidth, innerHeight); return { canvas: [n.renderer.domElement.width, n.renderer.domElement.height] }; })()");
    await measure("no-outline-hull", "(() => { const n = window.__npr; let hidden = 0; n.scene.traverse((o) => { if (o.isMesh && o.userData && o.userData.__isOutline) { o.userData.__p_vis = o.visible; o.visible = false; hidden++; } }); return { hidden }; })()",
      "(() => { const n = window.__npr; let shown = 0; n.scene.traverse((o) => { if (o.isMesh && o.userData && typeof o.userData.__p_vis === 'boolean') { o.visible = o.userData.__p_vis; delete o.userData.__p_vis; shown++; } }); return { shown }; })()");
  } finally {
    try { chrome && chrome.kill(); } catch {}
    await new Promise((r) => srv.server.close(r));
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    log("[done] " + OUT);
  }
}
main().then(() => process.exit(0)).catch((e) => { log("[crash] " + (e?.stack || e)); process.exit(1); });