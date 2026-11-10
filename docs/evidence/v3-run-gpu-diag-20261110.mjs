/**
 * GPU / fps 诊断（只读）：判断 3.3fps 是 headless 软件光栅（SwiftShader）还是真实性能问题。
 *
 * 两轮：
 *  A) 与 v3-run-driver 完全相同的 Chrome 参数（--headless=new + --enable-gpu）
 *  B) 追加 --use-angle=d3d11（尝试走硬件 D3D11 后端）
 * 每轮读：WEBGL_debug_renderer_info 的 vendor/renderer、同分辨率 fps、缩到 800×625(dpr1) 的 fps。
 * 不改 dist/src，仅读；产物落 docs/evidence/。
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DIST = path.join(ROOT, "dist");
const HOST = "127.0.0.1";
const LOG_PATH = path.join(HERE, "v3-run-gpu-diag-20261110.log");
const OUT = path.join(HERE, "v3-run-gpu-diag-20261110.json");
try { writeFileSync(LOG_PATH, ""); } catch {}
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n"; try { appendFileSync(LOG_PATH, s); } catch {} try { process.stdout.write(s); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p));

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".glb": "model/gltf-binary", ".png": "image/png", ".json": "application/json" };

function startServer(root, ports) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
        const clean = p === "/" ? "/index.html" : p;
        const file = path.join(root, path.normalize(clean).replace(/^([/\\])+/, ""));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("nf"); return; }
        res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
        createReadStream(file).pipe(res);
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    const tryListen = (i) => {
      const port = ports[i];
      server.once("error", (err) => {
        if (err.code === "EADDRINUSE" && i + 1 < ports.length) tryListen(i + 1); else reject(err);
      });
      server.listen(port, HOST, () => resolve({ server, port }));
    };
    tryListen(0);
  });
}

class CDP {
  constructor(ws) { this.id = 0; this.pending = new Map(); this.events = new Map(); this.ws = new WebSocket(ws); this.ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } else if (m.method) for (const f of this.events.get(m.method) || []) f(m.params); }; }
  ready() { return new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  close() { try { this.ws.close(); } catch {} }
}
async function ev(cdp, expr, awaitP = false) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: awaitP, timeout: 60000 });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}

const FPS_EXPR = (N) => `(() => new Promise((resolve) => {
  const ts = [];
  const f = (t) => { ts.push(t); if (ts.length < ${N}) { requestAnimationFrame(f); return; }
    const dts = []; for (let i = 1; i < ts.length; i++) dts.push(ts[i] - ts[i - 1]);
    const s = dts.slice().sort((a, b) => a - b);
    const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)))];
    const avg = (ts[ts.length - 1] - ts[0]) / (${N} - 1);
    resolve({ frames: ${N}, avgMs: +avg.toFixed(2), avgFps: +(1000 / avg).toFixed(2), p5Fps: +(1000 / at(95)).toFixed(2), p50Fps: +(1000 / at(50)).toFixed(2), worstMs: +s[s.length - 1].toFixed(1) });
  };
  requestAnimationFrame(f);
}))()`;

async function launch(extraArgs, tag) {
  const port = 9500 + Math.floor(Math.random() * 400);
  const profile = path.join(os.tmpdir(), "naiwa-gpu-diag-" + tag + "-" + port);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  mkdirSync(profile, { recursive: true });
  const args = ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--window-size=1600,1000", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--mute-audio", "--hide-scrollbars", "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization", ...extraArgs, "about:blank"];
  const proc = spawn(CHROME, args, { stdio: "ignore", windowsHide: true });
  let t = null;
  for (let i = 0; i < 80; i++) { await sleep(250); try { t = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch {} }
  if (!t) throw new Error("no cdp " + tag);
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((x) => x.type === "page");
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable"); await cdp.send("Network.enable");
  return {
    cdp, browserVersion: t.Browser, tag, args,
    kill: () => { try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch {} cdp.close(); try { rmSync(profile, { recursive: true, force: true }); } catch {} },
  };
}

async function main() {
  const result = { rounds: [] };
  const srv = await startServer(DIST, [5295, 5296]);
  const url = `http://${HOST}:${srv.port}/`;
  log("[server] " + url);
  try {
    for (const [tag, extra] of [["default", []], ["angle-d3d11", ["--use-angle=d3d11", "--use-gl=angle"]]]) {
      let chrome = null;
      const round = { tag, extra };
      try {
        chrome = await launch(extra, tag);
        const cdp = chrome.cdp;
        round.browserVersion = chrome.browserVersion;
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1.25, mobile: false });
        await cdp.send("Page.navigate", { url: url + "?t=" + Date.now() });
        let ok = false;
        for (let i = 0; i < 200; i++) { await sleep(100); try { ok = await ev(cdp, "!!window.__npr"); } catch {} if (ok) break; }
        round.nprSeen = ok;
        await sleep(2500);
        round.gpu = await ev(cdp, `(() => {
          const c = document.createElement("canvas");
          const gl = c.getContext("webgl2") || c.getContext("webgl");
          if (!gl) return { gl: null };
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          return {
            version: gl.getParameter(gl.VERSION),
            vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
            renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          };
        })()`);
        round.fpsFull = await ev(cdp, FPS_EXPR(60), true);
        log("[" + tag + "] gpu=" + JSON.stringify(round.gpu) + " fpsFull=" + JSON.stringify(round.fpsFull));
        // 缩到 800×625 dpr1（像素量 1/5），看是否填充率瓶颈
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: 800, height: 500, deviceScaleFactor: 1, mobile: false });
        await sleep(1200);
        round.fpsSmall = await ev(cdp, FPS_EXPR(60), true);
        round.canvasAfterResize = await ev(cdp, "(() => { const n = window.__npr; return { canvas: [n.renderer.domElement.width, n.renderer.domElement.height], inner: [innerWidth, innerHeight], dpr: n.renderer.getPixelRatio() }; })()");
        log("[" + tag + "] fpsSmall=" + JSON.stringify(round.fpsSmall) + " canvas=" + JSON.stringify(round.canvasAfterResize));
      } catch (e) {
        round.fatal = String(e && e.stack || e);
        log("[" + tag + "] fatal " + round.fatal);
      } finally {
        try { chrome && chrome.kill(); } catch {}
      }
      result.rounds.push(round);
    }
  } finally {
    await new Promise((r) => srv.server.close(r));
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    log("[done] " + OUT);
  }
}
main().then(() => process.exit(0)).catch((e) => { log("[crash] " + (e?.stack || e)); process.exit(1); });