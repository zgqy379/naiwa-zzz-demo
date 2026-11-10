/**
 * 修复复验N（team task 21）—— 2000×1250 fps 双后端对照。
 *
 * 目的：本机默认 WebGL 后端极慢（历史上 1.34fps），只有显式加
 * `--use-angle=d3d11 --use-gl=angle` 的数字才对录制决策有意义。
 *
 * 流程：静态服务 + CDP 同进程 → 真实点击 title→select→battle → 预热 6s + 80 帧
 *       → 测 60 帧（两后端同口径）。
 *
 * 用法：
 *   node docs/evidence/v3-fix-fps-20261110.mjs --backend default --dist dist
 *   node docs/evidence/v3-fix-fps-20261110.mjs --backend angle   --dist dist
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const DIST = path.resolve(ROOT, arg("dist", "dist"));
const BACKEND = arg("backend", "default"); // default | angle
const PORT = Number(arg("port", BACKEND === "angle" ? "5309" : "5308"));
const OUT = path.resolve(ROOT, arg("out", `docs/evidence/v3-fix-fps-20261110-${BACKEND}.json`));
const LOG_PATH = path.join(HERE, `v3-fix-fps-20261110-${BACKEND}.log`);
const MEASURE_FRAMES = 60;
const WARMUP_FRAMES = 80;
const VIEW = { width: 1600, height: 1000, dpr: 1.25 }; // → 2000×1250

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
if (!CHROME) throw new Error("未找到 Chrome");
if (!existsSync(path.join(DIST, "index.html"))) throw new Error("缺少 " + DIST + "/index.html");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".glb": "model/gltf-binary", ".png": "image/png" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { writeFileSync(LOG_PATH, ""); } catch { /* noop */ }
function log(...a) {
  const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n";
  try { appendFileSync(LOG_PATH, s); } catch { /* noop */ }
  try { process.stdout.write(s); } catch { /* noop */ }
}

function startServer(root, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.join(root, path.normalize(p === "/" ? "/index.html" : p).replace(/^([/\\])+/, ""));
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("nf"); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
      createReadStream(file).pipe(res);
    });
    const t = (i) => {
      const candidate = port + i;
      if (i > 2) return reject(new Error("端口均被占用: " + port + ".." + (port + 2)));
      server.once("error", (e) => (e.code === "EADDRINUSE" ? t(i + 1) : reject(e)));
      server.listen(candidate, "127.0.0.1", () => resolve({ server, port: candidate }));
    };
    t(0);
  });
}

class CDP {
  constructor(ws) {
    this.id = 0; this.pending = new Map();
    this.ws = new WebSocket(ws);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    };
  }
  ready() { return new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}) {
    const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}
async function ev(cdp, expr, awaitP = false, timeout = 180000) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: awaitP, timeout });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}
const FPS = (N) => `(() => new Promise((resolve) => {
  const ts = []; const N = ${N};
  const f = (t) => { ts.push(t); if (ts.length < N) { requestAnimationFrame(f); return; }
    const dts = []; for (let i = 1; i < ts.length; i++) dts.push(ts[i] - ts[i - 1]);
    const s = dts.slice().sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)))];
    const avg = (ts[ts.length - 1] - ts[0]) / (N - 1);
    resolve({ n: N, avgMs: +avg.toFixed(2), avgFps: +(1000 / avg).toFixed(2), p50Fps: +(1000 / at(50)).toFixed(2),
              p5Fps: +(1000 / at(95)).toFixed(2), p95Ms: +at(95).toFixed(1), worstMs: +s[s.length - 1].toFixed(1) });
  };
  requestAnimationFrame(f);
}))()`;

async function main() {
  const result = { backend: BACKEND, dist: path.relative(ROOT, DIST).replace(/\\/g, "/"),
    viewport: VIEW, measureFrames: MEASURE_FRAMES, startedAt: new Date().toISOString() };
  const srv = await startServer(DIST, PORT);
  const url = `http://127.0.0.1:${srv.port}/`;
  log("[server] " + url + " backend=" + BACKEND);
  result.url = url;
  let chrome = null;
  try {
    const port = 9500 + Math.floor(Math.random() * 400);
    const profile = path.join(os.tmpdir(), `naiwa-fixfps-${BACKEND}-${port}`);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
    mkdirSync(profile, { recursive: true });
    const flags = ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
      "--window-size=1600,1000", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      "--hide-scrollbars", "--mute-audio", "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
      "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"];
    if (BACKEND === "angle") flags.push("--use-angle=d3d11", "--use-gl=angle");
    flags.push("about:blank");
    result.flags = flags.filter((f) => f !== "about:blank");
    const proc = spawn(CHROME, flags, { stdio: "ignore", windowsHide: true });
    let info = null;
    for (let i = 0; i < 80; i++) { await sleep(250); try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { /* wait */ } }
    if (!info) throw new Error("no cdp");
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find((x) => x.type === "page");
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.dpr, mobile: false });
    chrome = { kill: () => { try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ } cdp.close(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ } } };

    await cdp.send("Page.navigate", { url: url + "?bench=" + Date.now() });
    let ok = false;
    for (let i = 0; i < 200; i++) { await sleep(100); try { ok = await ev(cdp, "!!window.__npr"); } catch { /* wait */ } if (ok) break; }
    if (!ok) throw new Error("__npr 未出现");
    await sleep(400);
    // 真实点击（与录制同一路径）；这里只需进战斗，不做 screenshot
    await ev(cdp, `(() => { const b = document.querySelector('#screen-title [data-action="start"]'); b && b.click(); return true; })()`);
    await sleep(500);
    await ev(cdp, `(() => { const b = document.querySelector('#screen-select [data-action="confirm"]'); b && b.click(); return true; })()`);
    await sleep(1600);
    result.screen = await ev(cdp, "(() => window.__npr.screens.current)()");
    result.gpu = await ev(cdp, `(() => { const c = document.createElement("canvas"); const gl = c.getContext("webgl2");
      const e = gl.getExtension("WEBGL_debug_renderer_info");
      return { renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION) }; })()`);
    log("[gpu] " + JSON.stringify(result.gpu) + " screen=" + result.screen);

    log("[warmup] 6s + " + WARMUP_FRAMES + " frames ...");
    await sleep(6000);
    await ev(cdp, FPS(WARMUP_FRAMES), true, 300000);
    const fps = await ev(cdp, FPS(MEASURE_FRAMES), true, 300000);
    result.canvas = await ev(cdp, "(() => { const n = window.__npr; return { canvas: [n.renderer.domElement.width, n.renderer.domElement.height], inner: [innerWidth, innerHeight], dpr: n.renderer.getPixelRatio(), bloom: n.postfx.bloom.enabled, postfx: n.postfx.enabled }; })()");
    result.fps = fps;
    log("[fps] " + JSON.stringify({ canvas: result.canvas, fps }));
  } finally {
    try { chrome && chrome.kill(); } catch { /* noop */ }
    await new Promise((r) => srv.server.close(r));
    result.finishedAt = new Date().toISOString();
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    log("[done] " + OUT);
  }
}
main().then(() => process.exit(0)).catch((e) => { log("[crash] " + (e?.stack || e)); process.exit(1); });