/**
 * 合成成本探针（只读）：把「GPU 单帧合成成本」与「rAF 实际呈现帧率」分开量。
 * 目的：判断 7–15fps 是 GPU 干不动，还是浏览器/远程显示会话的帧调度被限速。
 *
 * 手法：gl.finish() 同步，分别测
 *  - postfx.render(dt) × 20（= 一次完整后处理合成，含 bloom/grade/fxaa/output）
 *  - renderer.render(scene,camera) × 20（= 主场景直渲）
 *  - rAF 连续 60 帧（= 浏览器真正交给页面的帧率）
 * 全部只读；测完不做任何持久化改动。产物落 docs/evidence/。
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
const OUT = path.join(HERE, "v3-run-composer-probe-20261110.json");
const LOG_PATH = path.join(HERE, "v3-run-composer-probe-20261110.log");
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

const GpuTime = (kind, iters) => `(async () => {
  const n = window.__npr; const gl = n.renderer.getContext();
  const run = () => { for (let i = 0; i < ${iters}; i++) { if (${JSON.stringify(kind)} === "composer") n.postfx.render(0.016); else n.renderer.render(n.scene, n.camera); } };
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  run(); gl.finish(); // 预热（含 shader 编译）
  const t0 = performance.now(); run(); gl.finish();
  return { kind: ${JSON.stringify(kind)}, iters: ${iters}, msPerFrame: +((performance.now() - t0) / ${iters}).toFixed(2), canvas: [n.renderer.domElement.width, n.renderer.domElement.height] };
})()`;

const RAF_FPS = (N) => `(() => new Promise((resolve) => {
  const ts = [];
  const f = (t) => { ts.push(t); if (ts.length < ${N}) { requestAnimationFrame(f); return; }
    const dts = []; for (let i = 1; i < ts.length; i++) dts.push(ts[i] - ts[i - 1]);
    const s = dts.slice().sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)))];
    const avg = (ts[ts.length - 1] - ts[0]) / (${N} - 1);
    resolve({ n: ${N}, avgFps: +(1000 / avg).toFixed(2), p50Fps: +(1000 / at(50)).toFixed(2), p5Fps: +(1000 / at(95)).toFixed(2), worstMs: +s[s.length - 1].toFixed(1) });
  };
  requestAnimationFrame(f);
}))()`;

async function main() {
  const result = { variants: [] };
  const srv = await startServer(DIST, [5301, 5302]);
  const url = `http://127.0.0.1:${srv.port}/`;
  let chrome = null;
  try {
    const port = 9700 + Math.floor(Math.random() * 90);
    const profile = path.join(os.tmpdir(), "naiwa-composer-" + port);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    mkdirSync(profile, { recursive: true });
    const headful = process.argv.includes("--headful");
    const proc = spawn(CHROME, [...(headful ? [] : ["--headless=new"]), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
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
    result.headful = headful;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1.25, mobile: false });
    await cdp.send("Page.navigate", { url: url + "?c=" + Date.now() });
    for (let i = 0; i < 200; i++) { await sleep(100); try { if (await ev(cdp, "!!window.__npr")) break; } catch {} }
    await sleep(400);
    await ev(cdp, `(() => { document.querySelector('#screen-title [data-action="start"]')?.click(); return true; })()`);
    await sleep(400);
    await ev(cdp, `(() => { document.querySelector('#screen-select [data-action="confirm"]')?.click(); return true; })()`);
    await sleep(6000);
    result.screen = await ev(cdp, "(() => window.__npr.screens.current)()");

    const measure = async (tag) => {
      const rec = { tag, canvas: await ev(cdp, "(() => { const n = window.__npr; return [n.renderer.domElement.width, n.renderer.domElement.height]; })()") };
      rec.composer = await ev(cdp, GpuTime("composer", 20), true);
      rec.direct = await ev(cdp, GpuTime("direct", 20), true);
      rec.raf = await ev(cdp, RAF_FPS(60), true);
      rec.gpu = await ev(cdp, "(() => { const n = window.__npr; const gl = n.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()");
      log("[" + tag + "] " + JSON.stringify(rec));
      result.variants.push(rec);
    };

    const rafOnly = async (tag, setup, restore) => {
      const rec = { tag };
      try {
        if (setup) rec.setup = await ev(cdp, setup);
        rec.raf = await ev(cdp, RAF_FPS(60), true);
      } finally { if (restore) { try { rec.restore = await ev(cdp, restore); } catch (e) { rec.restoreError = String(e?.message || e); } } }
      log("[" + tag + "] " + JSON.stringify(rec));
      result.variants.push(rec);
    };

    await measure("default-1600x1000-dpr1.25");
    await rafOnly("canvas-hidden",
      "(() => { const gl = document.getElementById('gl'); window.__p_glDisp = gl.style.display; gl.style.display = 'none'; return { was: window.__p_glDisp }; })()",
      "(() => { const gl = document.getElementById('gl'); gl.style.display = window.__p_glDisp; return { now: gl.style.display }; })()");
    await rafOnly("hud-hidden",
      "(() => { const ui = document.getElementById('ui'); window.__p_uiDisp = ui.style.display; ui.style.display = 'none'; return { was: window.__p_uiDisp }; })()",
      "(() => { const ui = document.getElementById('ui'); ui.style.display = window.__p_uiDisp; return { now: ui.style.display }; })()");
    await rafOnly("postfx-off",
      "(() => { const n = window.__npr; window.__p_postfx = n.postfx.enabled; n.postfx.enabled = false; return { was: window.__p_postfx }; })()",
      "(() => { const n = window.__npr; n.postfx.enabled = window.__p_postfx; return { now: n.postfx.enabled }; })()");
    await rafOnly("hud-hidden+postfx-off",
      "(() => { const n = window.__npr; window.__p_postfx2 = n.postfx.enabled; n.postfx.enabled = false; const ui = document.getElementById('ui'); window.__p_uiDisp2 = ui.style.display; ui.style.display = 'none'; return true; })()",
      "(() => { const n = window.__npr; n.postfx.enabled = window.__p_postfx2; const ui = document.getElementById('ui'); ui.style.display = window.__p_uiDisp2; return { postfx: n.postfx.enabled, ui: ui.style.display }; })()");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 864, deviceScaleFactor: 1.25, mobile: false });
    await sleep(1500);
    await measure("1920x1080");
  } finally {
    try { chrome && chrome.kill(); } catch {}
    await new Promise((r) => srv.server.close(r));
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    log("[done] " + OUT);
  }
}
main().then(() => process.exit(0)).catch((e) => { log("[crash] " + (e?.stack || e)); process.exit(1); });