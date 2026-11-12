/**
 * 报告书 Markdown → PDF（赛事提交用）。
 *
 * 管线：marked → HTML（打印样式：A4 / 中文字体 / 表格边框 / 章节分页 / 图不跨页）
 *      → Chrome headless --print-to-pdf（打印背景图）→ docs/report.pdf
 *
 * 图片用 <base href> 指向 docs/，因此 markdown 里的相对路径（evidence/*.png）可直接解析。
 *
 * 用法：node scripts/build-report-pdf.mjs
 */
import { marked } from "marked";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const DOCS = path.join(ROOT, "docs");
const MD = path.join(DOCS, "报告书.md");
const OUT_PDF = path.join(DOCS, "report.pdf");
const TMP_HTML = path.join(DOCS, ".report-build.html");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p));
if (!CHROME) throw new Error("未找到 Chrome");

const md = readFileSync(MD, "utf8");
marked.setOptions({ gfm: true, breaks: false });
const body = marked.parse(md);

// 章节分页：每个一级标题（##）另起一页
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<base href="file:///${DOCS.replace(/\\/g, "/")}/">
<title>奶蛙零 · 项目报告书</title>
<style>
  @page { size: A4; margin: 18mm 16mm 16mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Microsoft YaHei", "微软雅黑", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif;
    font-size: 10.5pt; line-height: 1.75; color: #16181d; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 24pt; text-align: center; margin: 0 0 10mm; letter-spacing: .5pt; }
  h1 + blockquote { border-left: 4px solid #5b6cff; background: #f4f6ff; padding: 8px 14px; border-radius: 4px; }
  h2 { font-size: 15pt; margin: 0 0 4mm; padding: 0 0 2mm; border-bottom: 2px solid #2b2f3a; page-break-before: always; page-break-after: avoid; }
  h2:first-of-type { page-break-before: avoid; }
  h3 { font-size: 12pt; margin: 6mm 0 2mm; color: #23304a; page-break-after: avoid; }
  h4 { font-size: 11pt; margin: 4mm 0 2mm; color: #33415c; page-break-after: avoid; }
  p { margin: 0 0 2.6mm; text-align: justify; }
  ul, ol { margin: 0 0 3mm; padding-left: 7mm; }
  li { margin: 0 0 1.2mm; }
  code { font-family: "Cascadia Mono", Consolas, "Courier New", monospace; font-size: 9pt;
         background: #f2f3f7; padding: 0.5px 4px; border-radius: 3px; word-break: break-all; }
  pre { background: #f6f7fa; border: 1px solid #e2e5ee; border-radius: 5px; padding: 8px 10px;
        overflow-x: hidden; white-space: pre-wrap; word-break: break-all; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 8.6pt; }
  blockquote { margin: 0 0 3mm; padding: 6px 12px; border-left: 4px solid #b9c0d4; background: #fafbfd; color: #333a4a; }
  blockquote p { margin: 0 0 1.4mm; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 4mm; font-size: 9.4pt; page-break-inside: auto; }
  th, td { border: 1px solid #c9cedd; padding: 4px 7px; vertical-align: top; text-align: left; }
  th { background: #eef1f8; font-weight: 700; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  img { max-width: 100%; height: auto; display: block; margin: 2mm auto 1.5mm; page-break-inside: avoid; }
  hr { border: 0; border-top: 1px solid #d7dbe6; margin: 5mm 0; }
  a { color: #2b4bd0; text-decoration: none; word-break: break-all; }
  strong { color: #10131a; }
</style></head><body>
${body}
</body></html>`;

writeFileSync(TMP_HTML, html, "utf8");
log("HTML 已生成 " + (statSync(TMP_HTML).size / 1024).toFixed(1) + " KB");

const profile = path.join(process.env.TEMP || "C:/Users/dqy/AppData/Local/Temp", "naiwa-pdf-profile");
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

execFileSync(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  `--user-data-dir=${profile}`,
  "--no-pdf-header-footer",
  "--print-to-pdf=" + OUT_PDF,
  "file:///" + TMP_HTML.replace(/\\/g, "/"),
], { stdio: "ignore", windowsHide: true, timeout: 240000 });

rmSync(TMP_HTML, { force: true });
rmSync(profile, { recursive: true, force: true });

if (!existsSync(OUT_PDF)) throw new Error("PDF 未生成");
const st = statSync(OUT_PDF);
log("PDF 已生成 docs/report.pdf  " + (st.size / 1048576).toFixed(2) + " MB");

function log(s) { console.log(s); }
