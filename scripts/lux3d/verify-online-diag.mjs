// 线上加载失败诊断：抓 console 错误 + 失败的网络请求（资源 URL + 状态）。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const log = [];
const note = (s) => { log.push(s); console.log(s); };

async function main() {
  const task = await taskSpace("naiwa-online-verify");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  const errs = [];
  const failed = [];
  const okUrls = [];
  p.on?.("console", (m) => { if (m.type === "error") errs.push(String(m.text()).slice(0, 300)); });
  // 用 CDP 拿网络失败
  try { await p.cdp("Network.enable"); } catch { /* noop */ }
  const cdpMsgs = [];
  try {
    p.cdpWs?.addEventListener?.("message", (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.method === "Network.loadingFailed") cdpMsgs.push("FAILED " + (m.params?.errorText || ""));
        if (m.method === "Network.responseReceived" && m.params?.response?.status >= 400) {
          cdpMsgs.push("HTTP" + m.params.response.status + " " + (m.params.response.url || "").slice(-90));
        }
      } catch { /* 忽略 */ }
    });
  } catch { /* 忽略 */ }

  try { await p.goto("https://zgqy379-naiwa-zero-demo.ms.show/index.html", { waitUntil: "commit", timeout: 60000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 15000));

  // 用页面内的 fetch 逐个探测关键资源（能看出到底哪个 404）
  // 不阻塞：发起探测后轮询读结果（ego 的 page.evaluate 有 15s 上限）
  await p.evaluate(`(() => {
    window.__probeResults = [];
    const urls = [
      "./asset/naiwa_laugh_g1_runtime.glb",
      "./asset/naiwa_anim_lib.glb",
      "./asset/naiwa_anim_lib2.glb",
      "./asset/naiwa_spatula.glb",
      "./audio/whoosh.wav",
    ];
    for (const u of urls) {
      fetch(u).then(async (r) => {
        const b = await r.arrayBuffer();
        window.__probeResults.push(u + " => " + r.status + " " + b.byteLength + "B");
      }).catch((e) => window.__probeResults.push(u + " => ERR " + String(e).slice(0, 60)));
    }
    return true;
  })()`).catch(() => {});
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const st = await p.evaluate(`(() => {
      const n = window.__npr;
      const a = n?.squad?.active;
      return {
        done: (window.__probeResults || []).length,
        results: window.__probeResults || [],
        app: !!n,
        hasClips: !!a?.anim?.hasClips,
        clipCount: a?.anim?.clips?.byName?.size ?? 0,
        memberGlb: a?.glb ?? null,
        memberScene: !!a?.scene,
        modelsRequested: n?.modelsRequested?.() ?? null,
        live3dReady: !!n?.screens?.live3d,
      };
    })()`).catch((e) => ({ err: String(e).slice(0, 90) }));
    if (st && st.done >= 5) { note("=== 状态 ==="); note("  " + JSON.stringify(st)); break; }
    if (i === 11) { note("=== 状态（未收齐）==="); note("  " + JSON.stringify(st)); }
  }
  const probe = await p.evaluate(`window.__probeResults || []`).catch(() => []);
  note("=== 资源探测 ===");
  (probe || []).forEach((x) => note("  " + x));
  note("=== console 错误 ===");
  errs.slice(0, 10).forEach((e) => note("  " + e));
  note("=== 网络失败 ===");
  cdpMsgs.slice(0, 12).forEach((e) => note("  " + e));

  await p.screenshot({ path: SHOTS + "/online-v7-diag.png" });
  await fs.writeFile(SHOTS + "/online-v7-diag.json", JSON.stringify({ probe, errs, cdpMsgs, log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
