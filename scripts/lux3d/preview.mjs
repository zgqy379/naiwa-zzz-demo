/**
 * GLB 姿态预览：把带骨骼动画的 GLB 放进 three.js，逐个动画片段截图。
 * 用于人工审片（生成角色的姿态/比例/动作是否可读）。
 *
 * 用法：node scripts/lux3d/preview.mjs <file.glb> [--out docs/evidence/lux3d-preview] [--cols 2]
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const argv = process.argv.slice(2);
const file = argv[0];
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = arg("out", path.join(ROOT, "docs", "evidence", "lux3d-preview"));
const COLS = Number(arg("cols", 2));
if (!file || !existsSync(file)) { console.error("用法：node scripts/lux3d/preview.mjs <file.glb> [--out 目录]"); process.exit(1); }

const THREE_DIR = path.join(ROOT, "node_modules", "three");
const MIME = { ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".wasm": "application/wasm" };

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#15171d;overflow:hidden}
canvas{display:block}
#hud{position:fixed;left:8px;top:8px;color:#cfd6e6;font:12px/1.5 monospace;background:rgba(0,0,0,.45);padding:6px 10px;border-radius:6px;z-index:9}
</style>
<script type="importmap">{"imports":{"three":"/three/three.module.js","three/addons/":"/three/addons/"}}</script>
</head><body><div id="hud">loading…</div><script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const hud = document.getElementById("hud");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171d);
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 2.2));
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3,5,4); scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 1.4); rim.position.set(-4,2,-3); scene.add(rim);
const grid = new THREE.GridHelper(8, 16, 0x39404f, 0x232833); scene.add(grid);
const camera = new THREE.PerspectiveCamera(38, innerWidth/innerHeight, 0.05, 100);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
let mixer = null, clips = [], root = null;
window.__ready = false;
loader.load("/model.glb", (gltf) => {
  root = gltf.scene; scene.add(root);
  gltf.animations.forEach(c => clips.push(c));
  mixer = new THREE.AnimationMixer(root);
  // 自动摆位：让模型站在原点、朝向 +Z
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  root.position.set(-c.x, -box.min.y, -c.z);
  const h = Math.max(size.y, 0.2);
  camera.position.set(h*0.9, h*0.75, h*1.9);
  camera.lookAt(0, h*0.45, 0);
  window.__clips = clips.map(c => c.name);
  window.__height = h;
  window.__ready = true;
  hud.textContent = "clips: " + window.__clips.join(", ");
}, undefined, (e) => { hud.textContent = "load error: " + e; window.__ready = "error"; });
window.__play = (i, t) => {
  if (!mixer || !clips[i]) return false;
  mixer.stopAllAction();
  const a = mixer.clipAction(clips[i]);
  a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
  a.play();
  mixer.setTime(t);
  return true;
};
window.__seek = (i, t) => { if (mixer && clips[i]) { mixer.setTime(t); } };
window.__spin = (a) => { if (root) { root.rotation.y = a; } };
let last = performance.now();
function loop(){ requestAnimationFrame(loop); const n = performance.now(); const dt = (n-last)/1000; last = n; if (mixer) mixer.update(dt); renderer.render(scene, camera); }
loop();
</script></body></html>`;

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/" || url === "/index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(HTML); return; }
  if (url === "/model.glb") {
    const b = readFileSync(file);
    res.writeHead(200, { "content-type": "model/gltf-binary", "content-length": b.length });
    res.end(b); return;
  }
  if (url.startsWith("/three/addons/")) {
    // three/examples/jsm/<rest>
    const p = path.join(THREE_DIR, "examples", "jsm", url.slice("/three/addons/".length));
    if (!p.startsWith(THREE_DIR) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end("nf " + p); return; }
    const b = readFileSync(p);
    res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
    res.end(b); return;
  }
  if (url.startsWith("/three/")) {
    // three/build/<rest>
    const p = path.join(THREE_DIR, "build", url.slice("/three/".length));
    if (!p.startsWith(THREE_DIR) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end("nf " + p); return; }
    const b = readFileSync(p);
    res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
    res.end(b); return;
  }
  res.writeHead(404); res.end("nf");
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

const cport = 9870 + Math.floor(Math.random() * 120);
const profile = path.join(os.tmpdir(), "naiwa-pv-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=900,900", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore", windowsHide: true });
let ver = null;
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { ver = await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
const errs = [];
cdp.ws.addEventListener("message", (e) => {
  try {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
      errs.push("console." + m.params.type + ": " + (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    }
    if (m.method === "Runtime.exceptionThrown") errs.push("exception: " + String(m.params.exceptionDetails?.text || m.params.exceptionDetails?.exception?.description || "").slice(0, 240));
    if (m.method === "Log.entryAdded" && m.params.entry?.level === "error") errs.push("log: " + String(m.params.entry.text).slice(0, 200));
  } catch { /* 忽略 */ }
});
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;

mkdirSync(OUT, { recursive: true });
await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 500)); if (await ev("window.__ready")) break; }
const ready = await ev("window.__ready");
const clips = (await ev("window.__clips")) || [];
console.log("ready =", ready, " clips =", clips.length, " →", clips.join(", "));
if (!ready || !clips.length) {
  console.log("页面错误：");
  errs.slice(0, 12).forEach((e) => console.log("  " + e));
  console.log("hud 文本 =", await ev("document.getElementById('hud')?.textContent"));
}
const base = path.basename(file, ".glb");
if (!clips.length) {
  // 无动画片段（静态道具）：摆一个 3/4 视角静帧
  await ev(`window.__spin && window.__spin(0.6)`);
  await new Promise((r) => setTimeout(r, 400));
  const out = path.join(OUT, `${base}-static.png`);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("  静态道具截图 => " + out);
}
for (let i = 0; i < clips.length; i++) {
  // 每个片段抓 3 个时间点（起/中/末）
  for (const [tag, t] of [["a", 0], ["b", 0.9], ["c", 1.8]]) {
    await ev(`window.__play(${i}, 0)`);
    await new Promise((r) => setTimeout(r, 120));
    await ev(`window.__seek(${i}, ${t})`);
    await new Promise((r) => setTimeout(r, 260));
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    const out = path.join(OUT, `${base}-${String(i + 1).padStart(2, "0")}-${clips[i]}-${tag}.png`);
    writeFileSync(out, Buffer.from(shot.data, "base64"));
  }
  console.log("  片段", i + 1, clips[i], "已截图");
}
cdp.close();
try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
server.close();
console.log("输出目录:", OUT);
