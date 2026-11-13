/**
 * 战斗手感量化测量（回答「为什么不像动作游戏」）。
 *
 * 逐帧记录：
 *   输入→动作延迟、命中顿帧(hitstop)、镜头位移/震动、对手动作与前摇、
 *   命中时的伤害/异常状态、受击硬直、闪避无敌帧、每回合时长
 * 输出 JSON + 结论行。
 */
import { spawn, execSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "docs", "evidence", "feel");
mkdirSync(OUT, { recursive: true });

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".mp4": "video/mp4", ".wav": "audio/wav", ".woff2": "font/woff2", ".txt": "text/plain" };
const server = createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end("nf"); return; }
  const st = statSync(f);
  const type = MIME[path.extname(f)] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    res.end(readFileSync(f).subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

class CDP {
  constructor(ws) {
    this.id = 0; this.pending = new Map();
    this.ws = new WebSocket(ws);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) { const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    };
  }
  ready() { return new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { resolve: res, reject: rej })); }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

const cport = 9875 + Math.floor(Math.random() * 10);
const profile = path.join(os.tmpdir(), "naiwa-feel-" + cport + "-" + Date.now());
mkdirSync(profile, { recursive: true });
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, "--window-size=1400,900", "--no-first-run", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "--enable-gpu", "about:blank"], { stdio: "ignore", windowsHide: true });
for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 250)); try { await (await fetch(`http://127.0.0.1:${cport}/json/version`)).json(); break; } catch { /* wait */ } }
const list = await (await fetch(`http://127.0.0.1:${cport}/json/list`)).json();
const cdp = new CDP(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await cdp.ready();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
const ev = async (x) => (await cdp.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: false })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 逐帧采样器（页面内跑，避免 CDP 往返抖动）
const START = `(() => {
  const n = window.__npr;
  window.__feel = [];
  const cam = n.camera;
  let prevOppHp = n.opponent.hp;
  let prevPlayerAction = n.squad.active.anim.action;
  window.__feelStop = false;
  const tick = () => {
    if (window.__feelStop) return;
    const a = n.squad.active;
    const camPos = n.camera.position;
    window.__feel.push({
      t: +performance.now().toFixed(1),
      pAction: a.anim.action,
      pStage: a.anim.combo?.stageIndex ?? null,
      comboIn: !!a.anim.combo?.bufferAttack,
      oppHp: n.opponent.hp,
      pHp: n.squad.active.hp,
      oppState: n.battle.oppState ?? null,
      oppWindup: +(n.battle.oppAttackWindup ?? 0).toFixed(3),
      oppAction: n.opponentAnim?.action ?? null,
      freeze: +n.battle.freezeT.toFixed(3),
      invuln: +n.battle.invulnT.toFixed(3),
      decibel: Math.round(n.battle.decibel || 0),
      camX: +camPos.x.toFixed(3), camY: +camPos.y.toFixed(3), camZ: +camPos.z.toFixed(3),
      shake: +(n.cameraShake ?? n.battle.shakeT ?? 0).toFixed(3),
      counterState: n.counter?.state ?? null,
      stagger: Math.round(n.stagger?.value ?? 0),
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`;

const KEY = (code, key, codeV) => `window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${code}', codeV: ${codeV}, bubbles: true })); true`;

try {
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 60; i++) { await sleep(500); if (await ev("!!window.__npr")) break; }
  await sleep(2500);
  await ev(`document.querySelector('[data-action="start"]')?.click(); true`);
  await sleep(6000);
  await ev(`document.querySelector('[data-action="confirm"]')?.click(); true`);
  await sleep(6000);

  const before = await ev(`(() => { const n = window.__npr; return { phase: n.battle.phase, oppHp: n.opponent.hp, hasCounter: !!n.counter, keys: Object.keys(n).filter(k=>/shake|hitstop|freeze|counter/i.test(k)) }; })()`);
  console.log("初始: " + JSON.stringify(before));

  await ev(START);
  // 观察 3 秒静置
  await sleep(3000);
  // 连打 4 次（每次 0.35s 间隔）
  for (let i = 0; i < 4; i++) {
    await ev(KEY("Space", " ", 32));
    await sleep(60);
    await ev(`window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true })); true`);
    await sleep(340);
  }
  // 等对手反击
  await sleep(4000);
  await ev(`window.__feelStop = true; true`);

  const frames = await ev("window.__feel");
  const out = path.join(OUT, "feel-frames.json");
  writeFileSync(out, JSON.stringify(frames, null, 1), "utf8");

  // ---- 分析 ----
  const F = frames;
  const dur = (F.length > 1) ? (F[F.length - 1].t - F[0].t) : 0;
  const fps = F.length > 1 ? (F.length / (dur / 1000)) : 0;
  // 命中帧（oppHp 下降）
  const hits = [];
  for (let i = 1; i < F.length; i++) if (F[i].oppHp < F[i - 1].oppHp) hits.push(i);
  // 输入→动作：动作从 idle 变为 attack1 的延迟
  let inputFrame = -1, actFrame = -1;
  for (let i = 0; i < F.length; i++) {
    if (inputFrame < 0 && F[i].pAction === "attack1" && F[i - 1].pAction !== "attack1") { actFrame = i; break; }
  }
  // 命中后顿帧（freeze>0 的持续帧数）
  let hitstopFrames = 0, maxFreeze = 0;
  for (const f of F) { if (f.freeze > 0) hitstopFrames++; maxFreeze = Math.max(maxFreeze, f.freeze); }
  // 镜头位移（命中前后 0.3s 内）
  let camMove = 0;
  for (const i of hits) {
    for (let j = Math.max(0, i - 18); j <= Math.min(F.length - 1, i + 18); j++) {
      const d = Math.hypot(F[j].camX - F[i].camX, F[j].camY - F[i].camY, F[j].camZ - F[i].camZ);
      camMove = Math.max(camMove, d);
    }
  }
  // 对手动作分布
  const oppActs = {};
  for (const f of F) if (f.oppAction) oppActs[f.oppAction] = (oppActs[f.oppAction] || 0) + 1;
  // 对手前摇：对手动作从无到 attack 的持续帧数
  const oppSeq = [];
  let last = null;
  for (const f of F) { if (f.oppAction !== last) { oppSeq.push({ act: f.oppAction, at: f.t }); last = f.oppAction; } }

  const summary = {
    totalFrames: F.length, durationMs: Math.round(dur), fps: Math.round(fps),
    hits: hits.length,
    hitFrames: hits.map((i) => ({ t: F[i].t, hpBefore: F[i - 1].oppHp, hpAfter: F[i].oppHp, dmg: F[i - 1].oppHp - F[i].oppHp })),
    hitstopFrames, maxFreeze,
    camMoveMax: +camMove.toFixed(3),
    oppActionCounts: oppActs,
    oppActionSequence: oppSeq,
    playerActions: F.reduce((m, f) => { m[f.pAction] = (m[f.pAction] || 0) + 1; return m; }, {}),
    counterStates: F.reduce((m, f) => { m[f.counterState || "none"] = (m[f.counterState || "none"] || 0) + 1; return m; }, {}),
  };
  writeFileSync(path.join(OUT, "feel-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 1));
} finally {
  cdp.close();
  try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore" }); } catch { /* noop */ }
  server.close();
}
