/**
 * 探针：角色归一化系数的确定性核查。
 *
 * 背景：ensureSquadModels 里 `const box = new THREE.Box3().setFromObject(wrapper)`
 *   → `const s = member.scale / size.y`。对 SkinnedMesh，three.js 的
 *   `SkinnedMesh.computeBoundingBox()` 用的是**蒙皮后**的顶点位置
 *   （依赖骨骼 matrixWorld 是否已更新），于是 size.y 会随「模型加载那一刻」
 *   的骨骼矩阵状态漂移 → 角色世界尺寸在 1.05 m 附近乱跳（实测 E2E 里大了约 3 倍）。
 *
 * 本探针同时测三种口径：
 *   A) setFromObject（现状）
 *   B) 几何体包围盒 × 世界矩阵（绑定姿势，确定性）
 *   C) 角色最终世界高度（应当 ≈ member.scale）
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
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

const cport = 9940 + Math.floor(Math.random() * 20);
const profile = path.join(os.tmpdir(), "naiwa-scale-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1200,800", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
let ver = null;
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { ver = await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DUMP = `(() => {
  const n = window.__npr;
  const V3 = n.camera.position.constructor;
  const out = [];
  for (const m of n.squad.members) {
    const w = m.group.getObjectByName("model-wrapper");
    if (!w) continue;
    const s = w.scale.x;
    // 代码里的归一化：s = member.scale / size.y * visualScale  →  反推 size.y
    const sizeYA = (m.scale * (m.visualScale || 1)) / (s || 1);
    // B) 几何体包围盒 × 世界矩阵（绑定姿势，确定性）
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    w.updateWorldMatrix(true, true);
    const tmp = new V3();
    w.traverse((c) => {
      if (!c.isMesh || !c.geometry?.attributes?.position) return;
      c.geometry.computeBoundingBox();
      const bb = c.geometry.boundingBox;
      for (const sx of [bb.min.x, bb.max.x]) for (const sy of [bb.min.y, bb.max.y]) for (const sz of [bb.min.z, bb.max.z]) {
        tmp.set(sx, sy, sz).applyMatrix4(c.matrixWorld);
        minX = Math.min(minX, tmp.x); maxX = Math.max(maxX, tmp.x);
        minY = Math.min(minY, tmp.y); maxY = Math.max(maxY, tmp.y);
      }
    });
    const restH = maxY - minY;
    out.push({
      id: m.id, memberScale: m.scale, visualScale: m.visualScale,
      wrapperScale: +s.toFixed(4),
      sizeY_used_by_code: +sizeYA.toFixed(4),
      restPoseWorldH: +restH.toFixed(4),
      correctS_fromRest: +(m.scale * (m.visualScale || 1) / (restH || 1)).toFixed(4),
      worldHeightNow: +(restH * s).toFixed(4),
    });
  }
  return out;
})()`;

try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 40; i++) { await sleep(500); if (await ev("!!window.__npr")) break; }
  await sleep(2000);
  await ev(`document.querySelector('[data-action="start"]')?.click(); true`);
  await sleep(4000);
  await ev(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await sleep(6000);
  const d = await ev(DUMP);
  console.log(JSON.stringify(d, null, 1));
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
