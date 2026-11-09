/**
 * 一键端到端测试运行器（Node 侧）。
 *
 * 流程：
 *   1. 构建生产版本（vite build）
 *   2. 启动 preview 服务器（vite preview）
 *   3. 调用 ego-browser 跑测试
 *   4. 汇总报告
 *
 * 用法：node tests/run-e2e.mjs
 */
import { spawn, execSync } from "node:child_process";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const ROOT = "E:/naiwa-zzz";
const EGO = "C:/Users/dqy/.local/share/ego/active_version_dir/ego-browser.exe";
const PORT = 5274;

function log(msg) {
  console.log(`[e2e] ${msg}`);
}

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
  // 只杀占用目标端口的进程，避免误杀自身
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
  await new Promise((r) => setTimeout(r, 1500));
}

async function waitForServer(url, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 800));
  }
  return false;
}

// ==================== 主流程 ====================
async function main() {
  const reportPath = `${ROOT}/docs/test-report.json`;

  // 0) 清理旧报告
  if (existsSync(reportPath)) {
    await writeFile(reportPath, JSON.stringify({ pending: true }, null, 2));
  }

  // 1) 构建
  log("构建生产版本...");
  const build = await run("node node_modules/vite/bin/vite.js build");
  if (build.code !== 0) {
    console.error("构建失败:", build.err.slice(-500));
    process.exit(1);
  }
  log("构建完成");

  // 2) 启动 preview
  await killPort();
  log("启动 preview 服务器...");
  const preview = spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--port", String(PORT), "--host", "127.0.0.1"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
  });
  preview.unref();

  const url = `http://127.0.0.1:${PORT}/`;
  const ready = await waitForServer(url, 20000);
  if (!ready) {
    console.error("preview 服务器启动失败");
    process.exit(1);
  }
  log(`服务器就绪: ${url}`);

  // 3) 跑测试（ego）
  log("运行测试...");
  const testScript = `${ROOT}/tests/run-game-test.mjs`;
  const test = await run(`"${EGO}" nodejs -e "await import('file:///${testScript.replace(/\\/g, "/")}')"`, {
    timeout: 300000,
  });

  // 4) 读报告
  let report = null;
  try {
    const raw = await readFile(reportPath, "utf8");
    report = JSON.parse(raw);
  } catch (e) {
    console.error("报告读取失败:", e.message);
  }

  // 5) 输出
  console.log("\n========== E2E 测试完成 ==========");
  if (report?.summary) {
    const s = report.summary;
    console.log(`  通过率: ${s.passRate}% (${s.passed}/${s.total})`);
    for (const [g, v] of Object.entries(report.groups ?? {})) {
      const pct = v.total ? Math.round((v.pass / v.total) * 100) : 0;
      console.log(`  ${g}: ${v.pass}/${v.total} (${pct}%)`);
    }
    const fails = (report.results ?? []).filter((r) => r.status === "fail");
    if (fails.length > 0) {
      console.log("\n  失败用例:");
      fails.forEach((f) => console.log(`    ✗ [${f.group}] ${f.name}: ${f.error}`));
    }
  } else {
    console.log("  测试未完成（无报告）");
    console.log(test.out?.slice(-800));
    console.log(test.err?.slice(-400));
  }
  console.log("==================================\n");

  // 6) 退出码
  const ok = report?.summary && report.summary.failed === 0;
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E 运行失败:", e);
  process.exit(1);
});
