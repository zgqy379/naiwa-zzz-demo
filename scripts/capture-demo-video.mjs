/**
 * Demo 视频重录 + §十过期插图重拍 —— 取自当前登记构建（dist/assets/index-Ce5zGDeB.js）。
 *
 * 与旧版录像（canvas#gl captureStream）的本质差异：CDP Page.startScreencast 抓的是
 * 合成器输出，DOM HUD / 液态玻璃层 / live3d 层 / 3D 光标层 / 视频背景全部入画。
 *
 * 通道沿用仓库既定取证模式（scripts/capture-show3.mjs）：
 *   本地静态服务 dist/（只读，不重建）+ headless Chrome + CDP over WebSocket。
 *
 * 产物：
 *   .tmp-demo-frames/f-000001.jpg ...        逐帧 JPEG（带 wall 时间戳）
 *   .tmp-demo-frames/list.ffconcat           ffmpeg concat 清单（含逐帧时长）
 *   docs/evidence/v3-show4-00-naiwa-20261111.png   §十图5 开局街道（默认机位）
 *   docs/evidence/v3-show4-01-naifen-20261111.png  §十图3 奶粉（show3 同款机位）
 *   docs/evidence/v3-show4-05-xigema-20261111.png  §十图4 西格玛（show3 同款机位）
 *   docs/evidence/v3-demo-rec-20261111.json   录制取证（构建指纹/时间线/错误/帧数）
 *
 * 用法：node scripts/capture-demo-video.mjs
 * 后续：ffmpeg -y -f concat -safe 0 -i .tmp-demo-frames/list.ffconcat \
 *         -vf "fps=30,format=yuv420p" -c:v libx264 -crf 20 -movflags +faststart \
 *         docs/demo-video-20261111.mp4
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawn, execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = path.join(ROOT, "dist");
const FRAMES = path.join(ROOT, ".tmp-demo-frames");
const OUT = path.join(ROOT, "docs", "evidence");
const PORTS = [5286, 5287];
const HOST = "127.0.0.1";
const VIEW = { width: 1920, height: 1080, dpr: 1 };
const LOG_PATH = path.join(ROOT, ".tmp-demo-rec.log");
const METRICS_PATH = path.join(OUT, "v3-demo-rec-20261111.json");

const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

if (!CHROME) throw new Error("未找到 Chrome/Edge");
{
  const entry = path.join(DIST, "assets", "index-Ce5zGDeB.js");
  if (!existsSync(entry)) throw new Error("缺少登记构建 dist/assets/index-Ce5zGDeB.js（AGENTS.md §4：录像只能取自最近登记构建）");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function startServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
        const clean = urlPath === "/" ? "/index.html" : urlPath;
        const file = path.join(root, path.normalize(clean).replace(/^([/\\])+/, ""));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("not found: " + clean);
          return;
        }
        const ext = path.extname(file).toLowerCase();
        const type = MIME[ext] || "application/octet-stream";
        const stat = statSync(file);
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
          if (Number.isNaN(start) || start < 0) start = 0;
          end = Math.min(end, stat.size - 1);
          if (start > end) start = Math.max(0, end);
          res.writeHead(206, {
            "content-type": type,
            "content-range": `bytes ${start}-${end}/${stat.size}`,
            "accept-ranges": "bytes",
            "content-length": end - start + 1,
            "cache-control": "no-store",
          });
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { "content-type": type, "content-length": stat.size, "accept-ranges": "bytes", "cache-control": "no-store" });
          createReadStream(file).pipe(res);
        }
      } catch (e) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(String(e));
      }
    });
    const tryListen = (i) => {
      const port = PORTS[i];
      const onError = (err) => {
        if (err && err.code === "EADDRINUSE" && i + 1 < PORTS.length) {
          server.removeListener("error", onError);
          tryListen(i + 1);
        } else reject(err);
      };
      server.once("error", onError);
      server.listen(port, HOST, () => { server.removeListener("error", onError); resolve({ server, port }); });
    };
    tryListen(0);
  });
}

class CDP {
  constructor(wsUrl) {
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message + " " + JSON.stringify(msg.error.data || ""))) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.events.get(msg.method) || []) fn(msg.params);
      }
    };
  }
  ready() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  on(method, fn) { const a = this.events.get(method) || []; a.push(fn); this.events.set(method, a); }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { writeFileSync(LOG_PATH, ""); } catch { /* noop */ }
