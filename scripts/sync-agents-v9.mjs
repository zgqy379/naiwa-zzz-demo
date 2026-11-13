import { readFileSync, writeFileSync } from "node:fs";

const F = "AGENTS.md";
let t = readFileSync(F, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!t.includes(from)) { fails.push(label); return; }
  t = t.replace(from, to); ok++;
}

// §7 线上站点（第九版，部署后回填 commit）
rep("§7 线上",
  "- 线上站点已是 2026-11-13 定版（**第八次重录后的统一收口构建：阶段 A–G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 首页背景自制**）：入口 `index-CLZViSiW.js`（1,024,950 B，sha256 前 16 位 `0DFE74C3908456C8`）+ CSS `index-BnIDec0l.css`（53,151 B，`E9056643B6D1168B`）；备用直连 `https://zgqy379.github.io/naiwa-zzz-demo/`（gh-pages）同版；**48 个交付文件 / 13.35 MB** GET 全部 200",
  "- 线上站点已是 2026-11-13 定版（**第九次重录后的统一收口构建：阶段 A–G 八个系统 + 骨骼与动作重做 + 手感/演出/声音三块补做 + 首页背景自制 + 奶蛙 IP 形体与自研 rest 姿态校正**）：入口 `index-CRaKQLgy.js`（1,025,029 B，sha256 前 16 位 `EFAA134DD4D5E58E`）+ CSS `index-BnIDec0l.css`（53,151 B，`E9056643B6D1168B`）；备用直连 `https://zgqy379.github.io/naiwa-zzz-demo/`（gh-pages）同版；**47 个交付文件 / 14.22 MB** GET 全部 200");

// §7 新增两条最容易再踩的坑
rep("§7 新增坑",
  "- **首页背景视频已自制**（2026-11-13）：",
  `- **官方「动画重定向」的骨架 ≠「自动绑骨」的骨架**（2026-11-13 实测，本轮最隐蔽的一类坑）：retarget 会**重新导出模型**（顶点数 18355→19566），骨架 rest 姿态随之改变（Hips 位移差 0.08 / 躯干角差 2~5° / 手指角差最多 73°），且官方把片段**烘焙成源角色骨架的绝对局部旋转** → 共享动画库直接套到别的角色上会**躺倒**（小幅片段 Idle/Walk 勉强站得住，大幅片段挥击/翻滚直接趴下）。正解：用**世界空间 delta 法**把片段换算到每只角色自己的骨架（\`scripts/lux3d/apply-rest-correction.mjs\`，零 API 积分）。**不要再试图用「共享库」省体积**——除非所有角色的骨架 rest 姿态逐骨骼完全一致（实测不成立）。
- **官方 Lux3D 积分已耗尽**（2026-11-13）：余额 10 积分，本轮 16 只重建 + 动画共消耗 2763 积分（文生 3D 13/只 + 绑骨 15/只 + 重定向 6/动作）。按官方手册：**每日登录魔搭社区可领 250 魔粒值**、主办方另发 250、报名 300/人 + 组队 3000/队，**所有算力积分于 11-19 23:59 过期**。需要更多积分时：\`https://lux3d.aholo3d.cn/pricing\` 有「Pro ¥21.9/月 = 300 积分」与「积分增购」（Free 套餐仅 5 次 Lux3D 免费试用）。
- **首页背景视频已自制**（2026-11-13）：`);

writeFileSync(F, t, "utf8");
console.log(`已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }
console.log("✓ AGENTS.md §7 已同步第九版");
