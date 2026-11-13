/**
 * 奶蛙 IP 形体修正版 · 单只试生成（同时验证官方积分能否继续用）。
 * 用法：node scripts/lux3d/test-ip-shape-v2.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createTask, waitTask, outputUrls, download } from "./client.mjs";
import { buildPrompt } from "./ip-shape.mjs";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work", "ip-v2");

const PROMPT = buildPrompt({
  bodyColor: "warm creamy yellow",
  accessories: "wearing small round black sunglasses over the small eyes and a thin gold chain necklace across the top of the cream belly",
});

console.log("提示词:\n  " + PROMPT + "\n");
mkdirSync(WORK, { recursive: true });

console.log("[1] 文生 3D（13 积分）…");
let taskid;
try {
  taskid = await createTask("/lux3d/v1/generate/text-to-3d/task/create", {
    prompt: PROMPT, style: "cartoon", version: "G1", faceCount: 30000,
    outputFormat: ["glb"], enablePbr: true,
  });
} catch (e) {
  console.log("✗ 失败: " + String(e && e.message ? e.message : e).slice(0, 300));
  console.log("  → 官方积分不可用（余额耗尽或额度未到账）");
  process.exit(2);
}
console.log("    taskid = " + taskid);
const d = await waitTask(taskid, { intervalMs: 6000, onTick: (x) => { if (x.status) console.log("    status = " + x.status); } });
if (d.status !== 3) { console.log("✗ 生成失败: " + JSON.stringify(d.outputs).slice(0, 300)); process.exit(1); }

const url = outputUrls(d).find((u) => /\.glb($|\?)/i.test(u));
console.log("    产出: " + url);
const glb = path.join(WORK, "textured.glb");
await download(url, glb);
console.log("    本地: " + glb);

console.log("[2] 自动绑骨（15 积分）…");
const rigTask = await createTask("/lux3d/v1/animations/rig/task/create", { modelUrl: url });
const rd = await waitTask(rigTask, { intervalMs: 6000, onTick: (x) => { if (x.status) console.log("    status = " + x.status); } });
if (rd.status !== 3) { console.log("✗ 绑骨失败: " + JSON.stringify(rd.outputs).slice(0, 400)); process.exit(1); }
const rigUrl = outputUrls(rd).find((u) => /\.glb($|\?)/i.test(u));
const rigGlb = path.join(WORK, "rigged.glb");
await download(rigUrl, rigGlb);
console.log("    本地: " + rigGlb);

writeFileSync(path.join(WORK, "probe.json"), JSON.stringify({ prompt: PROMPT, baseGlb: glb, baseUrl: url, rigGlb, rigUrl }, null, 2), "utf8");
console.log("done → " + path.join(WORK, "probe.json"));
