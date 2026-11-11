/**
 * 运行时测量 —— 只读，不改 src/、不重建 dist/。
 *
 * 目的：给报告书里此前「无证据支撑」的性能断言补真值：
 *   §4.2  「mesh 2107 → 1062，draw call 991 → 551」
 *   §10.6 「+1 draw call / +29,152 三角面（画面总量 188,122）」
 *
 * 通道：自建静态服务（只读服务 dist/）+ 自启 headless Chrome + 原生 CDP over WebSocket
 *      —— 与 scripts/capture-demo-video.mjs 同一套基础设施，不依赖 ego。
 *
 * ⚠ 口径说明：
 *   - draw call / 三角面 = 场景图谱事实，与 GPU 无关，headless 下同样成立；
 *   - 帧率在 headless 下是 SwiftShader 软件光栅，**不代表真机**，故本脚本不产出 fps 结论
 *     （真机帧率与长时稳定性走 ego(lite) 实机通道，另行取证）。
 *   - 每帧口径：renderer.info.autoReset=false → 在 rAF 回调内 reset → 下一个 rAF 读，
 *     恰好覆盖「一帧内 composer 的全部 pass」。
 *
 * 产出：docs/evidence/v3-runtime-metrics-20261111.json
 */
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = process.env.NAIWA_DIST ? path.resolve(process.env.NAIWA_DIST) : path.join(ROOT, "dist");
const OUT = path.join(ROOT, "docs", "evidence");
const OUT_JSON = path.join(OUT, process.env.NAIWA_OUT || "v3-runtime-metrics-20261111.json");
const PORTS = [5288, 5289];
const HOST = "127.0.0.1";
const VIEW = { width: 1920, height: 1080, dpr: 1 };

const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("未找到 Chrome/Edge");

// 登记构建指纹（AGENTS.md §4：证据只能取自登记构建）
const INDEX_HTML = path.join(DIST, "index.html");
if (!existsSync(INDEX_HTML)) throw new Error("缺少 dist/index.html");
const indexHtml = readFileSync(INDEX_HTML, "utf8");
const entryMatch = indexHtml.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
if (!entryMatch) throw new Error("dist/index.html 未引用入口 JS");
const ENTRY = entryMatch[0];
const entryPath = path.join(DIST, ENTRY);
if (!existsSync(entryPath)) throw new Error("入口 chunk 不存在: " + ENTRY);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".glb": "model/gltf-binary",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".mp4": "video/mp4", ".webm": "video/webm", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".map": "application/json",
};

function startServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
        const clean = urlPath === "/" ? "/index.html" : urlPath;
        const file = path.join(root, path.normalize(clean).replace(/^([/\\])+/, ""));
        if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
          res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return;
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
function log(...a) {
  const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n";
  try { process.stdout.write(s); } catch { /* noop */ }
}

async function launchChrome() {
  const port = 9800 + Math.floor(Math.random() * 150);
  const profile = path.join(os.tmpdir(), "naiwa-measure-" + port + "-" + Date.now());
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
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable");
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}

// 一帧口径的 renderer.info 采样
const SNAP_FRAME = `(async () => {
  const r = window.__npr.renderer;
  r.info.autoReset = false;
  await new Promise(res => requestAnimationFrame(res));   // 等一帧让设置生效
  r.info.reset();                                         // 在 rAF 回调内 reset → 恰好覆盖下一整帧
  await new Promise(res => requestAnimationFrame(res));   // 下一帧：应用先渲染，随后此处读取
  const out = {
    calls: r.info.render.calls,
    triangles: r.info.render.triangles,
    points: r.info.render.points,
    lines: r.info.render.lines,
    geometries: r.info.memory.geometries,
    textures: r.info.memory.textures,
    programs: r.info.programs ? r.info.programs.length : null,
    frame: r.info.render.frame,
  };
  r.info.autoReset = true;
  return out;
})()`;

