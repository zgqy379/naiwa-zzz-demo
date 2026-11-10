/**
 * 撤销重染复验采集（v3-tint2，task id=24 leader 裁决执行）。
 *
 * 背景：族谱像素采样五路交叉（docs/evidence/tint2-ref-sample-20261110.json）证实
 * GLB 贴图忠实于族谱配色（色相差 <11°），roster-audit 的「三只辨识色缺失」系把
 * config color（饰带色）误用为本体判据。leader 裁决：撤销重染（COLOR_OVERRIDE 置空），
 * 「恢复原状」为正确终态。
 *
 * 本采集目标 = 证明「回到原状」：
 *  - 隔离构建 .tmp-dist-tint2（默认 minify）、端口 5330 起试
 *  - 5 只：撤销重染的 idx 8/12/6 + 抽查 idx 0/15
 *  - 真实输入进战斗 → window.__npr.startBattle(i) 切换 → 就位轮询（同 roster/tint 口径）
 *  - 正视机位 distance 3.8 / height 1.6 / lookAt 0.7 / fov 40（与 roster/tint 同机位）
 *  - 每只 3 帧：主图（HUD+bloom）/ iso-empty / iso（掩膜源）
 *  - 材质取证：本轮全 null → defines 不含 USE_TINT_NPR、无 tint uniforms（机制未激活证据）
 *  - console error / Runtime.exceptionThrown / network error 全程采集
 *
 * 用法：node scripts/capture-tint2.mjs
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = path.join(ROOT, ".tmp-dist-tint2");
const OUT = path.join(ROOT, "docs", "evidence");
const PORT_PREFERRED = Number(process.env.PORT || 5330);
const FALLBACK_PORTS = [PORT_PREFERRED, 5331, 5332, 5333];
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
const VIEW = { width: 1600, height: 1000, dpr: 1.25 };
const LOG_PATH = path.join(ROOT, ".tmp-tint2-cap.log");
const PROGRESS_PATH = path.join(ROOT, ".tmp-tint2-progress.json");

const TARGETS = [
  { idx: 0,  id: "shell_naiwa",  short: "naiwa",  name: "奶蛙",   glb: "naiwa_laugh_g1_runtime.glb" },
  { idx: 6,  id: "shell_naifen", short: "naifen", name: "奶粉",   glb: "naiwa_naifen_runtime.glb" },
  { idx: 8,  id: "shell_naimao", short: "naimao", name: "奶猫",   glb: "naiwa_naimao_runtime.glb" },
  { idx: 12, id: "shell_naiyu",  short: "naiyu",  name: "奶鱼",   glb: "naiwa_naiyu_runtime.glb" },
  { idx: 15, id: "shell_xigema", short: "xigema", name: "西格玛奶蛙", glb: "naiwa_xigema_runtime.glb" },
];

if (!CHROME) throw new Error("未找到 Chrome/Edge");
if (!existsSync(path.join(DIST, "index.html"))) throw new Error("缺少 .tmp-dist-tint2/index.html，请先 vite build --outDir .tmp-dist-tint2 --emptyOutDir");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".glb": "model/gltf-binary",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".map": "application/json",
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
        res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
        createReadStream(file).pipe(res);
      } catch (e) { res.writeHead(500, { "content-type": "text/plain" }); res.end(String(e)); }
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
    this.id = 0; this.pending = new Map(); this.events = new Map();
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) { for (const fn of this.events.get(msg.method) || []) fn(msg.params); }
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
  const profile = path.join(os.tmpdir(), "naiwa-tint2-" + port + "-" + Date.now());
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 旧目录被锁则忽略 */ }
  mkdirSync(profile, { recursive: true });
  log("[chrome] launch port=" + port + " profile=" + profile);
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
}

async function shoot(cdp, file) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(file, Buffer.from(r.data, "base64"));
  return r.data.length;
}

function sha1(file) {
  return crypto.createHash("sha1").update(readFileSync(file)).digest("hex");
}

