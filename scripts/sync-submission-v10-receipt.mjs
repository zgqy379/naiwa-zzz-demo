import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const pdf = readFileSync("docs/report.pdf");
const pdfSha = createHash("sha256").update(pdf).digest("hex");

const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));
j.submit_at = "2026-11-13T23:59:00+08:00";
j.receipt = "第 9 版 · 提交于 2026-11-13 23:59（赛事站 https://www.aholo3d.cn/hackathon/my →「我的参赛 → 我的作品」→ 修改提交 → 提交新版本，团队编号 3FO4K4VY3D07，作品名「奶蛙零 · 奶家族谱 × 潮酷演出的 3D AI 连携短局」）；平台状态「已提交 · 作品已进入资格与完整性审核」；平台提示「作品已进入资格与完整性审核。请确保 Demo、视频和其他链接在结果公布前持续有效」与「截止前可多次提交，评审以 11 月 19 日 19:00 前最后一次成功提交的版本为准」。提交项：Demo = https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo （魔搭 master 69c321a，**47/47 交付文件实测 200**，五项关键文件与本仓 dist/ 逐字节一致） ；项目报告书 = 上传文件 report.pdf（**18.1 MB / 18,978,184 B**，sha256 " + pdfSha + "，与本仓 docs/report.pdf 逐字节一致，42 页中文可检索，含新增 §3.6「战斗手感 v1」） ；生态合作设备/技术使用情况 = 无；应用赛道 = 游戏应用奖、空间设计应用奖；项目源代码 = https://github.com/zgqy379/naiwa-zzz-demo/tree/main ；社交媒体发布链接 = 空（加分项，见下）。提交后卡片实拍 docs/evidence/v3-hackathon-submit-v10-20261113.png，提交前表单实拍 docs/evidence/v3-hackathon-submit-v10-form-20261113.png，前后状态快照 docs/evidence/v3-hackathon-submit-v10-result-20261113.json。前一版为第 8 版（2026-11-13 15:56）。";
j.report_pdf_note = `2026-11-13 第十版报告书 PDF（已上传为第 9 版附件）：docs/report.pdf，42 页 / ${pdf.length.toLocaleString("en-US")} B，sha256 ${pdfSha}（中文可检索，内嵌图 14–17 骨骼与武器证据；新增 §3.6「战斗手感 v1」）。平台第 9 版卡片显示「report.pdf · 18.1 MB」。注意 Chrome --print-to-pdf 会写入生成时间戳 → 同一份 markdown 每次生成字节不同，**本条登记的哈希对应上传到官网的那一份**，仓库内文件已与之逐字节一致。`;
writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("✓ 台账已回填第 9 版回执");
console.log("  submit_at = " + j.submit_at);
console.log("  pdf sha256 = " + pdfSha);
