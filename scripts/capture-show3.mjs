/**
 * 展示层三轮截图 + HUD 遮挡客观取证（v3-show3）。
 *
 * 与二轮 capture-show2.mjs 的差异：
 *  - 隔离构建 .tmp-dist-show3、端口 5284（占用则 5285）、机位 lookAtHeight 0.7（distance 3.8 / fov 40 / sideOffset 2.2 不变）
 *  - 每张主图前后读取底部 HUD 按键条 `#ui .hud-keys` 的 getBoundingClientRect()（CSS px），
 *    并同时换算为 canvas 像素（× canvas.height / innerHeight），供 python 与 iso 掩膜最低行比较
 *  - 记录主图时实际生效的 bloom（leader 提示 main.mjs 的 0.22 / 0.16 不一致，本轮只记录不改）
 *  - 恢复 bloom 时用截图前实测值，不再硬编码 0.16（否则从第二只起主图 bloom 会被改写）
 *  - 记录构建产物与源码 mtime，便于审计“截图晚于最后一次成功构建”
 *
 * 静态服务器 + CDP 同进程（Windows 下后台子进程会被回收）。
 * 页面只读：仅通过 window.__npr 公开 API 与 DOM 读操作驱动。
 *
 * 用法：node scripts/capture-show3.mjs
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = path.join(ROOT, ".tmp-dist-show3");
const OUT = path.join(ROOT, "docs", "evidence");
const PORT_PREFERRED = Number(process.env.PORT || 5284);
const FALLBACK_PORTS = [PORT_PREFERRED, 5285];
const HOST = process.env.HOST_IP || Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address || "127.0.0.1";
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
const VIEW = { width: 1600, height: 1000, dpr: 1.25 }; // → canvas 2000×1250
const LOG_PATH = path.join(ROOT, ".tmp-show3-cap.log");
const PROGRESS_PATH = path.join(ROOT, ".tmp-show3-progress.json");

if (!CHROME) throw new Error("未找到 Chrome/Edge");
if (!existsSync(path.join(DIST, "index.html"))) throw new Error("缺少 .tmp-dist-show3/index.html，请先 vite build --outDir .tmp-dist-show3 --minify false");

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
    const tryListen = (i) => {
      const port = FALLBACK_PORTS[i];
      const onError = (err) => {
        if (err && err.code === "EADDRINUSE" && i + 1 < FALLBACK_PORTS.length) {
          log("[server] port " + port + " in use, retry " + FALLBACK_PORTS[i + 1]);
          server.removeListener("error", onError);
          tryListen(i + 1);
        } else reject(err);
      };
      server.once("error", onError);
      server.listen(port, "0.0.0.0", () => { server.removeListener("error", onError); resolve({ server, port }); });
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
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = path.join(os.tmpdir(), "naiwa-show3-" + port + "-" + Date.now());
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
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* profile 可能被锁 */ }
  };
  return { cdp, kill, port };
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

/**
 * HUD 快照：壳名 / i/16 / activeIndex / 可见性 / 相机 / 底部按键条 rect。
 * 按键条 rect 同时给 CSS px（getBoundingClientRect）与 canvas px（× canvas.height / innerHeight），
 * 因为 iso 掩膜（PNG）坐标是 canvas px（2000×1250），而 DOM rect 是 CSS px（1600×1000）。
 */
