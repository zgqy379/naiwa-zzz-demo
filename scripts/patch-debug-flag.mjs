import { readFileSync, writeFileSync } from "node:fs";
const F = "src/main.mjs";
let c = readFileSync(F, "utf8");
const OLD = "  debugOpenWomark: () => openWomark(),";
const NEW = [
  "  debugOpenWomark: () => openWomark(),",
  "  // 2026-11-13 战斗手感 v1：测试用开关——冻结对手 AI（移动/闪避类断言时用，",
  "  // 避免主动逼近的新对手打断测量）。用法：window.__npr.debugNoOpponentAI = true",
  "  debugNoOpponentAI: false,",
].join("\n");
if (!c.includes(OLD)) { console.log("✗ 未匹配"); process.exit(1); }
c = c.replace(OLD, NEW);
writeFileSync(F, c, "utf8");
console.log("✓ 已加调试开关");
