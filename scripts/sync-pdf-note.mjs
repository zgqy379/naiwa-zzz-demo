import { readFileSync, writeFileSync } from "node:fs";

const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));
j.report_pdf_note = "2026-11-12 第八版报告书 PDF（已上传为官网附件）：docs/report.pdf，37 页 / 19,106,369 B，sha256 813d4d9ce4bc60b9997eee2b79b59e8afd2ecc8e57163bdfff05add4790e6818（中文可检索，内嵌图 14–17 骨骼与武器证据）。";
writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("✓ report_pdf_note 已回填实测值");
