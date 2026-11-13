/**
 * 共享动画库：官方绑骨对任何角色都产出**同一套关节名/顺序/层级**（Mixamo 52 关节），
 * 所以动画片段只需做**一份**（任意一只绑好的角色即可驱动全部 16 只）。
 *
 * 2026-11-13：批量流程改为「只生成+绑骨」（16×35 积分），动画集中在这里做一次
 * （10 片段 × 6 积分 = 60），比「每只都做 10 段」省 900 积分。
 *
 * 用法：node scripts/lux3d/make-shared-anim.mjs [--src shell_naiwa]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createTask, waitTask, outputUrls, download } from "./client.mjs";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work");
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));
const SRC = arg("src", roster.characters[0].id);
const ACTS = roster._actions.split(",").map((s) => s.trim()).filter(Boolean);

// 找一只已绑骨的角色作为动画源
function findRig() {
  // 优先用指定角色的 rig 状态
  const statesDir = path.join(WORK, "states");
  const candidates = [SRC, ...roster.characters.map((c) => c.id)];
  for (const id of candidates) {
    const f = path.join(statesDir, (id + ":rig").replace(/[:\\/]/g, "_") + ".json");
    if (existsSync(f)) {
      const j = JSON.parse(readFileSync(f, "utf8"));
      if (j.url) return { id, url: j.url, glb: j.glb };
    }
  }
  // 退回全局 state.json
  const gf = path.join(WORK, "state.json");
  if (existsSync(gf)) {
    const g = JSON.parse(readFileSync(gf, "utf8"));
    for (const c of roster.characters) {
      const j = g[c.id + ":rig"];
      if (j?.url) return { id: c.id, url: j.url, glb: j.glb };
    }
  }
  return null;
}

const rig = findRig();
if (!rig) { console.error("✗ 找不到已绑骨的角色（先跑 batch.mjs）"); process.exit(1); }
console.log(`动画源 = ${rig.id}  rig=${rig.url}`);

// 已做过就跳过
const doneF = path.join(WORK, "states", "shared-anim.json");
if (existsSync(doneF)) {
  const j = JSON.parse(readFileSync(doneF, "utf8"));
  if (j.glb && existsSync(j.glb)) { console.log("已存在，跳过: " + j.glb); process.exit(0); }
}

console.log(`动作 ${ACTS.length} 段：${ACTS.join(", ")}`);
const taskid = await createTask("/lux3d/v1/animations/retarget/task/create", {
  rigModelUrl: rig.url,
  animationIds: ACTS,
  animationOutputMode: "combined",
  outFormat: "glb",
  animateInPlace: true,
});
console.log("taskid = " + taskid);
const d = await waitTask(taskid, { intervalMs: 6000, onTick: (x) => { if (x.status) console.log("  status = " + x.status); } });
if (d.status !== 3) { console.error("✗ 失败: " + JSON.stringify(d.outputs).slice(0, 400)); process.exit(1); }

const url = outputUrls(d).find((u) => /\.glb($|\?)/i.test(u));
if (!url) { console.error("✗ 无 GLB 产出: " + JSON.stringify(d.outputs).slice(0, 400)); process.exit(1); }

// 落到 shell_<src>/anim.glb，build-animlib.mjs 会读它
const destDir = path.join(WORK, rig.id);
mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, "anim.glb");
await download(url, dest);
console.log("✓ 动画落盘: " + dest);

mkdirSync(path.join(WORK, "states"), { recursive: true });
writeFileSync(doneF, JSON.stringify({ taskid, glb: dest, url, actions: ACTS, source: rig.id }, null, 2), "utf8");
console.log("done");
