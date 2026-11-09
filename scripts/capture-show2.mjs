/**
 * 展示层二轮截图 + 运行时几何诊断（v3-show2）。
 *
 * 与第一轮 capture-show.mjs 的差异：
 *  - 隔离构建 .tmp-dist-show2、端口 5283、机位 3.8 / fov 40 / sideOffset 2.2（二轮拉近一档）
 *  - 除主图 / 剪影帧外，额外拍「同场景隐藏角色」的 bg 帧（v3-show2-bg-0X.png），
 *    供「差分掩膜 ∩ lum>55」口径的本体占屏高复算（剔除地面投影阴影）
 *  - 增加运行时几何探针：wrapper.scale、反推载入期 size.y、顶点级世界包围盒与 Y 分位、
 *    相机投影后的理论屏高像素 —— 用于定位奶鱼屏占比离群根因
 *
 * 静态服务器 + CDP 同进程（Windows 下后台子进程会被回收，vite preview 会因 stdin EOF 自退）。
 * 页面只读：仅通过 window.__npr 公开 API 与 DOM 读操作驱动。
 *
 * 用法：node scripts/capture-show2.mjs
 */
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DIST = path.join(ROOT, ".tmp-dist-show2");
const OUT = path.join(ROOT, "docs", "evidence");
const PORT = Number(process.env.PORT || 5283);
// 本机 127.0.0.1:5283 已被 MarvisSvr(PID 4100) 占用（netstat 看不到、pwsh Get-NetTCPConnection 可见），
// 且其返回 HTTPS 400；因此绑定 0.0.0.0 并通过网卡 IPv4 访问，端口仍严格为 5283。
const HOST = process.env.HOST_IP || Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address || "127.0.0.1";
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
const VIEW = { width: 1600, height: 1000, dpr: 1.25 }; // → canvas 2000×1250
const LOG_PATH = path.join(ROOT, ".tmp-show2-cap.log");

if (!CHROME) throw new Error("未找到 Chrome/Edge");
if (!existsSync(path.join(DIST, "index.html"))) throw new Error("缺少 .tmp-dist-show2/index.html，请先 vite build --outDir .tmp-dist-show2 --minify false");

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
    server.listen(PORT, "0.0.0.0", () => resolve(server));
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
  const profile = path.join(os.tmpdir(), "naiwa-show2-" + port + "-" + Date.now());
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

const HUD_EXPR = `(() => {
  const n = window.__npr;
  return {
    hudName: document.querySelector("#hud-shell-name")?.textContent?.trim() || "",
    hudIdx: document.querySelector("#hud-shell-idx")?.textContent?.trim() || "",
    activeIndex: n?.squad?.activeIndex ?? null,
    activeName: n?.squad?.active?.name ?? null,
    activeId: n?.squad?.active?.id ?? null,
    activeGlb: n?.squad?.active?.glb ?? null,
    visualScale: n?.squad?.active?.visualScale ?? null,
    scale: n?.squad?.active?.scale ?? null,
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
    shadowType: n?.renderer?.shadowMap?.type ?? null,
  };
})()`;

/**
 * 运行时几何探针（页面内执行）：
 *  - wrapper.scale / 反推载入期 size.y（= member.scale / wrapper.scale.x）
 *  - 顶点级世界坐标包围盒 + Y 分位（p0/p1/p5/p50/p95/p99/p100）→ 判断是否有离群顶点撑高 bbox
 *  - 几何局部 bbox（含 node 自身矩阵）
 *  - 相机投影后的理论屏高像素（世界 bbox 角点 → NDC → px）
 */
/** 暂停/恢复 rAF 主循环：冻结帧取证的前提。tick 通过全局 requestAnimationFrame 调度下一帧，
 *  包装后 paused=true 时把回调压入队列，resume 时用原生 rAF 重新抛出，链路不丢。 */
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

