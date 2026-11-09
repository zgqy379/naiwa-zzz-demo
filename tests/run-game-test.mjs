// 运行游戏全维度测试（ego 环境）
import { writeFile } from "node:fs/promises";
import { runAllTests } from "./game-test.mjs";

const task = await taskSpace("naiwa-test");
const page = task.page("p1");

console.log("=== 奶蛙零 · 全维度测试 ===\n");

let report;
try {
  report = await runAllTests(page);
} catch (e) {
  console.error("测试执行失败:", e);
  report = { error: String(e).slice(0, 500), summary: { total: 0, passed: 0, failed: 1, passRate: 0 } };
}

// 简化版报告写入（供主进程读取）
await writeFile(
  "E:/naiwa-zzz/docs/test-report.json",
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("\n报告已写入 docs/test-report.json");
