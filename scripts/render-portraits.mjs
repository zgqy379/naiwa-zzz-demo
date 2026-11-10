// 离线批量渲染 16 只家族立绘 → public/portrait/<id>.png
// 页面里跑实时离屏渲染（portrait.mjs 的兜底路径），逐只取回 base64 落盘。
const fs = await import("node:fs/promises");

const task = await taskSpace("naiwa-portrait");
const page = task.page("p1");
await page.goto("http://127.0.0.1:5276/?t=" + Date.now(), { waitUntil: "commit", timeout: 30000 });
await page.waitForTimeout(7000);

const ids = await page.evaluate(() => window.__npr.squad.members.map((m) => ({ id: m.id, name: m.name })));
console.log("MEMBERS " + JSON.stringify(ids.map((x) => x.name)));

await page.evaluate(() => {
  window.__p = { __done: 0 };
  (async () => {
    const n = window.__npr;
    for (const m of n.squad.members) {
      try {
        window.__p[m.id] = await n.makePortrait(m, { size: 512, force: true });
      } catch (e) {
        window.__p["__err_" + m.id] = String((e && e.message) || e);
      }
      window.__p.__done++;
    }
    window.__p.__finished = true;
  })();
});

for (let i = 0; i < 40; i++) {
  const st = await page.evaluate(() => ({ done: window.__p.__done, fin: !!window.__p.__finished }));
  if (st.fin) break;
  await page.waitForTimeout(2500);
}

const OUT = "E:/naiwa-zzz/public/portrait";
await fs.mkdir(OUT, { recursive: true });
const report = [];
for (const { id, name } of ids) {
  const r = await page.evaluate((i) => ({ url: window.__p[i] || null, err: window.__p["__err_" + i] || null }), id);
  if (!r.url || !r.url.includes(",")) { report.push(`${name}:SKIP ${r.url || r.err || "no data"}`); continue; }
  const b64 = r.url.split(",")[1];
  await fs.writeFile(`${OUT}/${id}.png`, Buffer.from(b64, "base64"));
  report.push(`${name}:ok ${Math.round(b64.length * 0.75 / 1024)}KB`);
}
console.log("DONE " + JSON.stringify(report));