const HUD_EXPR = `(() => {
  const n = window.__npr;
  const keysEl = document.querySelector("#ui .hud-keys");
  const kr = keysEl ? keysEl.getBoundingClientRect() : null;
  const cv = n?.renderer?.domElement;
  const scale = cv && cv.height ? cv.height / window.innerHeight : 1;
  return {
    hudName: document.querySelector("#hud-shell-name")?.textContent?.trim() || "",
    hudIdx: document.querySelector("#hud-shell-idx")?.textContent?.trim() || "",
    hudShell: document.querySelector("#hud-shell")?.textContent?.trim() || "",
    activeIndex: n?.squad?.activeIndex ?? null,
    activeName: n?.squad?.active?.name ?? null,
    activeId: n?.squad?.active?.id ?? null,
    activeGlb: n?.squad?.active?.glb ?? null,
    visualScale: n?.squad?.active?.visualScale ?? null,
    scale: n?.squad?.active?.scale ?? null,
    visibleGroups: n?.squad?.members?.filter((m) => m.group?.visible).map((m) => m.name) ?? [],
    opponentVisible: !!n?.scene?.getObjectByName?.("opponent")?.visible,
    mode: n?.getMode?.() ?? null,
    steps: n?.getSteps?.() ?? null,
    canvas: cv ? [cv.width, cv.height] : null,
    pixelRatio: n?.renderer?.getPixelRatio?.() ?? null,
    inner: [window.innerWidth, window.innerHeight],
    playerPos: n?.squad?.active?.move?.pos ? [n.squad.active.move.pos.x, n.squad.active.move.pos.y, n.squad.active.move.pos.z] : null,
    groupPos: n?.squad?.active?.group?.position ? [n.squad.active.group.position.x, n.squad.active.group.position.y, n.squad.active.group.position.z] : null,
    cameraPos: n?.camera?.position ? [n.camera.position.x, n.camera.position.y, n.camera.position.z] : null,
    cameraFov: n?.camera?.fov ?? null,
    exposute: n?.renderer?.toneMappingExposure ?? null,
    shadowType: n?.renderer?.shadowMap?.type ?? null,
    bloom: n?.postfx?.bloom ? {
      enabled: n.postfx.bloom.enabled,
      strength: n.postfx.bloom.strength,
      radius: n.postfx.bloom.radius,
      threshold: n.postfx.bloom.threshold,
    } : null,
    hudKeysSelector: "#ui .hud-keys",
    hudKeysRect: kr ? {
      top: +kr.top.toFixed(2), bottom: +kr.bottom.toFixed(2),
      left: +kr.left.toFixed(2), right: +kr.right.toFixed(2),
      width: +kr.width.toFixed(2), height: +kr.height.toFixed(2),
      cssViewport: [window.innerWidth, window.innerHeight],
      canvasSize: cv ? [cv.width, cv.height] : null,
      pxPerCssPx: +scale.toFixed(4),
      topCanvas: +(kr.top * scale).toFixed(2),
      bottomCanvas: +(kr.bottom * scale).toFixed(2),
      heightCanvas: +(kr.height * scale).toFixed(2),
    } : null,
  };
})()`;

/** 暂停/恢复 rAF 主循环：冻结帧取证的前提。 */
const RAF_INSTALL_EXPR = `(() => {
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
    const p = window.__rafPend.slice();
    window.__rafPend.length = 0;
    p.forEach((cb) => window.__rafOrig(cb));
  };
  window.__rafWrapped = true;
  return "installed";
})()`;

const DOM_HIDE_EXPR = `(() => {
  window.__domPrev = [];
  document.querySelectorAll("#ui, #toast, .screen").forEach((el) => {
    window.__domPrev.push([el, el.style.visibility]);
    el.style.visibility = "hidden";
  });
  return window.__domPrev.length;
})()`;

const BG_HIDE_EXPR = `(() => {
  const n = window.__npr; const g = n.squad.active.group;
  const prev = g.visible; g.visible = false; window.__bgPrev = prev; return { prev };
})()`;

const BG_RESTORE_EXPR = `(() => {
  const n = window.__npr; const g = n.squad.active.group;
  g.visible = window.__bgPrev; delete window.__bgPrev;
  (window.__domPrev || []).forEach(([el, prev]) => { el.style.visibility = prev; }); delete window.__domPrev;
  return g.visible;
})()`;

const ISO_HIDE_EXPR = `(() => {
  const n = window.__npr; const keep = n.squad.active.group; const hidden = [];
  n.scene.children.forEach((o) => { if (o.isLight || o === keep) return; if (o.visible) { o.visible = false; hidden.push(o); } });
  window.__isoHidden = hidden;
  window.__isoDom = [];
  document.querySelectorAll("#ui, #toast, .screen").forEach((el) => {
    const prev = el.style.visibility;
    el.style.visibility = "hidden";
    window.__isoDom.push([el, prev]);
  });
  return { hidden: hidden.length, dom: window.__isoDom.length };
})()`;

const ISO_EMPTY_EXPR = `(() => {
  const n = window.__npr; const g = n.squad.active.group;
  g.visible = false; return true;
})()`;

const ISO_RESTORE_EXPR = `(() => {
  const n = window.__npr; const g = n.squad.active.group; g.visible = true;
  const h = window.__isoHidden || []; h.forEach((o) => { o.visible = true; }); delete window.__isoHidden;
  (window.__isoDom || []).forEach(([el, prev]) => { el.style.visibility = prev; }); delete window.__isoDom;
  return h.length;
})()`;

