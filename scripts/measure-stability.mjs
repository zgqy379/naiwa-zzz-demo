/**
 * 阶段 1 证据补强 —— 长时稳定性 / 首屏加载瀑布 / 真触控复测。
 *
 * 三件事一次跑完，产出 docs/evidence/v3-stability-20261111.json：
 *   A. 首屏加载瀑布：禁用缓存导航，按 Network 事件还原每个请求的时间线与传输量
 *   B. 长时稳定性：12 分钟四屏轮转，每 2 秒采样 fps / JS heap / WebGL context 数，
 *      记录 context lost、console 错误、fps 衰减与内存增长趋势
 *   C. 真触控复测：移动视口 + Input.dispatchTouchEvent 真实触摸序列，核对命中与状态流转
 *
 * 通道：自建静态服务（只读服务 dist/）+ 自启 headless Chrome + 原生 CDP over WebSocket
 *      ——与 scripts/capture-demo-video.mjs 同一套基础设施。
 * ⚠ headless=new 在本机实测命中真实 AMD GPU（非 SwiftShader），但窗口非可见，
 *   真机可见窗口与真实手指的观感仍以 ego(lite) 实机通道为准。
 */
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = process.env.NAIWA_DIST ? path.resolve(process.env.NAIWA_DIST) : path.join(ROOT, "dist");
const OUT = path.join(ROOT, "docs", "evidence", process.env.NAIWA_OUT || "v3-stability-20261111.json");
const PORTS = [5290, 5291];
const HOST = "127.0.0.1";
const VIEW = { width: 1920, height: 1080, dpr: 1 };
const RUN_MS = Number(process.env.RUN_MS || 12 * 60 * 1000);
const SAMPLE_MS = 2000;

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
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
          res.writeHead(404); res.end("not found"); return;
        }
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
          res.writeHead(206, {
            "content-type": type, "content-range": `bytes ${start}-${end}/${stat.size}`,
            "accept-ranges": "bytes", "content-length": end - start + 1, "cache-control": "no-store",
          });
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
  const profile = path.join(os.tmpdir(), "naiwa-stab-" + port + "-" + Date.now());
  mkdirSync(profile, { recursive: true });
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
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
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  await cdp.send("Log.enable"); await cdp.send("Network.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.dpr, mobile: false });
  const kill = () => {
    try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
    cdp.close();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
  };
  return { cdp, kill, port };
}

