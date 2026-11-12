import { readFileSync, writeFileSync } from "node:fs";

const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));

j.rec_duration = "79.433 s（r_frame_rate=30/1，nb_frames=2383，1920×1080，ffprobe 实测 2026-11-12 第七次重录）";
j.rec_bytes = 31815695;
j.rec_bytes = 32395249;
j.rec_sha256 = "c8e2b50914f9c1da205f7c80c60de11c02a47f5caef8b51de1a84a017bd73f29";
j.rec_note = j.rec_note
  .replace("2026-11-12 第六次重录（制作人委托收口线执行）：取自定版构建 dist/assets/index-CP5WV8oE.js（1,019,574 B，sha256 前 16 位 8f8836d0ae2b55d5；含阶段 A-G 八个系统 + 骨骼与动作重做的全量，未手改 dist）",
    "2026-11-12 第七次重录（制作人委托收口线执行）：取自定版构建 dist/assets/index-CLZViSiW.js（1,024,950 B，sha256 前 16 位 0dfe74c3908456c8；含阶段 A-G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做的全量，未手改 dist）")
  .replace("片中角色为官方绑骨 + 官方动作驱动，挥击有重心转移与手臂甩动，武器握在右手骨骼上，命中帧在武器打击端爆出金属相撞火花。",
    "片中角色为官方绑骨 + 官方动作驱动，挥击有重心转移与手臂甩动，武器握在右手骨骼上，命中帧在武器打击端爆出金属相撞火花，并拖出武器尖端 ribbon 拖尾、伴随命中径向色散与挥击风声。");
j.report_pdf_note = "2026-11-12 第七版报告书 PDF：docs/report.pdf，37 页 / 19,038,778 B，sha256 d508bd5159b71bb63550db829adec8a8fcd884948482f2c647f48483244181a1（中文可检索，内嵌图 14–17 骨骼与武器证据）。";
j.demo_url_note = j.demo_url_note
  .replace("2026-11-12 部署第六版定版构建 index-CP5WV8oE.js，dist 44 个交付文件 / 21.33 MB）",
    "2026-11-12 部署第七版定版构建 index-CLZViSiW.js，dist 48 个交付文件 / 21.48 MB）")
  .replace("Demo 视频已于 2026-11-12 第六次重录：docs/demo-video-20261111.mp4（83.2 秒 / 2496 帧",
    "Demo 视频已于 2026-11-12 第七次重录：docs/demo-video-20261111.mp4（79.4 秒 / 2383 帧");

writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("submission.json 已同步第七版");
console.log("  rec_duration =", j.rec_duration);
console.log("  rec_bytes    =", j.rec_bytes);
