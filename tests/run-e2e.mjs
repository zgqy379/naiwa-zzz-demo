/**
 * 一键端到端测试运行器（Node 侧）。
 *
 * 流程：
 *   1. 构建生产版本（vite build --outDir .tmp-dist-e2e，不动交付物 dist/ —— AGENTS.md §4 构建唯一权）
 *   2. 启动 preview 服务器（vite preview --outDir .tmp-dist-e2e）
 *   3. 调用 ego-browser 跑测试
 *   4. 汇总报告（pending 只留内存态，不预写盘清空旧证据；报告由测试子进程测完后落盘）
 *
 * 用法：node tests/run-e2e.mjs
 */
import { spawn, execSync } from "node:child_process";
import { readFile, stat, rm } from "node:fs/promises";

const ROOT = "E:/naiwa-zzz";
const EGO = "C:/Users/dqy/.local/share/ego/active_version_dir/ego-browser.exe";
const PORT = 5274;
const TMP_OUT = ".tmp-dist-e2e"; // .gitignore 已忽略 .tmp-*，收工清理

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

async function cleanupTmp() {
  // 尽力清理临时构建目录；失败不影响退出码（.tmp-* 已被 .gitignore 忽略）
  try { await rm(`${ROOT}/${TMP_OUT}`, { recursive: true, force: true }); } catch {}
}

// ==================== 主流程 ====================
async function main() {
  const reportPath = `${ROOT}/docs/test-report.json`;

  // 1) 构建（产物进临时目录，不覆盖交付物 dist/）
  // 上一轮的 detached preview 可能仍握着 .tmp-dist-e2e 的文件句柄，Windows 上
  // 直接清空 outDir 会偶发 EPERM/EBUSY。先清理 + 失败重试一次，并把完整日志打出来，
  // 避免只截 500 字符把真正的错误藏起来。
  log(`构建生产版本（--outDir ${TMP_OUT}）...`);
  await cleanupTmp();
  let build = await run(`node node_modules/vite/bin/vite.js build --outDir ${TMP_OUT}`);
  if (build.code !== 0) {
    log("构建失败，清理临时目录后重试一次...");
    await cleanupTmp();
    build = await run(`node node_modules/vite/bin/vite.js build --outDir ${TMP_OUT}`);
  }
  if (build.code !== 0) {
    console.error("构建失败（已重试）：\n[stdout]\n" + build.out.slice(-2000) + "\n[stderr]\n" + build.err.slice(-2000));
    await cleanupTmp();
    process.exit(1);
  }
  log("构建完成");

  // 2) 启动 preview（指向同一临时目录）
  await killPort();
  log("启动 preview 服务器...");
  const preview = spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--outDir", TMP_OUT, "--port", String(PORT), "--host", "127.0.0.1"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
  });
  preview.unref();

  const url = `http://127.0.0.1:${PORT}/`;
  const ready = await waitForServer(url, 20000);
  if (!ready) {
    console.error("preview 服务器启动失败");
    await cleanupTmp();
    process.exit(1);
  }
  log(`服务器就绪: ${url}`);

  // 3) 跑测试（ego）
  log("运行测试...");
  const runStartMs = Date.now(); // 判定报告是否本轮新写，旧报告不得冒充本轮结果
  const testScript = `${ROOT}/tests/run-game-test.mjs`;
  // 显式覆盖宿主内 NAIWA_TEST_URL：ego nodejs 代码跑在常驻宿主进程里，命令行前缀 env 传不进去；
  // 宿主环境若被历史会话污染（实测残留 NAIWA_TEST_URL=5399），-e 内先改 process.env 再 import 可自愈
  const testEntry = `process.env.NAIWA_TEST_URL='http://127.0.0.1:${PORT}'; await import('file:///${testScript.replace(/\\/g, "/")}')`;
  const test = await run(`"${EGO}" nodejs -e "${testEntry}"`, {
    timeout: 300000,
  });

  // 4) 读报告（pending 只留内存态：盘上旧报告一律保留，仅当本轮确有新写才采信）
  let report = { pending: true };
  try {
    const st = await stat(reportPath);
    if (st.mtimeMs >= runStartMs) {
      report = JSON.parse(await readFile(reportPath, "utf8"));
    } else {
      console.error("报告未在本轮更新，旧证据保留在盘上，不作为本轮结果");
    }
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
  await cleanupTmp();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E 运行失败:", e);
  process.exit(1);
});
