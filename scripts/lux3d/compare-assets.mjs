/**
 * 关键资产迭代对比：旧版静态模型（git HEAD 里那份）vs 新版骨骼动画模型，
 * 逐帧并排拼成一张对比图（供报告书 §10.2）。
 *
 * 用法：node scripts/lux3d/compare-assets.mjs [角色id...]
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const TMP = path.join(process.env.TEMP || "C:/Users/dqy/AppData/Local/Temp", "naiwa-oldcmp");
mkdirSync(TMP, { recursive: true });

// 花名册里选几只做对比
const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));
const picks = process.argv.slice(2).length ? process.argv.slice(2) : ["shell_naiwa", "shell_naiji", "shell_naitu"];
const targets = roster.characters.filter((c) => picks.includes(c.id));

// 从 git 取出旧版（静态）模型
// 注意：**不能用 HEAD** —— 新资产已经在最近一次提交里入���，HEAD 取到的是新版。
// 这里默认取 `HEAD~1`（即新资产入库前的那一版），可用 --rev 指定其它提交。
const REV = process.argv.includes("--rev")
  ? process.argv[process.argv.indexOf("--rev") + 1]
  : "HEAD~1";
console.log(`旧版取自 git ${REV}`);
for (const c of targets) {
  const out = path.join(TMP, "old_" + c.id + ".glb");
  try {
    const buf = execSync(`git show ${REV}:public/asset/${c.glb}`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    writeFileSync(out, buf);
    c._old = out;
    c._new = path.join(ROOT, "public", "asset", c.glb);
  } catch (e) {
    console.error("取旧版失败 " + c.id + ": " + String(e).slice(0, 80));
  }
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
// three.js 资源路由（缺这一段会导致页面全黑：模块 404 → 渲染器没建起来）
const origHandler = server.listeners("request")[0];
server.removeAllListeners("request");
server.on("request", (req, res) => {
  const u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u.startsWith("/three/addons/")) {
    const p = path.join(ROOT, "node_modules", "three", "examples", "jsm", u.slice("/three/addons/".length));
    if (!existsSync(p)) { res.writeHead(404); res.end("nf " + p); return; }
    const b = readFileSync(p);
    res.writeHead(200, { "content-type": path.extname(p) === ".js" ? "application/javascript" : "application/octet-stream", "content-length": b.length });
    res.end(b); return;
  }
  if (u.startsWith("/three/")) {
    const p = path.join(ROOT, "node_modules", "three", "build", u.slice("/three/".length));
    if (!existsSync(p)) { res.writeHead(404); res.end("nf " + p); return; }
    const b = readFileSync(p);
    res.writeHead(200, { "content-type": path.extname(p) === ".js" ? "application/javascript" : "application/octet-stream", "content-length": b.length });
    res.end(b); return;
  }
  origHandler(req, res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#101218;color:#cfd6e6;font:12px/1.4 monospace}
.row{display:flex;gap:8px;padding:8px 12px;align-items:center}
.cell{width:300px}
canvas{display:block;background:#181b22;border:1px solid #2b3140;border-radius:6px}
.lbl{padding:4px 2px}
</style>
<script type="importmap">{"imports":{"three":"/three/three.module.js","three/addons/":"/three/addons/"}}</script>
</head><body>
<div id="root"></div>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const rows = JSON.parse(document.getElementById("data").textContent);
const root = document.getElementById("root");
window.__done = 0;
for (const row of rows) {
  const d = document.createElement("div");
  d.className = "row";
  for (const cell of row.cells) {
    const c = document.createElement("div");
    c.className = "cell";
    const cv = document.createElement("canvas");
    cv.width = 300; cv.height = 300;
    const lbl = document.createElement("div");
    lbl.className = "lbl"; lbl.textContent = cell.label;
    c.appendChild(cv); c.appendChild(lbl);
    d.appendChild(c);
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    r.setSize(300, 300, false);
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x181b22);
    sc.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 2.4));
    const k = new THREE.DirectionalLight(0xffffff, 2.2); k.position.set(3,5,4); sc.add(k);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
    loader.load(cell.url, (gltf) => {
      const root2 = gltf.scene;
      sc.add(root2);
      const box = new THREE.Box3().setFromObject(root2);
      const size = box.getSize(new THREE.Vector3());
      const ctr = box.getCenter(new THREE.Vector3());
      root2.position.sub(ctr); root2.position.y += size.y / 2;
      const h = Math.max(size.y, 0.001);
      cam.position.set(h * 0.95, h * 0.55, h * 2.35);
      cam.lookAt(0, h * 0.52, 0);
      if (gltf.animations?.length) {
        const mixer = new THREE.AnimationMixer(root2);
        const clip = gltf.animations.find(x => x.name === "Sword_Regular_A") || gltf.animations[0];
        const a = mixer.clipAction(clip); a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play();
        mixer.setTime(clip.duration * 0.35);
      }
      r.render(sc, cam);
      window.__done++;
    }, undefined, () => { r.render(sc, cam); window.__done++; });
  }
  root.appendChild(d);
}
</script>
<script type="application/json" id="data">__ROWS__</script>
</body></html>`;

const rows = targets.filter((c) => c._old).map((c) => ({
  cells: [
    { label: c.name + " · 旧版（静态 / skins=0）", url: "/old_" + c.id + ".glb" },
    { label: c.name + " · 新版（52 关节 + 官方动画）", url: "/new_" + c.id + ".glb" },
  ],
}));
// 新版模型也要拷进临时目录
for (const c of targets) {
  if (!c._old) continue;
  writeFileSync(path.join(TMP, "new_" + c.id + ".glb"), readFileSync(c._new));
}
const html = HTML.replace("__ROWS__", JSON.stringify(rows).replace(/</g, "\\u003c"));
const htmlPath = path.join(TMP, "index.html");
writeFileSync(htmlPath, html, "utf8");

// three.js 也要能被服务：软链到临时目录
const threeSrc = path.join(ROOT, "node_modules", "three");
const threeDst = path.join(TMP, "three");
if (!existsSync(threeDst)) {
  try { execFileSync("cmd", ["/c", "mklink", "/J", threeDst, threeSrc]); } catch { /* 软链失败则改用 node_modules 相对路径 */ }
}
// 页面里 three 的路径改为相对仓库 node_modules（服务器根在 TMP，需重写 importmap）
const html2 = existsSync(threeDst)
  ? html
  : html.replace('"/three/three.module.js"', '"/three/three.module.js"').replace('"/three/addons/"', '"/three/addons/"');
writeFileSync(htmlPath, html2, "utf8");

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

const cport = 9930 + Math.floor(Math.random() * 50);
const profile = path.join(os.tmpdir(), "naiwa-cmp-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1400,700", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
let ver = null;
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { ver = await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
  for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 500)); const d = await ev("window.__done"); if (d >= rows.length * 2) break; }
  await new Promise((r) => setTimeout(r, 1500));
  const out = path.join(ROOT, "docs", "evidence", "v3-asset-old-vs-new-20261112.png");
  mkdirSync(path.dirname(out), { recursive: true });
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("对比图 → " + out);
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
