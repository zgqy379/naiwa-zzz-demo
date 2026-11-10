/**
 * fps 基准（只读诊断）：给足预热后分档测量，判断「2000×1250 能不能 60fps」。
 *
 * 分档（同一浏览器会话内依次测量，测量间互不写源码）：
 *  A 2000×1250（1600×1000 CSS @dpr1.25）+ bloom on
 *  B 2000×1250 + bloom off      （只为归因后处理成本，测完还原）
 *  C 2000×1250 + postfx.enabled=false（直渲，归因 composer 成本，测完还原）
 *  D 1920×1080（1536×864 CSS @dpr1.25）+ bloom on（录制备选分辨率）
 *  E 1280×800（1280×800 CSS @dpr1）+ bloom on（分辨率下限对照）
 *
 * 每档先预热 180 帧（或 6s），再测 120 帧。产物落 docs/evidence/。
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
const headful = process.argv.includes("--headful");
const SUFFIX = headful ? "-headful" : "";
const OUT = path.join(HERE, "v3-run-bench-20261110" + SUFFIX + ".json");
const LOG_PATH = path.join(HERE, "v3-run-bench-20261110" + SUFFIX + ".log");
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
const FPS = (N) => `(() => new Promise((resolve) => {
  const ts = [];
  const f = (t) => { ts.push(t); if (ts.length < ${N}) { requestAnimationFrame(f); return; }
    const dts = []; for (let i = 1; i < ts.length; i++) dts.push(ts[i] - ts[i - 1]);
    const s = dts.slice().sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)))];
    const avg = (ts[ts.length - 1] - ts[0]) / (${N} - 1);
    resolve({ n: ${N}, avgMs: +avg.toFixed(2), avgFps: +(1000 / avg).toFixed(2), p50Fps: +(1000 / at(50)).toFixed(2), p5Fps: +(1000 / at(95)).toFixed(2), p95Ms: +at(95).toFixed(1), worstMs: +s[s.length - 1].toFixed(1) });
  };
  requestAnimationFrame(f);
}))()`;

async function main() {
  const result = { rounds: [], startedAt: new Date().toISOString() };
  const srv = await startServer(DIST, [5297, 5298]);
  const url = `http://127.0.0.1:${srv.port}/`;
  log("[server] " + url);
  let chrome = null;
  try {
    const port = 9800 + Math.floor(Math.random() * 100);
    const profile = path.join(os.tmpdir(), "naiwa-bench-" + port);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    mkdirSync(profile, { recursive: true });

    const proc = spawn(CHROME, [...(headful ? [] : ["--headless=new"]), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
      "--window-size=1600,1000", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      "--mute-audio", "--hide-scrollbars", "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
      "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", "about:blank"], { stdio: "ignore", windowsHide: true });
    let info = null;
    for (let i = 0; i < 80; i++) { await sleep(250); try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch {} }
    if (!info) throw new Error("no cdp");
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find((x) => x.type === "page");
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable"); await cdp.send("Network.enable");
    const kill = () => { try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch {} cdp.close(); try { rmSync(profile, { recursive: true, force: true }); } catch {} };
    chrome = { kill };

    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1.25, mobile: false });
    await cdp.send("Page.navigate", { url: url + "?bench=" + Date.now() });
    let ok = false;
    for (let i = 0; i < 200; i++) { await sleep(100); try { ok = await ev(cdp, "!!window.__npr"); } catch {} if (ok) break; }
    if (!ok) throw new Error("__npr 未出现");
    // 真实路径进战斗（保证画面与录制时一致：角色/对手/HUD 全在）
    await sleep(400);
    await ev(cdp, `(() => { const b = document.querySelector('#screen-title [data-action="start"]'); b && b.click(); return true; })()`);
    await sleep(500);
    await ev(cdp, `(() => { const b = document.querySelector('#screen-select [data-action="confirm"]'); b && b.click(); return true; })()`);
    await sleep(1200);
    result.screen = await ev(cdp, "(() => window.__npr.screens.current)()");
    result.gpu = await ev(cdp, `(() => { const c = document.createElement("canvas"); const gl = c.getContext("webgl2"); const e = gl.getExtension("WEBGL_debug_renderer_info"); return { renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION) }; })()`);
    log("[gpu] " + JSON.stringify(result.gpu) + " screen=" + result.screen);

    // 预热：让 shader 编译/纹理上传收敛（低帧率下按帧数计，按时间也给足）
    log("[warmup] 6s ...");
    await sleep(6000);

    const cases = [
      { tag: "A-2000x1250-bloom-on", w: 1600, h: 1000, dpr: 1.25, mutate: null },
      { tag: "B-2000x1250-bloom-off", w: 1600, h: 1000, dpr: 1.25, mutate: "bloom-off" },
      { tag: "C-2000x1250-direct", w: 1600, h: 1000, dpr: 1.25, mutate: "direct" },
      { tag: "D-1920x1080-bloom-on", w: 1536, h: 864, dpr: 1.25, mutate: "restore" },
      { tag: "E-1280x800-bloom-on", w: 1280, h: 800, dpr: 1, mutate: null },
    ];
    for (const c of cases) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: c.w, height: c.h, deviceScaleFactor: c.dpr, mobile: false });
      await sleep(1500);
      if (c.mutate === "bloom-off") await ev(cdp, "(() => { window.__benchOrigBloom = window.__npr.postfx.bloom.enabled; window.__npr.postfx.bloom.enabled = false; return true; })()");
      if (c.mutate === "direct") await ev(cdp, "(() => { window.__benchOrigEnabled = window.__npr.postfx.enabled; window.__npr.postfx.enabled = false; return true; })()");
      if (c.mutate === "restore") await ev(cdp, "(() => { if (window.__benchOrigEnabled !== undefined) window.__npr.postfx.enabled = window.__benchOrigEnabled; if (window.__benchOrigBloom !== undefined) window.__npr.postfx.bloom.enabled = window.__benchOrigBloom; return true; })()");
      // 每档预热 80 帧
      await ev(cdp, FPS(80), true);
      const fps = await ev(cdp, FPS(120), true);
      const canvas = await ev(cdp, "(() => { const n = window.__npr; return { canvas: [n.renderer.domElement.width, n.renderer.domElement.height], inner: [innerWidth, innerHeight], dpr: n.renderer.getPixelRatio(), bloom: n.postfx.bloom.enabled, postfx: n.postfx.enabled }; })()");
      const rec = { tag: c.tag, requested: { w: c.w, h: c.h, dpr: c.dpr }, canvas, fps };
      log("[" + c.tag + "] " + JSON.stringify({ canvas, fps }));
      result.rounds.push(rec);
    }
    await ev(cdp, "(() => { if (window.__benchOrigEnabled !== undefined) window.__npr.postfx.enabled = window.__benchOrigEnabled; if (window.__benchOrigBloom !== undefined) window.__npr.postfx.bloom.enabled = window.__benchOrigBloom; return true; })()");
  } finally {
    try { chrome && chrome.kill(); } catch {}
    await new Promise((r) => srv.server.close(r));
    result.finishedAt = new Date().toISOString();
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    log("[done] " + OUT);
  }
}
main().then(() => process.exit(0)).catch((e) => { log("[crash] " + (e?.stack || e)); process.exit(1); });