function log(...a) {
  const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n";
  try { appendFileSync(LOG_PATH, s); } catch { /* noop */ }
  try { process.stdout.write(s); } catch { /* noop */ }
}

async function evalJSON(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}
async function evalAwait(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}
function waitFrames(cdp, n = 2) {
  return evalAwait(cdp, `new Promise((res) => { let i = ${n}; const f = () => { if (--i <= 0) res(true); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`);
}

async function launchChrome() {
  const port = 9800 + Math.floor(Math.random() * 150);
  const profile = path.join(os.tmpdir(), "naiwa-demo-" + port + "-" + Date.now());
  mkdirSync(profile, { recursive: true });
  log("[chrome] launch port=" + port);
  const proc = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${VIEW.width},${VIEW.height}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
    "--hide-scrollbars", "--mute-audio",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization",
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  let info = null;
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { /* waiting */ }
  }
  if (!info) throw new Error("Chrome 20s 内未暴露 CDP");
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.dpr, mobile: false });
  const kill = () => {
    try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
    cdp.close();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* profile 可能被锁 */ }
  };
  return { cdp, kill, port };
}

async function shoot(cdp, file) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(file, Buffer.from(r.data, "base64"));
  return statSync(file).size;
}

// ---------- 录像（全页 screencast） ----------
const frames = [];
let recActive = false;

// ---------- 输入 ----------
async function pressKey(key, code, holdMs = 70) {
  await evalJSON(cdp0, `(function(){window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true}))})()`);
  await sleep(holdMs);
  await evalJSON(cdp0, `(function(){window.dispatchEvent(new KeyboardEvent('keyup',{key:${JSON.stringify(key)},code:${JSON.stringify(code)},bubbles:true}))})()`);
}
let cdp0 = null; // 由 main() 注入（pressKey 闭包引用）

