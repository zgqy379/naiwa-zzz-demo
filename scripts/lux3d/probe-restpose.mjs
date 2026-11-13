/**
 * 决定性对照：同一个角色，分别渲染
 *   (a) 不播动画（绑定姿势）
 *   (b) 播共享动画库的 Idle_Loop
 *   (c) 播「它自己的」anim.glb 里的 Idle_Loop（仅库源角色有）
 * 若 (b) 与 (a) 差异巨大而 (c) 正常 → 问题出在「共享库跨角色套用」；
 * 若 (b) 也崩 → 问题出在共享库文件本身（定版化环节）。
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  const b = readFileSync(f);
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "content-length": b.length });
  res.end(b);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#14161c;color:#dde3ef;font:13px/1.4 monospace}
.row{display:flex;gap:10px;padding:10px}
figure{margin:0}figcaption{padding:4px}
canvas{display:block;background:#1b1e26;border:1px solid #2c3242;border-radius:6px}
</style>
<script type="importmap">{"imports":{"three":"/three/three.module.js","three/addons/":"/three/addons/"}}</script>
</head><body><div class="row" id="row"></div>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const row = document.getElementById("row");
const CASES = __CASES__;
window.__done = 0;
for (const c of CASES) {
  const fig = document.createElement("figure");
  const cv = document.createElement("canvas"); cv.width = 420; cv.height = 560;
  const cap = document.createElement("figcaption"); cap.textContent = c.label;
  fig.appendChild(cv); fig.appendChild(cap); row.appendChild(fig);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  r.setSize(420, 560, false);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x1b1e26);
  sc.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 2.3));
  const k = new THREE.DirectionalLight(0xffffff, 2.2); k.position.set(3,5,4); sc.add(k);
  const cam = new THREE.PerspectiveCamera(35, 420/560, 0.05, 100);
  loader.load(c.char, (gltf) => {
    const root = gltf.scene; sc.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const h = Math.max(size.y, 0.001);
    cam.position.set(h*0.8, h*0.55, h*2.2); cam.lookAt(0, h*0.45, 0);
    let mixer = null;
    if (c.lib) {
      loader.load(c.lib, (lib) => {
        const clip = (lib.animations||[]).find(x => x.name === "Idle_Loop") || lib.animations[0];
        mixer = new THREE.AnimationMixer(root);
        const a = mixer.clipAction(clip); a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play();
        mixer.setTime(clip.duration * 0.35);
        r.render(sc, cam);
        window.__done++;
      });
    } else {
      r.render(sc, cam);
      window.__done++;
    }
  });
}
</script></body></html>`;

const cases = [
  { label: "奶豆 · 不播动画（绑定姿势）", char: "/asset/naiwa_naidou_runtime.glb", lib: null },
  { label: "奶豆 · 播共享库 Idle_Loop", char: "/asset/naiwa_naidou_runtime.glb", lib: "/asset/naiwa_anim_lib.glb" },
  { label: "奶蛙 · 不播动画", char: "/asset/naiwa_laugh_g1_runtime.glb", lib: null },
  { label: "奶蛙 · 播共享库 Idle_Loop（库源角色）", char: "/asset/naiwa_laugh_g1_runtime.glb", lib: "/asset/naiwa_anim_lib.glb" },
  { label: "奶兔 · 不播动画", char: "/asset/naiwa_naitu_runtime.glb", lib: null },
  { label: "奶兔 · 播共享库 Idle_Loop", char: "/asset/naiwa_naitu_runtime.glb", lib: "/asset/naiwa_anim_lib.glb" },
];
const html = HTML.replace("__CASES__", JSON.stringify(cases));
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
const profile = path.join(os.tmpdir(), "naiwa-cmp-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=2700,700", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/_cmp.html` });
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 600)); if ((await ev("window.__done")) >= cases.length) break; }
  await new Promise((r) => setTimeout(r, 1500));
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const out = path.join(OUT, "cmp-restpose-vs-sharedlib.png");
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("对照图 → " + out);
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
