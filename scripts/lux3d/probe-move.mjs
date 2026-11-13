/** 复现「WASD 移动生效」用例并打印全过程（定位投影符号为正的原因）。 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".mp4": "video/mp4", ".wav": "audio/wav", ".woff2": "font/woff2", ".txt": "text/plain" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  const b = readFileSync(f);
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Content-Length": b.length });
  res.end(b);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

class CDP {
  constructor(ws) {
    this.id = 0; this.pending = new Map();
    this.ws = new WebSocket(ws);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    };
  }
  ready() { return new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej })); }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

const cport = 9865 + Math.floor(Math.random() * 10);
const profile = path.join(os.tmpdir(), "naiwa-mv-" + cport + "-" + Date.now());
const { mkdirSync } = await import("node:fs");
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1400,900", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = `(() => {
  const n = window.__npr;
  const mv = n?.squad?.active?.move;
  const c = n?.camera;
  c?.updateMatrixWorld?.();
  const e = c?.matrixWorld?.elements;
  const right = e ? { x: e[0] / (Math.hypot(e[0], e[2]) || 1), z: e[2] / (Math.hypot(e[0], e[2]) || 1) } : null;
  return {
    pos: mv ? [+mv.pos.x.toFixed(3), +mv.pos.z.toFixed(3)] : null,
    vel: mv ? [+mv.vel.x.toFixed(3), +mv.vel.z.toFixed(3)] : null,
    action: n?.squad?.active?.anim?.action ?? null,
    phase: n?.battle?.phase ?? null,
    freezeT: +(n?.battle?.freezeT ?? 0).toFixed(3),
    oppState: n?.battle?.oppState ?? null,
    oppHp: n?.opponent?.hp ?? null,
    pHp: n?.squad?.active?.hp ?? null,
    right,
    camPos: c ? [+c.position.x.toFixed(2), +c.position.y.toFixed(2), +c.position.z.toFixed(2)] : null,
    keys: (n?.chargeState?.().keys ?? []).join(","),
    noAI: n?.debugNoOpponentAI === true,
  };
})()`;

try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 60; i++) { await sleep(500); if (await ev("!!window.__npr")) break; }
  await sleep(2500);
  await ev(`document.querySelector('[data-action="start"]')?.click(); true`);
  await sleep(5000);
  await ev(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await sleep(5000);

  console.log("初始: " + JSON.stringify(await ev(STATE)));

  // 复刻用例：冻结 AI + 播种到 4.4
  await ev(`(() => { window.__npr.debugNoOpponentAI = true; const mv = window.__npr.squad.active.move; mv.pos.set(4.4, 0, 0); mv.vel.set(0, 0, 0); return true; })()`);
  await sleep(1500);
  console.log("播种后: " + JSON.stringify(await ev(STATE)));

  const before = await ev(STATE);
  await ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true })); true`);
  for (let i = 0; i < 8; i++) {
    await sleep(300);
    const s = await ev(STATE);
    const dx = s.pos[0] - before.pos[0], dz = s.pos[1] - before.pos[1];
    const proj = dx * s.right.x + dz * s.right.z;
    console.log(`  +${(i + 1) * 300}ms  pos=${JSON.stringify(s.pos)} vel=${JSON.stringify(s.vel)} Δ=(${dx.toFixed(3)}, ${dz.toFixed(3)})  proj=${proj.toFixed(3)}  action=${s.action} keys=${s.keys} phase=${s.phase}`);
  }
  await ev(`window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", bubbles: true })); true`);
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
