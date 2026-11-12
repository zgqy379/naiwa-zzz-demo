/**
 * 共享动画库构建：
 *
 * 官方自动绑骨产出**标准 Mixamo 人形骨架**（52 关节，含手指骨），且跨角色关节名/顺序/层级
 * 完全一致（scripts/lux3d/compare-skeletons.mjs 可复核）。因此：
 *   - 角色文件 → 只保留「网格 + 蒙皮 + 骨架」，**去掉动画片段**（体积大头的片段全部移走）
 *   - 动画库 → 单独一个 GLB（骨架 + 全部官方动作片段），游戏加载一次，驱动 16 只角色
 *
 * 体积对比（实测）：每人各带 10 片段 ≈ 767 KB × 16 = 12.3 MB；
 * 改为共享库 ≈ 480 KB × 16 + 1.2 MB ≈ 8.9 MB（省约 3.4 MB），
 * 且以后加片段只需重做这一个库（6 积分/片段，16 只同时受益）。
 *
 * 用法：node scripts/lux3d/build-animlib.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work");
const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));
const ACTIONS = roster._actions.split(",").map((s) => s.trim()).filter(Boolean);
const LIB = path.join(ROOT, "public", "asset", "naiwa_anim_lib.glb");

// ① 角色文件：去掉动画片段（保留网格 + 蒙皮 + 骨架）
let done = 0;
for (const c of roster.characters) {
  const src = path.join(WORK, c.id, "anim.glb");
  if (!existsSync(src)) { console.log(`[${c.id}] 跳过（尚无 anim.glb）`); continue; }
  const out = path.join(ROOT, "public", "asset", c.glb);
  execFileSync("node", [
    path.join(ROOT, "scripts", "lux3d", "finalize.mjs"),
    "--in", src, "--out", out, "--actions", ACTIONS.join(","), "--no-animations",
  ], { stdio: ["ignore", "ignore", "inherit"], cwd: ROOT });
  done++;
  console.log(`[${c.id}] → public/asset/${c.glb}`);
}

// ② 动画库：骨架 + 全部片段
const libSrc = roster.characters.map((c) => path.join(WORK, c.id, "anim.glb")).find((p) => existsSync(p));
if (!libSrc) {
  console.error("没有任何 anim.glb，无法构建动画库");
  process.exit(1);
}
execFileSync("node", [
  path.join(ROOT, "scripts", "lux3d", "finalize.mjs"),
  "--in", libSrc, "--out", LIB, "--actions", ACTIONS.join(","), "--anim-only",
], { stdio: ["ignore", "ignore", "inherit"], cwd: ROOT });
console.log(`动画库 → ${LIB}（源 ${libSrc}）`);
console.log(`角色文件已重建 ${done} 个`);
