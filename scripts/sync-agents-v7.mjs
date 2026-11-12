import { readFileSync, writeFileSync } from "node:fs";

const F = "AGENTS.md";
let t = readFileSync(F, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!t.includes(from)) { fails.push(label); return; }
  t = t.replace(from, to); ok++;
}

rep("§7 线上站点",
  "- 线上站点已是 2026-11-12 定版（**第四次重录后的统一收口构建，已并入阶段 A–G 八个系统**）：魔搭 master `d44ca9f`，入口 `index-C6e6LaWv.js`（1,011,164 B，sha256 前 16 位 `EB060AB7F155E887`）；备用直连 `https://zgqy379.github.io/naiwa-zzz-demo/`（gh-pages `f90cc29`）同版；**34 个交付文件** GET/Range 全部 200/206，入口 / 主 JS / CSS / `bg/title.mp4` / `fonts/LICENSES.txt` **五项关键文件与本仓 `dist/` 逐字节一致**（HEAD 一律 403 不可用作判据；魔搭 `index.html` 为 301→根路径 200）。**原 workbuddy 地址已失效**（只返回引用旧构建 `index-iKSx0O26.js` 的壳页，静态资源全 403），不再作为备用。**当前 `src/`、线上构建、Demo 视频、§十 插图、报告书五者同版**。",
  "- 线上站点已是 2026-11-12 定版（**第七次重录后的统一收口构建：阶段 A–G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做**）：入口 `index-CLZViSiW.js`（1,024,950 B，sha256 前 16 位 `0DFE74C3908456C8`）+ CSS `index-BnIDec0l.css`（53,151 B，`E9056643B6D1168B`）；备用直连 `https://zgqy379.github.io/naiwa-zzz-demo/`（gh-pages）同版；**48 个交付文件** GET 全部 200，入口 / 主 JS / CSS / `bg/title.mp4` / `fonts/LICENSES.txt` **五项关键文件与本仓 `dist/` 逐字节一致**（HEAD 一律 403 不可用作判据；魔搭 `index.html` 为 301→根路径 200），旧构建 `assets/index-C6e6LaWv.js` 已 404 下线。**原 workbuddy 地址已失效**（只返回引用旧构建 `index-iKSx0O26.js` 的壳页，静态资源全 403），不再作为备用。**当前 `src/`、线上构建、Demo 视频、§十 插图、报告书五者同版**。");

rep("§7 冻结 tag",
  "- **冻结 tag `freeze-2026-11-11-final` 已被强制重指两次**（`eb074ff` → `95f74b9` → 统一收口提交）：每次重录/统一收口后都要重指并回填 `docs/submission.json` 的 `frozen_commit`。",
  "- **冻结 tag `freeze-2026-11-11-final` 已被强制重指多次**（`eb074ff` → `95f74b9` → 统一收口提交 → 第六版 → 第七版）：每次重录/统一收口后都要重指并回填 `docs/submission.json` 的 `frozen_commit`。\n- **官方绑骨模型的「局部单位 ≠ 世界单位」**（2026-11-12 实测，最隐蔽的一类 bug）：官方自动绑骨把网格写在**绑定空间**、绑定矩阵带缩放——奶蛙网格包围盒高 1.936 而蒙皮后实际高 0.314（差 **6.17 倍**），且**逐角色不同**（世界缩放 0.48~3.35）。凡是以模型局部单位表达的东西（**描边宽度**、**挂骨骼的道具**、粒子偏移）都必须先除以「累计世界缩放」（`src/core/scale.mjs`），否则会「变大变黑」而不是报错。修法与现象详见报告书 §2.3 第 ⑧ 条。\n- **武器是异步加载的**（晚于角色的 `applyNpr`）：挂上手骨后必须**单独补一次 `applyNpr`**，否则武器保留原始 `MeshPhysicalMaterial`，与角色的赛璐璐材质不一致，并让 E2E「NPR 材质生效」用例读到错误材质类型。");

writeFileSync(F, t, "utf8");
console.log(`已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }
console.log("✓ AGENTS.md §7 已同步");
