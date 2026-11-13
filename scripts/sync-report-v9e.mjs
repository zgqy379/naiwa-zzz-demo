import { readFileSync, writeFileSync } from "node:fs";
const F = "docs/报告书.md";
let t = readFileSync(F, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!t.includes(from)) { fails.push(label); return; }
  t = t.replace(from, to); ok++;
}
rep("§13 Demo 行",
  "含阶段 A–G 八个新系统 + 骨骼与动作重做 + 手感/演出/声音三块补做的全量）：**48/48 个交付文件实测全部取到 200**",
  "含阶段 A–G 八个新系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 奶蛙 IP 形体与自研 rest 姿态校正的全量）：**47/47 个交付文件实测全部取到 200**");
writeFileSync(F, t, "utf8");
console.log(`已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }
console.log("✓ 全部匹配并写入");
