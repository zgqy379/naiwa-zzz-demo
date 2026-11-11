/**
 * 界面流程实拍（13 张）—— 产出 docs/test-shots/01-13 的**当前构建**版本。
 *
 * 为什么不用 tests/harness.mjs 的截图：E2E 跑在 ego 宿主里，`page.cdp("Page.captureScreenshot")`
 *   在该宿主下会返回**空 data**，harness 静默跳过（`res?.data` 为空即 return null），
 *   于是 docs/test-shots/ 停留在旧构建的图上（2026-11-11 14:32 那轮）——报告书引用的
 *   §10.4 界面流程图会变成过期证据。本脚本走自建 CDP 通道（已验证可靠）。
 *
 * 通道：自建静态服务（只读服务 dist/）+ 自启 headless Chrome + 原生 CDP over WebSocket
 */
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.env.NAIWA_ROOT || "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const SHOTS = path.join(ROOT, "docs", "test-shots");
const OUT_JSON = path.join(ROOT, "docs", "evidence", "v3-test-shots-20261111.json");
const PORTS = [5298, 5299];
const HOST = "127.0.0.1";
const VIEW = { width: 1920, height: 1080, dpr: 1 };
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("未找到 Chrome/Edge");

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
        if (err && err.code === "EADDRINUSE" && i + 1 < PORTS.length) { server.removeListener("error", onError); tryListen(i + 1); } else reject(err);
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
const log = (...a) => console.log(a.join(" "));