const SCENE_FACTS = `(() => {
  const s = window.__npr.scene;
  let meshes = 0, instanced = 0, points = 0, lines = 0, sprites = 0, visibleMeshes = 0;
  const geos = new Set();
  s.traverse((o) => {
    if (o.isInstancedMesh) { instanced++; meshes++; }
    else if (o.isMesh) { meshes++; }
    else if (o.isPoints) points++;
    else if (o.isLine) lines++;
    else if (o.isSprite) sprites++;
    if (o.isMesh && o.visible) visibleMeshes++;
    if (o.geometry && o.geometry.uuid) geos.add(o.geometry.uuid);
  });
  return {
    sceneChildren: s.children.length,
    meshes, instanced, points, lines, sprites, visibleMeshes,
    uniqueGeometries: geos.size,
    aholo: window.__aholoStreet ? { ...window.__aholoStreet } : null,
    aholoMeshInScene: !!s.getObjectByName("aholo-world-parallax-shell"),
  };
})()`;

const CONTEXT_FACTS = `(() => {
  // ⚠ 不要再用 getContext 探测「这个 canvas 有没有 context」——那会**凭空创建** context，
  //   把不存在上下文的 canvas 也算进去（此前版本因此恒得 4，掩盖了惰性加载的真实效果）。
  //   改为读页面加载前注入的 getContext 补丁记录（window.__ctxLog），只统计应用**真正创建过**的。
  const log = window.__ctxLog || [];
  const seen = new Map();
  for (const e of log) {
    if (e.id === "__probe__") continue;   // 探针自身查 GPU 型号用的 context，不算应用占用
    const key = e.id + "@" + e.type;
    if (!seen.has(key)) seen.set(key, e);
  }
  let renderer = null;
  try {
    const c = document.createElement("canvas");
    c.id = "__probe__";   // 标记为探针自身，不计入应用 context 数
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }
  } catch (e) { renderer = null; }
  return {
    appContexts: seen.size,
    appContextList: [...seen.values()].map((e) => ({ id: e.id, type: e.type, w: e.w, h: e.h })),
    totalGetContextCalls: log.length,
    canvasElements: document.querySelectorAll("canvas").length,
    glRenderer: renderer,
    heapUsed: performance.memory ? performance.memory.usedJSHeapSize : null,
    heapLimit: performance.memory ? performance.memory.jsHeapSizeLimit : null,
    dpr: window.devicePixelRatio,
  };
})()`;

