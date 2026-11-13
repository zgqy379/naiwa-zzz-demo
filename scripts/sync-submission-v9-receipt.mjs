import { readFileSync, writeFileSync } from "node:fs";
const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));

j.$comment = j.$comment
  .replace("【2026-11-12 第八次更新：第 7 版已提交】", "【2026-11-13 第九次更新：第 8 版已提交（平台编号；本轮为「第九版收口批次」）】")
  .replace("frozen_tag / frozen_commit 随每次重录回填（2026-11-12 第七版已重指：freeze-2026-11-11-final → 见 frozen_commit）",
    "frozen_tag / frozen_commit 随每次重录回填（2026-11-13 第九版已重指：freeze-2026-11-11-final → 见 frozen_commit）");

j.submit_at = "2026-11-13T15:56:00+08:00";
j.receipt = "第 8 版 · 提交于 2026-11-13 15:56（赛事站 https://www.aholo3d.cn/hackathon/my →「我的参赛 → 我的作品」→ 修改提交 → 提交新版本，团队编号 3FO4K4VY3D07，作品名「奶蛙零 · 奶家族谱 × 潮酷演出的 3D AI 连携短局」）；平台状态「已提交 · 作品已进入资格与完整性审核」；平台提示「请确保 Demo、视频和其他链接在结果公布前持续有效」与「截止前可多次提交，评审以 11 月 19 日 19:00 前最后一次成功提交的版本为准」。提交项：Demo = https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo （魔搭 master 0835058，**47/47 交付文件实测 200**，五项关键文件与本仓 dist/ 逐字节一致） ；项目报告书 = 上传文件 report.pdf（**19.1 MB / 20,003,521 B**，sha256 d4beca21d7c2f5404d2718403d3d435d6488f30a4e96acf772d20ae602871c60，与本仓 docs/report.pdf 逐字节一致，41 页中文可检索） ；生态合作设备/技术使用情况 = 无；应用赛道 = 游戏应用奖、空间设计应用奖；项目源代码 = https://github.com/zgqy379/naiwa-zzz-demo/tree/main ；社交媒体发布链接 = 空（加分项，见下）。提交后卡片实拍 docs/evidence/v3-hackathon-submit-v9-20261113.png，提交前表单实拍 docs/evidence/v3-hackathon-submit-v9-form-20261113.png，前后状态快照 docs/evidence/v3-hackathon-submit-v9-result-20261113.json。前一版为第 7 版（2026-11-12 22:25）。";
j.report_pdf_note = "2026-11-13 第九版报告书 PDF（已上传为第 8 版附件）：docs/report.pdf，41 页 / 20,003,521 B，sha256 d4beca21d7c2f5404d2718403d3d435d6488f30a4e96acf772d20ae602871c60（中文可检索，内嵌图 14–17 骨骼与武器证据；新增 §2.3 ④-bis / ④-ter「官方动画为何不能直接共享 + 自研 rest 姿态校正」与创新点 13/14/15）。平台第 8 版卡片显示「report.pdf · 19.1 MB」。";
j.frozen_commit = "2642487e12631b8732d8cd4f889d811145c8430f";

writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("✓ submission.json 已回填第 8 版（平台编号）回执");
console.log("  submit_at =", j.submit_at);
