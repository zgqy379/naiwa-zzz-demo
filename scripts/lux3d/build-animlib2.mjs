/**
 * 第二个共享动画库（出场 / 收势 / 过渡 / 盾击 / 拳法 / 法术）。
 *
 * 官方动画库 85 个片段，单次 retarget 最多 10 个 → 分两个库：
 *   库 A（战斗）：Idle/Walk/Jog/Sword A,B,C/Combo/Hit/Roll/Death
 *   库 B（演出）：Sword_Heavy_Combo/剑击收势 A,B/勾拳收势/躺卧起身/坐下/起身/
 *                 盾击/刺拳/法术发射
 * 两个库都由「同一套 Mixamo 骨架」驱动 16 只角色（骨架跨角色一致），
 * 游戏侧把两库的片段数组拼起来即可（不必在 glTF 层面合并，省一层合并风险）。
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createTask, download, outputUrls, waitTask } from "./client.mjs";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work");
const LIB2 = path.join(ROOT, "public", "asset", "naiwa_anim_lib2.glb");

const LIB2_ACTIONS = [
  "Sword_Heavy_Combo",   // 重剑连招（大招）
  "Sword_Regular_A_Rec", // 剑击收势 A（转场/收招）
  "Sword_Regular_B_Rec", // 剑击收势 B
  "Melee_Hook_Rec",      // 勾拳收势
  "LayToIdle",           // 躺卧起身（登场/倒地起身）
  "Sitting_Enter",       // 坐下（过渡）
  "Sitting_Exit",        // 起身（过渡）
  "Shield_OneShot",      // 盾击
  "Punch_Jab",           // 刺拳
  "Spell_Simple_Shoot",  // 法术发射
];

// 找一只已绑骨的角色作为源（骨架一致，任取其一）
// 状态可能来自旧的全局 state.json（早期批量）或新的每角色文件 states/<id>:rig.json
const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));
const globalState = existsSync(path.join(WORK, "state.json"))
  ? JSON.parse(readFileSync(path.join(WORK, "state.json"), "utf8")) : {};
let rigUrl = null, rigOwner = null;
for (const c of roster.characters) {
  const f = path.join(WORK, "states", c.id.replace(/[:\\/]/g, "_") + "_rig.json");
  let j = null;
  if (existsSync(f)) { try { j = JSON.parse(readFileSync(f, "utf8")); } catch { /* ignore */ } }
  if (!j) j = globalState[c.id + ":rig"];
  if (j?.url) { rigUrl = j.url; rigOwner = c.id; break; }
}
if (!rigUrl) {
  console.error("找不到已绑骨的角色（先跑 batch）");
  process.exit(1);
}
console.log(`用 ${rigOwner} 的已绑骨模型做库 B 源`);

// 已有则跳过
const stateF = path.join(WORK, "states", "animlib2.json");
if (existsSync(stateF)) {
  const st = JSON.parse(readFileSync(stateF, "utf8"));
  if (st.glb && existsSync(st.glb)) { console.log("库 B 已存在，跳过"); process.exit(0); }
}

console.log("库 B 动画重定向：" + LIB2_ACTIONS.join(", "));
const taskid = await createTask("/lux3d/v1/animations/retarget/task/create", {
  rigModelUrl: rigUrl,
  animationIds: LIB2_ACTIONS,
  animationOutputMode: "combined",
  outFormat: "glb",
  animateInPlace: true,
});
console.log("taskid=" + taskid);
const d = await waitTask(taskid, { intervalMs: 6000, onTick: () => {} });
if (d.status !== 3) { console.error("失败：" + JSON.stringify(d.outputs).slice(0, 300)); process.exit(1); }
const glb = outputUrls(d).find((u) => /\.glb($|\?)/i.test(u));
if (!glb) { console.error("无 GLB 产出"); process.exit(1); }
const src = path.join(WORK, "animlib2_raw.glb");
mkdirSync(path.dirname(src), { recursive: true });
await download(glb, src);
execFileSync("node", [
  path.join(ROOT, "scripts", "lux3d", "finalize.mjs"),
  "--in", src, "--out", LIB2, "--actions", LIB2_ACTIONS.join(","), "--anim-only",
], { stdio: ["ignore", "ignore", "inherit"], cwd: ROOT });
mkdirSync(path.join(WORK, "states"), { recursive: true });
const { writeFileSync } = await import("node:fs");
writeFileSync(stateF, JSON.stringify({ taskid, glb: LIB2, actions: LIB2_ACTIONS }, null, 2), "utf8");
console.log("库 B → " + LIB2);
