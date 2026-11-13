/**
 * 修复：清掉上一轮遗留的**旧角色** anim.glb（它们对应旧的人形模型），
 * 并删除受影响角色的 final 状态，让 batch 用**本轮新模型**的 rigged.glb 重新定版。
 *
 * 事故复盘（2026-11-13）：
 *   ① 本轮 16 只新模型已由 batch 定版化（源 = 各自 rigged.glb）✓
 *   ② 但随后跑 build-animlib.mjs，它对每个角色找 `.lux3d-work/<id>/anim.glb`
 *      —— 那是**上一轮**留下的旧人形模型 + 旧动画 → 用它重新定版 = 把新模型覆盖回旧人形
 *   ③ 再用「IP 模型做的共享动画库」驱动旧人形模型 → rest pose 不匹配 → 角色躺倒
 *   修法：anim.glb 只允许来自本轮（make-shared-anim.mjs 产出，且只给库 A 的源角色）；
 *        其余角色一律用 rigged.glb 定版。
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work");
const STATES = path.join(WORK, "states");

// 本轮共享动画库的源角色（它的 anim.glb 是本轮产物、合法）
const shared = path.join(STATES, "shared-anim.json");
let keepId = null;
if (existsSync(shared)) keepId = JSON.parse(readFileSync(shared, "utf8")).source;
console.log("共享动画库源角色 = " + (keepId || "(未知)"));

const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));

let removed = 0, cleared = 0;
for (const c of roster.characters) {
  if (c.id === keepId) continue;             // 库 A 的源角色，保留它的 anim.glb
  const anim = path.join(WORK, c.id, "anim.glb");
  if (existsSync(anim)) { rmSync(anim, { force: true }); removed++; }
  // 删掉 final 状态 → 让 batch 重新定版化
  for (const f of readdirSync(STATES)) {
    if (!f.startsWith(c.id)) continue;
    const p = path.join(STATES, f);
    const j = JSON.parse(readFileSync(p, "utf8"));
    if (j.final) { rmSync(p, { force: true }); cleared++; }
  }
}
console.log(`已删除陈旧 anim.glb = ${removed} 个，清掉 final 状态 = ${cleared} 条`);
