/** 抓「对手出招」的实拍连拍（前摇闪光 → 挥击 → 命中），存成 filmstrip 证据。 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "docs", "evidence", "feel");
mkdirSync(OUT, { recursive: true });

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

const cport = 9855 + Math.floor(Math.random() * 10);
const profile = path.join(os.tmpdir(), "naiwa-film-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1200,700", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (f) => { const s = await cdp.send("Page.captureScreenshot", { format: "png" }); writeFileSync(f, Buffer.from(s.data, "base64")); };

const ST = `(() => { const n = window.__npr; return { st: n?.battle?.oppState ?? null, oa: n?.opponentAnim?.action ?? null, pw: n?.battle?.oppAttackWindup ?? 0, pHp: n?.squad?.active?.hp ?? 0 }; })()`;

try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 60; i++) { await sleep(500); if (await ev("!!window.__npr")) break; }
  await sleep(2500);
  await ev(`document.querySelector('[data-action="start"]')?.click(); true`);
  await sleep(5000);
  await ev(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await sleep(4000);

  // 边打边拍：抓对手 windup / strike 的瞬间
  const shots = [];
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); true`);
  for (let i = 0; i < 40; i++) {
    await sleep(160);
    const s = await ev(ST);
    const tag = `${String(i).padStart(2, "0")}-${s.st}-${s.oa}`;
    if (s.st === "windup" || s.st === "windup2" || s.st === "strike" || s.oa === "attack1") {
      const f = path.join(OUT, `film-${tag}.png`);
      await shot(f);
      shots.push({ file: path.basename(f), ...s });
    }
  }
  console.log("抓到 " + shots.length + " 张：");
  shots.forEach((s) => console.log("  " + s.file + "  st=" + s.st + " oppAct=" + s.oa + " pHp=" + s.pHp));
  writeFileSync(path.join(OUT, "film-list.json"), JSON.stringify(shots, null, 1), "utf8");
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
