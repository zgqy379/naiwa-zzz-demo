/**
 * 16 只家族角色花名册总览：把全部角色加载进一个页面，播同一个动作片段，
 * 渲染成 4×4 的花名册图（供报告书 §11 / §10.3 使用）。
 *
 * 用法：node scripts/lux3d/roster-sheet.mjs [clip名] [输出png]
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const argv = process.argv.slice(2);
const CLIP = argv[0] && !argv[0].endsWith(".png") ? argv[0] : "Sword_Regular_A";
const OUT = argv.find((a) => a.endsWith(".png")) || path.join(ROOT, "docs", "evidence", "v3-roster-sheet-20261112.png");

const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));
const members = roster.characters.map((c) => ({ id: c.id, name: c.name, url: "/asset/" + c.glb }));

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

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#0d0f14;color:#d6dcea;font:13px/1.4 "Microsoft YaHei",sans-serif}
#grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2px}
.cell{position:relative;background:#171a21}
canvas{display:block;width:100%;height:260px}
.nm{position:absolute;left:8px;bottom:6px;font-size:14px;color:#ffd98a;text-shadow:0 1px 3px #000}
.no{position:absolute;right:8px;bottom:6px;color:#8b93a5}
</style>
<script type="importmap">{"imports":{"three":"/three/three.module.js","three/addons/":"/three/addons/"}}</script>
</head><body>
<div id="grid"></div>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const members = __MEMBERS__;
const clipName = __CLIP__;
const grid = document.getElementById("grid");
let loaded = 0, libClips = [];
// 先取共享动画库
loader.load("/asset/naiwa_anim_lib.glb", (g) => {
  libClips = g.animations || [];
  loader.load("/asset/naiwa_anim_lib2.glb", (g2) => {
    libClips = libClips.concat(g2.animations || []);
    build();
  });
});
function build() {
  const clip = libClips.find(c => c.name === clipName) || libClips.find(c => c.name === "Idle_Loop") || libClips[0];
  for (const m of members) {
    const d = document.createElement("div"); d.className = "cell";
    const cv = document.createElement("canvas"); cv.width = 400; cv.height = 520;
    const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = m.name;
    const no = document.createElement("div"); no.className = "no"; no.textContent = m.id;
    d.appendChild(cv); d.appendChild(nm); d.appendChild(no); grid.appendChild(d);
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    r.setSize(400, 520, false);
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x171a21);
    sc.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 2.2));
    const k = new THREE.DirectionalLight(0xffffff, 2.3); k.position.set(3,5,4); sc.add(k);
    const cam = new THREE.PerspectiveCamera(32, 400/520, 0.05, 100);
    loader.load(m.url, (gltf) => {
      const root = gltf.scene; sc.add(root);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const ctr = box.getCenter(new THREE.Vector3());
      root.position.sub(ctr); root.position.y += size.y / 2;
      const h = Math.max(size.y, 0.001);
      cam.position.set(h * 0.8, h * 0.62, h * 2.15); cam.lookAt(0, h * 0.5, 0);
      const mixer = new THREE.AnimationMixer(root);
      const a = mixer.clipAction(clip); a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play();
      mixer.setTime(clip.duration * 0.42);
      r.render(sc, cam);
      loaded++;
      window.__loaded = loaded;
    }, undefined, () => { r.render(sc, cam); loaded++; window.__loaded = loaded; });
  }
}
</script>
</body></html>`;

const html = HTML.replace("__MEMBERS__", JSON.stringify(members).replace(/</g, "\\u003c")).replace("__CLIP__", JSON.stringify(CLIP));
// three 从 node_modules 直接映射（服务根在 DIST，需要额外映射 /three）
const htmlPath = path.join(process.env.TEMP || "C:/Users/dqy/AppData/Local/Temp", "roster-sheet.html");
writeFileSync(htmlPath, html, "utf8");

// 服务端补一条 /three 映射
const origHandler = server.listeners("request")[0];
server.removeAllListeners("request");
server.on("request", (req, res) => {
  const u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u.startsWith("/three/addons/")) {
    // three/examples/jsm/<rest>
    const p = path.join(ROOT, "node_modules", "three", "examples", "jsm", u.slice("/three/addons/".length));
    if (!existsSync(p)) { res.writeHead(404); res.end("nf " + p); return; }
    const b = readFileSync(p);
    res.writeHead(200, { "content-type": path.extname(p) === ".js" ? "application/javascript" : "application/octet-stream", "content-length": b.length });
    res.end(b); return;
  }
  if (u.startsWith("/three/")) {
    // three/build/<rest>
    const p = path.join(ROOT, "node_modules", "three", "build", u.slice("/three/".length));
    if (!existsSync(p)) { res.writeHead(404); res.end("nf " + p); return; }
    const b = readFileSync(p);
    res.writeHead(200, { "content-type": path.extname(p) === ".js" ? "application/javascript" : "application/octet-stream", "content-length": b.length });
    res.end(b); return;
  }
  if (u === "/roster.html") {
    const b = readFileSync(htmlPath);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": b.length });
    res.end(b); return;
  }
  origHandler(req, res);
});

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

const cport = 9970 + Math.floor(Math.random() * 25);
const profile = path.join(os.tmpdir(), "naiwa-rs-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1620,1080", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
let ver = null;
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { ver = await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/roster.html` });
  for (let i = 0; i < 90; i++) { await new Promise((r) => setTimeout(r, 1000)); if ((await ev("window.__loaded")) >= members.length) break; }
  await new Promise((r) => setTimeout(r, 2000));
  mkdirSync(path.dirname(OUT), { recursive: true });
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("花名册总览 → " + OUT + "  (clip=" + CLIP + ", loaded=" + (await ev("window.__loaded")) + "/" + members.length + ")");
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