async function launchChrome() {
  const port = 9800 + Math.floor(Math.random() * 150);
  const profile = path.join(os.tmpdir(), "naiwa-shots-" + port + "-" + Date.now());
  mkdirSync(profile, { recursive: true });
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${VIEW.width},${VIEW.height}`, "--no-first-run", "--disable-extensions", "--disable-sync", "--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--enable-gpu", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore", windowsHide: true });
  let info = null;
  for (let i = 0; i < 80; i++) { await sleep(250); try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { /* wait */ } }
  if (!info) throw new Error("Chrome 未暴露 CDP");
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.dpr, mobile: false });
  return { cdp, kill: () => { try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ } cdp.close(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ } } };
}
async function ev(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: false });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result.value;
}
async function shoot(cdp, file) {
  const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(file, Buffer.from(r.data, "base64"));
  return statSync(file).size;
}
async function key(cdp, k, code, holdMs = 80) {
  await ev(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)}, code: ${JSON.stringify(code)}, bubbles: true }))`);
  await sleep(holdMs);
  await ev(cdp, `window.dispatchEvent(new KeyboardEvent("keyup", { key: ${JSON.stringify(k)}, code: ${JSON.stringify(code)}, bubbles: true }))`);
}
async function waitFor(cdp, expr, timeoutMs = 20000, label = "") {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await ev(cdp, expr); } catch { /* noop */ }
    if (v) return Date.now() - t0;
    if (Date.now() - t0 > timeoutMs) throw new Error("等待超时: " + label);
    await sleep(120);
  }
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const srv = await startServer(DIST);
  const chrome = await launchChrome();
  const cdp = chrome.cdp;
  const shots = [];
  const take = async (name, label) => {
    const file = path.join(SHOTS, `${name}.png`);
    const bytes = await shoot(cdp, file);
    shots.push({ file: `docs/test-shots/${name}.png`, label, bytes });
    log(`  [shot] ${name}.png  ${label}  ${(bytes / 1024).toFixed(0)} KB`);
  };
  try {
    await cdp.send("Page.navigate", { url: `http://${HOST}:${srv.port}/` });
    await waitFor(cdp, "document.readyState === 'complete' && !!document.querySelector('[data-action=\"start\"]') && !!(window.__npr && window.__npr.battle)", 45000, "首页就绪");
    await sleep(7000);

    // 01 主界面
    await ev(cdp, `(() => { const v = document.querySelector('#title-video'); if (v && v.paused) v.play().catch(()=>{}); return true; })()`);
    await sleep(1200);
    await take("01-title", "主界面（视频背景 + 液态玻璃三按钮）");

    // 02 选人界面
    await ev(cdp, `document.querySelector('[data-action="start"]').click()`);
    await waitFor(cdp, "!document.querySelector('#screen-select').classList.contains('hidden')", 15000, "选人页");
    await sleep(7000);
    await take("02-select", "选人界面（16 名成员 + 实时 3D 卡片）");

    // 03 切换到奶狗（index 5）
    await ev(cdp, `document.querySelectorAll('#select-list .char-card')[5].click()`);
    await sleep(2500);
    await take("03-select-switch", "切换到「奶狗」后的选中态与属性面板");

    // 04 战斗界面（选西格玛，战斗开始）
    await ev(cdp, `document.querySelector('[data-action="confirm"]').click()`);
    await waitFor(cdp, "window.__npr.battle && window.__npr.battle.phase === 'playing'", 20000, "战斗");
    await sleep(5000);
    await take("04-battle", "战斗界面（奶狗 · 回合 1/3）");

    // 05 结算界面（三连战打完 3 个）
    for (let i = 0; i < 3; i++) { await ev(cdp, `window.__npr.opponent.hp = 0`); await sleep(1200); }
    await waitFor(cdp, "!document.querySelector('#screen-result').classList.contains('hidden')", 15000, "结算");
    await sleep(2200);
    await take("05-result", "结算界面（评级 + 三连战逐回合战果）");

    // 06 返回主界面
    await ev(cdp, `document.querySelector('#screen-result [data-action="back-title"]').click()`);
    await waitFor(cdp, "!document.querySelector('#screen-title').classList.contains('hidden')", 15000, "返回主界面");
    await sleep(2200);
    await take("06-back-title", "返回主界面");

    // 重新进战斗，采集战斗中的 5 张
    await ev(cdp, `document.querySelector('[data-action="start"]').click()`);
    await sleep(1200);
    await ev(cdp, `document.querySelector('[data-action="confirm"]').click()`);
    await waitFor(cdp, "window.__npr.battle && window.__npr.battle.phase === 'playing'", 20000, "战斗2");
    await sleep(4000);

    // 07 换人（Tab 接力）
    await key(cdp, "Tab", "Tab", 90);
    await sleep(2200);
    await take("07-swap", "Tab 接力换人后（连携演出）");

    // 08 移动（按 W）
    await ev(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", code: "KeyW", bubbles: true }))`);
    await sleep(700);
    await take("08-move", "按 W 前压移动中");
    await ev(cdp, `window.dispatchEvent(new KeyboardEvent("keyup", { key: "w", code: "KeyW", bubbles: true }))`);

    // 09 攻击（起手）
    await key(cdp, " ", "Space", 90);
    await sleep(180);
    await take("09-attack", "空格攻击起手（第一段）");

    // 10 攻击命中
    await key(cdp, " ", "Space", 90);
    await sleep(320);
    await take("10-attack", "连段第二段命中");

    // 11 连段（第三段 + 冲击特效）
    await key(cdp, " ", "Space", 90);
    await sleep(420);
    await take("11-combo", "三段连段冲击瞬间");

    // 12 NPR/PBR 切换
    await key(cdp, "n", "KeyN", 90);
    await sleep(900);
    await take("12-mode-switch", "N 键切换渲染风格（PBR）");
    await key(cdp, "n", "KeyN", 90);
    await sleep(700);

    // 13 按 A 移动（方向语义）
    await ev(cdp, `window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true }))`);
    await sleep(700);
    await take("13-move-a", "按 A 向相机左方移动");
    await ev(cdp, `window.dispatchEvent(new KeyboardEvent("keyup", { key: "a", code: "KeyA", bubbles: true }))`);
  } finally {
    chrome.kill();
    srv.server.close();
  }
  writeFileSync(OUT_JSON, JSON.stringify({ shotAt: new Date().toISOString(), build: readFileSync(path.join(DIST, "index.html"), "utf8").match(/assets\/index-[A-Za-z0-9_-]+\.js/)[0], shots }, null, 2), "utf8");
  log("已写 " + OUT_JSON + "  共 " + shots.length + " 张");
}
main().catch((e) => { console.error("ERR:", e); process.exit(1); });
