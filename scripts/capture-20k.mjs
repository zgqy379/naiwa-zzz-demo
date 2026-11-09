/**
 * 19k 运行时资产验收截图（隔离构建 .tmp-dist-20k · 根路径服务 · 同进程 CDP）
 *
 * 为什么同进程静态服务器 + 截图：子进程静态服务器在 Windows 下容易被父进程回收，
 * 导致 GLB 404 退化成占位球，截图证据失真。因此静态服务器与 CDP 驱动放在同一 node 进程，
 * finally 统一关闭（server.close + Chrome taskkill + CDP close）。
 *
 * 约束：
 *  - 只读被测页面：不改 src / public，仅通过 window.__npr 公开 API 与键盘事件驱动。
 *  - 已知构建缺陷（本次不修）：vite bundle 后 screens.css 的 @import 位置非法被丢弃，
 *    `.screen/.screen.hidden` 规则缺失 → 战斗时标题层不会隐藏。截图前用诊断性
 *    display:none 隐藏 .screen，仅为取证，不代表线上表现。
 *
 * 用法：node scripts/capture-20k.mjs [--port 5281] [--out docs/evidence]
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = path.join(ROOT, ".tmp-dist-20k");
const OUT = path.join(ROOT, "docs", "evidence");
const PORT = Number(process.env.PORT || 5281);
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
const VIEW = { width: 1600, height: 1000, dpr: 1.25 };

if (!CHROME) throw new Error("未找到 Chrome/Edge");
if (!existsSync(path.join(DIST, "index.html"))) throw new Error("缺少 .tmp-dist-20k/index.html，请先执行 vite build");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function startServer(root) {
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
      res.writeHead(200, {
        "content-type": MIME[ext] || "application/octet-stream",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

/* ---------------- CDP 最小客户端（同 cdp_measure.mjs） ---------------- */
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

// Windows 下本机 bash 常丢 stdout（cdp_measure 同款问题），门禁日志双写文件
const LOG_PATH = path.join(ROOT, ".tmp-cap.log");
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

/** awaitPromise=true 版本：在页面内等一帧后回读，用于取「单帧累计」的 renderer.info */
async function evalAwait(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}

async function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = path.join(os.tmpdir(), "naiwa-20k-" + port + "-" + Date.now());
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 旧目录被锁则忽略 */ }
  mkdirSync(profile, { recursive: true });
  log("[chrome] launch port=" + port + " profile=" + profile);
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
  };
  return { cdp, kill, port };
}

async function pressKey(cdp, code, key, vk) {
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

/**
 * 按数字键换人并确认生效：squad.swapTo 有 2.0s 冷却，冷却期内的按键会被静默丢弃
 * （实测第 2、3 只偶发失败）。因此按键后轮询 HUD 的 activeIndex，不匹配就重按，
 * 保证「截图 ↔ HUD 读数 ↔ 期望角色」三者一致。
 */
async function swapToIndex(cdp, keySpec, wantIndex) {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await pressKey(cdp, ...keySpec);
    for (let i = 0; i < 16; i++) {
      await sleep(250);
      const st = await evalJSON(cdp, HUD_EXPR);
      if (st.activeIndex === wantIndex) return { attempts: attempt, pollMs: (i + 1) * 250 };
    }
  }
  throw new Error("换人未生效: want=" + wantIndex + " key=" + JSON.stringify(keySpec));
}

async function shoot(cdp, file) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(file, Buffer.from(r.data, "base64"));
  return r.data.length;
}

const READY_EXPR = `(() => {
  const n = window.__npr;
  if (!n) return { ok: false, why: "no __npr" };
  const name = document.querySelector("#hud-shell-name")?.textContent?.trim() || "";
  if (!name) return { ok: false, why: "hud-shell-name empty" };
  const ms = n.squad?.members || [];
  if (ms.length !== 16) return { ok: false, why: "members=" + ms.length };
  const missing = ms.map((m, i) => (m.group && m.group.getObjectByName("model-wrapper") ? null : i)).filter((x) => x !== null);
  if (missing.length) return { ok: false, why: "no wrapper: " + missing.join(",") };
  return { ok: true, name, count: ms.length };
})()`;

