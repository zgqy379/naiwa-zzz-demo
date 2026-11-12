import { readFileSync, writeFileSync } from "node:fs";

// ① 报告书：§六 时间线补第八版
const R = "docs/报告书.md";
let t = readFileSync(R, "utf8");
const marker = "| 11.10–11.16（计划） | 打磨 + 实测取证 + 冻结验收 |";
const row = "| 11.12 | **统一收口（第八版）：首页背景视频改为自制 + 第八次重录**：把标题页背景从**第三方短视频素材**（含抖音水印与第三方账号 ID、主体是鸡）换成本项目**自制**的霓虹街道 3D 实拍（`scripts/lux3d/capture-title-bg.mjs`，17.3 秒 / 1280×720 / **192 KB**，此前为 8.33 MiB）——**合规缺口与 IP 不一致同时消除**，交付包 21.48 → **13.35 MB**、first-paint 964 → **636 ms**、标题页 fps 234–295 → **358–361**；Demo 视频**第八次重录**（87.7 秒 / 2632 帧 / 29,199,693 B，sha256 `30b3bfde…`，零 console 错误、无黑帧）；§十插图与界面实拍重拍；授权表 `VIDEO_BG_Title` 改为「自有产出」，§五 授权表与 §九第 8 条同步销账 |\n";
if (!t.includes(marker)) { console.log("✗ 时间线插入点未找到"); process.exit(1); }
t = t.replace(marker, row + marker);
writeFileSync(R, t, "utf8");
console.log("✓ 报告书 §六 时间线已补第八版");

// ② submission.json：视频指纹 + 构建口径
const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));
j.rec_duration = "87.733 s（r_frame_rate=30/1，nb_frames=2632，1920×1080，ffprobe 实测 2026-11-12 第八次重录）";
j.rec_bytes = 29199693;
j.rec_sha256 = "30b3bfdeebea4f7abafea41a9e97ba4e5c75bd913ea9cb923562f2d9af6db8db";
j.rec_note = j.rec_note
  .replace("2026-11-12 第七次重录（制作人委托收口线执行）", "2026-11-12 第八次重录（制作人委托收口线执行）")
  .replace("片中角色为官方绑骨 + 官方动作驱动，挥击有重心转移与手臂甩动，武器握在右手骨骼上，命中帧在武器打击端爆出金属相撞火花，并拖出武器尖端 ribbon 拖尾、伴随命中径向色散与挥击风声。",
    "片中角色为官方绑骨 + 官方动作驱动，挥击有重心转移与手臂甩动，武器握在右手骨骼上，命中帧在武器打击端爆出金属相撞火花，并拖出武器尖端 ribbon 拖尾、伴随命中径向色散与挥击风声；标题页背景为本项目自制的霓虹街道实拍（零第三方素材、零水印）。");
j.report_pdf_note = "2026-11-12 第八版报告书 PDF：docs/report.pdf（页数/字节/sha256 见本文件生成时的实测值），中文可检索，内嵌图 14–17 骨骼与武器证据。";
j.demo_url_note = j.demo_url_note
  .replace("dist 48 个交付文件 / 21.48 MB）", "dist 48 个交付文件 / 13.35 MB，首页背景已改为自制实拍）")
  .replace("Demo 视频已于 2026-11-12 第七次重录：docs/demo-video-20261111.mp4（79.4 秒 / 2383 帧",
    "Demo 视频已于 2026-11-12 第八次重录：docs/demo-video-20261111.mp4（87.7 秒 / 2632 帧");
writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("✓ submission.json 已同步第八版");
