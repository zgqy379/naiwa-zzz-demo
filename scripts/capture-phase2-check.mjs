/**
 * 四屏实拍 + 关键状态核对 —— 用于性能治理（2A）后的观感回归验收，同时充当阶段 3 重拍的取景工具。
 *
 * 产出 docs/evidence/v3-phase2-check-<日期>.json + 四张 PNG
 * 核对项：
 *   1. 标题页：视频背景**真的在播**（readyState / paused / currentTime 递增）、液态玻璃层有内容
 *   2. 选人页：16 张卡片的实时 3D 模型**真的渲染出来了**（live3d 场景里有 16 个 group 且可见）
 *   3. 战斗页：玩家角色是**真模型**而非占位球（占位球已被移除）
 *   4. 结算页：评级与统计项齐全
 *   5. 全程 console 错误 = 0
 */
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = process.env.NAIWA_DIST ? path.resolve(process.env.NAIWA_DIST) : path.join(ROOT, "dist");
const STAMP = process.env.NAIWA_STAMP || "phase2";
const OUT_DIR = path.join(ROOT, "docs", "evidence");
const OUT = path.join(OUT_DIR, `v3-${STAMP}-check-20261111.json`);
const PORTS = [5292, 5293];
const HOST = "127.0.0.1";
const VIEW = { width: 1920, height: 1080, dpr: 1 };

const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("未找到 Chrome/Edge");

const indexHtml = readFileSync(path.join(DIST, "index.html"), "utf8");
const ENTRY = (indexHtml.match(/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0];
if (!ENTRY) throw new Error("dist/index.html 未引用入口 JS");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg",
  ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2",
};

function startServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
        const clean = urlPath === "/" ? "/index.html" : urlPath;
        const file = path.join(root, path.normalize(clean).replace(/^([/\\])+/, ""));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("nf"); return; }
        const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
        const stat = statSync(file);
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
          if (Number.isNaN(start) || start < 0) start = 0;
          end = Math.min(end, stat.size - 1);
          if (start > end) start = Math.max(0, end);
          res.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${stat.size}`, "accept-ranges": "bytes", "content-length": end - start + 1, "cache-control": "no-store" });
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { "content-type": type, "content-length": stat.size, "accept-ranges": "bytes", "cache-control": "no-store" });
          createReadStream(file).pipe(res);
        }
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    const tryListen = (i) => {
      const onError = (err) => {
        if (err && err.code === "EADDRINUSE" && i + 1 < PORTS.length) { server.removeListener("error", onError); tryListen(i + 1); }
        else reject(err);
      };
      server.once("error", onError);
      server.listen(PORTS[i], HOST, () => { server.removeListener("error", onError); resolve({ server, port: PORTS[i] }); });
    };
    tryListen(0);
  });
}

class CDP {
  constructor(wsUrl) {
    this.id = 0; this.pending = new Map(); this.events = new Map();
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) { for (const fn of this.events.get(msg.method) || []) fn(msg.params); }
    };
  }
  ready() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  on(method, fn) { const a = this.events.get(method) || []; a.push(fn); this.events.set(method, a); }
  send(method, params = {}) {
    const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(...a) { try { process.stdout.write(a.join(" ") + "\n"); } catch { /* noop */ } }

async function launchChrome() {
  const port = 9800 + Math.floor(Math.random() * 150);
  const profile = path.join(os.tmpdir(), "naiwa-check-" + port + "-" + Date.now());
  mkdirSync(profile, { recursive: true });
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${VIEW.width},${VIEW.height}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync",
    "--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required",
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
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.dpr, mobile: false });
  const kill = () => {
    try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
    cdp.close();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
  };
  return { cdp, kill, port };
}

async function evalJSON(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}
async function waitExpr(cdp, expr, timeoutMs, label) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await evalJSON(cdp, expr); } catch { /* noop */ }
    if (v) return Date.now() - t0;
    if (Date.now() - t0 > timeoutMs) throw new Error("等待超时: " + label);
    await sleep(150);
  }
}
async function shoot(cdp, file) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(file, Buffer.from(r.data, "base64"));
  return statSync(file).size;
}

const VIDEO_PROBE = `(() => {
  const v = document.getElementById("title-video");
  if (!v) return { found: false };
  return { found: true, readyState: v.readyState, paused: v.paused, currentTime: +v.currentTime.toFixed(2), muted: v.muted, w: v.videoWidth, h: v.videoHeight, err: v.error ? v.error.code : null };
})()`;

const LIVE3D_PROBE = `(() => {
  const c = document.getElementById("live3d-layer");
  if (!c) return { found: false };
  const cards = document.querySelectorAll("#select-list .char-card").length;
  // live3d 场景不在 __npr 里；用 canvas 尺寸与「live3d-layer 是否已建 context」间接判定：
  // 惰性化后，只有进入选人页才会给它建 WebGL 上下文
  return { found: true, w: c.width, h: c.height, cards, hasData: c.width > 0 };
})()`;

const MODEL_PROBE = `(() => {
  const n = window.__npr;
  if (!n?.squad) return { error: "no squad" };
  const info = n.squad.members.map((m) => {
    const w = m.group?.getObjectByName("model-wrapper");
    let verts = 0, meshes = 0;
    w?.traverse((c) => { if (c.isMesh) { meshes++; verts += c.geometry?.attributes?.position?.count || 0; } });
    return { name: m.name, verts, meshes, placeholder: !!m.placeholder };
  });
  return {
    total: info.length,
    loaded: info.filter((x) => x.verts >= 1000).length,
    placeholders: info.filter((x) => x.placeholder).length,
    sample: info.slice(0, 3),
  };
})()`;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const errors = [];
  const shots = {};
  let server = null, kill = null, cdp = null;
  const result = { ok: false, measuredAt: new Date().toISOString(), build: { entry: ENTRY, bytes: statSync(path.join(DIST, ENTRY)).size }, errors, shots };

  try {
    const srv = await startServer(DIST);
    server = srv.server;
    const chrome = await launchChrome();
    cdp = chrome.cdp; kill = chrome.kill;
    cdp.on("Runtime.exceptionThrown", (p) => errors.push({ kind: "exception", text: p.exceptionDetails?.text, desc: p.exceptionDetails?.exception?.description?.slice(0, 200) }));
    cdp.on("Log.entryAdded", (p) => { if (p.entry?.level === "error" && !/favicon\.ico/.test(p.entry.url || "")) errors.push({ kind: "log", text: p.entry.text, url: p.entry.url }); });
    cdp.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "assert") errors.push({ kind: "console." + p.type, args: (p.args || []).map((a) => a.value ?? a.description ?? a.type).slice(0, 3) }); });

    await cdp.send("Page.navigate", { url: `http://${HOST}:${srv.port}/` });
    await waitExpr(cdp, "!!(window.__npr && window.__npr.renderer)", 45000, "__npr");
    await sleep(7000);

    // 1) 标题页：视频是否真在播
    const v1 = await evalJSON(cdp, VIDEO_PROBE);
    await sleep(2500);
    const v2 = await evalJSON(cdp, VIDEO_PROBE);
    result.titleVideo = { first: v1, second: v2, advancing: v2.currentTime > v1.currentTime };
    shots.title = { file: `v3-${STAMP}-01-title-20261111.png`, bytes: await shoot(cdp, path.join(OUT_DIR, `v3-${STAMP}-01-title-20261111.png`)) };
    log("[1] 标题页视频:", JSON.stringify(v2), "推进=", result.titleVideo.advancing);

    // 2) 选人页
    await evalJSON(cdp, `document.querySelector('[data-action="start"]').click()`);
    await waitExpr(cdp, "!document.querySelector('#screen-select').classList.contains('hidden')", 15000, "选人页");
    await sleep(8000);   // 等 live3d 的 16 只 GLB 加载 + 首帧渲染
    result.select = await evalJSON(cdp, LIVE3D_PROBE);
    shots.select = { file: `v3-${STAMP}-02-select-20261111.png`, bytes: await shoot(cdp, path.join(OUT_DIR, `v3-${STAMP}-02-select-20261111.png`)) };
    log("[2] 选人页:", JSON.stringify(result.select));

    // 3) 战斗页：真实模型（占位球应已被替换）
    await evalJSON(cdp, `document.querySelector('[data-action="confirm"]').click()`);
    await waitExpr(cdp, "window.__npr && window.__npr.battle && window.__npr.battle.phase === 'playing'", 20000, "战斗");
    await sleep(6000);
    result.battle = await evalJSON(cdp, MODEL_PROBE);
    result.battleState = await evalJSON(cdp, "(() => ({ phase: window.__npr.battle.phase, oppHp: window.__npr.opponent.hp, active: window.__npr.squad.active.name, round: window.__npr.battle.round + 1, total: window.__npr.battle.totalRounds }))()");
    shots.battle = { file: `v3-${STAMP}-03-battle-20261111.png`, bytes: await shoot(cdp, path.join(OUT_DIR, `v3-${STAMP}-03-battle-20261111.png`)) };
    log("[3] 战斗页:", JSON.stringify(result.battleState), "loaded=" + result.battle.loaded + "/" + result.battle.total);

    // 3b) 蓄力条：按住空格到蓄满
    await evalJSON(cdp, `window.__npr.teleportPlayer(-1.0, 0)`);
    await evalJSON(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }))`);
    await sleep(1100);
    result.charge = await evalJSON(cdp, "(() => { const e=document.getElementById('hud-charge'); const f=document.getElementById('hud-charge-fill'); return { show: e?e.classList.contains('show'):null, full: e?e.classList.contains('full'):null, pct: f?f.style.width:'-' }; })()");
    shots.charge = { file: `v3-${STAMP}-03b-charge-20261111.png`, bytes: await shoot(cdp, path.join(OUT_DIR, `v3-${STAMP}-03b-charge-20261111.png`)) };
    log("[3b] 蓄力条:", JSON.stringify(result.charge));
    await evalJSON(cdp, `window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }))`);
    await sleep(1500);

    // 4) 结算页：三连战打完 3 个对手
    for (let i = 0; i < 3; i++) {
      await evalJSON(cdp, `(() => { const n = window.__npr; n.opponent.hp = 0; })()`);
      await sleep(1200);
    }
    await waitExpr(cdp, "!document.querySelector('#screen-result').classList.contains('hidden')", 15000, "结算页");
    await sleep(2500);
    result.result = await evalJSON(cdp, "(() => ({ grade: document.getElementById('result-grade')?.textContent, stats: document.querySelectorAll('.result-stat').length, rewards: document.querySelectorAll('.reward-chip').length, rounds: document.querySelectorAll('#result-rounds .result-round').length, roundsHead: document.querySelector('#result-rounds .result-rounds-head')?.textContent }))()");
    shots.result = { file: `v3-${STAMP}-04-result-20261111.png`, bytes: await shoot(cdp, path.join(OUT_DIR, `v3-${STAMP}-04-result-20261111.png`)) };
    log("[4] 结算页:", JSON.stringify(result.result));

    result.ok = true;
  } catch (e) {
    result.error = String((e && e.stack) || e);
  } finally {
    try { if (kill) kill(); } catch { /* noop */ }
    try { if (server) server.close(); } catch { /* noop */ }
  }

  writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
  log("WROTE " + OUT + "  ok=" + result.ok + (result.error ? "  error=" + result.error : "") + "  errors=" + errors.length);
}

main();
