/**
 * 开发-测试-修复循环工作流
 *
 * 用法：
 *   node tests/dev-loop.mjs --round 1
 *   node tests/dev-loop.mjs --round 2 --fix "修复建议"
 *
 * 循环步骤：
 *   1. 构建（vite build）
 *   2. 测试（25 项断言 + 截图）
 *   3. 诊断（失败原因分类）
 *   4. 报告（JSON + 控制台）
 *
 * 设计目标：每次改动都能快速验证，不靠"看着说好看"
 */
import { spawn, execSync } from "node:child_process";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync as exists } from "node:fs";

const ROOT = "E:/naiwa-zzz";
const EGO = "C:/Users/dqy/.local/share/ego/active_version_dir/ego-browser.exe";
const PORT = 5274;

function log(msg) { console.log(`[loop] ${msg}`); }

function run(cmd, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, [], { shell: true, cwd: ROOT, ...opts });
    let out = "", err = "";
    p.stdout?.on("data", (d) => { out += d; });
    p.stderr?.on("data", (d) => { err += d; });
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

async function killPort() {
  try {
    const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: "utf8", shell: true });
    const pids = new Set();
    for (const line of out.split("\n")) {
      const m = line.trim().match(/(\d+)$/);
      if (m) pids.add(m[1]);
    }
    for (const pid of pids) {
      try { execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore", shell: true }); } catch {}
    }
  } catch {}
  // 等待端口释放（加长到 3 秒）
  await new Promise((r) => setTimeout(r, 3000));
}

async function waitForServer(url, timeout = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

// ==================== 主循环 ====================
async function main() {
  const round = process.argv.includes("--round")
    ? process.argv[process.argv.indexOf("--round") + 1]
    : "1";

  const statePath = `${ROOT}/docs/dev-loop-state.json`;
  let state = { round: 0, history: [] };
  if (exists(statePath)) {
    try { state = JSON.parse(await readFile(statePath, "utf8")); } catch {}
  }
  state.round = parseInt(round);
  state.history = state.history || [];

  console.log(`\n========== 开发循环 · 第 ${round} 轮 ==========\n`);

  // ---- 1. 构建 ----
  log("1/4 构建...");
  const build = await run("node node_modules/vite/bin/vite.js build");
  if (build.code !== 0) {
    console.error("❌ 构建失败:", build.err.slice(-400));
    state.history.push({ round, phase: "build", status: "fail", err: build.err.slice(-200) });
    await writeFile(statePath, JSON.stringify(state, null, 2));
    process.exit(1);
  }
  log("   构建成功");

  // ---- 2. 启动 + 测试 ----
  await killPort();
  log("2/4 启动服务器...");
  const preview = spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--host", "127.0.0.1"], {
    cwd: ROOT, detached: true, stdio: "ignore",
  });
  preview.unref();

  const ready = await waitForServer(`http://127.0.0.1:${PORT}/`);
  if (!ready) {
    console.error("❌ 服务器启动失败");
    process.exit(1);
  }

  log("3/4 运行测试...");
  const testScript = `${ROOT}/tests/run-game-test.mjs`;
  const test = await run(`"${EGO}" nodejs -e "await import('file:///${testScript.replace(/\\/g, "/")}')"`, { timeout: 300000 });

  // ---- 3. 读报告 ----
  let report = null;
  try {
    report = JSON.parse(await readFile(`${ROOT}/docs/test-report.json`, "utf8"));
  } catch {}

  // ---- 4. 诊断 ----
  log("4/4 诊断...");
  const failures = (report?.results ?? []).filter((r) => r.status === "fail");
  const summary = report?.summary ?? { total: 0, passed: 0, failed: 0, passRate: 0 };

  // 分类失败
  const categories = { 时序: [], 功能: [], 断言: [], 其他: [] };
  for (const f of failures) {
    const err = f.error ?? "";
    if (/超时|timeout|截图/i.test(err)) categories.时序.push(f);
    else if (/未|失败|无|不/i.test(err)) categories.功能.push(f);
    else if (/期望|应为|断言/i.test(err)) categories.断言.push(f);
    else categories.其他.push(f);
  }

  // ---- 报告 ----
  console.log("\n---------- 本轮结果 ----------");
  console.log(`  通过率: ${summary.passRate}% (${summary.passed}/${summary.total})`);
  if (failures.length > 0) {
    console.log(`  失败 ${failures.length} 项，分类：`);
    for (const [cat, list] of Object.entries(categories)) {
      if (list.length > 0) {
        console.log(`    ${cat}: ${list.length} 项`);
        list.forEach((f) => console.log(`      · ${f.name}: ${String(f.error).slice(0, 70)}`));
      }
    }
  } else {
    console.log("  ✅ 全部通过");
  }
  console.log("------------------------------\n");

  // ---- 保存状态 ----
  state.history.push({
    round,
    at: new Date().toISOString(),
    passRate: summary.passRate,
    passed: summary.passed,
    total: summary.total,
    failures: failures.map((f) => ({ name: f.name, error: String(f.error).slice(0, 100) })),
  });
  // 只保留最近 10 轮
  if (state.history.length > 10) state.history = state.history.slice(-10);
  await writeFile(statePath, JSON.stringify(state, null, 2));

  // ---- 建议 ----
  if (failures.length > 0) {
    console.log("📋 修复建议（按优先级）：");
    const fixes = [];
    if (categories.功能.length > 0) {
      fixes.push("1. 功能问题（优先修）：" + categories.功能.map((f) => f.name).join("、"));
    }
    if (categories.断言.length > 0) {
      fixes.push("2. 断言/逻辑问题：" + categories.断言.map((f) => f.name).join("、"));
    }
    if (categories.时序.length > 0) {
      fixes.push("3. 时序/环境问题（可放宽或加等待）：" + categories.时序.map((f) => f.name).join("、"));
    }
    fixes.forEach((f) => console.log("   " + f));
  } else {
    console.log("✅ 本轮全绿，可部署或继续下一项开发。");
  }

  console.log("\n========== 循环结束 ==========\n");
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error("循环失败:", e); process.exit(1); });
