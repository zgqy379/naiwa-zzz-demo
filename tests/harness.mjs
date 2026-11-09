/**
 * 游戏测试工作流框架 —— 自动化断言 + 截图取证 + 报告生成。
 *
 * 设计：
 *  - 每个测试用例：名称 + 断言函数 + 可选截图
 *  - 结果：pass/fail + 错误信息 + 截图路径
 *  - 汇总：JSON 报告 + 控制台表格
 */

import { writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";

export class TestHarness {
  /**
   * @param {object} page ego page
   * @param {object} opts { shotDir, reportPath }
   */
  constructor(page, opts = {}) {
    this.page = page;
    this.results = [];
    this.shotDir = opts.shotDir ?? "E:/naiwa-zzz/docs/test-shots";
    this.reportPath = opts.reportPath ?? "E:/naiwa-zzz/docs/test-report.json";
    this.currentGroup = "未分组";
  }

  group(name) { this.currentGroup = name; }

  /**
   * 跑一个测试用例。
   * @param {string} name
   * @param {Function} fn 断言函数（抛错即失败）
   * @param {object} opts { shot: string|boolean, shotName: string }
   */
  async case(name, fn, opts = {}) {
    const item = {
      group: this.currentGroup,
      name,
      status: "pass",
      error: null,
      shot: null,
      duration: 0,
    };
    const t0 = Date.now();
    try {
      await fn(this.page);
      if (opts.shot) {
        const shotName = typeof opts.shot === "string" ? opts.shot : (opts.shotName ?? name);
        item.shot = await this._shot(shotName);
      }
    } catch (e) {
      item.status = "fail";
      item.error = String(e?.message ?? e).slice(0, 300);
      if (opts.shotOnFail !== false) {
        try { item.shot = await this._shot((opts.shotName ?? name) + "-FAIL"); } catch {}
      }
    }
    item.duration = Date.now() - t0;
    this.results.push(item);
    const icon = item.status === "pass" ? "✓" : "✗";
    console.log(`  ${icon} ${name}${item.error ? " — " + item.error : ""}`);
    return item;
  }

  /** 截图 */
  async _shot(name) {
    const safe = name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
    const path = `${this.shotDir}/${safe}.png`;
    mkdirSync(this.shotDir, { recursive: true });
    const res = await this.page.cdp("Page.captureScreenshot", { format: "png" });
    if (res?.data) {
      await writeFile(path, Buffer.from(res.data, "base64"));
      return path;
    }
    return null;
  }

  // ---------- 断言工具 ----------
  static assert(cond, msg) {
    if (!cond) throw new Error(msg ?? "断言失败");
  }

  static assertEqual(actual, expected, msg) {
    if (actual !== expected) throw new Error(msg ?? `期望 ${expected}，实际 ${actual}`);
  }

  static assertClose(actual, expected, tol, msg) {
    if (Math.abs(actual - expected) > tol) throw new Error(msg ?? `期望 ${expected}±${tol}，实际 ${actual}`);
  }

  static assertGreater(actual, threshold, msg) {
    if (!(actual > threshold)) throw new Error(msg ?? `期望 > ${threshold}，实际 ${actual}`);
  }

  static assertLess(actual, threshold, msg) {
    if (!(actual < threshold)) throw new Error(msg ?? `期望 < ${threshold}，实际 ${actual}`);
  }

  static assertTruthy(v, msg) {
    if (!v) throw new Error(msg ?? `期望真值，实际 ${v}`);
  }

  /** 汇总报告 */
  async report() {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.status === "pass").length;
    const failed = total - passed;

    const groups = {};
    for (const r of this.results) {
      if (!groups[r.group]) groups[r.group] = { total: 0, pass: 0, fail: 0, items: [] };
      groups[r.group].total++;
      groups[r.group][r.status === "pass" ? "pass" : "fail"]++;
      groups[r.group].items.push(r);
    }

    const report = {
      at: new Date().toISOString(),
      summary: { total, passed, failed, passRate: total ? Math.round((passed / total) * 100) : 0 },
      groups,
      results: this.results,
    };

    try {
      mkdirSync(this.shotDir, { recursive: true });
      await writeFile(this.reportPath, JSON.stringify(report, null, 2), "utf8");
    } catch (e) {
      console.error("报告写入失败:", e.message);
    }

    console.log("\n========== 测试报告 ==========");
    for (const [g, s] of Object.entries(groups)) {
      const pct = s.total ? Math.round((s.pass / s.total) * 100) : 0;
      console.log(`  ${g}: ${s.pass}/${s.total} (${pct}%)`);
    }
    console.log(`  ─────────────────────────`);
    console.log(`  总计: ${passed}/${total} (${report.summary.passRate}%)`);
    if (failed > 0) {
      console.log(`  失败用例:`);
      this.results.filter((r) => r.status === "fail").forEach((r) => {
        console.log(`    ✗ [${r.group}] ${r.name}: ${r.error}`);
      });
    }
    console.log("==============================\n");

    return report;
  }
}
