/**
 * 展示层验收截图（v3-show）：隔离构建 .tmp-dist-show · 根路径服务 · 同进程 CDP。
 *
 * 目标：证明「侧后方机位 + 高度归一化 + 曝光/描边调整」后 16 只造型的**轮廓**能读出来。
 *
 * 设计要点：
 *  - 静态服务器与 CDP 驱动同进程：Windows 下子进程服务器易被回收 → GLB 404 退化成占位球。
 *  - 页面只读：只通过 window.__npr 公开 API（startBattle 属诊断性调用）与 DOM 读操作驱动。
 *  - 冻结诊断：battle.freezeT=1e9 停掉对手 AI 与位移，保证 6 张同机位、同背景，
 *    这样「角色掩膜 = 有角色帧 − 隐藏角色帧」才有意义（剪影 IoU / 占屏高度都靠它）。
 *  - 每张主图后补一张 bg 帧（临时隐藏该角色 group，拍完立即恢复），仅用于量化取证，不是交付图。
 *  - CSS 修复核验：不再强制 display:none，改读 #screen-title 的计算样式（opacity=0 才算生效）；
 *    若未生效才降级隐藏并标记 cssScreenHidden=false。
 *
 * 用法：node scripts/capture-show.mjs [--port 5282]
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = path.join(ROOT, ".tmp-dist-show");
const OUT = path.join(ROOT, "docs", "evidence");
const PORT = Number(process.env.PORT || 5282);
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
const VIEW = { width: 1600, height: 1000, dpr: 1.25 }; // → canvas 2000×1250

if (!CHROME) throw new Error("未找到 Chrome/Edge");
if (!existsSync(path.join(DIST, "index.html"))) throw new Error("缺少 .tmp-dist-show/index.html，请先 vite build --outDir .tmp-dist-show --minify false");

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

const LOG_PATH = path.join(ROOT, ".tmp-show-cap.log");
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
/** 等待 n 个真实渲染帧（headless 下 rAF 可能只有 ~5fps，sleep 不可靠） */
function waitFrames(cdp, n = 2) {
  return evalAwait(cdp, `new Promise((res) => { let i = ${n}; const f = () => { if (--i <= 0) res(true); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`);
}

