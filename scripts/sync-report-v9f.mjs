import { readFileSync, writeFileSync } from "node:fs";
const F = "docs/报告书.md";
let t = readFileSync(F, "utf8");
let ok = 0; const fails = [];
function rep(label, from, to) {
  if (!t.includes(from)) { fails.push(label); return; }
  t = t.replace(from, to); ok++;
}
rep("时间线 提交",
  "⑥E2E **33/33** 全绿、lint 0 |",
  "⑥E2E **33/33** 全绿、lint 0；⑦**官网提交第 8 版**（平台编号，2026-11-13 15:56，状态「已提交 · 作品已进入资格与完整性审核」），魔搭 master `0835058` / gh-pages `b17d2f9` 双通道 47/47 文件实测 200 |");
rep("§13 Demo 行 hash",
  "2026-11-13 部署 `index-CRaKQLgy.js` 定版（魔搭 master，**47 个交付文件**",
  "2026-11-13 部署 `index-CRaKQLgy.js` 定版（魔搭 master `0835058` / gh-pages `b17d2f9`，**47 个交付文件**");
writeFileSync(F, t, "utf8");
console.log(`已替换 ${ok} 处`);
if (fails.length) { console.log("✗ 未匹配：" + fails.join(" | ")); process.exit(1); }
console.log("✓ 全部匹配并写入");
