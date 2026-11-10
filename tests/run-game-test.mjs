// 运行游戏全维度测试（ego 环境）
import { writeFile } from "node:fs/promises";
import { runAllTests } from "./game-test.mjs";

// 环境检测：taskSpace 由 ego 宿主注入，普通 node 下不存在（直接跑会抛 ReferenceError）
if (typeof taskSpace === "undefined") {
  console.error(
    "[run-game-test] 未检测到 ego 宿主全局 taskSpace：本脚本必须以 ego-browser 运行，请勿用普通 node 直接执行。\n" +
    "正确调用方式（ego 环境）：\n" +
    `  ego-browser nodejs -e "await import('file:///E:/naiwa-zzz/tests/run-game-test.mjs')"\n` +
    "或走全链路（构建 + preview + ego）：npm run test"
  );
  process.exit(1);
}

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
