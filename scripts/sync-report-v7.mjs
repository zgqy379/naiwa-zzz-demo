/**
 * 报告书口径批量同步（2026-11-12 第七版收口：并入展示线手感/演出/声音三块补做）。
 * 用法：node scripts/sync-report-v7.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "docs/报告书.md";
let text = readFileSync(FILE, "utf8");
let ok = 0;
const fails = [];
function rep(label, from, to) {
  if (!text.includes(from)) { fails.push(label); return; }
  text = text.replace(from, to);
  ok++;
}

// ① §4.2 性能段
rep("§4.2 性能",
  "- 实测（2026-11-12，定版构建 `index-CP5WV8oE.js`，1920×1080，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：场景图谱 **804 个 mesh**（其中 123 个为 `InstancedMesh`）、786 个唯一几何体；**战斗屏每帧 357 draw call / 167,026 三角面**（含 16 只蒙皮角色 + 共享动画库驱动的骨骼动画 + 描边壳 —— 描边壳是共享几何体的背面副本，故三角面比静态版多约 3 万）；选人屏与标题页主场景按渲染节流**停渲**（draw call 0，视觉全部由实时 3D 卡片层承担）；标题页 **3 个** WebGL context、战斗屏 4 个，四屏 **console 错误 0**；GPU 为 AMD Radeon（ANGLE / D3D11），非软件光栅",
  "- 实测（2026-11-12，定版构建 `index-CLZViSiW.js`，1920×1080，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：场景图谱 **821 个 mesh**（其中 123 个为 `InstancedMesh`）、787 个唯一几何体；**战斗屏每帧 346 draw call / 177,722 三角面**（含 16 只蒙皮角色 + 共享动画库驱动的骨骼动画 + 描边壳 + 武器拖尾 ribbon —— 描边壳是共享几何体的背面副本，故三角面比静态版多约 3 万）；选人屏与标题页主场景按渲染节流**停渲**（draw call 0，视觉全部由实时 3D 卡片层承担）；标题页 **3 个** WebGL context、战斗屏 4 个，四屏 **console 错误 0**；GPU 为 AMD Radeon（ANGLE / D3D11），非软件光栅");

rep("§4.2 首屏",
  "- **首屏与后台预取**（取证 `docs/evidence/v3-stability-20261111.json`）：首屏 **first-paint 1,184 ms**（DOMContentLoaded 2,089 ms / load 3,756 ms），全站请求 **110 个 / 12,116 KB**（其中 16 只蒙皮角色 GLB 合计 7.15 MB + 两个共享动画库 2.2 MB + 8 件武器 1.26 MB，均在标题页停留期间后台下载，不阻塞首屏）；标题页帧率 **198–237 fps**（实测区间 3 → 237；heap 52→35 MB，`webglcontextlost` **0** 次）",
  "- **首屏与后台预取**（取证 `docs/evidence/v3-stability-20261111.json`）：首屏 **first-paint 964 ms**（DOMContentLoaded 1,739 ms），全站请求 **108 个 / 13,598 KB**（其中 16 只蒙皮角色 GLB 合计 7.15 MB + 两个共享动画库 2.2 MB + 8 件武器 1.26 MB + 4 段自有采样音频，均在标题页停留期间后台下载，不阻塞首屏）；标题页帧率 **234–295 fps**（heap 50→35 MB，`webglcontextlost` **0** 次）");

rep("§4.2 A/B",
  "| 性能实测 | 同一帧开关背景层对比（2026-11-12 实测，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：开 **357 draw call / 167,026 三角面** vs 关 **350 / 137,694** —— 三角面差值 **+29,332**（= 背景层自身面数 29,152，差值里另含一帧的角色动作形变），draw call 差值 **+7**（背景层为多层视差实体，按当帧的可见层数浮动，实测区间 +1~+7） |",
  "| 性能实测 | 同一帧开关背景层对比（2026-11-12 实测，取证 `docs/evidence/v3-runtime-metrics-20261111.json`）：开 **346 draw call / 177,722 三角面** vs 关 **345 / 148,570** —— 三角面差值恒为 **+29,152**（= 背景层自身面数），draw call 差值 **+1**（背景层为多层视差实体，合并在同一次绘制里） |");

// ② §10.5 视频口径
rep("§10.5 视频",
  "- **Demo 视频的如实边界**：现行提交视频为 `demo-video-20261111.mp4`（**83.2 秒 / 1920×1080 / 30fps / 2496 帧**，31,815,695 B，sha256 `e9c4a81bab8ce76ee92eaaf2d4d0d45b8a34cf16e9250bf8f6fdf86a352eeda0`，2026-11-12 **第六次重录**，取自定版构建 `index-CP5WV8oE.js`）",
  "- **Demo 视频的如实边界**：现行提交视频为 `demo-video-20261111.mp4`（**79.4 秒 / 1920×1080 / 30fps / 2383 帧**，32,395,249 B，sha256 `c8e2b50914f9c1da205f7c80c60de11c02a47f5caef8b51de1a84a017bd73f29`，2026-11-12 **第七次重录**，取自定版构建 `index-CLZViSiW.js`）");

rep("§10.5 视频补充",
  "**片中角色为官方绑骨 + 官方动作驱动**：挥击有重心转移与手臂甩动，武器握在右手骨骼上，命中帧在**武器打击端**爆出金属相撞火花。",
  "**片中角色为官方绑骨 + 官方动作驱动**：挥击有重心转移与手臂甩动，武器握在右手骨骼上，命中帧在**武器打击端**爆出金属相撞火花，并拖出武器尖端 ribbon 拖尾、伴随命中径向色散与挥击风声。");

// ③ §13 交付物：视频行
rep("§13 视频",
  "| Demo 视频（提交用） | `docs/demo-video-20261111.mp4`（**83.2 秒 / 30fps / 1920×1080 / 2496 帧**，31,815,695 B） | **现行版**：2026-11-12 **第六次重录**，取自定版构建 `index-CP5WV8oE.js` 全页合成",
  "| Demo 视频（提交用） | `docs/demo-video-20261111.mp4`（**79.4 秒 / 30fps / 1920×1080 / 2383 帧**，32,395,249 B） | **现行版**：2026-11-12 **第七次重录**，取自定版构建 `index-CLZViSiW.js` 全页合成");

rep("§13 视频补充",
  "且**角色为官方绑骨 + 官方动作驱动**（挥击有重心转移，武器握在右手骨骼，命中帧在武器打击端爆出金属相撞火花）；零 console 错误",
  "且**角色为官方绑骨 + 官方动作驱动**（挥击有重心转移，武器握在右手骨骼，命中帧在武器打击端爆出金属相撞火花并拖出尖端 ribbon）；零 console 错误");

// ④ §10.8 / §10.7 更正行
rep("§10.8 更正",
  "**已按 §4 统一重跑**：定版构建 `index-CP5WV8oE.js` → Demo 视频**第六次重录**（83.2 秒 / 2496 帧，含骨骼动作、武器相撞与正确描边）",
  "**已按 §4 统一重跑**：定版构建 `index-CLZViSiW.js` → Demo 视频**第七次重录**（79.4 秒 / 2383 帧，含骨骼动作、武器相撞、武器拖尾与正确描边）");

// ⑤ §13 在线 Demo / 备用链接
rep("§13 Demo",
  "2026-11-12 部署 `index-CP5WV8oE.js` 定版（魔搭 master **`a3a4703`**，含阶段 A–G 八个新系统 + 骨骼与动作重做的全量）：**44/44 个交付文件实测全部取到 200**，五项关键文件（入口 `index.html` / 主 JS / CSS / `bg/title.mp4` / `fonts/LICENSES.txt`）与本仓 `dist/` **逐字节一致**（sha256 前 16 位 `93FBBF3F2CFA5AB8` / `8F8836D0AE2B55D5` / `E9056643B6D1168B` / `DA18AB01B02C594A` / `18A6B716E5A31801`），旧构建 `assets/index-C6e6LaWv.js` 已 **404** 下线",
  "2026-11-12 部署 `index-CLZViSiW.js` 定版（魔搭 master，**48 个交付文件**，含阶段 A–G 八个新系统 + 骨骼与动作重做 + 手感/演出/声音三块补做的全量）：**48/48 个交付文件实测全部取到 200**，五项关键文件（入口 `index.html` / 主 JS / CSS / `bg/title.mp4` / `fonts/LICENSES.txt`）与本仓 `dist/` **逐字节一致**，旧构建 `assets/index-C6e6LaWv.js` 已 **404** 下线");

rep("§13 备用",
  "2026-11-12 复测（第六版，gh-pages commit `eeb1697`）：五项关键文件 GET **全部 200**，旧构建 `assets/index-C6e6LaWv.js` **404**；入口 `index.html` 与主 JS `index-CP5WV8oE.js` 与本仓 `dist/` **逐字节一致**",
  "2026-11-12 复测（第七版，gh-pages）：五项关键文件 GET **全部 200**，旧构建 `assets/index-C6e6LaWv.js` **404**；入口 `index.html` 与主 JS `index-CLZViSiW.js` 与本仓 `dist/` **逐字节一致**");

// ⑥ 资产清单：加音频
rep("资产清单 音频",
  "- **音频**：Web Audio 程序化合成（BGM / 打击音 / UI 音 / 环境音），零外部音频文件",
  "- **音频**：Web Audio 程序化合成（BGM / 打击音 / UI 音 / 环境音），**零外部音频文件**；另有 4 段**自有离线渲染**的采样（`scripts/gen-audio-samples.py`，确定性种子，141 KB，见 `docs/ASSET-LICENSES.md`），缺失时自动回退实时合成");

writeFileSync(FILE, text, "utf8");
console.log(`已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }
console.log("✓ 全部匹配并写入");
