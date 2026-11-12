/**
 * 探针：修完「描边宽度单位」与「武器尺寸」之后的自检。
 * 输出：描边壳的 uWidth（局部单位）、描边壳的世界缩放、武器的世界包围盒、角色世界高度。
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "docs", "evidence", "anim-probe");
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

const cport = 9920 + Math.floor(Math.random() * 20);
const profile = path.join(os.tmpdir(), "naiwa-fix-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
mkdirSync(OUT, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1400,900", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
let ver = null;
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { ver = await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (f) => { const s = await cdp.send("Page.captureScreenshot", { format: "png" }); writeFileSync(f, Buffer.from(s.data, "base64")); };

const DUMP = `(() => {
  const n = window.__npr;
  const V3 = n.camera.position.constructor;
  const out = [];
  const active = n.squad.active;
  const w = active.group.getObjectByName("model-wrapper");
  // 描边壳
  let outline = null;
  w.traverse((c) => { if (c.userData.__isOutline && !outline) outline = c; });
  const oScale = outline ? (() => { const v = new V3(); outline.getWorldScale(v); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; })() : null;
  // 武器（手骨下的非骨骼 mesh）
  let weapon = null, hand = null;
  w.traverse((c) => {
    if (/RightHand$/i.test(c.name) && !c.isMesh && !hand) hand = c;
  });
  const wbb = { min: null, max: null };
  w.traverse((c) => {
    if (!c.isMesh || c.userData.__isOutline) return;
    let p = c, chain = [];
    while (p && p !== n.scene) { chain.unshift(p.name || p.type); p = p.parent; }
    const cc = chain.join("/");
    if (!/RightHand/i.test(cc)) return;
    if (c.isSkinnedMesh) return;
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    const g = c.geometry.boundingBox;
    const tmp = new V3();
    let mn = Infinity, mx = -Infinity, mnx = Infinity, mxx = -Infinity;
    for (const sx of [g.min.x, g.max.x]) for (const sy of [g.min.y, g.max.y]) for (const sz of [g.min.z, g.max.z]) {
      tmp.set(sx, sy, sz).applyMatrix4(c.matrixWorld);
      mn = Math.min(mn, tmp.y); mx = Math.max(mx, tmp.y);
      mnx = Math.min(mnx, tmp.x); mxx = Math.max(mxx, tmp.x);
    }
    if (!isFinite(mn)) return;
    if (!weapon) weapon = { chain: cc.slice(0, 110), h: +(mx - mn).toFixed(3), w: +(mxx - mnx).toFixed(3), scale: [+c.scale.x.toFixed(3), +c.scale.y.toFixed(3), +c.scale.z.toFixed(3)] };
  });
  const handScale = hand ? (() => { const v = new V3(); hand.getWorldScale(v); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; })() : null;
  return {
    wrapperScale: +w.scale.x.toFixed(4),
    outlineUWidth: outline?.material?.uniforms?.uWidth?.value ?? null,
    outlineWorldScale: oScale,
    handName: hand?.name ?? null,
    handWorldScale: handScale,
    weapon,
  };
})()`;

try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 40; i++) { await sleep(500); if (await ev("!!window.__npr")) break; }
  await sleep(2500);
  await ev(`document.querySelector('[data-action="start"]')?.click(); true`);
  await sleep(5000);
  await ev(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await sleep(7000);
  console.log(JSON.stringify(await ev(DUMP), null, 1));
  // 攻击帧（举起武器）看武器是否可见
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })); true`);
  await sleep(120);
  await ev(`window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })); true`);
  await sleep(260);
  await shot(path.join(OUT, "fix-attack.png"));
  await sleep(1500);
  await shot(path.join(OUT, "fix-npr.png"));
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', bubbles: true })); true`);
  await sleep(1500);
  await shot(path.join(OUT, "fix-pbr.png"));
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
