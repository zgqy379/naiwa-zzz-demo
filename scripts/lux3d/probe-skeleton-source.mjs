/**
 * 决定性实验：动画库与角色运行时文件的**骨架是否同源**。
 *
 * 情形 A：角色来自 rigged.glb（现状）+ 动画来自 anim.glb（retarget 产出）
 * 情形 B：角色来自 anim.glb（同一份，剥掉网格）+ 动画来自 anim.glb
 * 情形 C：角色来自 rigged.glb + 动画来自 rigged.glb 自身（若 rigged.glb 无动画则跳过）
 *
 * 若 A 趴倒而 B 站直 → 结论：官方 retarget 产出里的骨架 rest 姿态与绑骨产出**不同**，
 *       修法 = 角色运行时文件改从 anim.glb 定版（零积分）。
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const WORK = path.join(ROOT, ".lux3d-work");
const OUT = path.join(ROOT, "docs", "evidence", "anim-probe");
mkdirSync(OUT, { recursive: true });

// 先做「情形 B」的资产：从 anim.glb 剥网格定版
execFileSafe();

function execFileSafe() {
  try {
    execSync(`node "${path.join(ROOT, "scripts", "lux3d", "finalize.mjs")}" --in "${path.join(WORK, "shell_naiwa", "anim.glb")}" --out "${path.join(WORK, "ip-probe", "naiwa_from_anim.glb")}" --actions "Idle_Loop,Walk_Loop,Jog_Fwd_Loop,Sword_Regular_A,Sword_Regular_B,Sword_Regular_C,Sword_Regular_Combo,Hit_Chest,Roll,Death01" --no-animations`, { stdio: "ignore", cwd: ROOT });
    console.log("  已从 anim.glb 定版出「情形 B」角色");
  } catch (e) { console.log("  情形 B 定版失败: " + String(e).slice(0, 120)); }
}

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
  if (p.startsWith("/work/")) {
    const f = path.join(WORK, p.slice("/work/".length));
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
figure{margin:0}figcaption{padding:3px 2px;font-size:11px;max-width:300px}
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
function draw(container, charGlb, libGlb, clipName, t, label) {
  const fig = document.createElement("figure");
  const cv = document.createElement("canvas"); cv.width = 300; cv.height = 400;
  const cap = document.createElement("figcaption"); cap.textContent = label;
  fig.appendChild(cv); fig.appendChild(cap);
  container.appendChild(fig);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
  r.setSize(300, 400, false);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x1b1e26);
  sc.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2f3a, 2.6));
  const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(3,5,4); sc.add(k);
  const cam = new THREE.PerspectiveCamera(34, 300/400, 0.05, 100);
  const finish = () => { r.render(sc, cam); window.__done++; };
  loader.load(charGlb, (gltf) => {
    const root = gltf.scene; sc.add(root);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const h = Math.max(size.y, 0.001);
    cam.position.set(h*0.85, h*0.6, h*2.3); cam.lookAt(0, h*0.45, 0);
    if (!libGlb) { finish(); return; }
    loader.load(libGlb, (lib) => {
      const clip = (lib.animations||[]).find(x => x.name === clipName) || (lib.animations||[])[0];
      if (!clip) { finish(); return; }
      const mixer = new THREE.AnimationMixer(root);
      const a = mixer.clipAction(clip); a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play();
      mixer.setTime((clip.duration||1) * t);
      finish();
    }, undefined, finish);
  }, undefined, finish);
}
const CASES = __CASES__;
for (const c of CASES) {
  if (c.group) {
    const h = document.createElement("h2"); h.textContent = c.group; all.appendChild(h);
    const row = document.createElement("div"); row.className = "row"; all.appendChild(row);
    continue;
  }
  const row = all.querySelector(".row:last-of-type");
  draw(row, c.char, c.lib, c.clip, c.t ?? 0.35, c.label);
}
</script></body></html>`;

const CASES = [
  { group: "奶蛙 · A：角色=rigged.glb（现状）+ 动画=anim.glb 原始" },
  { char: "/asset/naiwa_laugh_g1_runtime.glb", lib: "/work/shell_naiwa/anim.glb", clip: "animation_1", t: 0.35, label: "A · 原始 anim.glb 的第 1 段" },
  { char: "/asset/naiwa_laugh_g1_runtime.glb", lib: "/work/shell_naiwa/anim.glb", clip: "animation_4", t: 0.5, label: "A · 原始 anim.glb 的第 4 段" },
  { group: "奶蛙 · B：角色=anim.glb（剥网格）+ 动画=anim.glb 原始" },
  { char: "/work/ip-probe/naiwa_from_anim.glb", lib: "/work/shell_naiwa/anim.glb", clip: "animation_1", t: 0.35, label: "B · 同源角色 + 第 1 段" },
  { char: "/work/ip-probe/naiwa_from_anim.glb", lib: "/work/shell_naiwa/anim.glb", clip: "animation_4", t: 0.5, label: "B · 同源角色 + 第 4 段" },
  { group: "奶蛙 · C：角色=rigged.glb + 动画=定版共享库（现状）" },
  { char: "/asset/naiwa_laugh_g1_runtime.glb", lib: "/asset/naiwa_anim_lib.glb", clip: "Idle_Loop", t: 0.35, label: "C · 定版库 Idle_Loop" },
];
const html = HTML.replace("__CASES__", JSON.stringify(CASES));
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

const cport = 9905 + Math.floor(Math.random() * 10);
const profile = path.join(os.tmpdir(), "naiwa-src-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1000,1500", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/_cmp.html` });
  for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 700)); if ((await ev("window.__done")) >= CASES.length) break; }
  await new Promise((r) => setTimeout(r, 2000));
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const out = path.join(OUT, "cmp-skeleton-source.png");
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("对照图 → " + out + " (done=" + (await ev("window.__done")) + ")");
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
