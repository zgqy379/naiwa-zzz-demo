/**
 * 环境 rAF 天花板测试（只读）：在**同一浏览器会话**里先测 about:blank 空页的 rAF 帧率，
 * 再测游戏页 rAF 帧率。若空页也只有 ~10fps，说明低帧率来自浏览器/远程显示会话的帧调度，
 * 而不是交付物本身。
 */
import { existsSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(HERE, "v3-run-raf-ceiling-20261110.log");
const OUT = path.join(HERE, "v3-run-raf-ceiling-20261110.json");
try { writeFileSync(LOG_PATH, ""); } catch {}
const log = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n"; try { appendFileSync(LOG_PATH, s); } catch {} try { process.stdout.write(s); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));

class CDP {
  constructor(ws) { this.id = 0; this.pending = new Map(); this.ws = new WebSocket(ws); this.ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } }; }
  ready() { return new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  close() { try { this.ws.close(); } catch {} }
}
async function ev(cdp, expr, awaitP = false) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: awaitP, timeout: 60000 });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}
const RAF = (N) => `(() => new Promise((resolve) => {
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

async function run(tag, extra) {
  const port = 9800 + Math.floor(Math.random() * 90);
  const profile = path.join(os.tmpdir(), "naiwa-rafceiling-" + tag + "-" + port);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  mkdirSync(profile, { recursive: true });
  const headful = tag.includes("headful");
  const proc = spawn(CHROME, [...(headful ? [] : ["--headless=new"]), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--window-size=1600,1000", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--mute-audio", "--hide-scrollbars", "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "--enable-gpu", "--ignore-gpu-blocklist", ...(extra || []), "about:blank"], { stdio: "ignore", windowsHide: true });
  try {
    let info = null;
    for (let i = 0; i < 80; i++) { await sleep(250); try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch {} }
    if (!info) throw new Error("no cdp " + tag);
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const cdp = new CDP(list.find((x) => x.type === "page").webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1.25, mobile: false });
    await cdp.send("Page.navigate", { url: "about:blank" });
    await sleep(1500);
    const blank = await ev(cdp, RAF(120), true);
    const blankHeavy = await ev(cdp, `(() => new Promise((resolve) => {
      // 空页但每帧跑 20ms 忙等：区分「调度上限」与「CPU 忙」
      const ts = [];
      const f = (t) => { const until = performance.now() + 20; while (performance.now() < until) {} ts.push(t);
        if (ts.length < 120) requestAnimationFrame(f); else {
          const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
          const avg = (ts[ts.length - 1] - ts[0]) / (ts.length - 1);
          resolve({ avgFps: +(1000 / avg).toFixed(2), worstMs: +Math.max(...d).toFixed(1) }); } };
      requestAnimationFrame(f);
    }))()`, true);
    const canvasPresent = await ev(cdp, `(() => new Promise((resolve) => {
      // 2000×1250 WebGL 画布纯清屏：只测「画布上屏/呈现」通道
      const c = document.createElement("canvas"); c.width = 2000; c.height = 1250;
      c.style.position = "fixed"; c.style.left = "0"; c.style.top = "0"; c.style.zIndex = "1";
      document.body.appendChild(c);
      const gl = c.getContext("webgl2", { antialias: false, alpha: false });
      const ts = [];
      const f = (t) => { gl.clearColor(0.1, 0.2, 0.3, 1); gl.clear(gl.COLOR_BUFFER_BIT); ts.push(t);
        if (ts.length < 120) requestAnimationFrame(f); else {
          const avg = (ts[ts.length - 1] - ts[0]) / (ts.length - 1);
          resolve({ avgFps: +(1000 / avg).toFixed(2), worstMs: +Math.max(...ts.slice(1).map((x, i) => x - ts[i])).toFixed(1) });
        } };
      requestAnimationFrame(f);
    }))()`, true);
    log("[" + tag + "] canvas2000x1250-present=" + JSON.stringify(canvasPresent));
    return { tag, blank, blankBusy20ms: blankHeavy, canvasPresent };
  } finally {
    try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch {}
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  const out = { runs: [] };
  for (const [tag, extra] of [
    ["headless", []],
    ["headless-noframelimit", ["--disable-frame-rate-limit", "--disable-gpu-vsync"]],
    ["headful", []],
  ]) {
    try { out.runs.push(await run(tag, extra)); } catch (e) { out.runs.push({ tag, error: String(e?.message || e) }); log("[" + tag + "] error " + String(e?.message || e)); }
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  log("[done] " + OUT);
}
main().then(() => process.exit(0)).catch((e) => { log("[crash] " + (e?.stack || e)); process.exit(1); });