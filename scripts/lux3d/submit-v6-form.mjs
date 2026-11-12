// 官网提交第 6 版（真实浏览器 ego，脚本驱动）。
// 步骤：①打开「我的参赛 → 我的作品」②进入修改提交 ③填 Demo / 上传报告书 PDF / 源码链接
//       ④按需处理社交链接 ⑤**停在最终提交前**（提交是真实账号动作，需制作人确认）
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const PDF = "E:/naiwa-zzz/docs/report.pdf";
const DEMO_URL = "https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo";
const SRC_URL = "https://github.com/zgqy379/naiwa-zzz-demo/tree/main";

const log = [];
const note = (s) => { log.push(s); console.log(s); };

const DUMP = `(() => {
  const t = (document.body.innerText||"").replace(/\\n{3,}/g,"\\n\\n");
  const inputs = [...document.querySelectorAll("input,textarea")].map((i,idx)=>({
    idx, tag: i.tagName, type: i.type||"", name: i.name||i.id||"",
    ph: (i.placeholder||"").slice(0,40), val: (i.value||"").slice(0,120),
    checked: i.checked, visible: i.offsetParent!==null,
  }));
  const btns = [...document.querySelectorAll("button,a,[role='button']")]
    .filter(b=>b.offsetParent!==null)
    .map(b=>({ text:(b.innerText||"").replace(/\\s+/g," ").trim().slice(0,26), tag:b.tagName }));
  const files = [...document.querySelectorAll("input[type=file]")].map((f,i)=>({ i, name:f.name||f.id||"", accept:f.accept||"" }));
  const labels = [...document.querySelectorAll("label")].map(l=>(l.innerText||"").replace(/\\s+/g," ").trim().slice(0,40)).filter(Boolean);
  return {
    url: location.href.slice(0,140), title:(document.title||"").slice(0,60),
    text: t.slice(0, 2600),
    inputs, btns: [...new Map(btns.map(b=>[b.text,b])).values()].slice(0,40),
    files, labels: labels.slice(0,30),
  };
})()`;

async function main() {
  const task = await taskSpace("naiwa-submit-v6");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  try { await p.goto("https://www.aholo3d.cn/hackathon/my", { waitUntil: "commit", timeout: 60000 }); } catch { note("goto 超时，继续"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 9000));

  const d0 = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 90) }));
  note("=== 页面初始 ===");
  note("  url = " + (d0.url || d0.err));
  note("  按钮: " + (d0.btns || []).map((b) => b.text).join(" | "));
  note("  文本片段: " + String(d0.text || "").split("\n").slice(0, 14).join(" / "));
  await p.screenshot({ path: SHOTS + "/v6-0-list.png" });

  // 找到「我的作品」并进入
  const opened = await p.evaluate(`(() => {
    const el = [...document.querySelectorAll("button,a,[role='button'],div,span")]
      .find(e => (e.innerText||"").trim() === "我的作品" || (e.innerText||"").trim() === "修改提交");
    if (!el) return "not-found";
    (el.closest("button,a,[role='button']") || el).click();
    return "clicked:" + (el.innerText||"").trim();
  })()`);
  note("  进入作品页 = " + opened);
  await new Promise((r) => setTimeout(r, 7000));

  const d1 = await p.evaluate(DUMP).catch((e) => ({ err: String(e).slice(0, 90) }));
  note("=== 作品页 ===");
  note("  按钮: " + (d1.btns || []).map((b) => b.text).join(" | "));
  note("  输入框:");
  (d1.inputs || []).forEach((i) => note("    [" + i.idx + "] " + i.tag + " " + i.type + " name=" + i.name + " ph=" + i.ph + " val=" + JSON.stringify(i.val)));
  note("  文件输入: " + JSON.stringify(d1.files));
  await p.screenshot({ path: SHOTS + "/v6-1-work.png" });

  await fs.writeFile(SHOTS + "/v6-form.json", JSON.stringify({ d0, d1, log }, null, 2), "utf8");
  note("done-dump");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
