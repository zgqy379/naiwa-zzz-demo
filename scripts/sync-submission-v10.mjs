import { readFileSync, writeFileSync } from "node:fs";

// ① 报告书：§13 部署 commit + 构建 hash
const R = "docs/报告书.md";
let t = readFileSync(R, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!t.includes(from)) { fails.push(label); return; }
  t = t.replace(from, to); ok++;
}
rep("§13 部署 commit",
  "2026-11-13 部署 `index-CDoGGTde.js` 定版（魔搭 master，**47 个交付文件**",
  "2026-11-13 部署 `index-CDoGGTde.js` 定版（魔搭 master `69c321a` / gh-pages `c1ac55f`，**47 个交付文件**");
writeFileSync(R, t, "utf8");
console.log(`报告书已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); }

// ② 台账
const F = "docs/submission.json";
const j = JSON.parse(readFileSync(F, "utf8"));
j.demo_url_note = j.demo_url_note
  .replace("**47/47 文件 GET 全部 200**", "**47/47 文件 GET 全部 200**（魔搭 master `69c321a` / gh-pages `c1ac55f`，入口 `index-CDoGGTde.js`）")
  .replace("主 JS assets/index-CLZViSiW.js 0DFE74C3908456C8", "主 JS assets/index-CDoGGTde.js 18D9BCABDB0AD822")
  .replace("主 JS assets/index-CRaKQLgy.js EFAA134DD4D5E58E", "主 JS assets/index-CDoGGTde.js 18D9BCABDB0AD822")
  .replace("入口 index.html 5BC2CE3504D461E3", "入口 index.html 490DC07D3B903EA8")
  .replace("旧构建 assets/index-C6e6LaWv.js 与 assets/index-CP5WV8oE.js 均已 404 下线", "旧构建 assets/index-C6e6LaWv.js / index-CP5WV8oE.js / index-CLZViSiW.js 均已 404 下线");
j.report_pdf_note = "2026-11-13 第十版报告书 PDF：docs/report.pdf，42 页 / 18,976,297 B，sha256 e9b15fb1c2f4524ce3f78dcc906b8a9a95b1d9a604a79eca64c2f9c6658314ae（中文可检索，内嵌图 14–17 骨骼与武器证据；新增 §3.6「战斗手感 v1」）。";
j.demo_url_note = j.demo_url_note.replace("战斗为手感 v1）", "战斗为手感 v1（对手 AI 状态机 / 强命中反馈 / 伤害节奏重平衡））");
writeFileSync(F, JSON.stringify(j, null, 2) + "\n", "utf8");
console.log("✓ 台账已同步第十版部署口径");
