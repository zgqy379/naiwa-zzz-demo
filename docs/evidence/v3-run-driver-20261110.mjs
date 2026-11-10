/**
 * 交付演练M（team task 20）—— `dist` 交付物「可直接录 32s 视频」实跑验证驱动。
 *
 * 纪律（与任务红线一致）：
 *  - **只读 dist**：本脚本绝不写 dist，也绝不碰 src/ 与 public/；产物全部落 docs/evidence/
 *  - 静态服务 + CDP **同一 node 进程**（Windows 下后台子进程会被回收），`finally` 关闭
 *  - **挂根路径 `/`**：GLB 走绝对路径 `/asset/*.glb`，只挂子目录会 404 退化成占位球
 *  - 全部走**真实输入路径**：Input.dispatchMouseEvent / Input.dispatchKeyEvent，不直接改游戏状态
 *  - 读数只走 DOM 选择器与 `window.__npr` 公开句柄；压缩产物内部变量名已重命名，不 grep 源码变量
 *  - 页面内 instrumentation 仅做**只读观测**（MutationObserver 读 style/新增节点），不改应用逻辑
 *
 * 用法：
 *   node docs/evidence/v3-run-driver-20261110.mjs --port 5292 \
 *        --out-prefix v3-run --date 20261110 \
 *        --json docs/evidence/v3-run-20261110.json \
 *        --log docs/evidence/v3-run-driver-20261110.log
 */
import http from "node:http";
import crypto from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)); // docs/evidence
const ROOT = path.resolve(HERE, "..", "..");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const DIST = path.resolve(ROOT, arg("dist", "dist"));
const PORT_PREFERRED = Number(arg("port", "5292"));
const PORTS = [PORT_PREFERRED, PORT_PREFERRED + 1, PORT_PREFERRED + 2]; // 5283–5291 有历史占用
const HOST = "127.0.0.1";
const PREFIX = arg("out-prefix", "v3-run");
const DATE = arg("date", "20261110");
const JSON_OUT = path.resolve(ROOT, arg("json", `docs/evidence/${PREFIX}-${DATE}.json`));
const LOG_PATH = path.resolve(ROOT, arg("log", `docs/evidence/${PREFIX}-driver-${DATE}.log`));
const SHOT_DIR = path.resolve(ROOT, arg("shot-dir", "docs/evidence"));

const VIEW = { width: 1600, height: 1000, dpr: 1.25 }; // → 截图 2000×1250
const BOOT_TIMEOUT_MS = 20000;
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

if (!CHROME) throw new Error("未找到 Chrome/Edge");
if (!existsSync(path.join(DIST, "index.html"))) throw new Error("缺少 " + DIST + "/index.html");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".glb": "model/gltf-binary",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".map": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { writeFileSync(LOG_PATH, ""); } catch { /* noop */ }
function log(...a) {
  const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n";
  try { appendFileSync(LOG_PATH, s); } catch { /* noop */ }
  try { process.stdout.write(s); } catch { /* noop */ }
}

/** 交付物快照：只读 stat + hash（用于证明「测的是哪一版、中途有没有被外部改写」） */
function distSnapshot() {
  const snap = { dir: path.relative(ROOT, DIST).replace(/\\/g, "/"), at: new Date().toISOString(), files: [] };
  const add = (rel) => {
    const f = path.join(DIST, rel);
    if (!existsSync(f)) return;
    const st = statSync(f);
    snap.files.push({
      file: rel,
      size: st.size,
      mtime: new Date(st.mtimeMs).toISOString(),
      sha256: crypto.createHash("sha256").update(readFileSync(f)).digest("hex"),
    });
  };
  add("index.html");
  const assetsDir = path.join(DIST, "assets");
  if (existsSync(assetsDir)) {
    // vite 默认单入口 → assets 顶层只有 index-<hash>.js / .css 各一个
    for (const f of readdirSync(assetsDir)) {
      if (f.endsWith(".js") || f.endsWith(".css")) add("assets/" + f);
    }
  }
  const srcSnap = {};
  for (const rel of ["src/main.mjs", "src/game/tuning.mjs", "src/vfx/cinematic.mjs"]) {
    const f = path.join(ROOT, rel);
    if (existsSync(f)) { const st = statSync(f); srcSnap[rel] = { size: st.size, mtime: new Date(st.mtimeMs).toISOString() }; }
  }
  snap.src = srcSnap;
  return snap;
}

function startServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
        const clean = urlPath === "/" ? "/index.html" : urlPath;
        const file = path.join(root, path.normalize(clean).replace(/^([/\\])+/, ""));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("not found: " + clean);
          return;
        }
        res.writeHead(200, {
          "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        });
        createReadStream(file).pipe(res);
      } catch (e) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(String(e));
      }
    });
    const tryListen = (i) => {
      const port = PORTS[i];
      const onError = (err) => {
        if (err && err.code === "EADDRINUSE" && i + 1 < PORTS.length) {
          log("[server] port " + port + " 被占用，改用 " + PORTS[i + 1]);
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

async function evalJSON(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}

async function evalAwait(cdp, expr, timeout = 30000) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, timeout });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}

/** 真实鼠标点击：坐标取 getBoundingClientRect 中心（CSS px） */
async function clickSel(cdp, sel) {
  const rect = await evalJSON(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height,
             vis: getComputedStyle(el).visibility, opacity: +getComputedStyle(el).opacity };
  })()`);
  if (!rect || !rect.found || rect.w === 0) return { ok: false, why: "selector not found/invisible: " + sel, rect };
  const x = +rect.x.toFixed(1), y = +rect.y.toFixed(1);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await sleep(40);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  return { ok: true, rect: { x, y, w: +rect.w.toFixed(1), h: +rect.h.toFixed(1) }, vis: rect.vis };
}

/** 真实按键：Input.dispatchKeyEvent（不是 document.dispatchEvent） */
async function pressKey(cdp, { key, code, vk, modifiers = 0, holdMs = 45 }) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  const down = { type: "keyDown", ...base };
  if (key.length === 1) down.text = key;
  down.unmodifiedText = key.length === 1 ? key : undefined;
  await cdp.send("Input.dispatchKeyEvent", down);
  await sleep(holdMs);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}
const pressSpace = (cdp) => pressKey(cdp, { key: " ", code: "Space", vk: 32 });
const pressShift = (cdp) => pressKey(cdp, { key: "Shift", code: "ShiftLeft", vk: 16, modifiers: 8 });

/** 真实鼠标拖拽（window 上的 mousedown/mousemove/mouseup 才会被 main.mjs 采纳） */
async function drag(cdp, fromX, toX, y, steps = 12, stepMs = 25) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fromX, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: fromX, y, button: "left", buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    const x = fromX + ((toX - fromX) * i) / steps;
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    await sleep(stepMs);
  }
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: toX, y, button: "left", buttons: 0, clickCount: 1 });
}

const STATE_EXPR = `(() => {
  const n = window.__npr;
  if (!n) return { ok: false, why: "no __npr" };
  const groups = (n.squad?.members ?? []).map((m, i) => ({ i, name: m.name, id: m.id, visible: !!m.group?.visible }));
  const vis = groups.filter((g) => g.visible);
  const og = n.scene.getObjectByName("opponent");
  return {
    ok: true,
    screen: n.screens?.current ?? null,
    activeName: n.squad?.active?.name ?? null,
    activeId: n.squad?.active?.id ?? null,
    activeIndex: n.squad?.activeIndex ?? null,
    visibleGroups: vis,
    visibleCount: vis.length,
    totalGroups: groups.length,
    allMemberNames: groups.map((g) => g.name),
    opponentVisible: !!og?.visible,
    opponentHp: n.opponent?.hp ?? null,
    opponentMaxHp: n.opponent?.maxHp ?? null,
    battleTimer: n.battle?.timer ?? null,
    battleTimerType: typeof n.battle?.timer,
    battlePhase: n.battle?.phase ?? null,
    battleElapsed: n.getBattleStats?.().elapsed ?? null,
    hudElapsedText: document.querySelector("#hud-elapsed")?.textContent ?? null,
    hudHpText: document.querySelector("#hud-hp-num")?.textContent ?? null,
    hudOppText: document.querySelector("#hud-opp-num")?.textContent ?? null,
    hudShellName: document.querySelector("#hud-shell-name")?.textContent ?? null,
    hudShellIdx: document.querySelector("#hud-shell-idx")?.textContent ?? null,
    hudCounterShown: document.querySelector("#hud-counter")?.classList.contains("show") ?? null,
    canvas: [n.renderer.domElement.width, n.renderer.domElement.height],
    inner: [innerWidth, innerHeight],
    pixelRatio: n.renderer.getPixelRatio(),
    fov: +Number(n.camera.fov).toFixed(2),
    exposure: n.renderer.toneMappingExposure,
    shadowMapType: n.renderer.shadowMap.type,
    bloom: n.postfx?.bloom ? { enabled: n.postfx.bloom.enabled, strength: +Number(n.postfx.bloom.strength).toFixed(3) } : null,
    cam: { x: +n.camera.position.x.toFixed(3), y: +n.camera.position.y.toFixed(3), z: +n.camera.position.z.toFixed(3) },
    counter: { state: n.counter?.state ?? null, total: n.counter?.totalCounters ?? null, last: n.counter?.lastResult ?? null },
    combo: { stageIndex: n.combo?.stageIndex ?? null, comboCount: n.combo?.comboCount ?? null },
    freezeT: +Number(n.battle?.freezeT ?? 0).toFixed(3),
  };
})()`;

/** renderer.info：autoReset=false + reset() + 双 rAF 取一帧；再取「主场景单渲」口径剔除 OutputPass 全屏三角 */
const INFO_EXPR = `(async () => {
  const n = window.__npr;
  const info = n.renderer.info;
  const prevAuto = info.autoReset;
  info.autoReset = false;
  info.reset();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const measured = {
    triangles: info.render.triangles,
    calls: info.render.calls,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
  info.reset();
  n.renderer.render(n.scene, n.camera);
  const direct = { triangles: info.render.triangles, calls: info.render.calls };
  info.autoReset = prevAuto;
  n.postfx.render(0.016);
  return { measured, direct, prevAutoReset: prevAuto };
})()`;

/** 120 帧帧间隔 → 平均 fps 与 p5 fps（p5 = 1000 / p95 帧时长） */
const FPS_EXPR = `(() => new Promise((resolve) => {
  const ts = []; const N = 120;
  const f = (t) => {
    ts.push(t);
    if (ts.length < N) { requestAnimationFrame(f); return; }
    const dts = [];
    for (let i = 1; i < ts.length; i++) dts.push(ts[i] - ts[i - 1]);
    const sorted = dts.slice().sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];
    const avgMs = (ts[ts.length - 1] - ts[0]) / (N - 1);
    resolve({
      frames: N,
      avgMs: +avgMs.toFixed(2),
      avgFps: +(1000 / avgMs).toFixed(2),
      p50Fps: +(1000 / at(50)).toFixed(2),
      p5Fps: +(1000 / at(95)).toFixed(2),
      worstMs: +sorted[sorted.length - 1].toFixed(2),
      lastMs: +sorted[sorted.length - 1].toFixed(2),
    });
  };
  requestAnimationFrame(f);
}))()`;

async function installProbe(cdp) {
  return evalJSON(cdp, `(() => {
    if (window.__runProbe) return { ok: true, existing: true };
    const P = { t0: +performance.now().toFixed(1), flash: [], words: [], shockPolls: 0 };
    window.__runProbe = P;
    const flashEl = document.querySelector(".hit-flash");
    if (flashEl) {
      P.moFlash = new MutationObserver(() => {
        const v = parseFloat(flashEl.style.opacity);
        if (Number.isFinite(v)) P.flash.push({ t: +performance.now().toFixed(1), v: +v.toFixed(4) });
      });
      P.moFlash.observe(flashEl, { attributes: true, attributeFilter: ["style"] });
    }
    const sc = document.querySelector(".sfx-container");
    if (sc) {
      P.moWords = new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.classList.contains("sfx-word")) {
            P.words.push({ t: +performance.now().toFixed(1), text: n.textContent, cls: n.className });
          }
        }
      });
      P.moWords.observe(sc, { childList: true });
    }
    return { ok: true, flashObserved: !!P.moFlash, wordsObserved: !!P.moWords };
  })()`);
}

async function probeSlice(cdp, sinceFlash, sinceWords) {
  return evalJSON(cdp, `(() => {
    const P = window.__runProbe; if (!P) return null;
    return {
      flash: P.flash.slice(${sinceFlash}).map((x) => ({ t: x.t, v: x.v })),
      words: P.words.slice(${sinceWords}).map((x) => ({ t: x.t, text: x.text, cls: x.cls })),
      totalFlash: P.flash.length, totalWords: P.words.length,
    };
  })()`);
}

async function probeMark(cdp) {
  return evalJSON(cdp, `(() => { const P = window.__runProbe; return P ? { f: P.flash.length, w: P.words.length } : { f: 0, w: 0 }; })()`);
}

/** 冲击波：场景里带 userData.maxRadius 的环（Shockwave.spawn 写入），只读轮询 */
async function pollShockwaves(cdp, durationMs) {
  const out = [];
  const t0 = Date.now();
  while (Date.now() - t0 < durationMs) {
    const list = await evalJSON(cdp, `(() => {
      const n = window.__npr; if (!n) return [];
      return n.scene.children
        .filter((c) => c.userData && typeof c.userData.maxRadius === "number")
        .map((c) => ({
          maxRadius: c.userData.maxRadius,
          duration: c.userData.duration,
          t: +Number(c.userData.t).toFixed(3),
          scaleX: +Number(c.scale.x).toFixed(3),
          opacity: +Number(c.material?.opacity ?? -1).toFixed(3),
        }));
    })()`);
    if (list && list.length) out.push({ dtMs: Date.now() - t0, list });
    await sleep(12);
  }
  return out;
}

function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function shot(cdp, file, list) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const buf = Buffer.from(r.data, "base64");
  const abs = path.resolve(SHOT_DIR, file);
  writeFileSync(abs, buf);
  const size = pngSize(buf);
  const rec = { file: path.relative(ROOT, abs).replace(/\\/g, "/"), bytes: buf.length, px: size, at: new Date().toISOString() };
  if (list) list.push(rec);
  log("[shot] " + rec.file + " " + buf.length + "B " + (size ? size.width + "x" + size.height : "?"));
  return rec;
}

function waitScreen(cdp, name, timeoutMs) {
  const t = Date.now();
  return (async () => {
    while (Date.now() - t < timeoutMs) {
      const cur = await evalJSON(cdp, "(() => window.__npr?.screens?.current ?? null)()").catch(() => null);
      if (cur === name) return { ok: true, ms: Date.now() - t };
      await sleep(40);
    }
    const cur = await evalJSON(cdp, "(() => window.__npr?.screens?.current ?? null)()").catch(() => null);
    return { ok: false, ms: Date.now() - t, current: cur };
  })();
}

function launchChrome() {
  return (async () => {
    const port = 9400 + Math.floor(Math.random() * 400);
    const profile = path.join(os.tmpdir(), "naiwa-dist-readiness-" + port + "-" + Date.now());
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
    mkdirSync(profile, { recursive: true });
    log("[chrome] port=" + port + " profile=" + profile);
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
      try { process.platform === "win32" ? execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }) : proc.kill("SIGKILL"); } catch { /* noop */ }
      cdp.close();
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* profile 可能被锁 */ }
    };
    return { cdp, kill, port, profile };
  })();
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const result = {
    meta: { dist: path.relative(ROOT, DIST).replace(/\\/g, "/"), viewport: VIEW, chrome: CHROME, startedAt: new Date().toISOString() },
    distBefore: distSnapshot(),
    boot: {}, fps: null, screenshots: [], steps: {}, errors: { exceptions: [], consoleErrors: [], consoleWarnings: [], consoleOthers: [], logErrors: [], httpErrors: [], loadingFailed: [] },
    distAfter: null, notes: [],
  };
  let server = null, kill = null, actualPort = null;

  try {
    const srv = await startServer(DIST);
    server = srv.server;
    actualPort = srv.port;
    const url = `http://${HOST}:${actualPort}/`;
    log("[boot] root=" + DIST + " url=" + url);
    result.meta.url = url;
    result.meta.port = actualPort;

    const chrome = await launchChrome();
    const cdp = chrome.cdp;
    kill = chrome.kill;

    cdp.on("Runtime.exceptionThrown", (p) => {
      const d = p.exceptionDetails || {};
      result.errors.exceptions.push({
        text: d.text, errorName: d.exception?.className || null, message: d.exception?.description || null,
        url: d.url || null, line: (d.lineNumber ?? -1) + 1,
        at: new Date().toISOString(),
      });
    });
    cdp.on("Log.entryAdded", (p) => {
      const e = p.entry || {};
      const text = (e.text || "") + " " + (e.url || "");
      if (e.level === "error") {
        if (/favicon\.ico/i.test(text)) { result.meta.favicon404 = true; return; }
        result.errors.logErrors.push({ source: e.source, text: e.text, url: e.url });
      } else if (e.level === "warning") {
        result.errors.consoleWarnings.push({ source: e.source, text: e.text, url: e.url });
      }
    });
    cdp.on("Runtime.consoleAPICalled", (p) => {
      const args = (p.args || []).map((a) => a.value ?? a.description ?? a.type);
      if (p.type === "error" || p.type === "assert") result.errors.consoleErrors.push({ type: p.type, args });
      else if (p.type === "warning") result.errors.consoleWarnings.push({ type: p.type, args });
      else result.errors.consoleOthers.push({ type: p.type, args });
    });
    cdp.on("Network.loadingFailed", (p) => {
      if (p.canceled) return;
      result.errors.loadingFailed.push({ requestId: p.requestId, errorText: p.errorText, type: p.type });
    });
    cdp.on("Network.responseReceived", (p) => {
      const r = p.response || {};
      if (r.status >= 400) result.errors.httpErrors.push({ status: r.status, url: r.url, type: p.type });
    });

    const t0 = Date.now();
    await cdp.send("Page.navigate", { url: url + "?t=" + Date.now() });

    // 1) 等 window.__npr
    let nprSeen = false;
    for (let i = 0; i < BOOT_TIMEOUT_MS / 100; i++) {
      await sleep(100);
      try { nprSeen = await evalJSON(cdp, "!!window.__npr"); } catch { nprSeen = false; }
      if (nprSeen) break;
    }
    result.boot.nprMs = Date.now() - t0;
    result.boot.nprSeen = nprSeen;
    log("[boot] __npr=" + nprSeen + " in " + result.boot.nprMs + "ms");
    if (!nprSeen) throw new Error("__npr 20s 内未出现（白屏/启动失败）");

    // 2) 首屏时序（navigation timing）
    result.boot.nav = await evalJSON(cdp, `(() => {
      const e = performance.getEntriesByType("navigation")[0];
      if (!e) return null;
      return {
        domContentLoadedMs: +e.domContentLoadedEventEnd.toFixed(1),
        loadMs: +e.loadEventEnd.toFixed(1),
        responseEndMs: +e.responseEnd.toFixed(1),
        domInteractiveMs: +e.domInteractive.toFixed(1),
        transferSizeKB: +((e.transferSize ?? 0) / 1024).toFixed(1),
      };
    })()`);
    log("[boot] nav=" + JSON.stringify(result.boot.nav));

    // 3) 真实输入：title → select
    await sleep(500);
    const tTitleClick = Date.now();
    const c1 = await clickSel(cdp, '#screen-title [data-action="start"]');
    const s1 = await waitScreen(cdp, "select", 6000);
    result.boot.titleToSelectMs = s1.ms;
    result.steps.enter = {
      startClick: c1, selectReached: s1,
      urlAfter: await evalJSON(cdp, "location.href"),
    };
    log("[flow] start click=" + c1.ok + " select=" + s1.ok + " in " + s1.ms + "ms");
    if (!s1.ok) throw new Error("未进入 select：" + JSON.stringify(s1));

    // 4) 真实输入：select → battle
    await sleep(400);
    const c2 = await clickSel(cdp, '#screen-select [data-action="confirm"]');
    const s2 = await waitScreen(cdp, "battle", 10000);
    result.boot.selectToBattleMs = s2.ms;
    result.boot.navToBattleMs = Date.now() - t0;
    result.steps.enter.confirmClick = c2;
    result.steps.enter.battleReached = s2;
    result.steps.enter.titleClickAtMs = tTitleClick - t0;
    log("[flow] confirm click=" + c2.ok + " battle=" + s2.ok + " in " + s2.ms + "ms; nav→battle=" + result.boot.navToBattleMs + "ms");
    if (!s2.ok) throw new Error("未进入 battle：" + JSON.stringify(s2));

    // 让角色就位（GLB 装载 + 相机平滑）
    await sleep(1500);

    // 5) instrumentation
    result.steps.enter.probe = await installProbe(cdp);

    // ===== 步骤 1：开局 =====
    const mark1 = await probeMark(cdp);
    result.steps.step1 = { state: await evalJSON(cdp, STATE_EXPR) };
    result.steps.step1.info = await evalAwait(cdp, INFO_EXPR);
    result.fps = await evalAwait(cdp, FPS_EXPR);
    log("[fps] " + JSON.stringify(result.fps));
    await shot(cdp, `${PREFIX}-01-start-${DATE}.png`, result.screenshots);
    result.steps.step1.probe = await probeSlice(cdp, mark1.f, mark1.w);
    log("[step1] " + JSON.stringify({ state: result.steps.step1.state, info: result.steps.step1.info }));

    // ===== 步骤 2：拖拽绕行（真实鼠标 600px，再拖回） =====
    const camBefore = await evalJSON(cdp, "(() => { const c = window.__npr.camera.position; return { x:+c.x.toFixed(3), y:+c.y.toFixed(3), z:+c.z.toFixed(3) }; })()");
    const tDrag = Date.now();
    await drag(cdp, 500, 1100, 520, 12, 25);   // +600 CSS px
    await sleep(1200);                          // 阻尼收敛（0.14/frame）
    const camAfter = await evalJSON(cdp, "(() => { const c = window.__npr.camera.position; return { x:+c.x.toFixed(3), y:+c.y.toFixed(3), z:+c.z.toFixed(3) }; })()");
    const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const mark2 = await probeMark(cdp);
    await shot(cdp, `${PREFIX}-02-drag-${DATE}.png`, result.screenshots);
    // 拖回原位（同一拖拽会话净位移 -600）；低帧率下相机 lerp 收敛慢，等到收敛或超时
    await drag(cdp, 1100, 500, 520, 12, 25);
    const backSamples = [];
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const p = await evalJSON(cdp, "(() => { const c = window.__npr.camera.position; return { x:+c.x.toFixed(3), y:+c.y.toFixed(3), z:+c.z.toFixed(3) }; })()");
      backSamples.push(p);
      if (dist3(camBefore, p) < 0.25) break;
    }
    const camBack = backSamples[backSamples.length - 1];
    result.steps.step2 = {
      camBefore, camAfter, camBack, backSamples,
      dragPx: 600, dragMs: Date.now() - tDrag,
      moveLen: +dist3(camBefore, camAfter).toFixed(3),
      backLen: +dist3(camBefore, camBack).toFixed(3),
      residual: +dist3(camBefore, camBack).toFixed(3),
      stateAfter: await evalJSON(cdp, STATE_EXPR),
      probe: await probeSlice(cdp, mark2.f, mark2.w),
    };
    log("[step2] " + JSON.stringify({ camBefore, camAfter, moveLen: result.steps.step2.moveLen, camBack, residual: result.steps.step2.residual }));

    // ===== 步骤 3：弹反（对手预警瞬间按 Shift，真实按键） =====
    const mark3 = await probeMark(cdp);
    const tParry = Date.now();
    let parryPressAt = null, parrySeen = null;
    for (let i = 0; i < 1200 && Date.now() - tParry < 20000; i++) {
      const st = await evalJSON(cdp, "(() => { const c = window.__npr.counter; return { w: !!c.isWarning, s: c.state, total: c.totalCounters }; })()");
      if (st.w) { parrySeen = st; await pressShift(cdp); parryPressAt = Date.now() - tParry; break; }
      await sleep(20);
    }
    await sleep(90);
    const parryRightAfter = await evalJSON(cdp, "(() => { const c = window.__npr.counter; return { state: c.state, total: c.totalCounters, last: c.lastResult }; })()");
    const parryProbeEarly = await probeSlice(cdp, mark3.f, mark3.w);
    await shot(cdp, `${PREFIX}-03-parry-${DATE}.png`, result.screenshots);
    await sleep(250);
    result.steps.step3 = {
      windowWaitedMs: parryPressAt,
      windowSeen: parrySeen,
      afterShift: parryRightAfter,
      probeImmediate: parryProbeEarly,
      probeSettled: await probeSlice(cdp, mark3.f, mark3.w),
      stateAfter: await evalJSON(cdp, STATE_EXPR),
    };
    log("[step3] " + JSON.stringify(result.steps.step3.afterShift));

    // ===== 步骤 4：终结（连按空格：三段连段 → 第三段内再按一次触发 FINISHER 分支） =====
    const mark4 = await probeMark(cdp);
    const COMBO_EXPR = "(() => { const n = window.__npr; const c = n.combo; return { stage: c.stageIndex, count: c.comboCount, freeze: +Number(n.battle.freezeT).toFixed(3), phase: n.battle.phase, oppHp: n.opponent.hp, elapsed: +Number(n.getBattleStats?.().elapsed ?? 0).toFixed(2) }; })()";
    const comboTrail = [];
    // ① 起手；随后「短连打」（不做 eval，避免 CDP 往返把按压节奏拖到段外）：
    //    每个循环 4 连按 × ~115ms（远小于段时长），保证阶段结束时 bufferAttack 仍为 true
    await pressSpace(cdp);
    await sleep(70);
    for (let burst = 0; burst < 6; burst++) {
      for (let i = 0; i < 4; i++) { await pressSpace(cdp); await sleep(70); }
      const st = await evalJSON(cdp, COMBO_EXPR);
      comboTrail.push({ burst: burst + 1, ...st });
      if (st.freeze > 0.25) break;                 // 已触发终结（freezeT = 0.5×impact.strength）
      if (st.stage === 2) { await pressSpace(cdp); await sleep(110); break; } // 第三段内再按 → FINISHER
    }
    const atStage2 = await evalJSON(cdp, COMBO_EXPR);
    // ④ 若连打没把终结打出来，再补一次（第三段内按 = FINISHER 分支）
    let afterFinisher = atStage2;
    if (!(atStage2.freeze > 0.25)) {
      await pressSpace(cdp);
      await sleep(120);
      afterFinisher = await evalJSON(cdp, COMBO_EXPR);
    }
    for (let i = 0; i < 3 && !(afterFinisher.freeze > 0.25); i++) {
      await pressSpace(cdp);
      await sleep(160);
      afterFinisher = await evalJSON(cdp, COMBO_EXPR);
    }
    const shockPolls = await pollShockwaves(cdp, 420);
    const finisherProbeEarly = await probeSlice(cdp, mark4.f, mark4.w);
    await shot(cdp, `${PREFIX}-04-finisher-${DATE}.png`, result.screenshots);
    await sleep(300);
    result.steps.step4 = {
      atStage2,
      afterFinisher,
      finisherTriggered: !!(afterFinisher.freeze > 0.25 || afterFinisher.stage === -1),
      comboTrail,
      shockwavePolls: shockPolls,
      shockwaveMaxRadiusSeen: shockPolls.reduce((a, p) => Math.max(a, ...p.list.map((s) => s.maxRadius)), 0),
      shockwaveMaxScaleSeen: shockPolls.reduce((a, p) => Math.max(a, ...p.list.map((s) => s.scaleX)), 0),
      probeImmediate: finisherProbeEarly,
      probeSettled: await probeSlice(cdp, mark4.f, mark4.w),
      stateAfter: await evalJSON(cdp, STATE_EXPR),
    };
    log("[step4] " + JSON.stringify({ trail: comboTrail, maxRadius: result.steps.step4.shockwaveMaxRadiusSeen, maxScale: result.steps.step4.shockwaveMaxScaleSeen }));

    // ===== 步骤 5：计时器（HUD 与 battle.timer 双口径） =====
    await sleep(1200);
    result.steps.step5 = {
      state: await evalJSON(cdp, STATE_EXPR),
      hudTimerSelector: "#hud-elapsed（.hud-timer 容器内 ELAPSED 标签）",
      battleTimerNow: await evalJSON(cdp, "(() => { const n = window.__npr; return { timer: n.battle?.timer ?? null, type: typeof n.battle?.timer, elapsed: n.getBattleStats?.().elapsed ?? null, phase: n.battle?.phase ?? null }; })()"),
    };
    await shot(cdp, `${PREFIX}-05-timer-${DATE}.png`, result.screenshots);
    result.steps.step5.timerStart = result.steps.step1.state.hudElapsedText;
    result.steps.step5.timerEnd = result.steps.step5.state.hudElapsedText;
    log("[step5] timer " + result.steps.step5.timerStart + " → " + result.steps.step5.timerEnd + " | battle.timer=" + JSON.stringify(result.steps.step5.battleTimerNow));

    // 收尾快照
    result.meta.finishedAt = new Date().toISOString();
  } catch (e) {
    result.meta.fatal = String(e && e.stack || e);
    log("[fatal] " + (e && e.stack || e));
  } finally {
    try { kill && kill(); } catch { /* noop */ }
    try { server && await new Promise((r) => server.close(r)); } catch { /* noop */ }
    result.meta.portClosed = actualPort;
    try { result.distAfter = distSnapshot(); } catch (e) { result.meta.distAfterError = String(e?.message || e); }
    writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
    log("[done] " + JSON_OUT);
    log("[summary] exceptions=" + result.errors.exceptions.length
      + " consoleErr=" + result.errors.consoleErrors.length
      + " logErr=" + result.errors.logErrors.length
      + " warnings=" + result.errors.consoleWarnings.length
      + " netFail=" + result.errors.loadingFailed.length
      + " http4xx+=" + result.errors.httpErrors.length);
    for (const x of result.errors.exceptions) log("  EXC " + x.errorName + ": " + String(x.message).slice(0, 200));
    for (const x of result.errors.httpErrors) log("  HTTP " + x.status + " " + x.url);
    for (const x of result.errors.loadingFailed) log("  NET " + x.errorText);
  }
}

main().then(() => process.exit(0)).catch((e) => { log("[crash] " + (e?.stack || e)); process.exit(1); });