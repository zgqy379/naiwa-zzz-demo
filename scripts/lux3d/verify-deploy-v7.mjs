/**
 * 部署验收（轻量版）：逐文件 GET/HEAD 检查状态码 + 五项关键文件逐字节一致。
 * 用法：node scripts/lux3d/verify-deploy-v7.mjs [magaspace|gh]
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const which = process.argv[2] || "magaspace";
const BASE = which === "gh"
  ? "https://zgqy379.github.io/naiwa-zzz-demo"
  : "https://zgqy379-naiwa-zero-demo.ms.show";

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, base, out);
    else out.push(path.relative(base, f).replace(/\\/g, "/"));
  }
  return out;
}

const files = walk(DIST).sort();
const KEY = /^(index\.html|assets\/index-[^/]+\.js|assets\/index-[^/]+\.css|bg\/title\.mp4|fonts\/LICENSES\.txt)$/;

let ok = 0; const bad = [];
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 240000);
for (const f of files) {
  try {
    const r = await fetch(`${BASE}/${f}`, { signal: ctrl.signal, redirect: "follow" });
    const buf = Buffer.from(await r.arrayBuffer());
    if (r.status === 200) {
      ok++;
      if (KEY.test(f)) {
        const local = createHash("sha256").update(readFileSync(path.join(DIST, f))).digest("hex").slice(0, 16).toUpperCase();
        const remote = createHash("sha256").update(buf).digest("hex").slice(0, 16).toUpperCase();
        console.log(`  ${f.padEnd(32)} local=${local} remote=${remote} ${local === remote ? "✓逐字节一致" : "✗不一致"} (${buf.length} B)`);
      }
    } else bad.push(`${f}:${r.status}`);
  } catch (e) {
    bad.push(`${f}:ERR`);
  }
}
clearTimeout(timer);
console.log(`\n[${which}] ${BASE}\n  ${ok}/${files.length} 取到 200` + (bad.length ? `  失败: ${bad.slice(0, 8).join(", ")}` : "  全部 200"));
for (const old of ["assets/index-C6e6LaWv.js", "assets/index-CP5WV8oE.js"]) {
  try {
    const r = await fetch(`${BASE}/${old}`, { redirect: "follow" });
    console.log(`  旧构建 ${old} => ${r.status}（应为 404/非 200）`);
  } catch { console.log(`  旧构建 ${old} => ERR`); }
}
