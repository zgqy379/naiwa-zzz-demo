/**
 * 单角色验证：按「奶蛙真实 IP 形体」生成一只并自动绑骨，渲染预览。
 * 目的：在花 16 只的积分与时间之前，先确认官方工具能出「守 IP + 可绑骨」的奶蛙。
 *
 * 用法：node scripts/lux3d/test-naiwa-ip.mjs [--name probe-ip] [--keep]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createTask, call, waitTask, outputUrls, download } from "./client.mjs";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work", "ip-probe");
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const NAME = arg("name", "ip-probe");

const BASE = "a chubby egg-shaped yellow frog-mascot character with a cream-yellow matte surface, the head merging directly into the torso with NO neck, a big cream-white oval belly patch on the lower front of the body, two bulging round eyes set wide apart on the upper body with pale green eye whites and small black pupils with a white highlight dot, one thin straight small mouth line, two short stubby arms with dark olive-brown mitten hands, two short stubby legs with dark olive-brown wide flat feet";
const POSE = "standing upright on two legs, full body T-pose, both short arms stretched straight out horizontally to the sides in a perfect T shape, palms facing down, short legs slightly apart, flat feet on the ground";
const TAIL = "wearing black round sunglasses over the bulging eyes, three-quarter front view, clean solid light grey background, stylized cartoon 3D render, high quality PBR material, full body visible, no props in hands";
const PROMPT = `${BASE}, ${POSE}, ${TAIL}`;

console.log("提示词:\n  " + PROMPT + "\n");

mkdirSync(WORK, { recursive: true });

// ① 文生 3D
console.log("[1] 文生 3D …");
let taskid = await createTask("/lux3d/v1/generate/text-to-3d/task/create", {
  prompt: PROMPT, style: "cartoon", version: "G1", faceCount: 30000,
  outputFormat: ["glb"], enablePbr: true,
});
console.log("    taskid = " + taskid);
let d = await waitTask(taskid, { intervalMs: 6000, onTick: (x) => { if (x.status) console.log("    status = " + x.status); } });
if (d.status !== 3) throw new Error("文生3D 失败: " + JSON.stringify(d.outputs).slice(0, 300));
const urls = outputUrls(d);
const glb = urls.find((u) => /\.glb($|\?)/i.test(u));
const zip = urls.find((u) => /\.zip($|\?)/i.test(u));
console.log("    产出: " + (glb || zip));
const baseDir = path.join(WORK, "base");
mkdirSync(baseDir, { recursive: true });
let baseGlb;
if (glb) {
  baseGlb = path.join(baseDir, "textured.glb");
  await download(glb, baseGlb);
} else {
  const { execFileSync } = await import("node:child_process");
  const z = path.join(baseDir, "r.zip");
  await download(zip, z);
  execFileSync("tar", ["-xf", z, "-C", baseDir], { stdio: "ignore" });
  const { readdirSync } = await import("node:fs");
  baseGlb = path.join(baseDir, readdirSync(baseDir).find((f) => f.endsWith(".glb")));
}
console.log("    本地: " + baseGlb);

// ② 自动绑骨
console.log("[2] 自动绑骨 …");
const rigTask = await createTask("/lux3d/v1/animations/rig/task/create", { modelUrl: glb || zip });
console.log("    taskid = " + rigTask);
const rd = await waitTask(rigTask, { intervalMs: 6000, onTick: (x) => { if (x.status) console.log("    status = " + x.status); } });
if (rd.status !== 3) throw new Error("绑骨失败: " + JSON.stringify(rd.outputs).slice(0, 400));
const rigUrl = outputUrls(rd).find((u) => /\.glb($|\?)/i.test(u));
const rigGlb = path.join(WORK, "rigged.glb");
await download(rigUrl, rigGlb);
console.log("    本地: " + rigGlb);

// ③ 存状态，供后续脚本复用
writeFileSync(path.join(WORK, "probe.json"), JSON.stringify({
  name: NAME, baseGlb, rigGlb, rigUrl, prompt: PROMPT, baseUrl: glb || zip,
}, null, 2), "utf8");
console.log("done → " + path.join(WORK, "probe.json"));
