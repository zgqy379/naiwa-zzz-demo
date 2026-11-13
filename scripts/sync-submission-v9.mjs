import { readFileSync, writeFileSync } from "node:fs";
const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));
j.rec_duration = "87.767 s（r_frame_rate=30/1，nb_frames=2633，1920×1080，ffprobe 实测 2026-11-13 第九次重录）";
j.rec_bytes = 25432325;
j.rec_sha256 = "a9644ae9266000a79b9438253162c93ad0b455c345a03484de5dba4d9fc10561";
j.rec_note = j.rec_note
  .replace(
    "2026-11-12 第八次重录（制作人委托收口线执行）：取自定版构建 dist/assets/index-CLZViSiW.js（1,024,950 B，sha256 前 16 位 0dfe74c3908456c8；含阶段 A-G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做的全量，未手改 dist）",
    "2026-11-13 第九次重录（制作人委托收口线执行）：取自定版构建 dist/assets/index-CRaKQLgy.js（1,025,029 B，sha256 前 16 位 efaa134dd4d5e58e；含阶段 A-G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 奶蛙 IP 形体与自研 rest 姿态校正的全量，未手改 dist）")
  .replace(
    "标题页背景为本项目自制的霓虹街道实拍（零第三方素材、零水印）。",
    "标题页背景为本项目自制的霓虹街道实拍（零第三方素材、零水印）；角色为奶蛙 IP 形体（黄色蛋形、无脖、奶油腹、绿眼圈圆眼、橄榄褐短手短脚），16 只各自携带按自己骨架校正过的官方动画片段（自研世界空间 delta 法重定向，零额外 API 积分）。");
j.demo_url_note = j.demo_url_note
  .replace("dist 48 个交付文件 / 13.35 MB，首页背景已改为自制实拍）", "dist 47 个交付文件 / 14.22 MB，首页背景为自制实拍，角色为奶蛙 IP 形体）")
  .replace("**48/48 文件 GET 全部 200**", "**47/47 文件 GET 全部 200**")
  .replace("Demo 视频已于 2026-11-12 第八次重录：docs/demo-video-20261111.mp4（87.7 秒 / 2632 帧", "Demo 视频已于 2026-11-13 第九次重录：docs/demo-video-20261111.mp4（87.8 秒 / 2633 帧");
j.report_pdf_note = "2026-11-13 第九版报告书 PDF：docs/report.pdf（页数/字节/sha256 见回填值），中文可检索，内嵌图 14–17 骨骼与武器证据；新增 §2.3 ④-bis / ④-ter「官方动画为何不能直接共享 + 自研 rest 姿态校正」与创新点 13/14/15。";
writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("✓ submission.json 已同步第九版");
console.log("  rec_duration =", j.rec_duration);
console.log("  rec_bytes    =", j.rec_bytes);
