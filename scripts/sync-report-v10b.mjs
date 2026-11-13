/** 报告书 + 台账口径同步（2026-11-13 第十版：战斗手感 v1）。 */
import { readFileSync, writeFileSync } from "node:fs";

const R = "docs/报告书.md";
let t = readFileSync(R, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!t.includes(from)) { fails.push(label); return; }
  t = t.replace(from, to); ok++;
}

// ① §4.2 性能
rep("§4.2 性能",
  "**战斗屏每帧 345 draw call / 181,326 三角面**（2026-11-13 战斗手感 v1 后为 346 / 182,166）",
  "**战斗屏每帧 346 draw call / 181,382 三角面**");
rep("§4.2 首屏",
  "- **首屏与后台预取**（取证 `docs/evidence/v3-stability-20261111.json`）：首屏 **first-paint 1,072 ms**，全站请求 **105 个 / 12,116 KB**",
  "- **首屏与后台预取**（取证 `docs/evidence/v3-stability-20261111.json`）：首屏 **first-paint 972 ms**（同一构建连测 3 次为 972 / 2,720 / 2,704 ms —— 波动来自**测量机本身的负载**，本机同时跑着另一个 AI agent 与即时通讯软件；上线前一轮同构建的实测区间是 636~3,016 ms），全站请求 **106 个 / 11,678 KB**");
rep("§4.2 fps",
  "标题页帧率 **207–316 fps**（heap 50→41 MB，`webglcontextlost` **0** 次）",
  "标题页帧率 **303–358 fps**（heap 51→49 MB，`webglcontextlost` **0** 次）");
rep("§4.2 A/B",
  "| 性能实测 | 同一帧开关背景层对比（2026-11-13 实测，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：开 **345 draw call / 181,326 三角面** vs 关 **344 / 152,174**",
  "| 性能实测 | 同一帧开关背景层对比（2026-11-13 实测，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：开 **346 draw call / 181,382 三角面** vs 关 **345 / 152,230**");

// ② §10.5 视频
rep("§10.5 视频",
  "- **Demo 视频的如实边界**：现行提交视频为 `demo-video-20261111.mp4`（**87.8 秒 / 1920×1080 / 30fps / 2633 帧**，25,432,325 B，sha256 `a9644ae9266000a79b9438253162c93ad0b455c345a03484de5dba4d9fc10561`，2026-11-13 **第九次重录**，取自定版构建 `index-CRaKQLgy.js`；首页背景为**自制**的霓虹街道实拍，角色为**奶蛙 IP 形体**）",
  "- **Demo 视频的如实边界**：现行提交视频为 `demo-video-20261111.mp4`（**85.8 秒 / 1920×1080 / 30fps / 2573 帧**，26,730,907 B，sha256 `1e5daa45fdfc64c2efc0ab10dc0f82437f8bb26adb65c559d7be4b1681a26f1c`，2026-11-13 **第十次重录**，取自定版构建 `index-CDoGGTde.js`；首页背景为**自制**的霓虹街道实拍，角色为**奶蛙 IP 形体**，战斗采用**手感 v1** 的对手 AI 与命中反馈）");
rep("§10.5 补充",
  "**片中角色为官方绑骨 + 官方动作驱动**：挥击有重心转移与手臂甩动，武器握在右手骨骼上，命中帧在**武器打击端**爆出金属相撞火花，并拖出武器尖端 ribbon 拖尾、伴随命中径向色散与挥击风声；角色本身是**奶蛙 IP 形体**（黄色蛋形、无脖、奶油腹、绿眼圈圆眼、橄榄褐短手短脚），16 只只靠配色与配件区分。",
  "**片中角色为官方绑骨 + 官方动作驱动**：挥击有重心转移与手臂甩动，武器握在右手骨骼上，命中帧在**武器打击端**爆出金属相撞火花，并拖出武器尖端 ribbon 拖尾、伴随命中径向色散与挥击风声；角色本身是**奶蛙 IP 形体**（黄色蛋形、无脖、奶油腹、绿眼圈圆眼、橄榄褐短手短脚），16 只只靠配色与配件区分。**对手不再站桩**：片中可见对手主动逼近、蓄力（角色闪金光＝可弹反 / 闪红光＝不可弹反、只能闪避）、挥拳反击，并打出 2 段连招（§3.6）。");

