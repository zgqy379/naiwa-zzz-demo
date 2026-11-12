/**
 * 探针：NPR 模式下角色容器里的网格构成（找出黑块是谁）。
 * 输出：每个 mesh 的 name / 类型 / 材质 / 顶点数 / 是否描边壳 / 世界坐标 / 包围盒。
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "docs", "evidence", "anim-probe");
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

const cport = 9960 + Math.floor(Math.random() * 30);
const profile = path.join(os.tmpdir(), "naiwa-nprd-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
mkdirSync(OUT, { recursive: true });
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
const shot = async (f) => { const s = await cdp.send("Page.captureScreenshot", { format: "png" }); writeFileSync(f, Buffer.from(s.data, "base64")); };

const DUMP = `(() => {
  const n = window.__npr;
  const V = n.camera.position.constructor;
  const dump = (root, label) => {
    const out = [];
    root?.traverse((c) => {
      if (!c.isMesh) return;
      const g = c.geometry;
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const wp = new V(); c.getWorldPosition(wp);
      out.push({
        name: c.name || "(unnamed)",
        type: c.type,
        mat: c.material?.type,
        side: c.material?.side,
        skinned: !!c.isSkinnedMesh,
        isOutline: !!c.userData.__isOutline,
        verts: g.attributes?.POSITION?.count ?? 0,
        world: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)],
        localSize: [+(bb.max.x - bb.min.x).toFixed(3), +(bb.max.y - bb.min.y).toFixed(3), +(bb.max.z - bb.min.z).toFixed(3)],
        uWidth: c.material?.uniforms?.uWidth?.value ?? null,
        parent: c.parent?.name || c.parent?.type,
      });
    });
    return { label, meshes: out };
  };
  const active = n.squad.active;
  const w = active.group.getObjectByName("model-wrapper");
  const ow = n.scene.getObjectByName("opponent")?.getObjectByName("model-wrapper");
  return {
    mode: n.getMode?.() ?? "n/a",
    wrapperScale: w ? [+w.scale.x.toFixed(3), +w.scale.y.toFixed(3), +w.scale.z.toFixed(3)] : null,
    player: dump(w, "player"),
    opponent: dump(ow, "opponent"),
  };
})()`;

try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 40; i++) { await sleep(500); if (await ev("!!window.__npr")) break; }
  await sleep(2500);
  await ev(`document.querySelector('[data-action="start"]')?.click(); true`);
  await sleep(4500);
  await ev(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await sleep(6000);

  console.log("=== NPR 模式 ===");
  const npr = await ev(DUMP);
  console.log(JSON.stringify(npr, null, 1));
  await shot(path.join(OUT, "npr-dump.png"));

  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', bubbles: true })); true`);
  await sleep(1500);
  console.log("=== 切到 PBR 后 ===");
  const pbr = await ev(DUMP);
  console.log(JSON.stringify(pbr, null, 1));
  await shot(path.join(OUT, "pbr-dump.png"));
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
