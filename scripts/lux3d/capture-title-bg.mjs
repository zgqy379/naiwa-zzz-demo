/**
 * 自制标题页背景视频：只拍游戏自己的 3D 场景层（隐藏视频与 DOM 叠层），
 * 得到「霓虹街道 + 我们的奶蛙」的画面 —— 版权 100% 归我们自己，零第三方水印。
 *
 * 用法：node scripts/lux3d/capture-title-bg.mjs [--out public/bg/title.mp4] [--seconds 18]
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = arg("out", path.join(ROOT, "public", "bg", "title.mp4"));
const SECONDS = Number(arg("seconds", 18));
const FRAMES = path.join(ROOT, ".tmp-bg-frames");

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

const cport = 9960 + Math.floor(Math.random() * 30);
const profile = path.join(os.tmpdir(), "naiwa-bg-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
mkdirSync(FRAMES, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1280,720", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
let ver = null;
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { ver = await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 60; i++) { await sleep(500); if (await ev("!!window.__npr")) break; }
  await sleep(4000);

  // 进选人页（16 只奶蛙在实时 3D 卡片层里待机），再把 DOM 面板藏掉 → 只剩两层画布
  const wentSelect = await ev(`(() => {
    const b = document.querySelector('[data-action="start"]');
    if (!b) return "no-start";
    b.click();
    return "clicked";
  })()`);
  console.log("进选人页 = " + wentSelect);
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    const ok = await ev(`(() => {
      const n = window.__npr;
      const live = n?.screens?.live3d;
      return !!(live && n?.squad?.members?.length);
    })()`).catch(() => false);
    if (ok) { console.log(`  选人页就绪（${i + 1}s）`); break; }
  }
  await sleep(4000);

  // 隐藏：首页视频叠层 + 所有 DOM 界面层（只留 3D 画布）
  const hidden = await ev(`(() => {
    const keep = new Set(["gl", "live3d-layer"]);
    let n = 0;
    // 1) 所有 <video> 叠层
    for (const e of document.querySelectorAll("video")) { e.style.display = "none"; n++; }
    // 2) 选人页/标题页/结算页等 DOM 容器（含卡片、面板、标题），但不动两个画布
    const sels = ["#screen-select", "#screen-title", "#screen-result", "#screen-settings", "#ui", "#hud", ".select-panel", "#select-list", "#showcase", ".title-wrap", "#topbar", ".menu-btn", "#select-loading"];
    for (const s of sels) {
      for (const e of document.querySelectorAll(s)) {
        if (keep.has(e.id)) continue;
        e.style.display = "none"; n++;
      }
    }
    // 3) 兜底：body 下除画布外的直接子元素里，带文字内容的块全藏
    document.body.style.background = "#0b0d12";
    return n;
  })()`);
  console.log("隐藏的叠层数 = " + hidden);
  await sleep(2500);

  // 慢速运镜（标题页本身是程序化街道 + 相机漂移，这里再叠一层缓慢环绕）
  const cam = await ev(`(() => {
    const n = window.__npr;
    if (!n?.camera) return "no-camera";
    window.__bgCam = { t: 0, base: n.camera.position.clone(), baseQ: n.camera.quaternion.clone() };
    return "ok";
  })()`);
  console.log("相机准备 = " + cam);

  const total = Math.round(SECONDS * 24);   // 24 fps 采样（与编码帧率一致，否则播放会加速）
  for (let i = 0; i < total; i++) {
    // 每帧把相机绕 y 轴缓慢转一点（叠加在原有漂移之上）
    await ev(`(() => {
      const n = window.__npr;
      const c = n?.camera;
      if (!c) return false;
      const st = window.__bgCam;
      if (!st) return false;
      st.t += 0.0014;
      const a = st.t;
      c.position.set(st.base.x + Math.sin(a) * 1.5, st.base.y + Math.sin(a * 0.7) * 0.25, st.base.z + Math.cos(a) * 0.9);
      c.lookAt(st.base.x * 0.35, 1.1, st.base.z * 0.35);
      return true;
    })()`);
    await sleep(41);
    const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 90 });
    writeFileSync(path.join(FRAMES, `f-${String(i).padStart(5, "0")}.jpg`), Buffer.from(shot.data, "base64"));
    if (i % 48 === 0) console.log(`  帧 ${i}/${total}`);
  }
  console.log("采帧完成 " + total + " 帧");

  // 编码：H.264 mp4（1280×720, 24fps, CRF 24, faststart, 体积小）
  const listFile = path.join(FRAMES, "list.txt");
  const frames = readFileSync ? null : null;
  const files = [];
  for (const f of (await import("node:fs")).readdirSync(FRAMES)) if (f.endsWith(".jpg")) files.push(f);
  files.sort();
  writeFileSync(listFile, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n", "utf8");
  mkdirSync(path.dirname(OUT), { recursive: true });
  execSync(`ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "${listFile}" -vf "fps=24,format=yuv420p,scale=1280:720" -c:v libx264 -crf 24 -preset slow -movflags +faststart "${OUT}"`, { stdio: "inherit" });
  console.log("输出 = " + OUT + "  " + Math.round(statSync(OUT).size / 1024) + " KB");
} catch (e) {
  console.error("ERR:", e);
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
