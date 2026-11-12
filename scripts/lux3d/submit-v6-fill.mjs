// 官网提交第 6 版：填表（Demo 链接 / 上传新报告书 PDF / 源码链接 / 赛道与确认框）
// **停在「提交新版本」之前** —— 提交是真实账号动作，须制作人确认后再点。
import fs from "node:fs/promises";

const SHOTS = "C:/Users/dqy/AppData/Local/Temp/opencode/naiwa-audit-20261111/shots";
const PDF = "E:/naiwa-zzz/docs/report.pdf";
const DEMO_URL = "https://www.modelscope.cn/studios/zgqy379/naiwa-zero-demo";
const SRC_URL = "https://github.com/zgqy379/naiwa-zzz-demo/tree/main";

const log = [];
const note = (s) => { log.push(s); console.log(s); };

const STATE = `(() => {
  const q = (n) => document.querySelector(n);
  const rad = (name) => [...document.querySelectorAll("input[type=radio][name='" + name + "']")]
    .map(r => r.value + (r.checked ? "*" : ""));
  const cks = [...document.querySelectorAll("input[type=checkbox]")]
    .map(c => (c.name || c.value) + (c.checked ? "=ON" : "=off"));
  const g = (sel) => { const e = q(sel); return e ? (e.value || "") : "(no-el)"; };
  return {
    dv: rad("dv"), reportMode: rad("reportMode"), repoMode: rad("repoMode"),
    link: g("input[name=link]"), social: g("input[name=social]"), repo: g("input[name=repo]"),
    cks,
    lux: q("input[name=lux]")?.checked ?? null,
    notice: q("input[name=notice]")?.checked ?? null,
    hasFileInput: !!q("input[type=file][name=reportFile]"),
    fileName: q("input[type=file][name=reportFile]")?.files?.[0]?.name ?? null,
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

  // 进入修改提交
  const opened = await p.evaluate(`(() => {
    const el = [...document.querySelectorAll("button,a,[role='button'],div,span")]
      .find(e => (e.innerText||"").trim() === "修改提交");
    if (!el) return "not-found";
    (el.closest("button,a,[role='button']") || el).click();
    return "clicked";
  })()`);
  note("进入修改提交 = " + opened);
  await new Promise((r) => setTimeout(r, 8000));

  note("=== 初始状态 ===");
  note(JSON.stringify(await p.evaluate(STATE)));

  // ① Demo 链接（url 输入框用原生 setter + input 事件；React 受控）
  const setLink = await p.evaluate(`(() => {
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return "no-el";
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return el.value;
    };
    return { link: set("input[name=link]", "${DEMO_URL}"), repo: set("input[name=repo]", "${SRC_URL}"), social: set("input[name=social]", "") };
  })()`);
  note("链接写入 = " + JSON.stringify(setLink));

  // ② 报告书：切到「上传文件」模式
  const mode = await p.evaluate(`(() => {
    const r = document.querySelector("input[type=radio][name=reportMode][value='file']");
    if (!r) return "no-radio";
    r.click();
    return "clicked file mode";
  })()`);
  note("报告书模式 = " + mode);
  await new Promise((r) => setTimeout(r, 2500));

  // ③ 上传新 PDF（隐藏的 file input 用 CDP DOM.setFileInputFiles 喂）
  const doc = await p.cdp("DOM.getDocument", { depth: 1 });
  const q = await p.cdp("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[type=file][name=reportFile]" });
  if (!q.nodeId) { note("✗ 找不到 file input"); }
  else {
    await p.cdp("DOM.setFileInputFiles", { files: [PDF], nodeId: q.nodeId });
    note("PDF 已喂入 file input");
    await new Promise((r) => setTimeout(r, 3000));
  }

  // ④ 勾选确认框（须知勾选框不随草稿持久化，必须此刻勾上）
  const checks = await p.evaluate(`(() => {
    const want = ["lux", "notice"];
    const out = {};
    for (const n of want) {
      const c = document.querySelector("input[type=checkbox][name='" + n + "']");
      if (!c) { out[n] = "no-el"; continue; }
      if (!c.checked) c.click();
      out[n] = c.checked;
    }
    // 赛道：游戏应用奖 + 空间设计应用奖
    const tracks = [...document.querySelectorAll("input[type=checkbox]")].filter(c => ["GAME","SPATIAL_DESIGN"].includes(c.value));
    tracks.forEach(c => { if (!c.checked) c.click(); });
    out.tracks = [...document.querySelectorAll("input[type=checkbox]")].filter(c => ["GAME","SPATIAL_DESIGN"].includes(c.value)).map(c => c.value + (c.checked?"=ON":"=off"));
    return out;
  })()`);
  note("勾选 = " + JSON.stringify(checks));

  await new Promise((r) => setTimeout(r, 1500));
  note("=== 提交前最终状态 ===");
  const st = await p.evaluate(STATE);
  note(JSON.stringify(st, null, 1));
  await p.screenshot({ path: SHOTS + "/v6-2-filled.png" });

  await fs.writeFile(SHOTS + "/v6-filled.json", JSON.stringify({ st, log }, null, 2), "utf8");
  note("STOPPED-BEFORE-SUBMIT");
}
main().catch((e) => { console.log("ERROR: " + String(e && e.stack ? e.stack : e)); });