async function rectOf(selector) {
  return await evalJSON(cdp0, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1), cy: +(r.y + r.height / 2).toFixed(1) }; })()`);
}
async function cardRect(i) {
  return await evalJSON(cdp0, `(() => { const els = document.querySelectorAll('.char-card'); const el = els[${i}]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1), cy: +(r.y + r.height / 2).toFixed(1) }; })()`);
}
async function mouseMove(x, y) { await cdp0.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", pointerType: "mouse" }); }
async function mouseClick(x, y) {
  await cdp0.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clicks: 1, pointerType: "mouse" });
  await sleep(70);
  await cdp0.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clicks: 1, pointerType: "mouse" });
}
async function mouseDrag(x1, y1, x2, y2, durMs) {
  await cdp0.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clicks: 1, pointerType: "mouse" });
  const steps = 22;
  for (let i = 1; i <= steps; i++) {
    await mouseMove(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await sleep(durMs / steps);
  }
  await cdp0.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clicks: 1, pointerType: "mouse" });
}
async function glide(points, totalMs) {
  // 沿折线平滑移动指针（每段匀速），用于首页光标/玻璃高光演示
  for (let s = 0; s < points.length - 1; s++) {
    const [x1, y1] = points[s], [x2, y2] = points[s + 1];
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      await mouseMove(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
      await sleep(totalMs / (points.length - 1) / steps);
    }
  }
}
async function waitExpr(expr, timeoutMs, label, everyMs = 150) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await evalJSON(cdp0, expr); } catch { /* 页面切换瞬间可能抛错 */ }
    if (v) return Date.now() - t0;
    if (Date.now() - t0 > timeoutMs) throw new Error("等待超时: " + label);
    await sleep(everyMs);
  }
}

// ---------- 主流程 ----------
async function main() {
  mkdirSync(OUT, { recursive: true });
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });

  const errors = [];
  const timeline = [];
  const mark = (ev) => { const rec = { t: +(Date.now() - T0) / 1000, ev }; timeline.push(rec); log("[t+" + rec.t.toFixed(2) + "s] " + ev); };
  let T0 = Date.now();

  let server = null, kill = null, actualPort = null, cdp = null;
  const result = { ok: false, errors, timeline, frames: 0 };
  try {
    const srv = await startServer(DIST);
    server = srv.server; actualPort = srv.port;
    log("[boot] static root=" + DIST + " url=http://" + HOST + ":" + actualPort + "/");
    const chrome = await launchChrome();
    cdp = chrome.cdp; kill = chrome.kill; cdp0 = cdp;
    result.cdpPort = chrome.port;

    cdp.on("Runtime.exceptionThrown", (p) => errors.push({ kind: "exception", text: p.exceptionDetails?.text, desc: p.exceptionDetails?.exception?.description?.slice(0, 300) }));
    cdp.on("Log.entryAdded", (p) => { if (p.entry?.level === "error" && !/favicon\.ico/.test(p.entry.url || p.entry.text || "")) errors.push({ kind: "log", source: p.entry.source, text: p.entry.text, url: p.entry.url }); });
    cdp.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "assert") errors.push({ kind: "console." + p.type, args: (p.args || []).map((a) => (a.value ?? a.description ?? a.type)).slice(0, 3) }); });
    cdp.on("Network.loadingFailed", (p) => { if (!p.canceled) errors.push({ kind: "network", id: p.requestId, err: p.errorText }); });

    // screencast 帧落地（直接写盘，内存只留索引）
    cdp.on("Page.screencastFrame", (p) => {
      cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
      if (!recActive) return;
      const seq = frames.length + 1;
      const name = "f-" + String(seq).padStart(6, "0") + ".jpg";
      try { writeFileSync(path.join(FRAMES, name), Buffer.from(p.data, "base64")); } catch { /* 磁盘异常则丢帧 */ }
      frames.push({ wall: Date.now(), ts: p.metadata?.timestamp ?? null, file: name });
    });

    // ---- 打开首页 ----
    T0 = Date.now();
    await cdp.send("Page.navigate", { url: `http://${HOST}:${actualPort}/?t=${Date.now()}` });
    await waitExpr(`(() => { const v = document.querySelector('#title-video'); const n = window.__npr; return n && v && v.readyState >= 2 && document.querySelectorAll('#screen-title .menu-btn').length >= 3; })()`, 45000, "首页就绪");
    // 视频若被暂停则尝试续播（muted autoplay 在 headless 偶发被拦）
    const vstat0 = await evalJSON(cdp, `(() => { const v = document.querySelector('#title-video'); if (v && v.paused) { v.play().catch(() => {}); } return { ready: v.readyState, paused: v.paused, w: v.videoWidth, h: v.videoHeight }; })()`);
    result.titleVideo = vstat0;
    await sleep(900);
    mark("首页就绪 video=" + JSON.stringify(vstat0));

    // ---- 开始录制 ----
    recActive = true;
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNth: 1 });
    mark("screencast 开始");

    // ---- 场景 1：首页（~11s）----
    const rStart = await rectOf('#screen-title [data-action="start"]');
    const rChars = await rectOf('#screen-title [data-action="characters"]');
    const rSet = await rectOf('#screen-title [data-action="settings"]');
    if (!rStart || !rChars || !rSet) throw new Error("首页按钮 rect 缺失");
    await mouseMove(1500, 300);
    await glide([[1500, 300], [rSet.cx, rSet.cy], [rChars.cx, rChars.cy], [rStart.cx, rStart.cy], [VIEW.width / 2, VIEW.height / 2 + 120], [rStart.cx, rStart.cy]], 8200);
    await sleep(1200);
    mark("首页演示完成，点击开始作战");
    await mouseMove(rStart.cx, rStart.cy);
    await sleep(350);
    await evalJSON(cdp0, `(() => { document.querySelector('#screen-title [data-action="start"]').click(); return true; })()`);
    await waitExpr(`document.querySelectorAll('.char-card').length === 16 && (() => { const c = document.querySelector('#live3d-layer'); return c && c.width > 0; })()`, 15000, "选人界面就绪");
    await sleep(1400);
    mark("选人界面就绪");

    // ---- 场景 2：选人（~10s）----
    const cardA = await cardRect(0);   // 奶蛙
    const cardB = await cardRect(5);   // 奶狗
    if (!cardA || !cardB) throw new Error("角色卡 rect 缺失");
    await glide([[cardA.cx, cardA.cy], [cardB.cx, cardB.cy]], 2600);
    await sleep(400);
    // 第 16 张卡（西格玛）很可能在视口外：先 scrollIntoView 再视觉移过去，DOM click 保命中（E2E 同款）
    await evalJSON(cdp0, `(() => { const el = document.querySelectorAll('.char-card')[15]; if (!el) throw new Error('no card 15'); el.scrollIntoView({ block: 'center' }); return true; })()`);
    await sleep(650);
    const cardC = await cardRect(15);  // 西格玛
    if (!cardC) throw new Error("角色卡 15 rect 缺失");
    await glide([[cardB.cx, cardB.cy], [cardC.cx, cardC.cy]], 2000);
    await sleep(400);
    await evalJSON(cdp0, `(() => { document.querySelectorAll('.char-card')[15].click(); return true; })()`);  // 选中西格玛（档案卡切换）
    await sleep(1500);
    const rConfirm = await rectOf('[data-action="confirm"]');
    if (!rConfirm) throw new Error("出战按钮 rect 缺失");
    await glide([[cardC.cx, cardC.cy], [rConfirm.cx, rConfirm.cy]], 1600);
    mark("选人演示完成，点击出战（西格玛）");
    await mouseMove(rConfirm.cx, rConfirm.cy);
    await sleep(300);
    await evalJSON(cdp0, `(() => { document.querySelector('[data-action="confirm"]').click(); return true; })()`);
    try {
      await waitExpr(`window.__npr && window.__npr.battle && window.__npr.battle.phase === 'playing' && document.querySelector('#ui') && document.querySelector('#ui').children.length > 0`, 20000, "战斗就绪");
    } catch (e) {
      const dbg = await evalJSON(cdp0, `(() => { const n = window.__npr; const cf = document.querySelector('[data-action="confirm"]'); const r = cf ? cf.getBoundingClientRect() : null; const at = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null; return { phase: n && n.battle ? n.battle.phase : null, active: n && n.squad ? n.squad.activeIndex : null, sel: n && n.screens ? n.screens.selectedIndex : null, hasStart: !!(n && n.screens && n.screens.o && n.screens.o.onStart), visible: [...document.querySelectorAll('.screen')].filter(s => !s.classList.contains('hidden')).map(s => s.id), uiChildren: document.querySelector('#ui') ? document.querySelector('#ui').children.length : -1, atConfirm: at ? at.tagName + '.' + (at.className || '') : null }; })()`).catch(() => null);
      throw new Error("战斗就绪超时 诊断=" + JSON.stringify(dbg));
    }
    await sleep(1200);
    mark("战斗开始 active=" + (await evalJSON(cdp, `window.__npr.squad.active.name`)));

    // ---- 场景 3：战斗（~28s）----
    await pressKey("w", "KeyW", 750);            // 前压
    await sleep(250);
    await pressKey(" ", "Space", 80); await sleep(380);
    await pressKey(" ", "Space", 80); await sleep(520);
    await pressKey(" ", "Space", 80); await sleep(950);   // 三段连段
    mark("连段完成");
    await pressKey("a", "KeyA", 520); await sleep(200);
    await pressKey("d", "KeyD", 520); await sleep(300);
    await pressKey(" ", "Space", 80); await sleep(430);
    await pressKey(" ", "Space", 80); await sleep(900);
    mark("侧移 + 二轮攻击");
    await pressKey("Tab", "Tab", 80);            // 接力换人
    await sleep(2600);                           // 连携演出
    mark("接力换人 active=" + (await evalJSON(cdp, `window.__npr.squad.active.name`)));
    await pressKey("w", "KeyW", 620); await sleep(250);
    await pressKey(" ", "Space", 80); await sleep(500);
    await pressKey("Shift", "ShiftLeft", 80);    // 闪避
    await sleep(650);
    mark("移动 + 攻击 + 闪避");
    await mouseDrag(960, 700, 1420, 640, 1300);  // 相机环绕
    await sleep(400);
    mark("相机环绕");
    // 弹反窗口：轮询预警，命中即 Shift
    let countered = false;
    {
      const t0 = Date.now();
      while (Date.now() - t0 < 9000) {
        const w = await evalJSON(cdp, `window.__npr.counter.isWarning`);
        if (w) {
          await pressKey("Shift", "ShiftLeft", 60);
          await sleep(260);
          const st = await evalJSON(cdp, `({ state: window.__npr.counter.state, total: window.__npr.counter.totalCounters })`);
          countered = st.state === "success";
          result.counter = st;
          mark("弹反尝试 " + JSON.stringify(st));
          break;
        }
        await sleep(120);
      }
    }
    await pressKey(" ", "Space", 80); await sleep(400);
    await pressKey(" ", "Space", 80); await sleep(820);
    await pressKey("a", "KeyA", 420); await sleep(250);
    await pressKey(" ", "Space", 80); await sleep(700);
    mark("战斗收尾 countered=" + countered);

    // ---- 场景 4：结算（~6s）----
    await evalJSON(cdp, `(() => { const n = window.__npr; if (n.opponent && n.opponent.hp > 0) n.opponent.hp = 0; n.endBattle(); return true; })()`);
    await waitExpr(`!document.querySelector('#screen-result').classList.contains('hidden')`, 8000, "结算界面");
    const grade = await evalJSON(cdp, `document.querySelector('#result-grade')?.textContent || ''`);
    mark("结算 grade=" + grade);
    await sleep(900);
    const rBack = await rectOf('#screen-result [data-action="back-title"]');
    if (rBack) { await glide([[VIEW.width / 2, VIEW.height / 2], [rBack.cx, rBack.cy]], 1600); }
    await sleep(1400);

    // ---- 场景 5：返回首页（~3s）----
    if (rBack) {
      await mouseMove(rBack.cx, rBack.cy);
      await sleep(300);
      await evalJSON(cdp0, `(() => { document.querySelector('#screen-result [data-action="back-title"]').click(); return true; })()`);
    }
    await sleep(2600);
    mark("返回首页，停止录制");
    await cdp.send("Page.stopScreencast");
    recActive = false;
    result.frames = frames.length;
    result.grade = grade;
    result.counterAttempted = true;

    // ---- 帧序列 → ffconcat ----
    if (frames.length < 240) throw new Error("帧数过少: " + frames.length);
    let list = "ffconcat version 1.0\n";
    for (let i = 0; i < frames.length; i++) {
      let d;
      if (i < frames.length - 1) d = (frames[i + 1].wall - frames[i].wall) / 1000;
      else d = 0.033;
      d = Math.min(0.25, Math.max(0.008, d));
      list += "file '" + frames[i].file + "'\nduration " + d.toFixed(4) + "\n";
    }
    list += "file '" + frames[frames.length - 1].file + "'\n"; // concat demuxer 要求最后一项重复
    writeFileSync(path.join(FRAMES, "list.ffconcat"), list, "utf8");
    const spanS = (frames[frames.length - 1].wall - frames[0].wall) / 1000;
    result.spanSeconds = +spanS.toFixed(2);
    result.avgFps = +(frames.length / spanS).toFixed(1);
    log("[frames] count=" + frames.length + " span=" + spanS.toFixed(2) + "s avgFps=" + result.avgFps);

    // ---- 插图重拍（screencast 已停）----
    await cdp.send("Page.navigate", { url: `http://${HOST}:${actualPort}/?t=${Date.now()}` });
    await waitExpr(`(() => { const n = window.__npr; return n && document.querySelectorAll('#screen-title .menu-btn').length >= 3; })()`, 30000, "插图 pass 首页就绪");
    await evalJSON(cdp, `(() => { const v = document.querySelector('#title-video'); if (v && v.paused) v.play().catch(() => {}); return true; })()`);
    await sleep(700);
    await evalJSON(cdp, `(() => { if (window.__rafWrapped) return "already"; const orig = window.requestAnimationFrame.bind(window); window.__rafOrig = orig; window.__rafPaused = false; window.__rafPend = []; window.requestAnimationFrame = (cb) => { if (window.__rafPaused) { window.__rafPend.push(cb); return 0; } return orig(cb); }; window.__rafPause = () => { window.__rafPaused = true; }; window.__rafResume = () => { window.__rafPaused = false; const p = window.__rafPend.slice(); window.__rafPend.length = 0; p.forEach((cb) => window.__rafOrig(cb)); }; window.__rafWrapped = true; return "installed"; })()`);

    const stills = [
      { index: 6, file: "v3-show4-01-naifen-20261111.png", rig: true, label: "奶粉" },
      { index: 15, file: "v3-show4-05-xigema-20261111.png", rig: true, label: "西格玛奶蛙" },
      { index: 0, file: "v3-show4-00-naiwa-20261111.png", rig: false, label: "奶蛙（开局默认机位）" },
    ];
    result.stills = [];
    for (const s of stills) {
      await evalJSON(cdp, `(() => { const n = window.__npr; n.startBattle(${s.index}); n.battle.freezeT = 1e9; return true; })()`);
      await sleep(s.rig ? 1100 : 1700);
      if (s.rig) {
        await evalJSON(cdp, `(() => { const n = window.__npr; const p = n.squad.active.move.pos; const c = n.camera; n.squad.active.group.position.copy(p); c.position.set(p.x + 3.8, 1.6, 2.2); c.fov = 40; c.updateProjectionMatrix(); c.lookAt(p.x, 0.7, p.z); c.updateMatrixWorld(true); return true; })()`);
      }
      await waitFrames(cdp, 2);
      await evalJSON(cdp, `window.__rafPause()`);
      await sleep(260);
      await evalJSON(cdp, `window.__npr.postfx.render(0.016)`);
      await sleep(90);
      const bytes = await shoot(cdp, path.join(OUT, s.file));
      const hud = await evalJSON(cdp, `document.querySelector('#hud-shell-name')?.textContent?.trim() || ''`);
      await evalJSON(cdp, `window.__rafResume()`);
      await waitFrames(cdp, 2);
      log("[still] " + s.file + " label=" + s.label + " hud=" + hud + " bytes=" + bytes);
      result.stills.push({ file: s.file, expect: s.label, hud, bytes, hudMatch: hud === s.label });
    }

    // ---- 构建指纹 ----
    const entry = path.join(DIST, "assets", "index-Ce5zGDeB.js");
    result.build = {
      entry: "assets/index-Ce5zGDeB.js",
      bytes: statSync(entry).size,
      sha256_16: createHash("sha256").update(readFileSync(entry)).digest("hex").slice(0, 16),
      servedIndexBytes: statSync(path.join(DIST, "index.html")).size,
      bgVideoBytes: statSync(path.join(DIST, "bg", "title.mp4")).size,
      mtime: statSync(entry).mtime.toISOString(),
    };
    result.viewport = VIEW;
    result.method = "CDP Page.startScreencast(jpeg q85) 全页合成 → ffmpeg concat 30fps H.264（DOM HUD / glass-layer / live3d-layer / cursor3d-layer / 视频背景全部入画）";
    result.ok = true;
  } catch (e) {
    result.fatal = String((e && e.stack) || e);
    log("[fatal] " + result.fatal);
    try { await cdp?.send("Page.stopScreencast"); } catch { /* noop */ }
    recActive = false;
  } finally {
    try { if (kill) kill(); } catch { /* noop */ }
    if (server) await new Promise((r) => server.close(r));
    result.finishedAt = new Date().toISOString();
    writeFileSync(METRICS_PATH, JSON.stringify(result, null, 2), "utf8");
    log("[done] ok=" + result.ok + " frames=" + (result.frames || frames.length) + " errors=" + errors.length + " stills=" + (result.stills?.length || 0));
  }
  if (!result.ok) process.exitCode = 1;
}

function r0safe(v) { return Math.max(1, Math.min(VIEW.height - 2, v)); }

main().catch((e) => {
  log("[top-fatal] " + String((e && e.stack) || e));
  writeFileSync(METRICS_PATH, JSON.stringify({ ok: false, fatal: String((e && e.stack) || e) }, null, 2), "utf8");
  process.exitCode = 1;
});
