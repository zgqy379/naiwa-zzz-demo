import { readFileSync, writeFileSync } from "node:fs";

const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));

j.$comment = j.$comment
  .replace("【2026-11-12 第七次更新：第 6 版已提交】", "【2026-11-12 第八次更新：第 7 版已提交】")
  .replace("frozen_tag / frozen_commit 随每次重录回填（2026-11-12 第六版已重指：freeze-2026-11-11-final → ba2f342）",
    "frozen_tag / frozen_commit 随每次重录回填（2026-11-12 第七版已重指：freeze-2026-11-11-final → 见 frozen_commit）");

j.submit_at = "2026-11-12T22:25:00+08:00";
j.receipt = "第 7 版 · 提交于 2026-11-12 22:25（赛事站 https://www.aholo3d.cn/hackathon/my →「我的参赛 → 我的作品」→ 修改提交 → 提交新版本，团队编号 3FO4K4VY3D07）；平台状态「已提交 · 作品已进入资格与完整性审核」；平台提示「作品已进入资格与完整性审核。请确保 Demo、视频和其他链接在结果公布前持续有效」与「截止前可多次提交，评审以 11 月 19 日 19:00 前最后一次成功提交的版本为准」。提交项：Demo = https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo （魔搭 master b160f78，48/48 交付文件实测 200，五项关键文件与本仓 dist/ 逐字节一致） ；项目报告书 = 上传文件 report.pdf（18.2 MB / 19,038,778 B，sha256 d508bd5159b71bb63550db829adec8a8fcd884948482f2c647f48483244181a1，与本仓 docs/report.pdf 逐字节一致，37 页中文可检索） ；生态合作设备/技术使用情况 = 无；应用赛道 = 游戏应用奖、空间设计应用奖；项目源代码 = https://github.com/zgqy379/naiwa-zzz-demo/tree/main ；社交媒体发布链接 = 空（加分项，见下）。提交后卡片实拍 docs/evidence/v3-hackathon-submit-v7-20261112.png，提交前表单实拍 docs/evidence/v3-hackathon-submit-v7-form-20261112.png，前后状态快照 docs/evidence/v3-hackathon-submit-v7-result-20261112.json。前一版为第 6 版（2026-11-12 21:10）。";
j.report_pdf_note = "2026-11-12 第七版报告书 PDF（已上传为第 7 版附件）：docs/report.pdf，37 页 / 19,038,778 B，sha256 d508bd5159b71bb63550db829adec8a8fcd884948482f2c647f48483244181a1（中文可检索，内嵌图 14–17 骨骼与武器证据；新增 §3.5「手感 / 演出 / 声音三层」）。平台第 7 版卡片显示「report.pdf · 18.2 MB」。";
j.demo_url_note = j.demo_url_note
  .replace("2026-11-12 部署第七版定版构建 index-CLZViSiW.js，dist 48 个交付文件 / 21.48 MB）",
    "2026-11-12 部署第七版定版构建 index-CLZViSiW.js，魔搭 master b160f78，dist 48 个交付文件 / 21.48 MB）")
  .replace("**44/44 文件 GET 全部 200**", "**48/48 文件 GET 全部 200**")
  .replace("五项关键文件与本仓 dist/ **逐字节一致**（入口 index.html 93FBBF3F2CFA5AB8、主 JS assets/index-CP5WV8oE.js 8F8836D0AE2B55D5、CSS assets/index-BnIDec0l.css E9056643B6D1168B、bg/title.mp4 DA18AB01B02C594A、fonts/LICENSES.txt 18A6B716E5A31801），旧构建 assets/index-C6e6LaWv.js 已 404 下线",
    "五项关键文件与本仓 dist/ **逐字节一致**（入口 index.html 3D99A4609B90D030、主 JS assets/index-CLZViSiW.js 0DFE74C3908456C8、CSS assets/index-BnIDec0l.css E9056643B6D1168B、bg/title.mp4 DA18AB01B02C594A、fonts/LICENSES.txt 18A6B716E5A31801），旧构建 assets/index-C6e6LaWv.js 与 assets/index-CP5WV8oE.js 均已 404 下线")
  .replace("备用直连（gh-pages，commit eeb1697）", "备用直连（gh-pages，commit 2e11511）")
  .replace("**44/44 文件实测可取，五项关键文件与本仓 `dist/` 逐字节一致**", "**48/48 文件实测可取，五项关键文件与本仓 `dist/` 逐字节一致**");

writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("submission.json 已回填第 7 版回执");
console.log("  submit_at =", j.submit_at);
console.log("  receipt 头 =", j.receipt.slice(0, 60));
