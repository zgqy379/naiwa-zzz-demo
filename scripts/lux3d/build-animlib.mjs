/**
 * 共享动画库 + 角色运行时资产（零 API 调用，全部用本地已下载的中间产物）。
 *
 * 2026-11-13 修正（事故复盘）：
 *   本轮 16 只新 IP 模型由 batch 定版化（源 = 各自 rigged.glb）✓，
 *   但 build-animlib 随后用 `.lux3d-work/<id>/anim.glb` 重新定版 —— 那些是**上一轮**
 *   留下的**旧人形模型**的动画文件 → 把新模型覆盖回旧人形，再用 IP 模型的共享动画库
 *   驱动 → rest pose 不匹配 → 角色躺倒。
 *   修法：**角色运行时文件一律从 `rigged.glb` 定版**；`anim.glb` 只作为共享动画库的源。
 *
 * 用法：node scripts/lux3d/build-animlib.mjs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work");
const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));
const ACTIONS = roster._actions.split(",").map((s) => s.trim()).filter(Boolean);
const LIB = path.join(ROOT, "public", "asset", "naiwa_anim_lib.glb");

// 共享动画库的源（states/shared-anim.json 记录了它是哪只）
let libSource = null;
const sharedF = path.join(WORK, "states", "shared-anim.json");
if (existsSync(sharedF)) libSource = JSON.parse(readFileSync(sharedF, "utf8")).source;
if (!libSource) {
  // 退化：找任何一只本轮的 anim.glb（mtime 最新）
  const cands = roster.characters.map((c) => path.join(WORK, c.id, "anim.glb")).filter((p) => existsSync(p));
  if (!cands.length) { console.error("✗ 找不到任何 anim.glb，无法构建共享动画库"); process.exit(1); }
  cands.sort((a, b) => require("node:fs").statSync(b).mtimeMs - require("node:fs").statSync(a).mtimeMs);
  libSource = path.basename(path.dirname(cands[0]));
}
console.log("共享动画库源 = " + libSource);

let done = 0;
for (const c of roster.characters) {
  const rigged = path.join(WORK, c.id, "rigged.glb");
  const out = path.join(ROOT, "public", "asset", c.glb);
  if (!existsSync(rigged)) { console.log(`[${c.id}] 跳过（无 rigged.glb）`); continue; }
  execFileSync("node", [
    path.join(ROOT, "scripts", "lux3d", "finalize.mjs"),
    "--in", rigged, "--out", out, "--actions", ACTIONS.join(","), "--no-animations",
  ], { stdio: ["ignore", "ignore", "inherit"], cwd: ROOT });
  done++;
  console.log(`[${c.id}] → public/asset/${c.glb}`);
}
console.log(`角色文件已重建 ${done} 个`);

// 共享动画库 A（源角色的 anim.glb）
const libSrc = path.join(WORK, libSource, "anim.glb");
if (existsSync(libSrc)) {
  execFileSync("node", [
    path.join(ROOT, "scripts", "lux3d", "finalize.mjs"),
    "--in", libSrc, "--out", LIB, "--actions", ACTIONS.join(","), "--anim-only",
  ], { stdio: ["ignore", "ignore", "inherit"], cwd: ROOT });
  console.log("动画库 → " + LIB + "（源 " + libSource + "）");
} else {
  console.log("⚠ 源角色没有 anim.glb，共享动画库保持现状");
}
