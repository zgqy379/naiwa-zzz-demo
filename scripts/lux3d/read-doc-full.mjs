// 读取飞书《参赛选手手册》全文（虚拟滚动 → 分段抓取）。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const OUT = "E:/naiwa-zzz/docs/赛事手册-参赛选手手册.md";
const URL = process.argv[2] || "https://zhangqi.feishu.cn/docx/LQXOdudK5o4Mq9xsx83c5Doznof";

async function main() {
  const task = await taskSpace("naiwa-doc-read");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  try { await p.goto(URL, { waitUntil: "commit", timeout: 60000 }); } catch { /* noop */ }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 10000));

  const chunks = [];
  const seen = new Set();
  for (let step = 0; step < 120; step++) {
    const t = await p.evaluate(`(() => {
      const el = document.scrollingElement || document.documentElement;
      return (document.body.innerText || "").replace(/\\n{3,}/g, "\\n\\n");
    })()`).catch(() => "");
    if (t) {
      // 按段落去重累积
      for (const para of t.split("\n")) {
        const k = para.trim();
        if (k && !seen.has(k)) { seen.add(k); chunks.push(k); }
      }
    }
    // 飞书文档的滚动容器是内层 div（不是 documentElement）→ 找 scrollHeight 最大的那个
    const moved = await p.evaluate(`(() => {
      let best = null, bestH = 0;
      for (const e of document.querySelectorAll("div,main,section")) {
        const h = e.scrollHeight - e.clientHeight;
        if (h > bestH) { bestH = h; best = e; }
      }
      const el = best || (document.scrollingElement || document.documentElement);
      const before = el.scrollTop;
      el.scrollTop = before + 620;
      return { before, after: el.scrollTop, max: bestH };
    })()`).catch(() => null);
    await new Promise((r) => setTimeout(r, 380));
    if (moved && moved.before === moved.after) break;
  }

  const text = chunks.join("\n");
  await fs.writeFile(OUT, "# 2026 群核空间智能黑客松 · 参赛选手手册（官方，飞书）\n\n来源：https://zhangqi.feishu.cn/docx/LQXOdudK5o4Mq9xsx83c5Doznof\n抓取时间：2026-11-13（只读访问，用于对齐交付清单）\n\n---\n\n" + text, "utf8");
  console.log("已抓取段落 " + chunks.length + " 条，字符 " + text.length + " → " + OUT);

  // 关键片段
  const keys = ["积分", "额度", "交付", "清单", "提交", "绑定", "动画", "骨骼", "版权", "授权", "署名", "原创", "禁止", "必须", "红线"];
  console.log("\n=== 命中关键词的段落 ===");
  chunks.forEach((c) => {
    if (keys.some((k) => c.includes(k)) && c.length > 6) console.log("  • " + c.slice(0, 240));
  });
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