function statMtime(p) {
  try { return statSync(p).mtime.toISOString(); } catch { return null; }
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

const MEMBER_READY_EXPR = (name, idx) => `(() => {
  const n = window.__npr;
  const hudName = document.querySelector("#hud-shell-name")?.textContent?.trim() || "";
  const vis = (n?.squad?.members || []).map((m, i) => (m.group?.visible ? i : -1)).filter((i) => i >= 0);
  return {
    ok: hudName === ${JSON.stringify(name)} && vis.length === 1 && vis[0] === ${idx} && n?.squad?.activeIndex === ${idx},
    hudName, visibleGroups: vis, activeIndex: n?.squad?.activeIndex ?? null,
    activeId: n?.squad?.active?.id ?? null, activeGlb: n?.squad?.active?.glb ?? null,
    screen: n?.screens?.current ?? null,
  };
})()`;

const HUD_EXPR = `(() => {
  const n = window.__npr;
  const m = n?.squad?.active;
  const cv = n?.renderer?.domElement;
  return {
    hudName: document.querySelector("#hud-shell-name")?.textContent?.trim() || "",
    hudIdx: document.querySelector("#hud-shell-idx")?.textContent?.trim() || "",
    activeIndex: n?.squad?.activeIndex ?? null,
    activeName: m?.name ?? null, activeId: m?.id ?? null, activeGlb: m?.glb ?? null,
    tintColor: m?.tintColor ?? null,
    visibleGroups: (n?.squad?.members || []).map((x, i) => (x.group?.visible ? i : -1)).filter((i) => i >= 0),
    facing: m?.move?.facing ?? null,
    cameraPos: n?.camera ? [n.camera.position.x, n.camera.position.y, n.camera.position.z] : null,
    cameraFov: n?.camera?.fov ?? null,
    canvas: cv ? [cv.width, cv.height] : null,
    exposure: n?.renderer?.toneMappingExposure ?? null,
    bloom: n?.postfx?.bloom ? { enabled: n.postfx.bloom.enabled, strength: n.postfx.bloom.strength } : null,
  };
})()`;

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

const ISO_GROUP_OFF = `(() => { window.__npr.squad.active.group.visible = false; return true; })()`;
const ISO_GROUP_ON = `(() => { window.__npr.squad.active.group.visible = true; return true; })()`;
const ISO_RESTORE_EXPR = `(() => {
  const h = window.__isoHidden || [];
  h.forEach((o) => { o.visible = true; });
  delete window.__isoHidden;
  (window.__isoDom || []).forEach(([el, prev]) => { el.style.visibility = prev; });
  delete window.__isoDom;
  return h.length;
})()`;

const BLOOM_OFF = `(() => {
  const b = window.__npr.postfx.bloom;
  window.__bloomPrev = { enabled: b.enabled, strength: b.strength };
  window.__npr.postfx.setBloom(false);
  return window.__bloomPrev;
})()`;
const BLOOM_RESTORE = `(() => {
  const p = window.__bloomPrev; delete window.__bloomPrev;
  window.__npr.postfx.setBloom(p.enabled, p.strength);
  return p;
})()`;

const FACE_CAMERA_EXPR = `(() => {
  const n = window.__npr; const m = n.squad.active; const c = n.camera;
  const p = m.move?.pos || m.group.position;
  const facing = (m.move?.facing != null) ? m.move.facing : 0;
  const fwd = { x: Math.sin(facing), z: Math.cos(facing) };
  const dist = 3.8;
  c.position.set(p.x + fwd.x * dist, 1.6, p.z + fwd.z * dist);
  c.fov = 40; c.updateProjectionMatrix();
  c.lookAt(p.x, 0.7, p.z);
  c.updateMatrixWorld(true);
  return { facing, camPos: [c.position.x, c.position.y, c.position.z], pos: [p.x, p.y, p.z] };
})()`;

/** 材质取证：本轮撤销后应无任何 tint 注入（defines 无 USE_TINT_NPR、无 uTintHS） */
const TINT_INSPECT_EXPR = `(() => {
  const w = window.__npr.squad.active.group.getObjectByName("model-wrapper");
  if (!w) return { error: "no wrapper" };
  const mats = [];
  w.traverse((c) => {
    if (c.isMesh && c.material?.userData?.shader) {
      const u = c.material.userData.shader.uniforms;
      mats.push({
        hasTint: !!(u.uTintHS || u.uTintColor),
        uTintHS: u.uTintHS ? [+u.uTintHS.value.x.toFixed(4), +u.uTintHS.value.y.toFixed(4)] : null,
        uTintMix: u.uTintMix ? u.uTintMix.value : null,
        defines: c.material.defines ? Object.keys(c.material.defines) : [],
      });
    }
  });
  return { nprMats: mats.length, mats };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const errors = [];
  const result = { shots: [], errors, meta: {} };
  let server = null, kill = null, actualPort = null, profile = null;
  try {
    result.meta.glb = TARGETS.map((f) => {
      const p = path.join(ROOT, "public", "asset", f.glb);
      const st = statSync(p);
      return { idx: f.idx, id: f.id, file: f.glb, bytes: st.size, sha1: sha1(p) };
    });
    result.meta.srcMtimes = {
      "src/game/squad.mjs": statMtime(path.join(ROOT, "src", "game", "squad.mjs")),
      "src/render/npr.mjs": statMtime(path.join(ROOT, "src", "render", "npr.mjs")),
      "src/main.mjs": statMtime(path.join(ROOT, "src", "main.mjs")),
    };
    log("[glb] 5 只目标指纹已计算");

    const srv = await startServer(DIST);
    server = srv.server;
    actualPort = srv.port;
    const HOST = "127.0.0.1";
    log("[boot] static root=" + DIST + " url=http://" + HOST + ":" + actualPort + "/");
    const chrome = await launchChrome();
    const { cdp, port } = chrome;
    kill = chrome.kill;
    profile = chrome.profile;
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
    await sleep(1500);

    // ---- 真实输入进战斗：title start → select confirm ----
    const clicked = await evalJSON(cdp, `(() => { const b = document.querySelector('#screen-title [data-action="start"]');
      if (!b) return { ok: false }; b.click(); return { ok: true }; })()`);
    await sleep(600);
    const confirmed = await evalJSON(cdp, `(() => { const b = document.querySelector('#screen-select [data-action="confirm"]');
      if (!b) return { ok: false }; b.click(); return { ok: true }; })()`);
    await sleep(1200);
    const enterState = await evalJSON(cdp, HUD_EXPR);
    log("[battle] startClick=" + clicked.ok + " confirmClick=" + confirmed.ok
      + " hud=" + enterState.hudName + " idx=" + enterState.hudIdx + " active=" + enterState.activeIndex);
    result.enter = { clicked, confirmed, enterState };

    await evalJSON(cdp, `(() => { window.__npr.battle.freezeT = 1e9; return window.__npr.battle.freezeT; })()`);
    const rafInstall = await evalJSON(cdp, RAF_INSTALL_EXPR);
    log("[freeze+raf] freezeT=1e9 raf=" + rafInstall);
    await sleep(900);

    for (const f of TARGETS) {
      const file = path.join(OUT, `v3-tint2-${String(f.idx).padStart(2, "0")}-${f.short}.png`);
      const isoFile = path.join(OUT, `v3-tint2-iso-${String(f.idx).padStart(2, "0")}.png`);
      const isoEmptyFile = path.join(OUT, `v3-tint2-iso-empty-${String(f.idx).padStart(2, "0")}.png`);

      // ---- 切换 + 就位轮询 ----
      await evalJSON(cdp, `(() => {
        const n = window.__npr;
        n.startBattle(${f.idx});
        n.battle.freezeT = 1e9;
        document.querySelectorAll(".screen").forEach((e) => { e.style.display = "none"; });
        return { ok: true, active: n.squad.activeIndex };
      })()`);
      let memberReady = null;
      for (let i = 0; i < 80; i++) {
        await sleep(150);
        try { memberReady = await evalJSON(cdp, MEMBER_READY_EXPR(f.name, f.idx)); } catch { memberReady = null; }
        if (memberReady?.ok) break;
      }
      if (!memberReady?.ok) {
        log("[warn] " + f.name + " 就位超时 " + JSON.stringify(memberReady));
        errors.push({ kind: "memberReady", idx: f.idx, state: memberReady });
      }

      // ---- 正视机位吸附（同 roster/tint 机位）----
      const camSnap = await evalJSON(cdp, FACE_CAMERA_EXPR);
      await waitFrames(cdp, 2);
      await sleep(700);

      // ---- 材质取证（撤销后应无 tint）----
      const tintInspect = await evalJSON(cdp, TINT_INSPECT_EXPR);

      // ---- 主图：RAF 暂停 + 手动 render（HUD+bloom 保留）----
      await evalJSON(cdp, `(() => { window.__rafPause(); return true; })()`);
      await sleep(300);
      const before = await evalJSON(cdp, HUD_EXPR);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(120);
      const bytes = await shoot(cdp, file);
      const after = await evalJSON(cdp, HUD_EXPR);

      // ---- 隔离帧 ----
      const isoHide = await evalJSON(cdp, ISO_HIDE_EXPR);
      await sleep(60);
      const bloomPrev = await evalJSON(cdp, BLOOM_OFF);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(100);
      const gOff = await evalJSON(cdp, ISO_GROUP_OFF);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(100);
      const isoEmptyBytes = await shoot(cdp, isoEmptyFile);
      await evalJSON(cdp, ISO_GROUP_ON);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(100);
      const isoBytes = await shoot(cdp, isoFile);
      const bloomRestore = await evalJSON(cdp, BLOOM_RESTORE);
      const isoRestore = await evalJSON(cdp, ISO_RESTORE_EXPR);
      await evalJSON(cdp, `(() => { window.__rafResume(); return true; })()`);
      await waitFrames(cdp, 2);

      log("[shot] idx=" + f.idx + " " + f.name + " hud=" + before.hudName + " vis=" + JSON.stringify(before.visibleGroups)
        + " tintColor=" + before.tintColor
        + " tintMats=" + (tintInspect.mats || []).filter((m) => m.hasTint).length
        + " bytes=" + bytes + " iso=" + isoBytes + " isoEmpty=" + isoEmptyBytes);
      result.shots.push({
        idx: f.idx, id: f.id, expect: f.name,
        file: path.basename(file), isoFile: path.basename(isoFile), isoEmptyFile: path.basename(isoEmptyFile),
        pngBytes: bytes, isoBytes, isoEmptyBytes,
        camSnap, hudBefore: before, hudAfter: after,
        memberReady, tintInspect,
        hudMatch: before.hudName === f.name && before.activeIndex === f.idx && before.visibleGroups.length === 1,
        shotAt: new Date().toISOString(),
      });
      try {
        writeFileSync(PROGRESS_PATH, JSON.stringify({ ok: null, shots: result.shots, errors }, null, 1), "utf8");
      } catch { /* noop */ }
    }

    result.meta.base = await evalJSON(cdp, `(() => {
      const n = window.__npr; const r = n.renderer;
      return {
        exposure: r.toneMappingExposure,
        toneMapping: r.toneMapping,
        canvas: [r.domElement.width, r.domElement.height],
        pixelRatio: r.getPixelRatio(),
        bloom: n.postfx?.bloom ? { enabled: n.postfx.bloom.enabled, strength: n.postfx.bloom.strength, threshold: n.postfx.bloom.threshold, radius: n.postfx.bloom.radius } : null,
        squad: n.squad.members.map((m, i) => ({ idx: i, id: m.id, name: m.name, color: m.color, tintColor: m.tintColor ?? null })),
      };
    })()`);
    result.meta.readyMs = readyMs;
    result.meta.cdpPort = port;
    result.meta.viewport = VIEW;
    result.meta.server = { requestedPort: PORT_PREFERRED, actualPort };
    result.meta.build = {
      dist: ".tmp-dist-tint2",
      vite: "8.3.6",
      minify: "default(production)",
      outDirMtime: statMtime(path.join(DIST, "index.html")),
      assetsMtime: statMtime(path.join(DIST, "assets")),
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
    writeFileSync(path.join(OUT, "v3-tint2-capture-20261110.json"), JSON.stringify(result, null, 2), "utf8");
    log("[done] ok=" + result.ok + " shots=" + result.shots.length + " errors=" + errors.length
      + " hudMismatch=" + result.shots.filter((s) => !s.hudMatch).length + " port=" + actualPort);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  log("[top-fatal] " + String((e && e.stack) || e));
  try { writeFileSync(path.join(OUT, "v3-tint2-capture-20261110.json"), JSON.stringify({ ok: false, fatal: String((e && e.stack) || e) }, null, 2), "utf8"); } catch { /* noop */ }
  process.exitCode = 1;
});