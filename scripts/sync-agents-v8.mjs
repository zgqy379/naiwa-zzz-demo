import { readFileSync, writeFileSync } from "node:fs";

const F = "AGENTS.md";
let t = readFileSync(F, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!t.includes(from)) { fails.push(label); return; }
  t = t.replace(from, to); ok++;
}

// §7：线上站点口径（第八版）
rep("§7 线上",
  "- 线上站点已是 2026-11-12 定版（**第七次重录后的统一收口构建：阶段 A–G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做**）：入口 `index-CLZViSiW.js`（1,024,950 B，sha256 前 16 位 `0DFE74C3908456C8`）+ CSS `index-BnIDec0l.css`（53,151 B，`E9056643B6D1168B`）；备用直连 `https://zgqy379.github.io/naiwa-zzz-demo/`（gh-pages）同版；**48 个交付文件** GET 全部 200，入口 / 主 JS / CSS / `bg/title.mp4` / `fonts/LICENSES.txt` **五项关键文件与本仓 `dist/` 逐字节一致**（HEAD 一律 403 不可用作判据；魔搭 `index.html` 为 301→根路径 200），旧构建 `assets/index-C6e6LaWv.js` 已 404 下线。**原 workbuddy 地址已失效**（只返回引用旧构建 `index-iKSx0O26.js` 的壳页，静态资源全 403），不再作为备用。**当前 `src/`、线上构建、Demo 视频、§十 插图、报告书五者同版**。",
  "- 线上站点已是 2026-11-13 定版（**第八次重录后的统一收口构建：阶段 A–G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 首页背景自制**）：入口 `index-CLZViSiW.js`（1,024,950 B，sha256 前 16 位 `0DFE74C3908456C8`）+ CSS `index-BnIDec0l.css`（53,151 B，`E9056643B6D1168B`）；备用直连 `https://zgqy379.github.io/naiwa-zzz-demo/`（gh-pages）同版；**48 个交付文件 / 13.35 MB** GET 全部 200，入口 / 主 JS / CSS / `bg/title.mp4` / `fonts/LICENSES.txt` **五项关键文件与本仓 `dist/` 逐字节一致**（HEAD 一律 403 不可用作判据；魔搭 `index.html` 为 301→根路径 200），旧构建已 404 下线。**原 workbuddy 地址已失效**（只返回引用旧构建 `index-iKSx0O26.js` 的壳页，静态资源全 403），不再作为备用。**当前 `src/`、线上构建、Demo 视频、§十 插图、报告书五者同版**。\n- **首页背景视频已自制**（2026-11-13）：`public/bg/title.mp4` = 用游戏自己的霓虹街道 3D 场景实拍（`scripts/lux3d/capture-title-bg.mjs`，17.3 秒 / 1280×720 / **192 KB**），**零第三方素材、零水印、零第三方账号标识**——原第三方短视频素材（含抖音水印与账号 ID）的**授权缺口与 IP 不一致同时消除**。重拍标题背景时务必用该脚本，不要再引入外部视频素材。");

writeFileSync(F, t, "utf8");
console.log(`已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }
console.log("✓ AGENTS.md §7 已同步第八版");
