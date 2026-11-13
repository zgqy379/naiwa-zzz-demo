import { readFileSync, writeFileSync } from "node:fs";
const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));
j.frozen_commit = "61da94681ccce12f8eeec467294f9e77cdee6484";
j.frozen_commit_note = "冻结 tag `freeze-2026-11-11-final` → 61da946（= 含本次官网提交回执的文档提交；其 src/ 与构建提交 2642487 完全一致，dist 与线上魔搭 master 0835058 / gh-pages b17d2f9 逐字节一致，docs/report.pdf 与官网落盘那份逐字节一致）。";
writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("✓ frozen_commit 已对齐冻结 tag：", j.frozen_commit);
