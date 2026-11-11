/**
 * 真实用户视角验证：直接打**线上地址**（不是本地 dist），用标准 Chrome（不受后台标签页
 * 节流影响），核对：模型预取是否触发、选人页卡片是否已有模型、战斗是否用真模型。
 *
 * 用法：node scripts/verify-deployed.mjs <线上URL> <输出前缀>
 */
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.env.NAIWA_ROOT || "E:/naiwa-zzz";
const OUT = path.join(ROOT, "docs", "evidence");
const URL = process.argv[2] || "https://zgqy379.github.io/naiwa-zzz-demo/";
const PREFIX = process.argv[3] || "v3-deployed-check";
const CHROME = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("未找到 Chrome");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(a.join(" "));

class CDP {
  constructor(wsUrl) {
    this.id = 0; this.pending = new Map();
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
  }
  ready() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}) {
    const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const port = 9800 + Math.floor(Math.random() * 150);
  const profile = path.join(os.tmpdir(), "naiwa-dep-" + port + "-" + Date.now());
  mkdirSync(profile, { recursive: true });
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1920,1080", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--enable-gpu", "--ignore-gpu-blocklist", "about:blank"], { stdio: "ignore", windowsHide: true });
  let info = null;
  for (let i = 0; i < 80; i++) { await sleep(250); try { info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { /* wait */ } }
  if (!info) throw new Error("Chrome 未暴露 CDP");
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => {
    const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: false });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const shoot = async (file) => {
    const r = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    writeFileSync(file, Buffer.from(r.data, "base64"));
    return statSync(file).size;
  };
  const probe = `(() => {
    const n = window.__npr;
    const mem = n?.squad?.members || [];
    const loaded = mem.filter((m) => {
      const w = m.group?.getObjectByName("model-wrapper");
      let v = 0; w?.traverse((c) => { if (c.isMesh) v += c.geometry?.attributes?.position?.count || 0; });
      return v >= 1000;
    }).length;
    const v = document.getElementById("title-video");
    return {
      modelsRequested: n?.modelsRequested?.(), loaded, total: mem.length,
      placeholders: mem.filter((m) => m.placeholder).length,
      video: v ? { rs: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(2) } : null,
      screen: n?.screens?.current ?? null,
    };
  })()`;

  try {
    await cdp.send("Page.navigate", { url: URL });
    await sleep(9000);
    const a = await ev(probe);
    log("[t=9s ] " + JSON.stringify(a));
    await sleep(7000);
    const b = await ev(probe);
    log("[t=16s] " + JSON.stringify(b));

    await ev(`document.querySelector('[data-action="start"]').click(); true`);
    await sleep(6000);
    const c = await ev(probe);
    log("[选人页] " + JSON.stringify(c));
    log("  select shot bytes=" + await shoot(path.join(OUT, `${PREFIX}-select.png`)));

    await ev(`document.querySelector('[data-action="confirm"]').click(); true`);
    await sleep(6000);
    const d = await ev(probe);
    log("[战斗页] " + JSON.stringify(d));
    log("  battle shot bytes=" + await shoot(path.join(OUT, `${PREFIX}-battle.png`)));

    writeFileSync(path.join(OUT, `${PREFIX}.json`), JSON.stringify({ url: URL, t9: a, t16: b, select: c, battle: d }, null, 2), "utf8");
  } finally {
    cdp.close();
    try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
    try { require("node:fs").rmSync(profile, { recursive: true, force: true }); } catch { /* noop */ }
  }
}
main().catch((e) => { console.error("ERR:", e); process.exit(1); });
