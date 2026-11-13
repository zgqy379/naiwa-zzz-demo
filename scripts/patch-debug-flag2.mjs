import { readFileSync, writeFileSync } from "node:fs";
const F = "src/main.mjs";
let c = readFileSync(F, "utf8");
const OLD = "    const oppFrozen = stagger.isStaggered || anomaly.isFrozen;";
const NEW = [
  "    // debugNoOpponentAI：测试用，冻结对手 AI（不影响其他战斗逻辑）",
  "    const oppFrozen = stagger.isStaggered || anomaly.isFrozen || window.__npr?.debugNoOpponentAI === true;",
].join("\n");
if (!c.includes(OLD)) { console.log("✗ 未匹配"); process.exit(1); }
c = c.replace(OLD, NEW);
writeFileSync(F, c, "utf8");
console.log("✓ AI 块已接入调试开关");
