// 官网提交第 6 版：填表 + 上传新 PDF + 勾确认框 + 点「提交新版本」+ 取回执
// 制作人已确认执行（2026-11-12 20:4x）。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const PDF = "E:/naiwa-zzz/docs/report.pdf";
const DEMO_URL = "https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo";
const SRC_URL = "https://github.com/zgqy379/naiwa-zzz-demo/tree/main";

const log = [];
const note = (s) => { log.push(s); console.log(s); };

const STATE = `(() => {
  const q = (s) => document.querySelector(s);
  const rad = (n) => [...document.querySelectorAll("input[type=radio][name='"+n+"']")].map(r=>r.value+(r.checked?"*":""));
  const g = (s) => { const e=q(s); return e ? (e.value||"") : "(no-el)"; };
  return {
    dv: rad("dv"), reportMode: rad("reportMode"), repoMode: rad("repoMode"),
    link: g("input[name=link]"), social: g("input[name=social]"), repo: g("input[name=repo]"),
    lux: q("input[name=lux]")?.checked ?? null,
    notice: q("input[name=notice]")?.checked ?? null,
    tracks: [...document.querySelectorAll("input[type=checkbox]")].filter(c=>["GAME","SPATIAL_DESIGN"].includes(c.value)).map(c=>c.value+(c.checked?"=ON":"=off")),
    fileText: (document.body.innerText.match(/report\\.pdf[^\\n]*/) || [""])[0],
    body: (document.body.innerText||"").replace(/\\n{3,}/g,"\\n\\n").slice(-1400),
  };
})()`;

async function main() {
  const task = await taskSpace("naiwa-submit-v6");
  const pages = await task.pages();
  for (const q of pages.slice(0, Math.max(0, pages.length - 1))) { try { await q.close(); } catch { /* noop */ } }
  let p = await task.newPage();

  try { await p.goto("https://www.aholo3d.cn/hackathon/my", { waitUntil: "commit", timeout: 60000 }); } catch { note("goto 超时"); }
  try { await p.cdp("Page.bringToFront"); } catch { /* noop */ }
  await new Promise((r) => setTimeout(r, 9000));

  await p.evaluate(`(() => {
    const el = [...document.querySelectorAll("button,a,[role='button'],div,span")].find(e => (e.innerText||"").trim() === "修改提交");
    if (el) (el.closest("button,a,[role='button']") || el).click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 8000));

  // ① 链接
  const links = await p.evaluate(`(() => {
    const set = (sel, val) => {
      const el = document.querySelector(sel); if (!el) return "no-el";
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return el.value;
    };
    return { link: set("input[name=link]", "${DEMO_URL}"), repo: set("input[name=repo]", "${SRC_URL}"), social: set("input[name=social]", "") };
  })()`);
  note("链接 = " + JSON.stringify(links));

  // ② 报告书切文件模式 + 上传
  await p.evaluate(`(() => { const r=document.querySelector("input[type=radio][name=reportMode][value='file']"); if(r) r.click(); return true; })()`);
  await new Promise((r) => setTimeout(r, 2500));
  const doc = await p.cdp("DOM.getDocument", { depth: 1 });
  const node = await p.cdp("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[type=file][name=reportFile]" });
  if (!node.nodeId) note("✗ 找不到 file input");
  else {
    await p.cdp("DOM.setFileInputFiles", { files: [PDF], nodeId: node.nodeId });
    note("PDF 已喂入");
    await new Promise((r) => setTimeout(r, 3500));
  }

  // ③ 勾确认框（须知框不持久化，提交瞬间必须勾）
  const ck = await p.evaluate(`(() => {
    const out = {};
    for (const n of ["lux","notice"]) {
      const c = document.querySelector("input[type=checkbox][name='"+n+"']");
      if (!c) { out[n]="no-el"; continue; }
      if (!c.checked) c.click();
      out[n]=c.checked;
    }
    for (const c of [...document.querySelectorAll("input[type=checkbox]")]) {
      if (["GAME","SPATIAL_DESIGN"].includes(c.value) && !c.checked) c.click();
    }
    return out;
  })()`);
  note("确认框 = " + JSON.stringify(ck));

  const pre = await p.evaluate(STATE);
  note("=== 提交前状态 ===");
  note(JSON.stringify(pre, null, 1));
  await p.screenshot({ path: SHOTS + "/v6-6-before-submit.png" });

  // ④ 点「提交新版本」
  note(">>> 点击「提交新版本」");
  const clicked = await p.evaluate(`(() => {
    const b = [...document.querySelectorAll("button")].find(x => (x.innerText||"").replace(/\\s+/g," ").trim() === "提交新版本");
    if (!b) return "no-button";
    b.click();
    return "clicked";
  })()`);
  note("点击结果 = " + clicked);

  await new Promise((r) => setTimeout(r, 6000));
  await p.screenshot({ path: SHOTS + "/v6-7-after-submit.png" });
  const post = await p.evaluate(STATE);
  note("=== 提交后状态 ===");
  note(JSON.stringify(post, null, 1));

  await fs.writeFile(SHOTS + "/v6-submit-result.json", JSON.stringify({ pre, post, log }, null, 2), "utf8");
  note("done");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