async function evalAwait(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}
async function evalJSON(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
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

// 页面内常量：fps 计数 + 统计量
const PAGE_PROBES = `(() => {
  window.__probe = window.__probe || { frames: 0, lost: 0, errs: [] };
  if (!window.__probeHooked) {
    window.__probeHooked = true;
    const origReq = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => origReq((t) => { window.__probe.frames++; return cb(t); });
    window.addEventListener("webglcontextlost", (e) => { window.__probe.lost++; }, true);
    window.addEventListener("error", (e) => { window.__probe.errs.push(String(e.message || e).slice(0, 200)); });
  }
  return true;
})()`;

const SAMPLE = `(() => {
  const p = window.__probe || { frames: 0, lost: 0, errs: [] };
  const f = p.frames; p.frames = 0;
  // context 数：读页面加载前注入的 getContext 补丁记录（只统计应用**真正创建过**的，
  //   不用 getContext 探测——那会凭空创建 context）
  const log = window.__ctxLog || [];
  const seen = new Set();
  for (const e of log) seen.add(e.id + "@" + e.type);
  const ctx = seen.size;
  const canvases = document.querySelectorAll("canvas").length;
  let screen = "unknown";
  for (const s of document.querySelectorAll("[id^=screen-]")) if (!s.classList.contains("hidden")) screen = s.id;
  return {
    t: Date.now(),
    frames: f,
    ctx, canvases,
    screen,
    heap: performance.memory ? performance.memory.usedJSHeapSize : null,
    lost: p.lost,
    errs: p.errs.length,
    phase: (window.__npr && window.__npr.battle) ? window.__npr.battle.phase : null,
  };
})()`;

async function main() {
  mkdirSync(path.dirname(OUT), { recursive: true });
  const errors = [];
  const netlog = [];
  let server = null, kill = null, cdp = null;
  const result = {
    ok: false,
    measuredAt: new Date().toISOString(),
    build: { entry: ENTRY, entryBytes: statSync(path.join(DIST, ENTRY)).size },
    caveats: [
      "headless=new 窗口不可见；本机实测命中真实 AMD GPU（非 SwiftShader），但真机可见窗口与真实手指观感以 ego(lite) 实机通道为准",
      "长时稳定性的 fps 为 headless 采样值，仅用于**趋势与衰减**判断，不作为真机帧率结论",
    ],
    errors,
  };

  try {
    const srv = await startServer(DIST);
    server = srv.server;
    const chrome = await launchChrome();
    cdp = chrome.cdp; kill = chrome.kill;
    log("[boot] port=" + srv.port + " cdp=" + chrome.port);

    cdp.on("Runtime.exceptionThrown", (p) => errors.push({ kind: "exception", text: p.exceptionDetails?.text, desc: p.exceptionDetails?.exception?.description?.slice(0, 240) }));
    cdp.on("Log.entryAdded", (p) => { if (p.entry?.level === "error" && !/favicon\.ico/.test(p.entry.url || "")) errors.push({ kind: "log", text: p.entry.text, url: p.entry.url }); });
    cdp.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "assert") errors.push({ kind: "console." + p.type, args: (p.args || []).map((a) => a.value ?? a.description ?? a.type).slice(0, 3) }); });

    // 页面脚本执行**之前**注入 getContext 补丁：记录应用真正创建过的每一个 WebGL 上下文
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        window.__ctxLog = [];
        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
          const ctx = orig.call(this, type, attrs);
          if (ctx && (type === "webgl" || type === "webgl2" || type === "experimental-webgl")) {
            window.__ctxLog.push({ id: this.id || "(anon)", type, w: this.width, h: this.height, at: Date.now() });
          }
          return ctx;
        };
      })()`,
    });

    // ---------- A. 首屏加载瀑布（禁用缓存） ----------
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    const reqs = new Map();
    cdp.on("Network.requestWillBeSent", (p) => {
      reqs.set(p.requestId, {
        url: p.request.url.replace(/^https?:\/\/[^/]+/, ""),
        method: p.request.method,
        type: p.type,
        start: p.timestamp,
        bytes: 0,
        status: null,
        mime: null,
        fromCache: false,
      });
    });
    cdp.on("Network.responseReceived", (p) => {
      const r = reqs.get(p.requestId);
      if (r) { r.status = p.response.status; r.mime = p.response.mimeType; r.fromCache = !!p.response.fromDiskCache || !!p.response.fromPrefetchCache; r.encoded = p.response.encodedDataLength; }
    });
    cdp.on("Network.loadingFinished", (p) => {
      const r = reqs.get(p.requestId);
      if (r) { r.end = p.timestamp; r.bytes = p.encodedDataLength; }
    });
    cdp.on("Network.loadingFailed", (p) => {
      const r = reqs.get(p.requestId);
      if (r) { r.failed = p.errorText; r.end = p.timestamp; }
      errors.push({ kind: "network", url: r ? r.url : p.requestId, err: p.errorText, canceled: p.canceled });
    });

    const t0 = Date.now();
    await cdp.send("Page.navigate", { url: `http://${HOST}:${srv.port}/` });
    await waitExpr(cdp, "!!(window.__npr && window.__npr.renderer && window.__npr.scene)", 45000, "__npr 就绪");
    await sleep(8000);
    await evalJSON(cdp, PAGE_PROBES);
    const paint = await evalJSON(cdp, "performance.getEntriesByType('paint').map(p=>({name:p.name,t:Math.round(p.startTime)}))");
    const nav = await evalJSON(cdp, "(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), responseEnd: Math.round(n.responseEnd), transferSize: n.transferSize, encodedBodySize: n.encodedBodySize, decodedBodySize: n.decodedBodySize } : null; })()");
    const reqArr = [...reqs.values()];
    result.waterfall = {
      wallMs: Date.now() - t0,
      paint,
      navigation: nav,
      requestCount: reqArr.length,
      totalEncodedBytes: reqArr.reduce((s, r) => s + (r.bytes || 0), 0),
      byType: Object.entries(reqArr.reduce((m, r) => { const k = r.type || "Other"; m[k] = (m[k] || 0) + (r.bytes || 0); return m; }, {}))
        .map(([k, v]) => ({ type: k, bytes: v })).sort((a, b) => b.bytes - a.bytes),
      requests: reqArr.sort((a, b) => (a.start || 0) - (b.start || 0)).map((r) => ({
        url: r.url, type: r.type, status: r.status, bytes: r.bytes || 0,
        ms: r.end && r.start ? Math.round((r.end - r.start) * 1000) : null,
        failed: r.failed || null,
      })),
    };
    log("[A] waterfall: " + result.waterfall.requestCount + " reqs, " + Math.round(result.waterfall.totalEncodedBytes / 1024) + " KB");

    // ---------- B. 长时稳定性 ----------
    const samples = [];
    const tStart = Date.now();
    let lastScreen = "title";
    let cycle = 0;
    while (Date.now() - tStart < RUN_MS) {
      const s = await evalJSON(cdp, SAMPLE);
      s.elapsedMs = Date.now() - tStart;
      s.fps = Math.round((s.frames / (SAMPLE_MS / 1000)) * 10) / 10;
      samples.push(s);
      log(`[B] t=${Math.round(s.elapsedMs / 1000)}s screen=${s.screen} fps=${s.fps} ctx=${s.ctx} heap=${Math.round((s.heap || 0) / 1048576)}MB`);

      // 每 ~75 秒切一次屏，制造四屏轮转
      if (s.elapsedMs - cycle * 75000 > 75000) {
        cycle++;
        try {
          if (lastScreen === "title") {
            await evalJSON(cdp, `document.querySelector('[data-action="start"]').click()`);
            await sleep(2500);
          } else if (lastScreen === "select") {
            await evalJSON(cdp, `document.querySelector('[data-action="confirm"]').click()`);
            await sleep(3500);
          } else if (lastScreen === "battle") {
            await evalJSON(cdp, `(() => { const n = window.__npr; n.opponent.hp = 0; n.endBattle(); })()`);
            await sleep(2500);
          } else {
            await evalJSON(cdp, `document.querySelector('#screen-result [data-action="back-title"]').click()`);
            await sleep(2500);
          }
          const cur = await evalJSON(cdp, `(() => { for (const s of document.querySelectorAll("[id^=screen-]")) if (!s.classList.contains("hidden")) return s.id; return "unknown"; })()`);
          lastScreen = cur.replace("screen-", "");
        } catch (e) { errors.push({ kind: "screen-cycle", text: String(e.message || e) }); }
      }
      await sleep(SAMPLE_MS);
    }
    const fpsVals = samples.map((s) => s.fps).filter((v) => v > 0);
    const firstHalf = fpsVals.slice(0, Math.floor(fpsVals.length / 2));
    const secondHalf = fpsVals.slice(Math.floor(fpsVals.length / 2));
    const avg = (a) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null);
    result.stability = {
      runMs: Date.now() - tStart,
      sampleCount: samples.length,
      screensVisited: [...new Set(samples.map((s) => s.screen))],
      fps: { min: Math.min(...fpsVals), max: Math.max(...fpsVals), avgFirstHalf: avg(firstHalf), avgSecondHalf: avg(secondHalf) },
      contextLostEvents: samples.length ? samples[samples.length - 1].lost : null,
      maxContexts: Math.max(...samples.map((s) => s.ctx || 0)),
      heap: {
        firstMB: Math.round((samples[0]?.heap || 0) / 1048576),
        lastMB: Math.round((samples[samples.length - 1]?.heap || 0) / 1048576),
        maxMB: Math.round(Math.max(...samples.map((s) => s.heap || 0)) / 1048576),
      },
      samples,
    };
    log("[B] stability done: " + JSON.stringify(result.stability.fps) + " heap " + result.stability.heap.firstMB + "->" + result.stability.heap.lastMB + "MB");

    // ---------- C. 真触控复测（移动视口） ----------
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cdp.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
    await cdp.send("Page.navigate", { url: `http://${HOST}:${srv.port}/?touch=1` });
    await waitExpr(cdp, "!!(window.__npr && window.__npr.screens)", 45000, "移动视口就绪");
    await sleep(6000);

    const touchSteps = [];
    const tap = async (sel, label) => {
      const rect = await evalJSON(cdp, `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
      if (!rect) { touchSteps.push({ label, ok: false, reason: "选择器未命中" }); return false; }
      const pt = [{ x: rect.x, y: rect.y, radiusX: 12, radiusY: 12, force: 1, id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
      await sleep(90);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(700);
      touchSteps.push({ label, ok: true, rect });
      return true;
    };
    const state = async () => await evalJSON(cdp, `(() => { let cur = "unknown"; for (const s of document.querySelectorAll("[id^=screen-]")) if (!s.classList.contains("hidden")) cur = s.id; return { screen: cur, selected: window.__npr && window.__npr.screens ? window.__npr.screens.selectedIndex : null, phase: window.__npr && window.__npr.battle ? window.__npr.battle.phase : null, activeIndex: window.__npr && window.__npr.squad ? window.__npr.squad.activeIndex : null }; })()`);

    const st0 = await state();
    await tap('[data-action="start"]', "触屏点击「开始作战」");
    const st1 = await state();
    await tap(".char-card", "触屏点击第 1 张角色卡");
    const st2 = await state();
    await tap('[data-action="confirm"]', "触屏点击「出战」");
    await sleep(2500);
    const st3 = await state();
    // 战斗中的 HUD 键位（空格/Shift 在 DOM 上是 .key 胶囊，触屏应能命中）
    const hudKeys = await evalJSON(cdp, `(() => [...document.querySelectorAll('#ui .key, #ui .keycap, #ui [data-key]')].map(e => ({ text: (e.textContent||'').trim().slice(0,20), cls: e.className })))()`);
    await tap('#ui .key', "触屏点击 HUD 键位");
    await sleep(1200);
    const st4 = await state();

    // 触摸拖拽（相机环绕）
    const dragOk = await evalJSON(cdp, `(() => { const c = document.querySelector('#gl'); if (!c) return false; const r = c.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })()`);
    let camBefore = null, camAfter = null;
    if (dragOk) {
      camBefore = await evalJSON(cdp, "(() => { const c = window.__npr.camera; return { x: +c.position.x.toFixed(3), z: +c.position.z.toFixed(3) }; })()");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: dragOk.x, y: dragOk.y, radiusX: 10, radiusY: 10, force: 1, id: 1 }] });
      for (let i = 1; i <= 12; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: dragOk.x + i * 12, y: dragOk.y - i * 3, radiusX: 10, radiusY: 10, force: 1, id: 1 }] });
        await sleep(45);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(900);
      camAfter = await evalJSON(cdp, "(() => { const c = window.__npr.camera; return { x: +c.position.x.toFixed(3), z: +c.position.z.toFixed(3) }; })()");
    }

    result.touch = {
      viewport: "390x844 @dpr3, touch enabled",
      steps: touchSteps,
      hudKeyCandidates: hudKeys,
      states: { st0, st1, st2, st3, st4 },
      cameraDrag: { before: camBefore, after: camAfter, moved: !!(camBefore && camAfter && (camBefore.x !== camAfter.x || camBefore.z !== camAfter.z)) },
    };
    log("[C] touch: " + JSON.stringify(result.touch.states));

    result.ok = true;
  } catch (e) {
    result.error = String((e && e.stack) || e);
  } finally {
    try { if (kill) kill(); } catch { /* noop */ }
    try { if (server) server.close(); } catch { /* noop */ }
  }

  writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
  log("WROTE " + OUT + "  ok=" + result.ok + (result.error ? "  error=" + result.error : ""));
  if (result.waterfall) log("  requests=" + result.waterfall.requestCount + " totalKB=" + Math.round(result.waterfall.totalEncodedBytes / 1024));
  if (result.stability) log("  fps=" + JSON.stringify(result.stability.fps) + " heap=" + result.stability.heap.firstMB + "->" + result.stability.heap.lastMB + "MB lost=" + result.stability.contextLostEvents);
  if (result.errors) log("  errors=" + result.errors.length);
}

main();
