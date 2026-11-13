import { readFileSync, writeFileSync } from "node:fs";
const R = "docs/报告书.md";
let t = readFileSync(R, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!t.includes(from)) { fails.push(label); return; }
  t = t.replace(from, to); ok++;
}

rep("§10.5 视频",
  "- **Demo 视频的如实边界**：现行提交视频为 `demo-video-20261111.mp4`（**87.8 秒 / 1920×1080 / 30fps / 2633 帧**，25,432,325 B，sha256 `a9644ae9266000a79b9438253162c93ad0b455c345a03484de5dba4d9fc10561`，2026-11-13 **第九次重录**，取自定版构建 `index-CRaKQLgy.js`（**手感 v1 后已再录一版，见下**）",
  "- **Demo 视频的如实边界**：现行提交视频为 `demo-video-20261111.mp4`（**85.8 秒 / 1920×1080 / 30fps / 2573 帧**，26,730,907 B，sha256 `1e5daa45fdfc64c2efc0ab10dc0f82437f8bb26adb65c559d7be4b1681a26f1c`，2026-11-13 **第十次重录**，取自定版构建 `index-CDoGGTde.js`（**手感 v1 之后的版本**）");

rep("§10.8 更正",
  "定版构建 `index-CRaKQLgy.js` → Demo 视频**第九次重录**（87.8 秒 / 2633 帧，含骨骼动作、武器相撞、武器拖尾与正确描边；角色已换成奶蛙 IP 形体，首页背景为自制实拍）",
  "定版构建 `index-CDoGGTde.js` → Demo 视频**第十次重录**（85.8 秒 / 2573 帧，含骨骼动作、武器相撞、武器拖尾、正确描边、奶蛙 IP 形体，以及手感 v1 的对手主动进攻与强命中反馈）");

rep("§13 Demo 行",
  "2026-11-13 部署 `index-CRaKQLgy.js` 定版（魔搭 master，**47 个交付文件**，含阶段 A–G 八个新系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 奶蛙 IP 形体与自研 rest 姿态校正的全量）",
  "2026-11-13 部署 `index-CDoGGTde.js` 定版（魔搭 master，**47 个交付文件**，含阶段 A–G 八个新系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 奶蛙 IP 形体与自研 rest 姿态校正 + **战斗手感 v1** 的全量）");

rep("§4.2 构建号",
  "- 实测（2026-11-12，定版构建 `index-CRaKQLgy.js`，1920×1080",
  "- 实测（2026-11-13，定版构建 `index-CDoGGTde.js`，1920×1080");

writeFileSync(R, t, "utf8");
console.log(`已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }
console.log("✓ 全部匹配并写入");