async function waitExpr(cdp, expr, timeoutMs, label) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await evalJSON(cdp, expr); } catch { /* 切屏瞬间可能抛错 */ }
    if (v) return Date.now() - t0;
    if (Date.now() - t0 > timeoutMs) throw new Error("等待超时: " + label);
    await sleep(150);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const errors = [];
  let server = null, kill = null, cdp = null;
  const result = {
    ok: false,
    measuredAt: new Date().toISOString(),
    build: { entry: ENTRY, entryBytes: statSync(entryPath).size, indexBytes: statSync(INDEX_HTML).size },
    caveat: "draw call / 三角面为场景图谱事实；headless 为 SwiftShader 软件光栅，帧率不代表真机，真机帧率另走 ego 实机通道取证",
    errors,
    screens: {},
  };
  try {
    const srv = await startServer(DIST);
    server = srv.server;
    log("[boot] server port=" + srv.port);
    const chrome = await launchChrome();
    cdp = chrome.cdp; kill = chrome.kill;
    log("[boot] chrome cdp port=" + chrome.port);

    cdp.on("Runtime.exceptionThrown", (p) => errors.push({ kind: "exception", text: p.exceptionDetails?.text, desc: p.exceptionDetails?.exception?.description?.slice(0, 240) }));
    cdp.on("Log.entryAdded", (p) => { if (p.entry?.level === "error" && !/favicon\.ico/.test(p.entry.url || "")) errors.push({ kind: "log", text: p.entry.text, url: p.entry.url }); });
    cdp.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "assert") errors.push({ kind: "console." + p.type, args: (p.args || []).map((a) => a.value ?? a.description ?? a.type).slice(0, 3) }); });

    const url = `http://${HOST}:${srv.port}/`;
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
    log("[nav] " + url);
    await cdp.send("Page.navigate", { url });
    log("[nav] sent");
    await waitExpr(cdp, "!!(window.__npr && window.__npr.renderer && window.__npr.scene)", 40000, "__npr 就绪");
    log("[nav] __npr ready");
    await sleep(6000); // 等 16 只 GLB / 背景层 / live3d 加载完
    log("[nav] settle done");

    const measure = async (label) => {
      log("[measure] " + label + " ...");
      const frame = await evalAwait(cdp, SNAP_FRAME);
      log("[measure] " + label + " frame ok");
      const scene = await evalJSON(cdp, SCENE_FACTS);
      const ctx = await evalJSON(cdp, CONTEXT_FACTS);
      result.screens[label] = { frame, scene, context: ctx };
      log("[measure] " + label + " done");
      return result.screens[label];
    };

    // 1) 标题页
    await measure("title");

    // 2) 选人页
    await evalJSON(cdp, `document.querySelector('[data-action="start"]').click()`);
    await waitExpr(cdp, "!document.querySelector('#screen-select').classList.contains('hidden')", 15000, "选人页");
    await sleep(4000);
    await measure("select");

    // 3) 战斗页
    await evalJSON(cdp, `document.querySelector('[data-action="confirm"]').click()`);
    await waitExpr(cdp, "window.__npr.battle && window.__npr.battle.phase === 'playing'", 20000, "战斗开始");
    await sleep(5000);
    await measure("battle");

    // 3b) A/B：Aholo World 街区层开关对比（同一帧口径）
    const aholoOff = await evalAwait(cdp, `(async () => {
      const s = window.__npr.scene;
      const m = s.getObjectByName("aholo-world-parallax-shell");
      if (!m) return null;
      const wasVisible = m.visible;
      m.visible = false;
      const r = window.__npr.renderer;
      r.info.autoReset = false;
      await new Promise(res => requestAnimationFrame(res));
      r.info.reset();
      await new Promise(res => requestAnimationFrame(res));
      const out = { calls: r.info.render.calls, triangles: r.info.render.triangles };
      r.info.autoReset = true;
      m.visible = wasVisible;
      return out;
    })()`);
    result.aholoLayerAB = { on: result.screens.battle.frame, off: aholoOff };

    // 4) 结算页
    await evalJSON(cdp, `(() => { const n = window.__npr; n.opponent.hp = 0; n.endBattle(); })()`);
    await waitExpr(cdp, "!document.querySelector('#screen-result').classList.contains('hidden')", 15000, "结算页");
    await sleep(2500);
    await measure("result");

    // 5) 回到标题页（确认主 renderer 在非战斗屏仍全速渲染）
    await evalJSON(cdp, `document.querySelector('#screen-result [data-action="back-title"]').click()`);
    await waitExpr(cdp, "!document.querySelector('#screen-title').classList.contains('hidden')", 15000, "回标题");
    await sleep(2500);
    await measure("title_returned");

    result.ok = true;
  } catch (e) {
    result.error = String(e && e.message ? e.message : e);
  } finally {
    try { if (kill) kill(); } catch { /* noop */ }
    try { if (server) server.close(); } catch { /* noop */ }
  }

  writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), "utf8");
  console.log("WROTE " + OUT_JSON);
  console.log("ok=" + result.ok + (result.error ? " error=" + result.error : ""));
  for (const [k, v] of Object.entries(result.screens)) {
    console.log(`  ${k}: calls=${v.frame.calls} tris=${v.frame.triangles} meshes=${v.scene.meshes} geos=${v.scene.uniqueGeometries} appCtx=${v.context.appContexts} [${(v.context.appContextList || []).map((c) => c.id).join(",")}]`);
  }
  if (result.aholoLayerAB) {
    console.log(`  aholo A/B: on calls=${result.aholoLayerAB.on.calls} tris=${result.aholoLayerAB.on.triangles} | off calls=${result.aholoLayerAB.off && result.aholoLayerAB.off.calls} tris=${result.aholoLayerAB.off && result.aholoLayerAB.off.triangles}`);
  }
  if (errors.length) console.log("  errors=" + errors.length);
}

main();
