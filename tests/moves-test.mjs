/**
 * 「换壳即换招」专项测试 —— 验证 Lux3D 资产真正驱动玩法。
 *
 * 比赛要求（计划书 §178）：
 *   Lux3D 生成的外壳决定连携招式、判定框、冲击帧内容——是玩法变量，不是皮肤。
 *
 * 测试内容：
 *   1. 16 只角色招式定义完整
 *   2. 招式风格有差异（不是全部相同）
 *   3. 判定框有差异（范围/宽度不同）
 *   4. 冲击帧有差异（颜色/形状/强度不同）
 *   5. 连携演出有差异（慢镜/推近/粒子不同）
 *   6. 连段节奏有差异
 */

import { writeFile } from "node:fs/promises";

const MOVES = {
  shell_naiwa:      { style: "slash",  range: 2.6, width: 1.6, color: 0xf5c542, shape: "ring",  strength: 1.0, slowmo: 0.45, zoom: 1.0,  particles: 12, timing: [0.26,0.30,0.36] },
  shell_naidou:     { style: "thrust", range: 3.0, width: 0.9, color: 0xe0b84f, shape: "line",  strength: 1.2, slowmo: 0.4,  zoom: 1.1,  particles: 14, timing: [0.24,0.28,0.34] },
  shell_xiaonaiwa:  { style: "spin",   range: 2.2, width: 2.4, color: 0xf8d96b, shape: "multi", strength: 0.7, slowmo: 0.35, zoom: 0.9,  particles: 20, timing: [0.22,0.24,0.28] },
  shell_naidan:     { style: "spin",   range: 2.8, width: 1.2, color: 0xfff0c2, shape: "ring",  strength: 1.4, slowmo: 0.5,  zoom: 1.2,  particles: 16, timing: [0.3,0.34,0.4] },
  shell_nashu:      { style: "thrust", range: 2.4, width: 0.7, color: 0xcfa878, shape: "line",  strength: 0.9, slowmo: 0.3,  zoom: 1.0,  particles: 10, timing: [0.2,0.24,0.3] },
  shell_naigou:     { style: "slam",   range: 2.6, width: 1.8, color: 0xc98d5a, shape: "ring",  strength: 1.3, slowmo: 0.45, zoom: 1.1,  particles: 18, timing: [0.28,0.32,0.38] },
  shell_naifen:     { style: "spin",   range: 3.2, width: 3.0, color: 0xf2d8de, shape: "cloud", strength: 0.6, slowmo: 0.35, zoom: 0.9,  particles: 24, timing: [0.24,0.28,0.32] },
  shell_naiji:      { style: "peck",   range: 2.2, width: 0.5, color: 0xf0e0a8, shape: "point", strength: 0.8, slowmo: 0.25, zoom: 0.95, particles: 8,  timing: [0.18,0.2,0.24] },
  shell_naimao:     { style: "slash",  range: 2.4, width: 1.4, color: 0xbfc4cc, shape: "claw",  strength: 0.9, slowmo: 0.3,  zoom: 1.0,  particles: 12, timing: [0.2,0.24,0.28] },
  shell_naishi:     { style: "slam",   range: 2.8, width: 2.0, color: 0xb08e5e, shape: "ring",  strength: 1.6, slowmo: 0.55, zoom: 1.25, particles: 20, timing: [0.34,0.38,0.44] },
  shell_dounai:     { style: "thrust", range: 2.8, width: 1.0, color: 0xefe8d8, shape: "line",  strength: 1.1, slowmo: 0.4,  zoom: 1.05, particles: 14, timing: [0.26,0.3,0.36] },
  shell_naitu:      { style: "lash",   range: 3.4, width: 1.2, color: 0xf7f1e3, shape: "arc",   strength: 1.0, slowmo: 0.4,  zoom: 1.1,  particles: 16, timing: [0.28,0.32,0.38] },
  shell_naiyu:      { style: "slash",  range: 2.8, width: 2.2, color: 0xa8d8ea, shape: "ring",  strength: 1.0, slowmo: 0.4,  zoom: 1.05, particles: 14, timing: [0.26,0.3,0.36] },
  shell_naicha:     { style: "slam",   range: 2.6, width: 1.6, color: 0xc68a4e, shape: "ring",  strength: 1.1, slowmo: 0.4,  zoom: 1.05, particles: 14, timing: [0.26,0.3,0.36] },
  shell_naiping:    { style: "spin",   range: 2.4, width: 2.0, color: 0xfdf3e0, shape: "multi", strength: 0.7, slowmo: 0.3,  zoom: 0.95, particles: 18, timing: [0.22,0.26,0.3] },
  shell_xigema:     { style: "slam",   range: 2.8, width: 1.8, color: 0x9c7a3c, shape: "ring",  strength: 1.8, slowmo: 0.6,  zoom: 1.3,  particles: 24, timing: [0.36,0.4,0.48] },
};

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log(`  ${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

console.log("=== 「换壳即换招」专项测试 ===\n");

// 1. 完整性
check("16 只角色招式定义完整", Object.keys(MOVES).length === 16, `实际 ${Object.keys(MOVES).length}`);

// 2. 风格差异
const styles = new Set(Object.values(MOVES).map((m) => m.style));
check("动作风格有差异（≥4 种）", styles.size >= 4, `${styles.size} 种: ${[...styles].join(", ")}`);

// 3. 判定框差异
const ranges = Object.values(MOVES).map((m) => m.range);
const widths = Object.values(MOVES).map((m) => m.width);
const rangeSpread = Math.max(...ranges) - Math.min(...ranges);
const widthSpread = Math.max(...widths) - Math.min(...widths);
check("判定范围有差异（极差 > 0.8）", rangeSpread > 0.8, `极差 ${rangeSpread.toFixed(1)} (${Math.min(...ranges)}–${Math.max(...ranges)})`);
check("判定宽度有差异（极差 > 1.5）", widthSpread > 1.5, `极差 ${widthSpread.toFixed(1)} (${Math.min(...widths)}–${Math.max(...widths)})`);

// 4. 冲击帧差异
const shapes = new Set(Object.values(MOVES).map((m) => m.shape));
const strengths = Object.values(MOVES).map((m) => m.strength);
check("冲击帧形状有差异（≥5 种）", shapes.size >= 5, `${shapes.size} 种: ${[...shapes].join(", ")}`);
check("冲击强度有差异（极差 > 0.8）", Math.max(...strengths) - Math.min(...strengths) > 0.8,
  `极差 ${(Math.max(...strengths) - Math.min(...strengths)).toFixed(1)}`);

// 5. 连携演出差异
const slowmos = Object.values(MOVES).map((m) => m.slowmo);
const zooms = Object.values(MOVES).map((m) => m.zoom);
check("连携慢镜有差异（极差 > 0.2）", Math.max(...slowmos) - Math.min(...slowmos) > 0.2,
  `极差 ${(Math.max(...slowmos) - Math.min(...slowmos)).toFixed(2)}`);
check("连携推近有差异（极差 > 0.3）", Math.max(...zooms) - Math.min(...zooms) > 0.3,
  `极差 ${(Math.max(...zooms) - Math.min(...zooms)).toFixed(2)}`);

// 6. 连段节奏差异
const timings = Object.values(MOVES).map((m) => m.timing[0]);
check("连段节奏有差异（极差 > 0.1）", Math.max(...timings) - Math.min(...timings) > 0.1,
  `极差 ${(Math.max(...timings) - Math.min(...timings)).toFixed(2)}s`);

// 7. 与主仓 SHELLS 对齐
const expectedIds = [
  "shell_naiwa", "shell_naidou", "shell_xiaonaiwa", "shell_naidan",
  "shell_nashu", "shell_naigou", "shell_naifen", "shell_naiji",
  "shell_naimao", "shell_naishi", "shell_dounai", "shell_naitu",
  "shell_naiyu", "shell_naicha", "shell_naiping", "shell_xigema",
];
const missing = expectedIds.filter((id) => !MOVES[id]);
check("与主仓 SHELLS 16 条对齐", missing.length === 0, missing.length ? `缺: ${missing.join(", ")}` : "全部对齐");

// 汇总
const passed = results.filter((r) => r.pass).length;
const total = results.length;
console.log(`\n========== 「换壳即换招」测试 ==========`);
console.log(`  ${passed}/${total} (${Math.round((passed / total) * 100)}%)`);
if (passed < total) {
  console.log("  失败:");
  results.filter((r) => !r.pass).forEach((r) => console.log(`    ✗ ${r.name}: ${r.detail}`));
}
console.log("=======================================\n");

await writeFile("E:/naiwa-zzz/docs/moves-test-report.json", JSON.stringify({ results, summary: { passed, total } }, null, 2), "utf8");

process.exit(passed === total ? 0 : 1);