/** 相机 + 角色世界变换快照（判定隔离帧与主图同一状态） */
const STATE_EXPR = `(() => {
  const n = window.__npr; const m = n.squad.active; const c = n.camera;
  const w = m.group.getObjectByName("model-wrapper");
  return {
    camPos: [c.position.x, c.position.y, c.position.z],
    camQuat: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w],
    fov: c.fov, aspect: c.aspect, near: c.near, far: c.far,
    groupPos: [m.group.position.x, m.group.position.y, m.group.position.z],
    groupQuat: [m.group.quaternion.x, m.group.quaternion.y, m.group.quaternion.z, m.group.quaternion.w],
    groupScale: [m.group.scale.x, m.group.scale.y, m.group.scale.z],
    wrapperScale: w ? [w.scale.x, w.scale.y, w.scale.z] : null,
    wrapperPos: w ? [w.position.x, w.position.y, w.position.z] : null,
    wrapperVisible: w ? w.visible : null,
    innerScale: m.anim?.inner ? [m.anim.inner.scale.x, m.anim.inner.scale.y, m.anim.inner.scale.z] : null,
    animAction: m.anim?.action ?? null,
  };
})()`;

function statMtime(p) {
  try { return statSync(p).mtime.toISOString(); } catch { return null; }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const errors = [];
  const result = { shots: [], errors, meta: {} };
  let server = null;
  let kill = null;
  let actualPort = null;
  try {
    const srv = await startServer(DIST);
    server = srv.server;
    actualPort = srv.port;
    log("[boot] static root=" + DIST + " url=http://" + HOST + ":" + actualPort + "/");
    const chrome = await launchChrome();
    const { cdp, port } = chrome;
    kill = chrome.kill;
    cdp.on("Runtime.exceptionThrown", (p) => errors.push({ kind: "exception", text: p.exceptionDetails?.text, desc: p.exceptionDetails?.exception?.description }));
    cdp.on("Log.entryAdded", (p) => { if (p.entry?.level === "error" && !/favicon\.ico/.test(p.entry.url || p.entry.text || "")) errors.push({ kind: "log", source: p.entry.source, text: p.entry.text, url: p.entry.url }); });
    cdp.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "assert") errors.push({ kind: "console." + p.type, args: (p.args || []).map((a) => a.value ?? a.description ?? a.type) }); });
    cdp.on("Network.loadingFailed", (p) => { if (!p.canceled) errors.push({ kind: "network", id: p.requestId, err: p.errorText }); });

    const t0 = Date.now();
    await cdp.send("Page.navigate", { url: `http://${HOST}:${actualPort}/?t=${Date.now()}` });

    let ready = { ok: false };
    for (let i = 0; i < 600; i++) {
      await sleep(100);
      try { ready = await evalJSON(cdp, READY_EXPR); } catch { ready = { ok: false, why: "eval pending" }; }
      if (ready.ok) break;
    }
    if (!ready.ok) throw new Error("就绪超时: " + JSON.stringify(ready));
    const readyMs = Date.now() - t0;
    log("[ready] " + readyMs + "ms members=" + ready.count + " hud=" + ready.name);

    const frozen0 = await evalJSON(cdp, `(() => { const n = window.__npr; n.battle.freezeT = 1e9; return n.battle.freezeT; })()`);
    log("[freeze] freezeT=" + frozen0);
    const rafInstall = await evalJSON(cdp, RAF_INSTALL_EXPR);
    log("[raf] " + rafInstall);
    await sleep(1200);

    const shots = [
      { tag: "00", file: "v3-show3-00-naiwa-20261109.png", label: "奶蛙", index: 0 },
      { tag: "01", file: "v3-show3-01-naifen-20261109.png", label: "奶粉", index: 6 },
      { tag: "02", file: "v3-show3-02-naimao-20261109.png", label: "奶猫", index: 8 },
      { tag: "03", file: "v3-show3-03-naishi-20261109.png", label: "奶屎", index: 9 },
      { tag: "04", file: "v3-show3-04-naiyu-20261109.png", label: "奶鱼", index: 12 },
      { tag: "05", file: "v3-show3-05-xigema-20261109.png", label: "西格玛奶蛙", index: 15 },
    ];

    for (const s of shots) {
      const setup = await evalJSON(cdp, `(() => {
        const n = window.__npr;
        n.startBattle(${s.index});
        n.battle.freezeT = 1e9;
        return { ok: true, active: n.squad.activeIndex, freezeT: n.battle.freezeT };
      })()`);
      await sleep(900);
      // 机位吸附到三轮调参目标：distance 3.8 / height 1.6 / sideOffset 2.2 / fov 40 / lookAt 0.7
      const cam = await evalJSON(cdp, `(() => {
        const n = window.__npr; const p = n.squad.active.move.pos; const c = n.camera;
        n.squad.active.group.position.copy(p);
        c.position.set(p.x + 3.8, 1.6, 2.2);
        c.fov = 40; c.updateProjectionMatrix();
        c.lookAt(p.x, 0.7, p.z);
        c.updateMatrixWorld(true);
        return [c.position.x, c.position.y, c.position.z, n.squad.active.group.position.x];
      })()`);
      await waitFrames(cdp, 2);

      const before = await evalJSON(cdp, HUD_EXPR);

      // 主图与隔离帧必须同一场景状态：先暂停 rAF 主循环，再手动 postfx.render 出主图。
      // 主图此时 HUD 仍可见、bloom 仍开启（与在线游玩画面一致），只是动画被冻结；
      // 随后关 bloom 拍 clean/bg/iso/iso-empty，角色变换（wrapperScale 等）与主图完全一致。
      // 注意：__rafPause 只拦截后续 rAF，已排队的一帧仍会执行一次；故先等 260ms 让其落地，
      // 再读 stateAtMain（冻结态），保证它与 stateBeforeIso 完全一致。
      await evalJSON(cdp, `(() => { window.__rafPause(); return true; })()`);
      await sleep(260);
      const stateAtMain = await evalJSON(cdp, STATE_EXPR);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(90);
      const bytes = await shoot(cdp, path.join(OUT, s.file));
      const after = await evalJSON(cdp, HUD_EXPR);
      const shotAt = new Date().toISOString();

      // ---------- 冻结帧取证 ----------
      // 环境（霓虹/bloom/氛围）在主循环里持续动画，普通差分会把整屏背景算进来。
      // 做法：暂停 rAF 主循环（上一段已暂停）→ 手动 postfx.render 同一场景状态两次（仅切换角色可见性）。
      // 取证帧临时关 bloom（全屏加性光晕会让差分被泛光污染），主图（上一步）保留 HUD 与 bloom。
      const domHide = await evalJSON(cdp, DOM_HIDE_EXPR);
      await sleep(40);
      // 记录并关闭 bloom；恢复时用实测值（不硬编码 0.16，避免改写外部线刚设的 0.22）
      const bloomPrev = await evalJSON(cdp, `(() => {
        const b = window.__npr.postfx.bloom;
        window.__bloomPrev = { enabled: b.enabled, strength: b.strength };
        window.__npr.postfx.setBloom(false);
        return window.__bloomPrev;
      })()`);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(90);
      const cleanBytes = await shoot(cdp, path.join(OUT, "v3-show3-clean-" + s.tag + ".png"));

      // bg 帧：只隐藏当前角色 group（场景/对手/灯光保持），用于同场景差分（辅助口径）
      const bgHide = await evalJSON(cdp, BG_HIDE_EXPR);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(90);
      const bgBytes = await shoot(cdp, path.join(OUT, "v3-show3-bg-" + s.tag + ".png"));
      const bgRestore = await evalJSON(cdp, BG_RESTORE_EXPR);

      // 剪影帧：隐藏场景其它节点 + DOM，只留当前角色与灯光 → 纯底，掩膜无歧义（无地面阴影）
      const isoHide = await evalJSON(cdp, ISO_HIDE_EXPR);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(90);
      const stateBeforeIso = await evalJSON(cdp, STATE_EXPR);
      const isoBytes = await shoot(cdp, path.join(OUT, "v3-show3-iso-" + s.tag + ".png"));
      // 空场景帧：在隔离状态下再隐藏角色 → 纯背景（无阴影），差分得纯剪影
      const isoEmptyHide = await evalJSON(cdp, ISO_EMPTY_EXPR);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(90);
      const isoEmptyBytes = await shoot(cdp, path.join(OUT, "v3-show3-iso-empty-" + s.tag + ".png"));
      const isoRestore = await evalJSON(cdp, ISO_RESTORE_EXPR);
      const bloomRestore = await evalJSON(cdp, `(() => {
        const p = window.__bloomPrev; delete window.__bloomPrev;
        window.__npr.postfx.setBloom(p.enabled, p.strength);
        window.__npr.postfx.render(0.016);
        return { enabled: window.__npr.postfx.bloom.enabled, strength: window.__npr.postfx.bloom.strength, prev: p };
      })()`);
      const stateAfterIso = await evalJSON(cdp, STATE_EXPR);
      await evalJSON(cdp, `(() => { window.__rafResume(); return true; })()`);
      await waitFrames(cdp, 2);

      log("[shot] " + s.file + " hud=" + before.hudName + " idx=" + before.hudIdx
        + " active=" + before.activeIndex + "/" + before.activeId + " vScale=" + before.visualScale
        + " cam=" + JSON.stringify(before.cameraPos) + " fov=" + before.cameraFov
        + " bloom=" + JSON.stringify(before.bloom)
        + " hudKeys=" + JSON.stringify(before.hudKeysRect)
        + " bytes=" + bytes + " clean=" + cleanBytes + " bg=" + bgBytes + " iso=" + isoBytes + " isoEmpty=" + isoEmptyBytes
        + " shotAt=" + shotAt);
      result.shots.push({
        file: s.file, cleanFile: "v3-show3-clean-" + s.tag + ".png", bgFile: "v3-show3-bg-" + s.tag + ".png",
        isoFile: "v3-show3-iso-" + s.tag + ".png", isoEmptyFile: "v3-show3-iso-empty-" + s.tag + ".png",
        expect: s.label, expectIndex: s.index, hudBefore: before, hudAfter: after,
        pngBytes: bytes, cleanBytes, bgBytes, isoBytes, isoEmptyBytes, domHidden: domHide,
        camSnap: cam, bgHide, bgRestore, isoHide, isoEmptyHide, isoRestore,
        bloomPrev, bloomRestore,
        stateAtMain, stateBeforeIso, stateAfterIso, shotAt,
        hudMatch: before.hudName === s.label && before.activeIndex === s.index && before.activeName === s.label,
      });
      // 增量落盘：本机偶发外部进程中断 node/chrome，保证已拍角色的数据不丢
      try {
        writeFileSync(PROGRESS_PATH,
          JSON.stringify({ ok: null, shots: result.shots, errors }, null, 1), "utf8");
      } catch { /* noop */ }
    }

    result.meta.base = await evalJSON(cdp, `(() => {
      const n = window.__npr; const r = n.renderer;
      return {
        exposure: r.toneMappingExposure,
        shadowMapType: r.shadowMap.type,
        camera: { pos: [n.camera.position.x, n.camera.position.y, n.camera.position.z], fov: n.camera.fov, aspect: n.camera.aspect },
        bloom: n.postfx?.bloom ? { strength: n.postfx.bloom.strength, enabled: n.postfx.bloom.enabled, threshold: n.postfx.bloom.threshold, radius: n.postfx.bloom.radius } : null,
        playerPos: [n.squad.active.move.pos.x, n.squad.active.move.pos.y, n.squad.active.move.pos.z],
        squadVisualScale: n.squad.members.map((m) => ({ id: m.id, name: m.name, scale: m.scale, visualScale: m.visualScale ?? null })),
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
    result.meta.cdpPort = port;
    result.meta.viewport = VIEW;
    result.meta.server = { requestedPort: PORT_PREFERRED, actualPort, bind: "0.0.0.0", hostUsed: HOST };
    result.meta.build = {
      dist: ".tmp-dist-show3",
      vite: "8.3.6",
      minify: false,
      outDirMtime: statMtime(path.join(DIST, "index.html")),
      assetsMtime: statMtime(path.join(DIST, "assets")),
      camera: { distance: 3.8, fovVertical: 40, height: 1.6, sideOffset: 2.2, lookAtHeight: 0.7 },
    };
    result.meta.srcMtimes = {
      "src/main.mjs": statMtime(path.join(ROOT, "src", "main.mjs")),
      "src/game/tuning.mjs": statMtime(path.join(ROOT, "src", "game", "tuning.mjs")),
      "src/game/squad.mjs": statMtime(path.join(ROOT, "src", "game", "squad.mjs")),
      "src/render/npr.mjs": statMtime(path.join(ROOT, "src", "render", "npr.mjs")),
      "src/ui/style.css": statMtime(path.join(ROOT, "src", "ui", "style.css")),
      "src/render/postfx.mjs": statMtime(path.join(ROOT, "src", "render", "postfx.mjs")),
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
    result.meta.finishedAt = new Date().toISOString();
    writeFileSync(path.join(OUT, "v3-show3-metrics.json"), JSON.stringify(result, null, 2), "utf8");
    log("[done] ok=" + result.ok + " shots=" + result.shots.length + " errors=" + errors.length
      + " hudMismatch=" + result.shots.filter((s) => !s.hudMatch).length + " port=" + actualPort);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  log("[top-fatal] " + String((e && e.stack) || e));
  writeFileSync(path.join(OUT, "v3-show3-metrics.json"), JSON.stringify({ ok: false, fatal: String((e && e.stack) || e) }, null, 2), "utf8");
  process.exitCode = 1;
});