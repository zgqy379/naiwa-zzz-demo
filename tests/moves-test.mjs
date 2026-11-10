/**
 * 「换壳即换招」专项测试 —— 验证 Lux3D 资产真正驱动玩法。
 *
 * 比赛要求（计划书 §178）：
 *   Lux3D 生成的外壳决定连携招式、判定框、冲击帧内容——是玩法变量，不是皮肤。
 *
 * 测试内容：
 *   0. 数据来源：直接 import 真实招式表 src/game/moves.mjs（无本地手抄副本）
 *   1. 16 只角色招式定义完整
 *   2. 招式风格有差异（不是全部相同）
 *   3. 判定框有差异（范围/宽度不同）
 *   4. 冲击帧有差异（颜色/形状/强度不同）
 *   5. 连携演出有差异（慢镜/推近/粒子不同）
 *   6. 连段节奏有差异
 */

import { writeFile } from "node:fs/promises";
// 直接断言真实招式表（唯一数据源 src/game/moves.mjs，无本地手抄副本，防手工同步漂移）；
// id 对齐基准用花名册 SQUAD（src/game/squad.mjs，自称与主仓 SHELLS 逐条对齐的仓内映照）。
import { MOVES } from "../src/game/moves.mjs";
import { SQUAD } from "../src/game/squad.mjs";

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
const ranges = Object.values(MOVES).map((m) => m.hitbox.range);
const widths = Object.values(MOVES).map((m) => m.hitbox.width);
const rangeSpread = Math.max(...ranges) - Math.min(...ranges);
const widthSpread = Math.max(...widths) - Math.min(...widths);
check("判定范围有差异（极差 > 0.8）", rangeSpread > 0.8, `极差 ${rangeSpread.toFixed(1)} (${Math.min(...ranges)}–${Math.max(...ranges)})`);
check("判定宽度有差异（极差 > 1.5）", widthSpread > 1.5, `极差 ${widthSpread.toFixed(1)} (${Math.min(...widths)}–${Math.max(...widths)})`);

// 4. 冲击帧差异
const shapes = new Set(Object.values(MOVES).map((m) => m.impact.shape));
const strengths = Object.values(MOVES).map((m) => m.impact.strength);
check("冲击帧形状有差异（≥5 种）", shapes.size >= 5, `${shapes.size} 种: ${[...shapes].join(", ")}`);
check("冲击强度有差异（极差 > 0.8）", Math.max(...strengths) - Math.min(...strengths) > 0.8,
  `极差 ${(Math.max(...strengths) - Math.min(...strengths)).toFixed(1)}`);

// 5. 连携演出差异
const slowmos = Object.values(MOVES).map((m) => m.chain.slowmo);
const zooms = Object.values(MOVES).map((m) => m.chain.zoom);
check("连携慢镜有差异（极差 > 0.2）", Math.max(...slowmos) - Math.min(...slowmos) > 0.2,
  `极差 ${(Math.max(...slowmos) - Math.min(...slowmos)).toFixed(2)}`);
check("连携推近有差异（极差 > 0.3）", Math.max(...zooms) - Math.min(...zooms) > 0.3,
  `极差 ${(Math.max(...zooms) - Math.min(...zooms)).toFixed(2)}`);

// 6. 连段节奏差异
const timings = Object.values(MOVES).map((m) => m.comboTiming[0]);
check("连段节奏有差异（极差 > 0.1）", Math.max(...timings) - Math.min(...timings) > 0.1,
  `极差 ${(Math.max(...timings) - Math.min(...timings)).toFixed(2)}s`);

// 7. 与花名册 SQUAD（主仓 SHELLS 的仓内映照）双向对齐：少一条、多一条都算失败
const rosterIds = SQUAD.map((s) => s.id);
const missing = rosterIds.filter((id) => !MOVES[id]);
const extra = Object.keys(MOVES).filter((id) => !rosterIds.includes(id));
const misaligned = [...missing.map((id) => `缺: ${id}`), ...extra.map((id) => `多: ${id}`)];
check("与主仓 SHELLS 16 条对齐", missing.length === 0 && extra.length === 0,
  misaligned.length ? misaligned.join(", ") : "全部对齐");

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
