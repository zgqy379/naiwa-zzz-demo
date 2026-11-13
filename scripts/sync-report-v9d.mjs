import { readFileSync, writeFileSync } from "node:fs";
const F = "docs/报告书.md";
let t = readFileSync(F, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!t.includes(from)) { fails.push(label); return; }
  t = t.replace(from, to); ok++;
}
rep("创新点 15 体积",
  "交付包体积 21.48 → 13.35 MB、首屏 first-paint 964 → 636 ms",
  "交付包体积 21.48 → 13.35 MB、首屏 first-paint 964 → 636 ms（第九版因角色各自携带校正后的动画片段，包体 13.35 → **14.22 MB**、first-paint **1,072 ms**，仍优于自研校正之前的 3,016 ms）");
rep("§13 Demo 行",
  "含阶段 A–G 八个新系统 + 骨骼与动作重做 + 手感/演出/声音三块补做的全量）：**47 个交付文件",
  "含阶段 A–G 八个新系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 奶蛙 IP 形体与自研 rest 姿态校正的全量）：**47 个交付文件");
rep("§13 体积",
  "交付包体积 **13.35 MB**（首页背景改自制后由 21.48 MB 降下来）",
  "交付包体积 **14.22 MB**（首页背景改自制后由 21.48 MB 降下来；角色各自携带校正后的动画片段使包体回升 0.87 MB）");
writeFileSync(F, t, "utf8");
console.log(`已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }
console.log("✓ 全部匹配并写入");