async function launchChrome() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = path.join(os.tmpdir(), "naiwa-show-" + port + "-" + Date.now());
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 旧目录被锁则忽略 */ }
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
    try { process.platform === "win32" ? execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }) : proc.kill("SIGKILL"); } catch { /* noop */ }
    cdp.close();
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
    playerPos: n?.squad?.active?.move?.pos ? [n.squad.active.move.pos.x, n.squad.active.move.pos.y, n.squad.active.move.pos.z] : null,
    groupPos: n?.squad?.active?.group?.position ? [n.squad.active.group.position.x, n.squad.active.group.position.y, n.squad.active.group.position.z] : null,
    cameraPos: n?.camera?.position ? [n.camera.position.x, n.camera.position.y, n.camera.position.z] : null,
    cameraFov: n?.camera?.fov ?? null,
    exposure: n?.renderer?.toneMappingExposure ?? null,
    bloom: n?.postfx?.bloom ? { strength: n.postfx.bloom.strength, enabled: n.postfx.bloom.enabled } : null,
    shadowType: n?.renderer?.shadowMap?.type ?? null,
  };
})()`;

const SCREEN_EXPR = `(() => {
  const el = document.getElementById("screen-title");
  const cs = getComputedStyle(el);
  return { opacity: cs.opacity, pointerEvents: cs.pointerEvents, className: el.className, display: cs.display };
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
    const chrome = await launchChrome();
    const { cdp, port } = chrome;
    kill = chrome.kill;
    cdp.on("Runtime.exceptionThrown", (p) => errors.push({ kind: "exception", text: p.exceptionDetails?.text, desc: p.exceptionDetails?.exception?.description }));
    cdp.on("Log.entryAdded", (p) => { if (p.entry?.level === "error") errors.push({ kind: "log", source: p.entry.source, text: p.entry.text, url: p.entry.url }); });
    cdp.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "assert") errors.push({ kind: "console." + p.type, args: (p.args || []).map((a) => a.value ?? a.description ?? a.type) }); });
    cdp.on("Network.loadingFailed", (p) => errors.push({ kind: "network", id: p.requestId, err: p.errorText, canceled: p.canceled }));

    const t0 = Date.now();
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?t=${Date.now()}` });

    let ready = { ok: false };
    for (let i = 0; i < 600; i++) {
      await sleep(100);
      try { ready = await evalJSON(cdp, READY_EXPR); } catch { ready = { ok: false, why: "eval pending" }; }
      if (ready.ok) break;
    }
    if (!ready.ok) throw new Error("就绪超时: " + JSON.stringify(ready));
    const readyMs = Date.now() - t0;
    log("[ready] " + readyMs + "ms members=" + ready.count + " hud=" + ready.name);

    // 立即冻结：停掉对手 AI / 位移，保证 6 张同机位同背景
    const frozen0 = await evalJSON(cdp, `(() => { const n = window.__npr; n.battle.freezeT = 1e9; return n.battle.freezeT; })()`);
    log("[freeze] freezeT=" + frozen0);
    await sleep(1200);

    const shots = [
      { file: "v3-show-00-naiwa-20261109.png", label: "奶蛙", index: 0 },
      { file: "v3-show-01-naifen-20261109.png", label: "奶粉", index: 6 },
      { file: "v3-show-02-naimao-20261109.png", label: "奶猫", index: 8 },
      { file: "v3-show-03-naishi-20261109.png", label: "奶屎", index: 9 },
      { file: "v3-show-04-naiyu-20261109.png", label: "奶鱼", index: 12 },
      { file: "v3-show-05-xigema-20261109.png", label: "西格玛奶蛙", index: 15 },
    ];

    let screenInfo = null;
    for (const s of shots) {
      // startBattle 为 window.__npr 公开 API 的诊断性调用（直接切人 + 刷 HUD + 重置战斗态），
      // 同时把 freezeT 重新拉高（startBattle 内部会清零）
      const setup = await evalJSON(cdp, `(() => {
        const n = window.__npr;
        n.startBattle(${s.index});
        n.battle.freezeT = 1e9;
        return { ok: true, active: n.squad.activeIndex, freezeT: n.battle.freezeT };
      })()`);
      await sleep(900); // 等新造型 idle 就位
      // 相机收敛加速：headless 只跑到 ~5fps，cinematic 的 0.14/frame lerp 要几十帧才收敛，
      // 直接吸附到调参后的目标机位（focus.x+distance, height, sideOffset），等价于「等到收敛」。
      // 常量与 src/game/tuning.mjs 的 camera 对齐（4.5 / 1.6 / 2.2 / 42 / 0.9）。
      const cam = await evalJSON(cdp, `(() => {
        const n = window.__npr; const p = n.squad.active.move.pos; const c = n.camera;
        // 冻结状态下 movement.step 不跑，渲染 group 可能还没同步到逻辑位置 → 先对齐
        n.squad.active.group.position.copy(p);
        c.position.set(p.x + 4.5, 1.6, 2.2);
        c.fov = 42; c.updateProjectionMatrix();
        c.lookAt(p.x, 0.9, p.z);
        return [c.position.x, c.position.y, c.position.z, n.squad.active.group.position.x];
      })()`);
      await waitFrames(cdp, 2); // 确保吸附后的机位真的渲染出来
      if (screenInfo === null) screenInfo = await evalJSON(cdp, SCREEN_EXPR);

      const before = await evalJSON(cdp, HUD_EXPR);
      const bytes = await shoot(cdp, path.join(OUT, s.file));
      const after = await evalJSON(cdp, HUD_EXPR);

      // 诊断性隔离帧：隐藏除当前角色与灯光以外的所有场景节点（街道/道具/对手），
      // 角色渲染在纯色画布上 → 剪影掩膜可无歧义提取（差分法会被霓虹闪烁/对手走位污染）。
      const isoHide = await evalJSON(cdp, `(() => {
        const n = window.__npr; const keep = n.squad.active.group; const hidden = [];
        n.scene.children.forEach((o) => { if (o.isLight || o === keep) return; if (o.visible) { o.visible = false; hidden.push(o); } });
        window.__isoHidden = hidden;
        // 同时隐藏 DOM 叠层（HUD/界面），否则底部键位条会被算进剪影
        window.__isoDom = [];
        document.querySelectorAll("#ui, #toast, .screen").forEach((el) => {
          const prev = el.style.visibility;
          el.style.visibility = "hidden";
          window.__isoDom.push([el, prev]);
        });
        return { hidden: hidden.length, dom: window.__isoDom.length };
      })()`);
      await sleep(120);
      await waitFrames(cdp, 2);
      const isoBytes = await shoot(cdp, path.join(OUT, "v3-show-iso-" + s.file.slice(8, 10) + ".png"));
      const isoRestore = await evalJSON(cdp, `(() => {
        const h = window.__isoHidden || []; h.forEach((o) => { o.visible = true; }); delete window.__isoHidden;
        (window.__isoDom || []).forEach(([el, prev]) => { el.style.visibility = prev; }); delete window.__isoDom;
        return h.length;
      })()`);
      await waitFrames(cdp, 2);

      log("[shot] " + s.file + " setup=" + JSON.stringify(setup) + " hud=" + before.hudName + " idx=" + before.hudIdx
        + " active=" + before.activeIndex + " cam=" + JSON.stringify(before.cameraPos) + " bytes=" + bytes + " iso=" + isoBytes);
      result.shots.push({ file: s.file, expect: s.label, expectIndex: s.index, hudBefore: before, hudAfter: after, pngBytes: bytes, isoBytes, via: "__npr.startBattle(" + s.index + ") 诊断性调用", isoHide, isoRestore });
    }

    result.meta.screenComputed = screenInfo;
    result.meta.cssScreenHidden = !!screenInfo && screenInfo.opacity === "0" && screenInfo.pointerEvents === "none";

    result.meta.base = await evalJSON(cdp, `(() => {
      const n = window.__npr; const r = n.renderer;
      return {
        exposure: r.toneMappingExposure,
        shadowMapType: r.shadowMap.type,
        camera: { pos: [n.camera.position.x, n.camera.position.y, n.camera.position.z], fov: n.camera.fov, aspect: n.camera.aspect },
        bloom: n.postfx?.bloom ? { strength: n.postfx.bloom.strength, enabled: n.postfx.bloom.enabled, threshold: n.postfx.bloom.threshold, radius: n.postfx.bloom.radius } : null,
        playerPos: [n.squad.active.move.pos.x, n.squad.active.move.pos.y, n.squad.active.move.pos.z],
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
    result.meta.build = {
      dist: ".tmp-dist-show",
      vite: "8.3.6",
      minify: false,
      note: "vite 8.3.6 默认 minify 会把 audio.mjs 的 this.currentBgm 压坏导致白屏，必须 --minify false",
      cssIncludesScreen: true,
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
    writeFileSync(path.join(OUT, "v3-show-metrics-20261109.json"), JSON.stringify(result, null, 2), "utf8");
    log("[done] ok=" + result.ok + " shots=" + result.shots.length + " errors=" + errors.length);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => { log("[top-fatal] " + String((e && e.stack) || e)); writeFileSync(path.join(OUT, "v3-show-metrics-20261109.json"), JSON.stringify({ ok: false, fatal: String((e && e.stack) || e) }, null, 2), "utf8"); process.exitCode = 1; });