/** 相机 + 角色世界变换快照（判定画面尺寸差异来自相机还是角色） */
const STATE_EXPR = `(() => {
  const n = window.__npr; const m = n.squad.active; const c = n.camera;
  const w = m.group.getObjectByName("model-wrapper");
  return {
    camPos: [c.position.x, c.position.y, c.position.z],
    camQuat: [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w],
    fov: c.fov, aspect: c.aspect, near: c.near, far: c.far,
    view: Array.from(c.matrixWorldInverse.elements),
    proj: Array.from(c.projectionMatrix.elements),
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

const PROBE_EXPR = `(() => {
  const n = window.__npr;
  const m = n.squad.active;
  const g = m.group;
  const wrapper = g.getObjectByName("model-wrapper");
  const cam = n.camera;
  cam.updateMatrixWorld(true);
  g.updateMatrixWorld(true);
  const ge = g.matrixWorld.elements;           // 世界 = g.matrixWorld * wrapper.matrix * vert
  const vw = cam.matrixWorldInverse.elements;  // 世界 → 相机
  const pm = cam.projectionMatrix.elements;    // 相机 → NDC
  let syMin = Infinity, syMax = -Infinity;     // 逐顶点投影后的屏幕 Y 像素范围（比 8 角点更贴近真实剪影）
  const ys = [];
  // 只统计 index 实际引用到的顶点：position 数组里可能含未被绘制的孤立顶点（量化/合并遗留），
  // 它们会把 bbox 撑大但不参与渲染 —— 这正是「bbox 测量」与「实际屏占」脱节的可疑来源。
  const usedAll = { yMin: Infinity, yMax: -Infinity, syMin: Infinity, syMax: -Infinity };
  const world = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const local = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const meshes = [];
  wrapper.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    o.updateMatrixWorld(true);
    const mw = o.matrixWorld.elements;
    let gmin = [Infinity, Infinity, Infinity], gmax = [-Infinity, -Infinity, -Infinity];
    // 用 getX/getY/getZ 而不是原始 array：meshopt 压缩后是 InterleavedBufferAttribute，
    // KHR_mesh_quantization 的 normalized 整数也只有 getX/Y/Z 会自动反归一化。
    for (let i = 0, cnt = pos.count; i < cnt; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // 局部几何（node 自身变换前）
      if (x < gmin[0]) gmin[0] = x; if (y < gmin[1]) gmin[1] = y; if (z < gmin[2]) gmin[2] = z;
      if (x > gmax[0]) gmax[0] = x; if (y > gmax[1]) gmax[1] = y; if (z > gmax[2]) gmax[2] = z;
      const wx = mw[0]*x + mw[4]*y + mw[8]*z + mw[12];
      const wy = mw[1]*x + mw[5]*y + mw[9]*z + mw[13];
      const wz = mw[2]*x + mw[6]*y + mw[10]*z + mw[14];
      if (wx < world.min[0]) world.min[0] = wx; if (wy < world.min[1]) world.min[1] = wy; if (wz < world.min[2]) world.min[2] = wz;
      if (wx > world.max[0]) world.max[0] = wx; if (wy > world.max[1]) world.max[1] = wy; if (wz > world.max[2]) world.max[2] = wz;
      // 逐顶点投影（世界 → view → clip → NDC.y → 像素）
      const cvx = vw[0]*wx + vw[4]*wy + vw[8]*wz + vw[12];
      const cvy = vw[1]*wx + vw[5]*wy + vw[9]*wz + vw[13];
      const cvz = vw[2]*wx + vw[6]*wy + vw[10]*wz + vw[14];
      const cyy = pm[1]*cvx + pm[5]*cvy + pm[9]*cvz + pm[13];
      const cww = pm[3]*cvx + pm[7]*cvy + pm[11]*cvz + pm[15];
      const sy = (cyy / cww) * 0.5 * 1250 + 625;
      if (sy < syMin) syMin = sy;
      if (sy > syMax) syMax = sy;
      ys.push(wy);
    }
    // 索引引用顶点（实际绘制）的世界/屏幕范围
    const idx = o.geometry.index;
    const idxCount = idx ? idx.count : pos.count;
    for (let t = 0; t < idxCount; t++) {
      const i = idx ? idx.getX(t) : t;
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const wx = mw[0]*x + mw[4]*y + mw[8]*z + mw[12];
      const wy = mw[1]*x + mw[5]*y + mw[9]*z + mw[13];
      const wz = mw[2]*x + mw[6]*y + mw[10]*z + mw[14];
      if (wy < usedAll.yMin) usedAll.yMin = wy; if (wy > usedAll.yMax) usedAll.yMax = wy;
      const cvx = vw[0]*wx + vw[4]*wy + vw[8]*wz + vw[12];
      const cvy = vw[1]*wx + vw[5]*wy + vw[9]*wz + vw[13];
      const cvz = vw[2]*wx + vw[6]*wy + vw[10]*wz + vw[14];
      const cyy = pm[1]*cvx + pm[5]*cvy + pm[9]*cvz + pm[13];
      const cww = pm[3]*cvx + pm[7]*cvy + pm[11]*cvz + pm[15];
      const sy2 = (cyy / cww) * 0.5 * 1250 + 625;
      if (sy2 < usedAll.syMin) usedAll.syMin = sy2; if (sy2 > usedAll.syMax) usedAll.syMax = sy2;
    }
    meshes.push({
      name: o.name || "(mesh)", verts: pos.count, indexCount: idxCount,
      indexType: idx ? idx.array?.constructor?.name ?? null : null,
      geomBBox: { min: gmin.map((v) => +v.toFixed(3)), max: gmax.map((v) => +v.toFixed(3)) },
      castShadow: o.castShadow, visible: o.visible,
      materialType: o.material?.type ?? null,
    });
  });
  ys.sort((a, b) => a - b);
  const pct = (p) => ys.length ? +ys[Math.min(ys.length - 1, Math.max(0, Math.floor((ys.length - 1) * p)))].toFixed(4) : null;
  // 世界 bbox 角点投影 → 屏幕 Y 像素范围（NDC*0.5+0.5 → *1250）
  const proj = (p) => {
    // 世界 → 相机（view）→ NDC → 像素；cam.matrixWorldInverse 由 updateMatrixWorld(true) 维护
    const v = cam.matrixWorldInverse.elements;
    const wx = v[0]*p[0] + v[4]*p[1] + v[8]*p[2] + v[12];
    const wy = v[1]*p[0] + v[5]*p[1] + v[9]*p[2] + v[13];
    const wz = v[2]*p[0] + v[6]*p[1] + v[10]*p[2] + v[14];
    const e = cam.projectionMatrix.elements;
    const cy = e[1]*wx + e[5]*wy + e[9]*wz + e[13];
    const cw = e[3]*wx + e[7]*wy + e[11]*wz + e[15];
    return (cy / cw) * 0.5 * 1250 + 625;
  };
  const cornerY = [];
  if (world.min[0] !== Infinity) {
    for (const x of [world.min[0], world.max[0]])
      for (const y of [world.min[1], world.max[1]])
        for (const z of [world.min[2], world.max[2]]) cornerY.push(proj([x, y, z]));
  }
  const yTop = cornerY.length ? Math.min(...cornerY) : 0;
  const yBot = cornerY.length ? Math.max(...cornerY) : 0;
  const projHeightPx = Math.abs(yTop - yBot);
  return {
    id: m.id, name: m.name, glb: m.glb,
    profileScale: m.scale, visualScale: m.visualScale ?? null,
    wrapperScale: wrapper ? [wrapper.scale.x, wrapper.scale.y, wrapper.scale.z] : null,
    derivedLoadSizeY: wrapper ? +(m.scale / (wrapper.scale.x || 1)).toFixed(4) : null,
    wrapperPosY: wrapper ? +wrapper.position.y.toFixed(4) : null,
    worldBBox: { min: world.min.map((v) => +v.toFixed(4)), max: world.max.map((v) => +v.toFixed(4)),
      size: world.max.map((v, i) => +(v - world.min[i]).toFixed(4)) },
    worldHeight: +(world.max[1] - world.min[1]).toFixed(4),
    yPercentiles: { p0: pct(0), p1: pct(0.01), p5: pct(0.05), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), p100: pct(1) },
    yP99MinusP1: +(pct(0.99) - pct(0.01)).toFixed(4),
    projHeightPx: +projHeightPx.toFixed(1),
    projHeightPctOf1250: +(projHeightPx / 1250 * 100).toFixed(2),
    projVertHeightPx: +(syMax - syMin).toFixed(1),
    projVertPctOf1250: +((syMax - syMin) / 1250 * 100).toFixed(2),
    projVertYRange: [+syMin.toFixed(1), +syMax.toFixed(1)],
    usedWorldHeight: +(usedAll.yMax - usedAll.yMin).toFixed(4),
    usedWorldYRange: [+usedAll.yMin.toFixed(4), +usedAll.yMax.toFixed(4)],
    usedProjVertPctOf1250: +((usedAll.syMax - usedAll.syMin) / 1250 * 100).toFixed(2),
    usedProjVertYRange: [+usedAll.syMin.toFixed(1), +usedAll.syMax.toFixed(1)],
    vertCount: ys.length,
    meshes,
  };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const errors = [];
  const result = { shots: [], probes: [], errors, meta: {} };
  let server = null;
  let kill = null;
  try {
    log("[boot] static root=" + DIST + " url=http://" + HOST + ":" + PORT + "/ (127.0.0.1 被 MarvisSvr 占用，改走网卡 IP)");
    server = await startServer(DIST);
    const chrome = await launchChrome();
    const { cdp, port } = chrome;
    kill = chrome.kill;
    cdp.on("Runtime.exceptionThrown", (p) => errors.push({ kind: "exception", text: p.exceptionDetails?.text, desc: p.exceptionDetails?.exception?.description }));
    cdp.on("Log.entryAdded", (p) => { if (p.entry?.level === "error" && !/favicon\.ico/.test(p.entry.url || p.entry.text || "")) errors.push({ kind: "log", source: p.entry.source, text: p.entry.text, url: p.entry.url }); });
    cdp.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "assert") errors.push({ kind: "console." + p.type, args: (p.args || []).map((a) => a.value ?? a.description ?? a.type) }); });
    cdp.on("Network.loadingFailed", (p) => { if (!p.canceled) errors.push({ kind: "network", id: p.requestId, err: p.errorText }); });

    const t0 = Date.now();
    await cdp.send("Page.navigate", { url: `http://${HOST}:${PORT}/?t=${Date.now()}` });

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
      { tag: "00", file: "v3-show2-00-naiwa-20261109.png", label: "奶蛙", index: 0 },
      { tag: "01", file: "v3-show2-01-naifen-20261109.png", label: "奶粉", index: 6 },
      { tag: "02", file: "v3-show2-02-naimao-20261109.png", label: "奶猫", index: 8 },
      { tag: "03", file: "v3-show2-03-naishi-20261109.png", label: "奶屎", index: 9 },
      { tag: "04", file: "v3-show2-04-naiyu-20261109.png", label: "奶鱼", index: 12 },
      { tag: "05", file: "v3-show2-05-xigema-20261109.png", label: "西格玛奶蛙", index: 15 },
    ];

    for (const s of shots) {
      const setup = await evalJSON(cdp, `(() => {
        const n = window.__npr;
        n.startBattle(${s.index});
        n.battle.freezeT = 1e9;
        return { ok: true, active: n.squad.activeIndex, freezeT: n.battle.freezeT };
      })()`);
      await sleep(900);
      // 机位吸附到二轮调参目标：distance 3.8 / height 1.6 / sideOffset 2.2 / fov 40 / lookAt 0.9
      const cam = await evalJSON(cdp, `(() => {
        const n = window.__npr; const p = n.squad.active.move.pos; const c = n.camera;
        n.squad.active.group.position.copy(p);
        c.position.set(p.x + 3.8, 1.6, 2.2);
        c.fov = 40; c.updateProjectionMatrix();
        c.lookAt(p.x, 0.9, p.z);
        c.updateMatrixWorld(true);
        return [c.position.x, c.position.y, c.position.z, n.squad.active.group.position.x];
      })()`);
      await waitFrames(cdp, 2);

      const probe = await evalJSON(cdp, PROBE_EXPR);
      const stateAtMain = await evalJSON(cdp, STATE_EXPR);
      const before = await evalJSON(cdp, HUD_EXPR);
      const bytes = await shoot(cdp, path.join(OUT, s.file));
      const after = await evalJSON(cdp, HUD_EXPR);

      // ---------- 冻结帧取证 ----------
      // 环境（霓虹/bloom/氛围）在主循环里持续动画，普通差分会把整屏背景算进来。
      // 做法：暂停 rAF 主循环 → 手动 postfx.render 同一场景状态两次（仅切换角色可见性），
      // 这样 clean/bg、iso/iso-empty 的差异只可能来自角色本体与其地面投影阴影。
      const domHide = await evalJSON(cdp, DOM_HIDE_EXPR);
      await waitFrames(cdp, 2);
      // 取证帧临时关 bloom：UnrealBloomPass 是全屏加性光晕，角色消失会让整屏亮度偏移 5-10，
      // 差分被泛光污染成整屏 bbox（实测 66-78%）。关闭后差分只剩「角色本体 + 地面投影阴影」。
      await evalJSON(cdp, `(() => { window.__npr.postfx.setBloom(false); return true; })()`);
      await evalJSON(cdp, `(() => { window.__rafPause(); return true; })()`);
      await sleep(260);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(90);
      const cleanBytes = await shoot(cdp, path.join(OUT, "v3-show2-clean-" + s.tag + ".png"));

      // bg 帧：只隐藏当前角色 group（场景/对手/灯光保持），用于差分掩膜
      const bgHide = await evalJSON(cdp, BG_HIDE_EXPR);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(90);
      const bgBytes = await shoot(cdp, path.join(OUT, "v3-show2-bg-" + s.tag + ".png"));
      const bgRestore = await evalJSON(cdp, BG_RESTORE_EXPR);

      // 剪影帧：隐藏场景其它节点 + DOM，只留当前角色与灯光 → 纯底，掩膜无歧义（无地面阴影）
      const isoHide = await evalJSON(cdp, ISO_HIDE_EXPR);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(90);
      const stateBeforeIso = await evalJSON(cdp, STATE_EXPR);
      const isoBytes = await shoot(cdp, path.join(OUT, "v3-show2-iso-" + s.tag + ".png"));
      // 空场景帧：在隔离状态下再隐藏角色 → 纯背景（无阴影），差分得纯剪影
      const isoEmptyHide = await evalJSON(cdp, ISO_EMPTY_EXPR);
      await evalJSON(cdp, `(() => { window.__npr.postfx.render(0.016); return true; })()`);
      await sleep(90);
      const isoEmptyBytes = await shoot(cdp, path.join(OUT, "v3-show2-iso-empty-" + s.tag + ".png"));
      const isoRestore = await evalJSON(cdp, ISO_RESTORE_EXPR);
      await evalJSON(cdp, `(() => { window.__npr.postfx.setBloom(true, 0.16); window.__npr.postfx.render(0.016); return true; })()`);
      const stateAfterIso = await evalJSON(cdp, STATE_EXPR);
      await evalJSON(cdp, `(() => { window.__rafResume(); return true; })()`);
      await waitFrames(cdp, 2);

      log("[shot] " + s.file + " hud=" + before.hudName + " idx=" + before.hudIdx
        + " active=" + before.activeIndex + "/" + before.activeId + " vScale=" + before.visualScale
        + " cam=" + JSON.stringify(before.cameraPos) + " fov=" + before.cameraFov
        + " worldH=" + probe.worldHeight + " loadSizeY=" + probe.derivedLoadSizeY
        + " projPct=" + probe.projHeightPctOf1250 + " projVertPct=" + probe.projVertPctOf1250
        + " bytes=" + bytes + " clean=" + cleanBytes + " bg=" + bgBytes + " iso=" + isoBytes + " isoEmpty=" + isoEmptyBytes + " domHidden=" + domHide);
      result.shots.push({
        file: s.file, cleanFile: "v3-show2-clean-" + s.tag + ".png", bgFile: "v3-show2-bg-" + s.tag + ".png", isoFile: "v3-show2-iso-" + s.tag + ".png",
        isoEmptyFile: "v3-show2-iso-empty-" + s.tag + ".png",
        expect: s.label, expectIndex: s.index, hudBefore: before, hudAfter: after,
        pngBytes: bytes, cleanBytes, bgBytes, isoBytes, isoEmptyBytes, domHidden: domHide,
        camSnap: cam, bgHide, bgRestore, isoHide, isoEmptyHide, isoRestore,
        stateAtMain, stateBeforeIso, stateAfterIso,
        hudMatch: before.hudName === s.label && before.activeIndex === s.index && before.activeName === s.label,
      });
      result.probes.push(probe);
      // 增量落盘：本机偶发外部进程中断 node/chrome，保证已拍角色的数据不丢
      try {
        writeFileSync(path.join(ROOT, ".tmp-show2-progress.json"),
          JSON.stringify({ ok: null, shots: result.shots, probes: result.probes, errors }, null, 1), "utf8");
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
    result.meta.server = { port: PORT, bind: "0.0.0.0", hostUsed: HOST, note: "127.0.0.1:5283 被 MarvisSvr(PID 4100) 占用，绑定 0.0.0.0 并经网卡 IPv4 访问，端口仍为 5283" };
    result.meta.build = {
      dist: ".tmp-dist-show2",
      vite: "8.3.6",
      minify: false,
      camera: { distance: 3.8, fovVertical: 40, height: 1.6, sideOffset: 2.2, lookAtHeight: 0.9 },
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
    writeFileSync(path.join(OUT, "v3-show2-metrics.json"), JSON.stringify(result, null, 2), "utf8");
    log("[done] ok=" + result.ok + " shots=" + result.shots.length + " errors=" + errors.length
      + " hudMismatch=" + result.shots.filter((s) => !s.hudMatch).length);
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => {
  log("[top-fatal] " + String((e && e.stack) || e));
  writeFileSync(path.join(OUT, "v3-show2-metrics.json"), JSON.stringify({ ok: false, fatal: String((e && e.stack) || e) }, null, 2), "utf8");
  process.exitCode = 1;
});