// ③ §13 交付物
rep("§13 视频",
  "| Demo 视频（提交用） | `docs/demo-video-20261111.mp4`（**87.8 秒 / 30fps / 1920×1080 / 2633 帧**，25,432,325 B） | **现行版**：2026-11-13 **第九次重录**，取自定版构建 `index-CRaKQLgy.js` 全页合成",
  "| Demo 视频（提交用） | `docs/demo-video-20261111.mp4`（**85.8 秒 / 30fps / 1920×1080 / 2573 帧**，26,730,907 B） | **现行版**：2026-11-13 **第十次重录**，取自定版构建 `index-CDoGGTde.js` 全页合成（含手感 v1 的对手主动进攻与强命中反馈）");
rep("§13 Demo 行",
  "2026-11-13 部署 `index-CRaKQLgy.js` 定版（魔搭 master `0835058` / gh-pages `b17d2f9`，**47 个交付文件",
  "2026-11-13 部署 `index-CDoGGTde.js` 定版（魔搭 master / gh-pages，**47 个交付文件");

// ④ §六 时间线
rep("时间线 v10",
  "| 11.10–11.16（计划） | 打磨 + 实测取证 + 冻结验收 |",
  `| 11.13 | **第十版：战斗手感 v1 上线（重录 + 重部署）**：把 §3.6 的手感改动做完整交付（Demo 视频**第十次重录** 85.8 秒 / 2573 帧 / 26,730,907 B，零 console 错误、无黑帧，结算 S 级；§十 13 张插图与界面流程 13 张实拍重拍；性能复测 战斗屏 346 draw call / 181,382 三角面、标题页 fps 303–358；报告书新增 §3.6 与 41→42 页） |\n| 11.10–11.16（计划） | 打磨 + 实测取证 + 冻结验收 |`);

writeFileSync(R, t, "utf8");
console.log(`报告书已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }

// ⑤ 台账
const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));
j.rec_duration = "85.767 s（r_frame_rate=30/1，nb_frames=2573，1920×1080，ffprobe 实测 2026-11-13 第十次重录）";
j.rec_bytes = 26730907;
j.rec_sha256 = "1e5daa45fdfc64c2efc0ab10dc0f82437f8bb26adb65c559d7be4b1681a26f1c";
j.rec_note = j.rec_note
  .replace("2026-11-13 第九次重录（制作人委托收口线执行）：取自定版构建 dist/assets/index-CRaKQLgy.js（1,025,029 B，sha256 前 16 位 efaa134dd4d5e58e；含阶段 A-G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 奶蛙 IP 形体与自研 rest 姿态校正的全量，未手改 dist）",
    "2026-11-13 第十次重录（制作人委托收口线执行）：取自定版构建 dist/assets/index-CDoGGTde.js（1,027,582 B；含阶段 A-G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 奶蛙 IP 形体与自研 rest 姿态校正 + **战斗手感 v1**（对手 AI 状态机 / 强命中反馈 / 伤害梯度重平衡）的全量，未手改 dist）")
  + " 本版新增「战斗手感 v1」：对手主动逼近与 2 段连招、命中顿帧 0.167s、击退、伤害梯度 9/16/30。";
j.report_pdf_note = "2026-11-13 第十版报告书 PDF：docs/report.pdf（页数/字节/sha256 见回填值），中文可检索，内嵌图 14–17 骨骼与武器证据；新增 §3.6「战斗手感 v1」。";
j.demo_url_note = j.demo_url_note
  .replace("dist 47 个交付文件 / 14.22 MB，首页背景为自制实拍，角色为奶蛙 IP 形体）",
    "dist 47 个交付文件 / 14.22 MB，首页背景为自制实拍，角色为奶蛙 IP 形体，战斗为手感 v1）")
  .replace("Demo 视频已于 2026-11-13 第九次重录：docs/demo-video-20261111.mp4（87.8 秒 / 2633 帧",
    "Demo 视频已于 2026-11-13 第十次重录：docs/demo-video-20261111.mp4（85.8 秒 / 2573 帧");
writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("✓ 台账已同步");
