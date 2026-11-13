import { readFileSync, writeFileSync } from "node:fs";
const F = "docs/报告书.md";
let t = readFileSync(F, "utf8");
const A = "⑥E2E **33/33** 全绿、lint 0；⑦**官网提交第 8 版**（平台编号，2026-11-13 15:56，状态「已提交 · 作品已进入资格与完整性审核」），魔搭 master `0835058` / gh-pages `b17d2f9` 双通道 47/47 文件实测 200 |";
const B = "⑥E2E **33/33** 全绿、lint 0 |";
const C = "2026-11-13 部署 `index-CRaKQLgy.js` 定版（魔搭 master `0835058` / gh-pages `b17d2f9`，**47 个交付文件**";
const D = "2026-11-13 部署 `index-CRaKQLgy.js` 定版（魔搭 master，**47 个交付文件**";
let n = 0;
if (t.includes(A)) { t = t.replace(A, B); n++; }
if (t.includes(C)) { t = t.replace(C, D); n++; }
writeFileSync(F, t, "utf8");
console.log("已回退 " + n + " 处（保持仓库 PDF 与官网已上传那份一致）");