const HUD_EXPR = `(() => {
  const n = window.__npr;
  return {
    hudName: document.querySelector("#hud-shell-name")?.textContent?.trim() || "",
    hudIdx: document.querySelector("#hud-shell-idx")?.textContent?.trim() || "",
    activeIndex: n?.squad?.activeIndex ?? null,
    activeName: n?.squad?.active?.name ?? null,
    activeId: n?.squad?.active?.id ?? null,
    visibleGroups: n?.squad?.members?.filter((m) => m.group?.visible).map((m) => m.name) ?? [],
    mode: n?.getMode?.() ?? null,
    steps: n?.getSteps?.() ?? null,
    canvas: n?.renderer ? [n.renderer.domElement.width, n.renderer.domElement.height] : null,
    pixelRatio: n?.renderer?.getPixelRatio?.() ?? null,
  };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const errors = [];
  const result = { shots: [], errors, meta: {} };
  let server = null;
  let kill = null;
  try {
    log("[boot] static root=" + DIST + " port=" + PORT);
    server = await startServer(DIST);
    log("[boot] server listening");
    const chrome = await launchChrome();
    const { cdp, port } = chrome;
    kill = chrome.kill;
    log("[boot] chrome cdp=" + port);
    cdp.on("Runtime.exceptionThrown", (p) => errors.push({ kind: "exception", text: p.exceptionDetails?.text, desc: p.exceptionDetails?.exception?.description }));
    cdp.on("Log.entryAdded", (p) => { if (p.entry?.level === "error") errors.push({ kind: "log", source: p.entry.source, text: p.entry.text, url: p.entry.url }); });
    cdp.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "assert") errors.push({ kind: "console." + p.type, args: (p.args || []).map((a) => a.value ?? a.description ?? a.type) }); });
    cdp.on("Network.loadingFailed", (p) => errors.push({ kind: "network", id: p.requestId, err: p.errorText, canceled: p.canceled }));

    const t0 = Date.now();
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?t=${Date.now()}` });
    log("[nav] done");

    // ---- 就绪：HUD 有文本 + __npr + 16 只 wrapper，然后 1.5s ----
    let ready = { ok: false };
    for (let i = 0; i < 600; i++) {
      await sleep(100);
      try { ready = await evalJSON(cdp, READY_EXPR); } catch { ready = { ok: false, why: "eval pending" }; }
      if (ready.ok) break;
    }
    if (!ready.ok) throw new Error("就绪超时: " + JSON.stringify(ready));
    const readyMs = Date.now() - t0;
    log("[ready] " + readyMs + "ms members=" + ready.count + " hud=" + ready.name);
    await sleep(1500);

    // ---- 进入战斗：真实点击「开始作战」→ 角色选择页「出战 →」（ScreenManager 是两步确认） ----
    const clicked = await evalJSON(cdp, `(() => { const b = document.querySelector('#screen-title [data-action="start"]');
      if (!b) return false; b.click(); return true; })()`);
    await sleep(500);
    const confirmed = await evalJSON(cdp, `(() => { const b = document.querySelector('#screen-select [data-action="confirm"]');
      if (!b) return false; b.click(); return true; })()`);
    await sleep(800);
    const screensHidden = await evalJSON(cdp, `(() => {
      const els = [...document.querySelectorAll(".screen")];
      els.forEach((e) => { e.style.display = "none"; });
      return els.length;
    })()`);
    log("[battle] start=" + clicked + " confirm=" + confirmed + " screensHidden=" + screensHidden);
    const enterState = await evalJSON(cdp, HUD_EXPR);
    log("[battle] hud=" + enterState.hudName + " idx=" + enterState.hudIdx + " active=" + enterState.activeIndex);
    await sleep(400);

    const shots = [
      { file: "v3-20k-00-naiwa-20261109.png", label: "奶蛙", key: null, index: 0 },
      { file: "v3-20k-01-naishu-20261109.png", label: "奶鼠", key: ["Digit5", "5", 53], index: 4 },
      { file: "v3-20k-02-naifen-20261109.png", label: "奶粉", key: ["Digit7", "7", 55], index: 6 },
      { file: "v3-20k-03-naimao-20261109.png", label: "奶猫", key: ["Digit9", "9", 57], index: 8 },
      { file: "v3-20k-04-naishi-20261109.png", label: "奶屎", key: ["Digit0", "0", 48], index: 9 },
    ];

    for (const s of shots) {
      let swap = null;
      if (s.key) {
        swap = await swapToIndex(cdp, s.key, s.index);
        await sleep(600); // 让新造型的 idle 姿态与相机稳定
      }
      const before = await evalJSON(cdp, HUD_EXPR);
      if (before.activeIndex !== s.index) throw new Error("HUD 与期望角色不一致: " + s.file + " want=" + s.index + " got=" + before.activeIndex);
      const bytes = await shoot(cdp, path.join(OUT, s.file));
      const after = await evalJSON(cdp, HUD_EXPR);
      log("[shot] " + s.file + " hud=" + before.hudName + " idx=" + before.hudIdx + " active=" + before.activeIndex
        + (swap ? " swapAttempts=" + swap.attempts : "") + " bytes=" + bytes);
      result.shots.push({ file: s.file, expect: s.label, expectIndex: s.index, hudBefore: before, hudAfter: after, pngBytes: bytes, swap });
    }

    // ---- 西格玛（index 15）：数字键/单位循环需要 15 次 2s 冷却，改用 __npr.startBattle(15)
    //      公开 API（同时刷新 HUD 与 group.visible），属诊断性操作 ----
    const diag = await evalJSON(cdp, `(() => { const n = window.__npr; if (!n?.startBattle) return false; n.startBattle(15);
      document.querySelectorAll(".screen").forEach((e) => { e.style.display = "none"; }); return true; })()`);
    await sleep(1200);
    const hudBefore = await evalJSON(cdp, HUD_EXPR);
    const bytes = await shoot(cdp, path.join(OUT, "v3-20k-05-xigema-20261109.png"));
    const hudAfter = await evalJSON(cdp, HUD_EXPR);
    log("[shot] v3-20k-05-xigema diag=" + diag + " hud=" + hudBefore.hudName + " idx=" + hudBefore.hudIdx + " active=" + hudBefore.activeIndex + " bytes=" + bytes);
    result.shots.push({ file: "v3-20k-05-xigema-20261109.png", expect: "西格玛奶蛙", expectIndex: 15, hudBefore, hudAfter, pngBytes: bytes, via: "__npr.startBattle(15) 诊断性调用" });

    // ---- 诊断帧：临时隐藏全部成员 group，拍一张「无角色背景」，用于把角色从背景里分离出
    //      剪影掩膜（计算两两 IoU 需要同机位、同姿态尺度的背景参考）。拍完立即恢复可见性，
    //      不是交付截图，仅为量化取证 ----
    const bgToggle = await evalJSON(cdp, `(() => {
      const ms = window.__npr?.squad?.members;
      if (!Array.isArray(ms)) return { ok: false };
      const saved = ms.map((m) => (m.group ? m.group.visible : null));
      ms.forEach((m) => { if (m.group) m.group.visible = false; });
      window.__bgSaved = saved;
      return { ok: true, hidden: saved.filter((v) => v === true).length };
    })()`);
    await sleep(700);
    const bgBytes = await shoot(cdp, path.join(OUT, "v3-20k-bg-diagnostic.png"));
    const bgRestore = await evalJSON(cdp, `(() => {
      const ms = window.__npr?.squad?.members || [];
      const saved = window.__bgSaved || [];
      ms.forEach((m, i) => { if (m.group && typeof saved[i] === "boolean") m.group.visible = saved[i]; });
      delete window.__bgSaved;
      return ms.filter((m) => m.group && m.group.visible).length;
    })()`);
    log("[diag-bg] ok=" + bgToggle.ok + " hidden=" + bgToggle.hidden + " bytes=" + bgBytes + " restoredVisible=" + bgRestore);
    // 注意：result.meta 会在后面被性能采样整体覆盖，因此这里先暂存，稍后再回填
    const bgDiag = { ok: !!bgToggle.ok, hidden: bgToggle.hidden, restoredVisible: bgRestore, bytes: bgBytes };

    // ---- renderer.info / 资源 / 耗时 ----
    // postfx 的最后一趟是全屏 quad，默认 autoReset 会把它误读成 calls=1。改为 autoReset=false，
    // 命令式 reset 后等一整帧再读，得到「一帧累计」（场景 + NPR 描边 + bloom/composite 全量）。
    result.meta = await evalJSON(cdp, `(() => {
      const n = window.__npr; const r = n.renderer; const info = r.info;
      const res = performance.getEntriesByType("resource").map((e) => ({ n: e.name.split("/").pop(), size: e.transferSize || e.decodedBodySize || 0, d: Math.round(e.duration), start: Math.round(e.startTime) }));
      const glbs = res.filter((x) => x.n.endsWith(".glb"));
      return {
        rendererLastPass: { calls: info.render.calls, triangles: info.render.triangles },
        canvas: [r.domElement.width, r.domElement.height], cssSize: [r.domElement.clientWidth, r.domElement.clientHeight],
        pixelRatio: r.getPixelRatio(),
        glb: { count: glbs.length, bytes: glbs.reduce((a, b) => a + b.size, 0), totalMs: Math.round(glbs.reduce((a, b) => Math.max(a, b.d), 0)) },
        nav: (() => { const t = performance.getEntriesByType("navigation")[0]; return t ? { domContentLoaded: Math.round(t.domContentLoadedEventEnd), load: Math.round(t.loadEventEnd) } : null; })(),
        memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize } : null,
      };
    })()`);
    const frameInfo = await evalAwait(cdp, `new Promise((res) => {
      const r = window.__npr.renderer; const info = r.info;
      r.info.autoReset = false; info.reset();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const o = { calls: info.render.calls, triangles: info.render.triangles, lines: info.render.lines, points: info.render.points,
          geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? null, frameAccumulated: true };
        info.autoReset = true; res(o);
      }));
    })`);
    result.meta.renderer = frameInfo;
    result.meta.readyMs = readyMs;
    result.meta.screensHiddenForBuildCssBug = screensHidden;
    result.meta.bgDiagnostic = bgDiag;
    result.meta.cdpPort = port;
    result.meta.viewport = VIEW;
    result.meta.build = {
      note: "vite 8.3.6 默认压缩产物存在 this.currentBgm 被错误压成裸标识符的构建缺陷，已在 --minify false 下取证",
    };
    result.ok = true;
  } catch (e) {
    result.ok = false;
    result.fatal = String((e && e.stack) || e);
    log("[fatal] " + result.fatal);
  } finally {
    try { if (kill) kill(); } catch { /* noop */ }
    if (server) await new Promise((r) => server.close(r));
    result.consoleErrors = errors;
    writeFileSync(path.join(OUT, "v3-20k-metrics-20261109.json"), JSON.stringify(result, null, 2), "utf8");
    log("[done] ok=" + result.ok + " shots=" + result.shots.length);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => { log("[top-fatal] " + String((e && e.stack) || e)); writeFileSync(path.join(OUT, "v3-20k-metrics-20261109.json"), JSON.stringify({ ok: false, fatal: String((e && e.stack) || e) }, null, 2), "utf8"); process.exitCode = 1; });