/**
 * 旧版 16 只 vs 新版 16 只 并排对照图（回答「现在还是不是奶蛙家族」）。
 * 旧资产取自重建前的提交（默认 afe8e7f），新版取当前 public/asset。
 * 用法：node scripts/lux3d/compare-family.mjs [旧提交号] [输出png]
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const TMP = path.join(process.env.TEMP || "C:/Users/dqy/AppData/Local/Temp", "naiwa-familycmp");
mkdirSync(TMP, { recursive: true });
const argv = process.argv.slice(2);
const REV = argv[0] && !argv[0].endsWith(".png") ? argv[0] : "afe8e7f";
const OUT = argv.find((a) => a.endsWith(".png")) || path.join(ROOT, "docs", "evidence", "v3-family-old-vs-new-20261112.png");

const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));

// 取旧资产
for (const c of roster.characters) {
  const out = path.join(TMP, `old_${c.id}.glb`);
  try {
    const buf = execSync(`git show ${REV}:public/asset/${c.glb}`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(out, buf);
    c._old = `/old_${c.id}.glb`;
  } catch { c._old = null; }
  c._new = `/asset/${c.glb}`;
}

const MIME = { ".html": "text/html", ".js": "application/javascript", ".glb": "model/gltf-binary", ".png": "image/png" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(TMP, p);
  if (!f.startsWith(TMP) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  const b = readFileSync(f);
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "content-length": b.length });
  res.end(b);
});
const orig = server.listeners("request")[0];
server.removeAllListeners("request");
server.on("request", (req, res) => {
  const u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u.startsWith("/three/addons/")) {
    const p = path.join(ROOT, "node_modules", "three", "examples", "jsm", u.slice("/three/addons/".length));
    if (!existsSync(p)) { res.writeHead(404); res.end("nf"); return; }
    const b = readFileSync(p);
    res.writeHead(200, { "content-type": "application/javascript", "content-length": b.length });
    res.end(b); return;
  }
  if (u.startsWith("/three/")) {
    const p = path.join(ROOT, "node_modules", "three", "build", u.slice("/three/".length));
    if (!existsSync(p)) { res.writeHead(404); res.end("nf"); return; }
    const b = readFileSync(p);
    res.writeHead(200, { "content-type": "application/javascript", "content-length": b.length });
    res.end(b); return;
  }
  if (u.startsWith("/asset/")) {
    const p = path.join(DIST, u.slice(1));
    if (!existsSync(p)) { res.writeHead(404); res.end("nf"); return; }
    const b = readFileSync(p);
    res.writeHead(200, { "content-type": "model/gltf-binary", "content-length": b.length });
    res.end(b); return;
  }
  orig(req, res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const rows = roster.characters.map((c) => ({ name: c.name, id: c.id, old: c._old, new: c._new }));
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#0e1015;color:#dfe4ee;font:12px/1.35 "Microsoft YaHei",sans-serif}
h2{margin:10px 12px 4px;font-size:15px;color:#ffd98a}
.row{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;padding:0 8px 6px}
.cell{position:relative;background:#171a21;border:1px solid #262b36;border-radius:5px;overflow:hidden}
canvas{display:block;width:100%;height:210px}
.nm{position:absolute;left:5px;bottom:4px;color:#ffd98a;text-shadow:0 1px 3px #000}
</style>
<script type="importmap">{"imports":{"three":"/three/three.module.js","three/addons/":"/three/addons/"}}</script>
</head><body>
<div id="all"></div>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const rows = __ROWS__;
const all = document.getElementById("all");
window.__done = 0; window.__total = rows.length * 2 + 2;
function section(title, key) {
  const h = document.createElement("h2"); h.textContent = title; all.appendChild(h);
  const g = document.createElement("div"); g.className = "row"; all.appendChild(g);
  for (const r of rows) {
    const url = r[key];
    const d = document.createElement("div"); d.className = "cell";
    const cv = document.createElement("canvas"); cv.width = 240; cv.height = 420;
    const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = r.name;
    d.appendChild(cv); d.appendChild(nm); g.appendChild(d);
    if (!url) { window.__done++; continue; }
    const r2 = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    r2.setSize(240, 420, false);
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x171a21);
    sc.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 2.3));
    const k = new THREE.DirectionalLight(0xffffff, 2.2); k.position.set(3,5,4); sc.add(k);
    const cam = new THREE.PerspectiveCamera(34, 240/420, 0.05, 100);
    loader.load(url, (gltf) => {
      const root = gltf.scene; sc.add(root);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const ctr = box.getCenter(new THREE.Vector3());
      root.position.sub(ctr); root.position.y += size.y / 2;
      const h = Math.max(size.y, 0.001);
      cam.position.set(h * 0.7, h * 0.55, h * 1.9); cam.lookAt(0, h * 0.5, 0);
      r2.render(sc, cam);
      window.__done++;
    }, undefined, () => { r2.render(sc, cam); window.__done++; });
  }
}
section("旧版 16 只（重建前提交 " + "__REV__" + " · skins=0 静态网格）", "old");
section("新版 16 只（当前交付 · 官方绑骨 52 关节 + 官方动作）", "new");
</script>
<script type="application/json" id="rows">__ROWS__</script>
</body></html>`;

const html = HTML.replace("__ROWS__", JSON.stringify(rows).replace(/</g, "\\u003c")).replace("__REV__", REV);
writeFileSync(path.join(TMP, "index.html"), html, "utf8");

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
const profile = path.join(os.tmpdir(), "naiwa-fam-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1920,1200", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
let ver = null;
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { ver = await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  for (let i = 0; i < 90; i++) { await new Promise((r) => setTimeout(r, 1000)); const d = await ev("window.__done"); const t = await ev("window.__total"); if (d >= t) break; }
  await new Promise((r) => setTimeout(r, 2500));
  mkdirSync(path.dirname(OUT), { recursive: true });
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("对照图 → " + OUT + "  (loaded=" + (await ev("window.__done")) + "/" + (await ev("window.__total")) + ")");
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
