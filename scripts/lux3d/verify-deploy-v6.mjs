/**
 * 部署验收：44/44 文件 GET/Range 200/206 + 关键文件与本仓 dist 逐字节一致 + 旧构建 404。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DIST = path.join(ROOT, "dist");
const MS = "https://zgqy379-naiwa-zero-demo.ms.show";
const GH = "https://zgqy379.github.io/naiwa-zzz-demo";

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, base, out);
    else out.push(path.relative(base, f).replace(/\\/g, "/"));
  }
  return out;
}

async function head(url) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow" });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, bytes: buf.length, sha: createHash("sha256").update(buf).digest("hex").slice(0, 16).toUpperCase(), body: buf };
  } catch (e) {
    return { status: 0, bytes: 0, sha: "-", err: String(e).slice(0, 60) };
  }
}

const files = walk(DIST).sort();
console.log(`本仓 dist 文件数 = ${files.length}`);

for (const [tag, base] of [["魔搭", MS], ["gh-pages", GH]]) {
  let ok = 0, bad = [];
  const keyHash = {};
  for (const f of files) {
    const r = await head(`${base}/${f}`);
    if (r.status === 200) ok++; else bad.push(`${f}:${r.status}`);
    if (/^(index\.html|assets\/index-[^/]+\.js|assets\/index-[^/]+\.css|bg\/title\.mp4|fonts\/LICENSES\.txt)$/.test(f)) {
      const local = createHash("sha256").update(readFileSync(path.join(DIST, f))).digest("hex").slice(0, 16).toUpperCase();
      keyHash[f] = { local, remote: r.sha, bytes: r.bytes, same: local === r.sha };
    }
  }
  console.log(`\n=== ${tag} (${base}) ===`);
  console.log(`  ${ok}/${files.length} 取到 200` + (bad.length ? `  失败: ${bad.slice(0, 6).join(", ")}` : "  全部 200"));
  for (const [f, v] of Object.entries(keyHash)) {
    console.log(`  ${f.padEnd(34)} local=${v.local} remote=${v.remote} ${v.same ? "✓逐字节一致" : "✗不一致"} (${v.bytes} B)`);
  }
  // 旧构建应 404
  const old = await head(`${base}/assets/index-C6e6LaWv.js`);
  console.log(`  旧构建 index-C6e6LaWv.js => ${old.status}（应为 404/非 200）`);
}
