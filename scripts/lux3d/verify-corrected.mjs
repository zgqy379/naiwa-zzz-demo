/**
 * 验证 rest-姿态校正的结果：每只角色用**自己 GLB 里的片段**渲染若干关键帧，
 * 检查是否站直、姿态是否合理（大动作片段跨角色最容易暴露错位）。
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
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
.row{display:flex;gap:6px;padding:4px 8px 8px;flex-wrap:wrap}
figure{margin:0}figcaption{padding:3px 2px;font-size:11px;max-width:220px}
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
function draw(container, charGlb, clipName, t, label) {
  const fig = document.createElement("figure");
  const cv = document.createElement("canvas"); cv.width = 220; cv.height = 300;
  const cap = document.createElement("figcaption"); cap.textContent = label;
  fig.appendChild(cv); fig.appendChild(cap);
  container.appendChild(fig);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  r.setSize(220, 300, false);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x1b1e26);
  sc.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 2.6));
  const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(3,5,4); sc.add(k);
  const cam = new THREE.PerspectiveCamera(34, 220/300, 0.05, 100);
  const finish = () => { r.render(sc, cam); window.__done++; };
  loader.load(charGlb, (gltf) => {
    const root = gltf.scene; sc.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const h = Math.max(size.y, 0.001);
    cam.position.set(h*0.85, h*0.6, h*2.3); cam.lookAt(0, h*0.45, 0);
    if (!clipName) { finish(); return; }
    const clip = (gltf.animations||[]).find(x => x.name === clipName);
    if (!clip) { finish(); return; }
    const mixer = new THREE.AnimationMixer(root);
    const a = mixer.clipAction(clip); a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play();
    mixer.setTime((clip.duration||1) * t);
    finish();
  }, undefined, finish);
}
const CHARS = __CHARS__;
const CLIPS = __CLIPS__;
for (const c of CHARS) {
  const h = document.createElement("h2"); h.textContent = c.label; all.appendChild(h);
  const row = document.createElement("div"); row.className = "row"; all.appendChild(row);
  for (const cl of CLIPS) draw(row, c.glb, cl.name, cl.t, cl.label);
}
</script></body></html>`;

const CHARS = [
  { label: "奶蛙（库源角色）", glb: "/asset/naiwa_laugh_g1_runtime.glb" },
  { label: "奶豆", glb: "/asset/naiwa_naidou_runtime.glb" },
  { label: "奶兔", glb: "/asset/naiwa_naitu_runtime.glb" },
  { label: "西格玛奶蛙", glb: "/asset/naiwa_xigema_runtime.glb" },
];
const CLIPS = [
  { name: null, t: 0, label: "绑定姿势" },
  { name: "Idle_Loop", t: 0.35, label: "Idle_Loop" },
  { name: "Sword_Regular_A", t: 0.45, label: "Sword_Regular_A" },
  { name: "Sword_Regular_B", t: 0.55, label: "Sword_Regular_B" },
];
const html = HTML.replace("__CHARS__", JSON.stringify(CHARS)).replace("__CLIPS__", JSON.stringify(CLIPS));
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

const cport = 9895 + Math.floor(Math.random() * 10);
const profile = path.join(os.tmpdir(), "naiwa-fixv-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1000,1400", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/_cmp.html` });
  const total = CHARS.length * CLIPS.length;
  for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 700)); if ((await ev("window.__done")) >= total) break; }
  await new Promise((r) => setTimeout(r, 2000));
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const out = path.join(OUT, "cmp-corrected-clips.png");
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("验证图 → " + out + " (done=" + (await ev("window.__done")) + "/" + total + ")");
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
