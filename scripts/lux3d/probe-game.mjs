/**
 * 游戏内验证：角色到底有没有真的动起来（骨骼动画是否接管）。
 *
 * 走真实构建产物：加载 dist/ → 进战斗 → 读动画层状态（有 clips？当前动作？）
 * → 触发一次攻击并连拍若干帧，落到 docs/evidence/ 下人工看。
 *
 * 用法：node scripts/lux3d/probe-game.mjs [--out docs/evidence/anim-probe]
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = arg("out", path.join(ROOT, "docs", "evidence", "anim-probe"));

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".mp4": "video/mp4", ".woff2": "font/woff2", ".txt": "text/plain" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  const st = statSync(f);
  const type = MIME[path.extname(f)] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    res.end(readFileSync(f).subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" });
  res.end(readFileSync(f));
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

const cport = 9840 + Math.floor(Math.random() * 120);
const profile = path.join(os.tmpdir(), "naiwa-gp-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1400,900", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore", windowsHide: true });
let ver = null;
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { ver = await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (file) => { const s = await cdp.send("Page.captureScreenshot", { format: "png" }); writeFileSync(file, Buffer.from(s.data, "base64")); return file; };

mkdirSync(OUT, { recursive: true });
try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 40; i++) { await sleep(500); if (await ev("!!window.__npr")) break; }
  await sleep(2500);
  await ev(`document.querySelector('[data-action="start"]')?.click(); true`);
  await sleep(4000);
  await ev(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await sleep(4000);

  const state = await ev(`(() => {
    const n = window.__npr;
    const m = n?.squad?.active;
    const d = m?.anim?.clips;
    return {
      app: !!n, screen: n?.screens?.current ?? null, phase: n?.battle?.phase ?? null,
      hasClips: !!m?.anim?.hasClips,
      clipCount: d ? d.byName.size : 0,
      clipNames: d ? [...d.byName.keys()].slice(0, 14) : [],
      action: m?.anim?.action ?? null,
      activeName: m?.name ?? null,
    };
  })()`);
  console.log("游戏内状态 =", JSON.stringify(state, null, 1));

  // 攻击是「按下起手 → 松手结算」（onAttackInput 起 charge，onAttackRelease 出招）
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); true`);
  await sleep(90);
  await ev(`window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })); true`);
  for (let i = 0; i < 12; i++) {
    await sleep(70);
    const act = await ev(`(() => {
      const n = window.__npr;
      const a = n?.squad?.active?.anim;
      const combo = n?.combo;
      return {
        action: a?.action, clip: a?.clips?.currentAction ?? null, t: +(a?.actionT?.toFixed?.(2) ?? 0),
        comboIn: !!combo?.isInCombo, stage: combo?.stageIndex ?? -1, count: combo?.count ?? -1,
        oppHp: Math.round(n?.opponent?.hp ?? -1),
        weapon: (() => { const w = n?.__weaponTip?.(); return w ? [ +w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2) ] : null; })(),
      };
    })()`);
    console.log(`  帧${i} =`, JSON.stringify(act));
    if (i === 2) await shot(path.join(OUT, "attack-mid.png"));
  }
} catch (e) {
  console.error("ERR:", e);
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
  console.log("输出目录:", OUT);
}
