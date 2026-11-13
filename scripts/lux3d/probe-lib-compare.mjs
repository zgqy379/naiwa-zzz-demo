/**
 * 决定性对照（2026-11-13）：同一批**新 IP 奶蛙**角色，分别套
 *   (a) 不播动画（绑定姿势）
 *   (b) 新共享库 A（本轮由 IP 奶蛙 retarget 出来）
 *   (c) 旧共享库 A（上一轮由人形模型 retarget 出来）
 *   (d) 新库 Sword_Regular_A（挥击片段）
 *   (e) 旧库 Sword_Regular_A
 *
 * 用途：判断「共享动画库失效」究竟是
 *   ① 库本身坏了 / 源角色骨架倒置
 *   ② 还是「rest 姿态不匹配」→ 需要逐只重定向（要积分）
 *   ③ 或者旧库（人形模型那份）其实也能驱动 IP 角色（那就零积分解决）
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const OLD = path.join(ROOT, ".lux3d-work", "oldlib");
const OUT = path.join(ROOT, "docs", "evidence", "anim-probe");
mkdirSync(OUT, { recursive: true });

const MIME = { ".html": "text/html", ".js": "application/javascript", ".glb": "model/gltf-binary", ".png": "image/png" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p.startsWith("/three/addons/")) {
    const f = path.join(ROOT, "node_modules", "three", "examples", "jsm", p.slice("/three/addons/".length));
    if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const b = readFileSync(f);
    res.writeHead(200, { "content-type": "application/javascript", "content-length": b.length });
    res.end(b); return;
  }
  if (p.startsWith("/three/")) {
    const f = path.join(ROOT, "node_modules", "three", "build", p.slice("/three/".length));
    if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const b = readFileSync(f);
    res.writeHead(200, { "content-type": "application/javascript", "content-length": b.length });
    res.end(b); return;
  }
  if (p.startsWith("/oldlib/")) {
    const f = path.join(OLD, p.slice("/oldlib/".length));
    if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
    const b = readFileSync(f);
    res.writeHead(200, { "content-type": "model/gltf-binary", "content-length": b.length });
    res.end(b); return;
  }
  if (p === "/") p = "/index.html";
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  const b = readFileSync(f);
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "content-length": b.length });
  res.end(b);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#14161c;color:#dde3ef;font:12px/1.4 "Microsoft YaHei",sans-serif}
h2{margin:8px 10px 2px;font-size:14px;color:#ffd98a}
.row{display:flex;gap:8px;padding:4px 8px 8px}
figure{margin:0}figcaption{padding:3px 2px;font-size:11px}
canvas{display:block;background:#1b1e26;border:1px solid #2c3242;border-radius:6px}
</style>
<script type="importmap">{"imports":{"three":"/three/three.module.js","three/addons/":"/three/addons/"}}</script>
</head><body><div id="all"></div>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const all = document.getElementById("all");
window.__done = 0;
const CHARS = __CHARS__;
const LIBS = __LIBS__;
function draw(container, charGlb, libGlb, clipName, t) {
  const fig = document.createElement("figure");
  const cv = document.createElement("canvas"); cv.width = 300; cv.height = 400;
  const cap = document.createElement("figcaption");
  cap.textContent = (charGlb.split("/").pop().replace("_runtime.glb","")) + (libGlb ? " + " + (libGlb.includes("oldlib") ? "旧库" : "新库") + " " + clipName : " · 绑定姿势");
  fig.appendChild(cv); fig.appendChild(cap);
  container.appendChild(fig);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  r.setSize(300, 400, false);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x1b1e26);
  sc.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 2.6));
  const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(3,5,4); sc.add(k);
  const cam = new THREE.PerspectiveCamera(34, 300/400, 0.05, 100);
  loader.load(charGlb, (gltf) => {
    const root = gltf.scene; sc.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const h = Math.max(size.y, 0.001);
    cam.position.set(h*0.85, h*0.6, h*2.3); cam.lookAt(0, h*0.45, 0);
    if (!libGlb) { r.render(sc, cam); window.__done++; return; }
    loader.load(libGlb, (lib) => {
      const clip = (lib.animations||[]).find(x => x.name === clipName) || (lib.animations||[])[0];
      if (!clip) { r.render(sc, cam); window.__done++; return; }
      const mixer = new THREE.AnimationMixer(root);
      const a = mixer.clipAction(clip); a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play();
      mixer.setTime((clip.duration||1) * t);
      r.render(sc, cam);
      window.__done++;
    }, undefined, () => { r.render(sc, cam); window.__done++; });
  }, undefined, () => { r.render(sc, cam); window.__done++; });
}
for (const c of CHARS) {
  const h = document.createElement("h2"); h.textContent = c.label; all.appendChild(h);
  const row = document.createElement("div"); row.className = "row"; all.appendChild(row);
  draw(row, c.glb, null, "", 0);
  for (const lib of LIBS) draw(row, c.glb, lib.url, lib.clip, 0.35);
}
</script></body></html>`;

const CHARS = [
  { label: "奶豆（IP 蛋形蛙）", glb: "/asset/naiwa_naidou_runtime.glb" },
  { label: "奶兔（IP 蛋形蛙）", glb: "/asset/naiwa_naitu_runtime.glb" },
  { label: "奶蛙（库源角色 · IP）", glb: "/asset/naiwa_laugh_g1_runtime.glb" },
];
const LIBS = [
  { url: "/asset/naiwa_anim_lib.glb", clip: "Idle_Loop" },
  { url: "/oldlib/naiwa_anim_lib_old.glb", clip: "Idle_Loop" },
  { url: "/asset/naiwa_anim_lib.glb", clip: "Sword_Regular_A" },
  { url: "/oldlib/naiwa_anim_lib_old.glb", clip: "Sword_Regular_A" },
];
const html = HTML.replace("__CHARS__", JSON.stringify(CHARS)).replace("__LIBS__", JSON.stringify(LIBS));
writeFileSync(path.join(DIST, "_cmp.html"), html, "utf8");

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

const cport = 9915 + Math.floor(Math.random() * 15);
const profile = path.join(os.tmpdir(), "naiwa-cmp2-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1600,1400", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/_cmp.html` });
  for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 700)); if ((await ev("window.__done")) >= CHARS.length * (LIBS.length + 1)) break; }
  await new Promise((r) => setTimeout(r, 2000));
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const out = path.join(OUT, "cmp-newlib-vs-oldlib.png");
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("对照图 → " + out + "  (done=" + (await ev("window.__done")) + ")");
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
