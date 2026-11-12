/**
 * 报告书口径批量同步（2026-11-12 第八版：首页背景视频改为自制，第三方授权缺口消除）。
 * 用法：node scripts/sync-report-v8.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "docs/报告书.md";
let text = readFileSync(FILE, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!text.includes(from)) { fails.push(label); return; }
  text = text.replace(from, to); ok++;
}

// ① §九 第 8 条：授权缺口 → 已消除
rep("§九第8条",
  "8. **首页背景视频的授权待验证**：首页循环背景 `bg/title.mp4`（8.33 MiB，随交付包部署）是**第三方短视频素材**（含平台水印与第三方账号标识、中文字幕），其原始素材页链接与授权凭证尚未取得（制作人提供素材时未留存）。官网 IP 条款要求「所使用的图片、视频等第三方内容具有合法授权」，因此本条为**已知的合规缺口**，已在 `docs/ASSET-LICENSES.md` 登记为 `VIDEO_BG_Title` 并如实标「待验证",
  "8. ~~**首页背景视频的授权待验证**~~ → **已于 2026-11-12 消除（改为自制背景）**：原首页循环背景 `bg/title.mp4`（8.33 MiB）是**第三方短视频素材**（含平台水印与第三方账号标识、中文字幕，且主体是鸡而非奶蛙），既构成官网 IP 条款下的授权缺口，也与作品 IP 不一致。现已改为**本项目自制**：用游戏自己的霓虹街道 3D 场景实拍成片（`scripts/lux3d/capture-title-bg.mjs`，隐藏界面叠层后只拍 3D 画布 + 缓慢运镜，17.3 秒 / 1280×720 / **192 KB**），**版权 100% 归本项目、零第三方素材、零水印**，同时把交付包体积从 21.48 MB 降到 **13.35 MB**、首屏 first-paint 从 964 ms 降到 **636 ms**。授权表 `docs/ASSET-LICENSES.md` 中 `VIDEO_BG_Title` 已改为「自制（官方工具产出 + 自研渲染）」");

// ② §4.2 性能段
rep("§4.2 性能",
  "- 实测（2026-11-12，定版构建 `index-CLZViSiW.js`，1920×1080，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：场景图谱 **821 个 mesh**（其中 123 个为 `InstancedMesh`）、787 个唯一几何体；**战斗屏每帧 346 draw call / 177,722 三角面**",
  "- 实测（2026-11-12，定版构建 `index-CLZViSiW.js`，1920×1080，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：场景图谱 **821 个 mesh**（其中 123 个为 `InstancedMesh`）、787 个唯一几何体；**战斗屏每帧 346 draw call / 177,638 三角面**");
rep("§4.2 首屏",
  "- **首屏与后台预取**（取证 `docs/evidence/v3-stability-20261111.json`）：首屏 **first-paint 964 ms**（DOMContentLoaded 1,739 ms），全站请求 **108 个 / 13,598 KB**",
  "- **首屏与后台预取**（取证 `docs/evidence/v3-stability-20261111.json`）：首屏 **first-paint 636 ms**，全站请求 **106 个 / 13,524 KB**");
rep("§4.2 fps",
  "标题页帧率 **234–295 fps**（heap 50→35 MB，`webglcontextlost` **0** 次）",
  "标题页帧率 **358–361 fps**（heap 52→35 MB，`webglcontextlost` **0** 次）");
rep("§4.2 A/B",
  "| 性能实测 | 同一帧开关背景层对比（2026-11-12 实测，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：开 **346 draw call / 177,722 三角面** vs 关 **345 / 148,570**",
  "| 性能实测 | 同一帧开关背景层对比（2026-11-12 实测，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：开 **346 draw call / 177,638 三角面** vs 关 **345 / 148,486**");

// ③ §10.5 视频口径
rep("§10.5 视频",
  "- **Demo 视频的如实边界**：现行提交视频为 `demo-video-20261111.mp4`（**79.4 秒 / 1920×1080 / 30fps / 2383 帧**，32,395,249 B，sha256 `c8e2b50914f9c1da205f7c80c60de11c02a47f5caef8b51de1a84a017bd73f29`，2026-11-12 **第七次重录**，取自定版构建 `index-CLZViSiW.js`）",
  "- **Demo 视频的如实边界**：现行提交视频为 `demo-video-20261111.mp4`（**87.7 秒 / 1920×1080 / 30fps / 2632 帧**，29,199,693 B，sha256 `30b3bfdeebea4f7abafea41a9e97ba4e5c75bd913ea9cb923562f2d9af6db8db`，2026-11-12 **第八次重录**，取自定版构建 `index-CLZViSiW.js`；首页背景已换为**自制**的霓虹街道实拍）");

// ④ §13 交付物
rep("§13 视频",
  "| Demo 视频（提交用） | `docs/demo-video-20261111.mp4`（**79.4 秒 / 30fps / 1920×1080 / 2383 帧**，32,395,249 B） | **现行版**：2026-11-12 **第七次重录**，取自定版构建 `index-CLZViSiW.js` 全页合成",
  "| Demo 视频（提交用） | `docs/demo-video-20261111.mp4`（**87.7 秒 / 30fps / 1920×1080 / 2632 帧**，29,199,693 B） | **现行版**：2026-11-12 **第八次重录**，取自定版构建 `index-CLZViSiW.js` 全页合成");
rep("§13 Demo 行",
  "含阶段 A–G 八个新系统 + 骨骼与动作重做 + 手感/演出/声音三块补做的全量）：**48/48 个交付文件实测全部取到 200**",
  "含阶段 A–G 八个新系统 + 骨骼与动作重做 + 手感/演出/声音三块补做的全量）：**48/48 个交付文件实测全部取到 200**，交付包体积 **13.35 MB**（首页背景改自制后由 21.48 MB 降下来）");

// ⑤ §10.8 更正
rep("§10.8 更正",
  "**已按 §4 统一重跑**：定版构建 `index-CLZViSiW.js` → Demo 视频**第七次重录**（79.4 秒 / 2383 帧，含骨骼动作、武器相撞、武器拖尾与正确描边）",
  "**已按 §4 统一重跑**：定版构建 `index-CLZViSiW.js` → Demo 视频**第八次重录**（87.7 秒 / 2632 帧，含骨骼动作、武器相撞、武器拖尾与正确描边；首页背景已换为自制实拍）");

// ⑥ 资产清单：视频
rep("资产清单",
  "- **场景**：玩法空间 / 店铺立面 / 地面 / 碰撞为 100% 程序化几何",
  "- **首页背景视频**：`public/bg/title.mp4` = **本项目自制**（游戏自己的霓虹街道 3D 场景实拍，17.3 秒 / 1280×720 / 192 KB，脚本 `scripts/lux3d/capture-title-bg.mjs`），零第三方素材、零水印\n- **场景**：玩法空间 / 店铺立面 / 地面 / 碰撞为 100% 程序化几何");

writeFileSync(FILE, text, "utf8");
console.log(`已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }
console.log("✓ 全部匹配并写入");
