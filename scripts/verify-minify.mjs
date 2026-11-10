/**
 * 构建验证 K（sub 18）：验证 **默认 minify** 产物能否真实跑起来（白屏回归取证）。
 *
 * 背景：曾记录 `--minify` 会把 src/audio/audio.mjs 的 `this.currentBgm` 压成裸变量，
 * 抛 `ReferenceError: currentBgm is not defined` → 白屏。本脚本用真实浏览器加载落定"是否仍存在"。
 *
 * 纪律：
 *  - 静态服务器与 CDP 同一 node 进程（Windows 下后台子进程会被回收）
 *  - **挂根路径 `/`**：squad.mjs 的 glb 是绝对路径 `/asset/*.glb`，必须根路径才能 200
 *  - 只读页面：仅通过 window.__npr 公开 API、DOM 读、真实鼠标事件驱动；不改源码
 *  - finally 一律关闭 server / chrome / 临时 profile
 *
 * 用法：
 *   node scripts/verify-minify.mjs --dist .tmp-dist-minify --port 5286 --shot docs/evidence/v3-minify-verify-20261109.png --json docs/evidence/v3-minify-verify-20261109.json
 *   node scripts/verify-minify.mjs --dist .tmp-dist-minify-off --port 5287 --shot docs/evidence/v3-minify-off-verify-20261109.png --json docs/evidence/v3-minify-off-verify-20261109.json
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const DIST = path.resolve(ROOT, arg("dist", ".tmp-dist-minify"));
const PORT_PREFERRED = Number(arg("port", "5286"));
const FALLBACK_PORTS = [PORT_PREFERRED, PORT_PREFERRED + 1];
const HOST = "127.0.0.1";
const SHOT = path.resolve(ROOT, arg("shot", "docs/evidence/v3-minify-verify-20261109.png"));
const JSON_OUT = path.resolve(ROOT, arg("json", "docs/evidence/v3-minify-verify-20261109.json"));
const LOG_PATH = path.resolve(ROOT, arg("log", ".tmp-verify-minify.log"));
const VIEW = { width: 1600, height: 1000, dpr: 1.25 }; // → canvas 2000×1250
const BOOT_TIMEOUT_MS = 15000;
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

if (!CHROME) throw new Error("未找到 Chrome/Edge");
if (!existsSync(path.join(DIST, "index.html"))) throw new Error("缺少 " + DIST + "/index.html，请先 vite build");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".glb": "model/gltf-binary",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".map": "application/json",
};

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
      const port = FALLBACK_PORTS[i];
      const onError = (err) => {
        if (err && err.code === "EADDRINUSE" && i + 1 < FALLBACK_PORTS.length) {
          log("[server] port " + port + " 被占用，改用 " + FALLBACK_PORTS[i + 1]);
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

/** 用真实鼠标事件点击（不是 el.click()），坐标取 getBoundingClientRect 中心（CSS px） */
async function clickSel(cdp, sel) {
  const rect = await evalJSON(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const sc = el.closest(".screen");
    const cs = sc ? getComputedStyle(sc) : null;
    return {
      found: true,
      x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height,
      vis: getComputedStyle(el).visibility, opacity: +getComputedStyle(el).opacity,
      screenId: sc ? sc.id : null, screenDisplay: cs ? cs.display : null, screenOpacity: cs ? +cs.opacity : null,
    };
  })()`);
  if (!rect || !rect.found) return { ok: false, why: "selector not found: " + sel };
  const x = +rect.x.toFixed(1), y = +rect.y.toFixed(1);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  return { ok: true, rect: { x, y, w: +rect.w.toFixed(1), h: +rect.h.toFixed(1) }, vis: rect.vis, screen: rect.screenId, screenDisplay: rect.screenDisplay };
}

const STATE_EXPR = `(() => {
  const n = window.__npr;
  if (!n) return { ok: false, why: "no __npr" };
  // renderer.info 每帧开头 reset；且 EffectComposer 是多次 pass，最后一个 pass（OutputPass）
  // 只画一个全屏三角形 → 直接读 postfx.render 之后的值会得到 triangles=1。
  // 正确口径：先单独渲染主场景统计场景三角数，再让 postfx 重绘恢复后处理画面。
  const info = n.renderer.info;
  let triangles = null, calls = null;
  try {
    n.renderer.render(n.scene, n.camera); // 主场景直渲一次（同一 rAF 内，info 在此被 reset+累计）
    triangles = info.render.triangles;
    calls = info.render.calls;
    n.postfx.render(0.016); // 立即重绘后处理画面，避免留下直渲帧
  } catch (e) { return { ok: false, why: "render threw: " + e.message }; }
  const cv = n.renderer.domElement;
  const groups = n.squad?.members?.filter((m) => m.group?.visible).map((m) => m.name) ?? [];
  return {
    ok: true,
    activeName: n.squad?.active?.name ?? null,
    activeId: n.squad?.active?.id ?? null,
    activeIndex: n.squad?.activeIndex ?? null,
    visibleGroups: groups,
    triangles,
    calls,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    canvas: [cv.width, cv.height],
    inner: [window.innerWidth, window.innerHeight],
    pixelRatio: n.renderer.getPixelRatio(),
    bloom: n.postfx?.bloom ? {
      enabled: n.postfx.bloom.enabled,
      strength: +Number(n.postfx.bloom.strength).toFixed(4),
      radius: +Number(n.postfx.bloom.radius).toFixed(4),
      threshold: +Number(n.postfx.bloom.threshold).toFixed(4),
    } : null,
    exposure: n.renderer.toneMappingExposure,
    screen: n.screens?.current ?? null,
    audioCtx: n.audio?.ctx ? n.audio.ctx.state : null,
    currentBgm: n.audio ? (n.audio.currentBgm ?? null) : null,
  };
})()`;

async function launchChrome() {
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = path.join(os.tmpdir(), "naiwa-verify-minify-" + port + "-" + Date.now());
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 旧目录被锁则忽略 */ }
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
  return { cdp, kill, port };
}

async function main() {
  mkdirSync(path.dirname(SHOT), { recursive: true });
  const result = {
    dist: path.relative(ROOT, DIST).replace(/\\/g, "/"),
    exceptions: [], consoleErrors: [], logErrors: [], loadingFailed: [], httpErrors: [],
    clicks: [], qualityToggle: [], state: null, shot: null, meta: {},
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
      const frames = (d.stackTrace?.callFrames || []).map((f) => `${f.functionName || "(anonymous)"} @ ${f.url}:${f.lineNumber + 1}:${f.columnNumber + 1}`);
      result.exceptions.push({
        text: d.text,
        errorName: d.exception?.className || null,
        message: d.exception?.description || null,
        url: d.url || null, line: (d.lineNumber ?? -1) + 1, column: (d.columnNumber ?? -1) + 1,
        stack: frames,
      });
    });
    cdp.on("Log.entryAdded", (p) => {
      const e = p.entry || {};
      if (e.level !== "error") return;
      const text = (e.text || "") + " " + (e.url || "");
      if (/favicon\.ico/i.test(text)) { result.meta.favicon404Ignored = true; return; }
      result.logErrors.push({ source: e.source, text: e.text, url: e.url });
    });
    cdp.on("Runtime.consoleAPICalled", (p) => {
      if (p.type !== "error" && p.type !== "assert") return;
      result.consoleErrors.push({
        type: p.type,
        args: (p.args || []).map((a) => a.value ?? a.description ?? a.type),
      });
    });
    cdp.on("Network.loadingFailed", (p) => {
      if (p.canceled) return;
      result.loadingFailed.push({ requestId: p.requestId, errorText: p.errorText, type: p.type });
    });
    cdp.on("Network.responseReceived", (p) => {
      const r = p.response || {};
      if (r.status >= 400) result.httpErrors.push({ status: r.status, url: r.url, type: p.type });
    });

    const t0 = Date.now();
    await cdp.send("Page.navigate", { url: url + "?t=" + Date.now() });

    // 1) 等 window.__npr 出现（最多 15 秒）
    let nprSeen = false;
    for (let i = 0; i < BOOT_TIMEOUT_MS / 100; i++) {
      await sleep(100);
      try { nprSeen = await evalJSON(cdp, "!!window.__npr"); } catch { nprSeen = false; }
      if (nprSeen) break;
    }
    result.meta.bootOk = nprSeen;
    result.meta.bootMs = Date.now() - t0;
    log("[boot] __npr=" + nprSeen + " in " + result.meta.bootMs + "ms");

    if (!nprSeen) {
      // 白屏兜底：仍然截图与采集异常，供判据使用
      const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      writeFileSync(SHOT, Buffer.from(r.data, "base64"));
      result.shot = { file: path.relative(ROOT, SHOT).replace(/\\/g, "/"), bytes: Buffer.from(r.data, "base64").length };
      throw new Error("__npr 15s 内未出现（白屏/启动失败）");
    }

    // 2) 画质档验证：low → high，检查 bloom 强度是否回到构造期值（双入口收口的核心）
    for (const q of ["low", "high"]) {
      const r = await evalJSON(cdp, `(() => {
        const n = window.__npr;
        n.screens.o.onSetQuality(${JSON.stringify(q)});
        const b = n.postfx.bloom;
        return { q: ${JSON.stringify(q)}, enabled: b.enabled, strength: +Number(b.strength).toFixed(4) };
      })()`);
      result.qualityToggle.push(r);
      await sleep(120);
    }
    log("[quality] " + JSON.stringify(result.qualityToggle));

    // 3) 两步进入战斗：主界面 start → 选人 confirm
    await sleep(500);
    const c1 = await clickSel(cdp, '#screen-title [data-action="start"]');
    result.clicks.push({ step: "start", ...c1 });
    await sleep(700);
    const screen1 = await evalJSON(cdp, "(() => window.__npr.screens.current)()");
    result.clicks.push({ step: "after-start-screen", screen: screen1 });

    const c2 = await clickSel(cdp, '#screen-select [data-action="confirm"]');
    result.clicks.push({ step: "confirm", ...c2 });
    await sleep(1200);
    const screen2 = await evalJSON(cdp, "(() => window.__npr.screens.current)()");
    result.clicks.push({ step: "after-confirm-screen", screen: screen2 });

    // 4) 等 2.5s 让角色/贴图/GLB 加载完
    await sleep(2500);
    result.state = await evalJSON(cdp, STATE_EXPR);
    log("[state] " + JSON.stringify(result.state));

    // 5) 截图（2000×1250 像素：1600×1000 CSS × dpr 1.25）
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const buf = Buffer.from(shot.data, "base64");
    writeFileSync(SHOT, buf);
    result.shot = { file: path.relative(ROOT, SHOT).replace(/\\/g, "/"), bytes: buf.length };

    result.meta.finishedAt = new Date().toISOString();

    // 6) 可选：同帧 bloom 参数 A/B（冻结 rAF 后只改运行时 bloom 参数重渲染，分离“参数效应”与“minify 效应”）
    if (process.argv.includes("--ab")) {
      await evalJSON(cdp, `(() => {
        if (window.__rafWrapped) return "already";
        const orig = window.requestAnimationFrame.bind(window);
        window.__rafOrig = orig;
        window.__rafPaused = false;
        window.__rafPend = [];
        window.requestAnimationFrame = (cb) => {
          if (window.__rafPaused) { window.__rafPend.push(cb); return 0; }
          return orig(cb);
        };
        window.__rafPause = () => { window.__rafPaused = true; };
        window.__rafResume = () => {
          window.__rafPaused = false;
          const p = window.__rafPend.slice(); window.__rafPend.length = 0;
          p.forEach((cb) => window.__rafOrig(cb));
        };
        window.__rafWrapped = true;
        return "installed";
      })()`);
      await evalJSON(cdp, "(() => { window.__rafPause(); return true; })()");
      await sleep(320);

      const ab = [];
      const setBloomRaw = async (strength, threshold) => evalJSON(cdp, `(() => {
        const n = window.__npr; const b = n.postfx.bloom;
        if (!window.__abOrig) window.__abOrig = { strength: b.strength, threshold: b.threshold };
        b.strength = ${strength}; b.threshold = ${threshold};
        n.postfx.render(0.016);
        return { strength: b.strength, threshold: b.threshold };
      })()`);

      for (const [tag, s, t] of [["0.40-0.68", 0.40, 0.68], ["0.22-0.88", 0.22, 0.88]]) {
        const applied = await setBloomRaw(s, t);
        await sleep(140);
        const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
        // 文件名带隔离产物标签，避免 minify 与 off 两轮互相覆盖
        const distTag = path.basename(DIST).replace(/^\.tmp-dist-/, "");
        const file = path.join(path.dirname(SHOT), "v3-" + distTag + "-bloom-ab-" + tag + "-20261109.png");
        const b = Buffer.from(r.data, "base64");
        writeFileSync(file, b);
        ab.push({ tag, applied, file: path.relative(ROOT, file).replace(/\\/g, "/"), bytes: b.length });
        log("[ab] " + tag + " -> " + path.basename(file));
      }
      // 恢复运行时参数并放开 rAF（不改源码，仅在内存里还原）
      await evalJSON(cdp, `(() => {
        const b = window.__npr.postfx.bloom;
        if (window.__abOrig) { b.strength = window.__abOrig.strength; b.threshold = window.__abOrig.threshold; delete window.__abOrig; }
        window.__rafResume();
        window.__npr.postfx.render(0.016);
        return { strength: b.strength, threshold: b.threshold, enabled: b.enabled };
      })()`);
      result.ab = ab;
    }
  } catch (e) {
    result.meta.fatal = e.message;
    log("[fatal] " + e.stack || e.message);
  } finally {
    try { kill && kill(); } catch { /* noop */ }
    try { server && await new Promise((r) => server.close(r)); } catch { /* noop */ }
    result.meta.portClosed = actualPort;
    writeFileSync(JSON_OUT, JSON.stringify(result, null, 2));
    log("[done] " + JSON_OUT);
    log("[summary] exceptions=" + result.exceptions.length + " consoleErr=" + result.consoleErrors.length
      + " logErr=" + result.logErrors.length + " loadingFailed=" + result.loadingFailed.length
      + " httpErr=" + result.httpErrors.length);
    for (const x of result.exceptions) log("  EXC " + x.errorName + ": " + x.message + " | frame0=" + (x.stack[0] || "-"));
    for (const x of result.httpErrors) log("  HTTP " + x.status + " " + x.url);
    for (const x of result.loadingFailed) log("  NET " + x.errorText);
  }
  // ENG-7：fatal（白屏兜底 throw 等）必须以非零码退出，不能被 catch 吞掉后恒 exit(0)
  return result.meta.fatal ? 1 : 0;
}

main().then((code) => process.exit(code || 0)).catch((e) => { log("[crash] " + (e?.stack || e)); process.exit(1); });