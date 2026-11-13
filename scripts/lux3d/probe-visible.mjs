/** 诊断：战斗里角色为什么不见了 —— 相机 / 角色世界变换 / 网格包围盒 / 材质。 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "docs", "evidence", "anim-probe");
mkdirSync(OUT, { recursive: true });

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".mp4": "video/mp4", ".wav": "audio/wav", ".woff2": "font/woff2", ".txt": "text/plain" };
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

const cport = 9885 + Math.floor(Math.random() * 10);
const profile = path.join(os.tmpdir(), "naiwa-vis-" + cport + "-" + Date.now());
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
const shot = async (f) => { const s = await cdp.send("Page.captureScreenshot", { format: "png" }); writeFileSync(f, Buffer.from(s.data, "base64")); };

const DUMP = `(() => {
  const n = window.__npr;
  const V3 = n.camera.position.constructor;
  const a = n.squad.active;
  const g = a.group;
  const w = g.getObjectByName("model-wrapper");
  const meshes = [];
  w?.traverse((c) => {
    if (!c.isMesh) return;
    const wp = new V3(); c.getWorldPosition(wp);
    const ws = new V3(); c.getWorldScale(ws);
    let bb = null;
    if (c.isSkinnedMesh && c.boundingBox) {
      const b = c.boundingBox;
      bb = [+b.min.y.toFixed(3), +b.max.y.toFixed(3)];
    }
    meshes.push({
      name: c.name || "(anon)", type: c.type, mat: c.material?.type, visible: c.visible,
      world: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)],
      scale: [+ws.x.toFixed(3), +ws.y.toFixed(3), +ws.z.toFixed(3)],
      skinBB: bb, outline: !!c.userData.__isOutline,
    });
  });
  const gw = new V3(); g.getWorldPosition(gw);
  const cam = n.camera;
  const dir = new V3(); cam.getWorldDirection(dir);
  return {
    screen: n.screens?.current, phase: n.battle?.phase,
    activeName: a.name,
    hasClips: !!a.anim?.hasClips, clipCount: a.anim?.clips?.byName?.size ?? 0,
    groupWorld: [+gw.x.toFixed(2), +gw.y.toFixed(2), +gw.z.toFixed(2)],
    wrapperScale: w ? [+w.scale.x.toFixed(4), +w.scale.y.toFixed(4), +w.scale.z.toFixed(4)] : null,
    wrapperPos: w ? [+w.position.x.toFixed(3), +w.position.y.toFixed(3), +w.position.z.toFixed(3)] : null,
    camPos: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
    camDir: [+dir.x.toFixed(2), +dir.y.toFixed(2), +dir.z.toFixed(2)],
    meshes,
  };
})()`;

try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 40; i++) { await sleep(500); if (await ev("!!window.__npr")) break; }
  await sleep(2500);
  await ev(`document.querySelector('[data-action="start"]')?.click(); true`);
  await sleep(5000);
  await ev(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await sleep(8000);
  const d = await ev(DUMP);
  console.log(JSON.stringify(d, null, 1));
  await shot(path.join(OUT, "vis-battle.png"));
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
