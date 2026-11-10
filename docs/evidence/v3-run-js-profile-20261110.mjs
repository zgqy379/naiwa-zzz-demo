/**
 * 主线程帧耗时画像（只读）：把 rAF 回调包一层计时，量「每帧 JS 占主线程多久」，
 * 再单独给 __npr 暴露的子系统（squad.step / anim.step / move.step）计时，判断 100ms 级卡顿归属。
 *
 * 不改任何源码/配置；包装在测完复原。产物落 docs/evidence/。
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(HERE, "v3-run-js-profile-20261110.json");
const LOG_PATH = path.join(HERE, "v3-run-js-profile-20261110.log");
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

async function main() {
  const result = {};
  const srv = await startServer(DIST, [5303, 5304]);
  const url = `http://127.0.0.1:${srv.port}/`;
  let chrome = null;
  try {
    const port = 9600 + Math.floor(Math.random() * 90);
    const profile = path.join(os.tmpdir(), "naiwa-jsprof-" + port);
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
    await cdp.send("Page.navigate", { url: url + "?j=" + Date.now() });
    for (let i = 0; i < 200; i++) { await sleep(100); try { if (await ev(cdp, "!!window.__npr")) break; } catch {} }
    await sleep(400);
    await ev(cdp, `(() => { document.querySelector('#screen-title [data-action="start"]')?.click(); return true; })()`);
    await sleep(400);
    await ev(cdp, `(() => { document.querySelector('#screen-select [data-action="confirm"]')?.click(); return true; })()`);
    await sleep(6000);
    result.screen = await ev(cdp, "(() => window.__npr.screens.current)()");

    // 1) rAF 回调计时（包一层，只读）
    result.installed = await ev(cdp, `(() => {
      if (window.__prof) return "exists";
      window.__prof = { js: [], gap: [] };
      const orig = window.requestAnimationFrame.bind(window);
      window.__profOrigRaf = orig;
      let lastEnd = 0;
      window.requestAnimationFrame = function (cb) {
        return orig(function (t) {
          const s = performance.now();
          if (lastEnd) window.__prof.gap.push(+(s - lastEnd).toFixed(2));
          try { return cb(t); } finally { window.__prof.js.push(+(performance.now() - s).toFixed(2)); lastEnd = performance.now(); }
        });
      };
      return "installed";
    })()`);
    await sleep(12000); // 至少 40+ 帧（低帧率下按时间等）
    result.frameProfile = await ev(cdp, `(() => {
      const p = window.__prof;
      const s = p.js.slice(-60), g = p.gap.slice(-60);
      const stat = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y);
        const at = (q) => a[Math.min(a.length - 1, Math.floor((q / 100) * a.length))];
        return { n: a.length, avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p50: +at(50).toFixed(2), p95: +at(95).toFixed(2), max: +a[a.length - 1].toFixed(2) }; };
      return { jsMs: stat(s), gapMs: stat(g), frames: p.js.length };
    })()`);
    log("[frameProfile] " + JSON.stringify(result.frameProfile));

    // 2) 子系统单次调用耗时（各 40 次取均值）
    result.subsystems = await ev(cdp, `(() => {
      const n = window.__npr; const out = {};
      const bench = (label, fn) => { const t0 = performance.now(); for (let i = 0; i < 40; i++) fn(); out[label] = +((performance.now() - t0) / 40).toFixed(3); };
      const a = n.squad.active;
      bench("squad.step", () => n.squad.step(0.016));
      bench("active.anim.step", () => a.anim.step(0.016));
      bench("active.move.step", () => a.move.step({ move: { x: 0, y: 0 }, jump: false, dodge: false }, 0.016));
      bench("hudNotExposed_skip", () => {});
      bench("opponentAnim.step", () => n.opponentAnim.step(0.016));
      bench("postfx.render", () => n.postfx.render(0.016));
      bench("renderer.render", () => n.renderer.render(n.scene, n.camera));
      return out;
    })()`);
    log("[subsystems] " + JSON.stringify(result.subsystems));

    // 复原 rAF
    result.restored = await ev(cdp, "(() => { if (window.__profOrigRaf) window.requestAnimationFrame = window.__profOrigRaf; return true; })()");
  } finally {
    try { chrome && chrome.kill(); } catch {}
    await new Promise((r) => srv.server.close(r));
    writeFileSync(OUT, JSON.stringify(result, null, 2));
    log("[done] " + OUT);
  }
}
main().then(() => process.exit(0)).catch((e) => { log("[crash] " + (e?.stack || e)); process.exit(1); });