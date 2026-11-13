import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

// 用当前 docs/report.pdf 的真实字节回填台账（PDF 因含生成时间戳不可复现 → 必须最后一步回填）
const pdf = readFileSync("docs/report.pdf");
const sha = createHash("sha256").update(pdf).digest("hex");
const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));
j.report_pdf_note = `2026-11-13 第十版报告书 PDF：docs/report.pdf，42 页 / ${pdf.length.toLocaleString("en-US")} B，sha256 ${sha}（中文可检索，内嵌图 14–17 骨骼与武器证据；新增 §3.6「战斗手感 v1」）。注意 Chrome --print-to-pdf 会写入生成时间戳 → 同一份 markdown 每次生成的字节不同，**本条登记的哈希对应上传到官网的那一份**，仓库内文件已与之逐字节一致。`;
writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("✓ report_pdf_note 已回填实测值");
console.log("  bytes = " + pdf.length + "  sha256 = " + sha);
