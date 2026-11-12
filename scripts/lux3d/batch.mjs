/**
 * 批量重建 16 只家族角色（官方 Lux3D 全链路）。
 *
 * 每只：文生3D → 自动绑骨 → 动画重定向（10 个官方动作合并成一个 GLB）→ 定版化（改名+压缩）
 *      → 落到 public/asset/<roster 里的 glb 文件名>（沿用旧文件名，URL 不变）
 *
 * 用法：
 *   node scripts/lux3d/batch.mjs                     # 全部（跳过已完成的）
 *   node scripts/lux3d/batch.mjs --only shell_naiyu   # 只跑某只
 *   node scripts/lux3d/batch.mjs --concurrency 3
 *   node scripts/lux3d/batch.mjs --dry-run           # 只打印计划，不调 API
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { call, createTask, download, loadCredentials, outputUrls, waitTask } from "./client.mjs";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work");
const STATE = path.join(WORK, "state.json");
const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const only = arg("only");
const dry = argv.includes("--dry-run");
const CONC = Math.max(1, Math.min(5, Number(arg("concurrency", 2))));

function readState() {
  if (!existsSync(STATE)) return {};
  try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return {}; }
}
/** 合并每个角色的独立状态文件（多进程并行时互不覆盖） */
function mergeStates() {
  const merged = readState();
  const dir = path.join(WORK, "states");
  if (!existsSync(dir)) return merged;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const one = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
      for (const [k, v] of Object.entries(one)) merged[k] = { ...(merged[k] || {}), ...v };
    } catch { /* 忽略坏文件 */ }
  }
  return merged;
}
function writeState(s) {
  mkdirSync(WORK, { recursive: true });
  // 原子写：先写临时文件再改名，避免多进程并发时把状态写坏
  const tmp = STATE + ".tmp" + process.pid;
  writeFileSync(tmp, JSON.stringify(s, null, 2), "utf8");
  renameSync(tmp, STATE);
}
/** 创建任务：官方有并发上限，超限时等待重试（避免整批角色被跳过） */
async function createTaskWithRetry(endpoint, body, tries = 20) {
  for (let i = 0; i < tries; i++) {
    try { return await createTask(endpoint, body); }
    catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (!/CONCURRENCY|并发/i.test(msg)) throw e;
      console.warn(`  并发上限，等待 45s 后重试（${i + 1}/${tries}）`);
      await new Promise((r) => setTimeout(r, 45000));
    }
  }
  throw new Error("并发上限重试耗尽");
}

/** 写单个角色的状态（多进程并行安全；文件名去掉冒号——Windows 不允许） */
function writeOneState(id, patch) {
  const dir = path.join(WORK, "states");
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, id.replace(/[:\\/]/g, "_") + ".json");
  const cur = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  const tmp = f + ".tmp" + process.pid;
  writeFileSync(tmp, JSON.stringify({ ...cur, ...patch }, null, 2), "utf8");
  renameSync(tmp, f);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function unzipTo(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  execFileSync("tar", ["-xf", zipPath, "-C", destDir], { stdio: "ignore" });
  return readdirSync(destDir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.glb$/i.test(d.name)).map((d) => path.join(destDir, d.name));
}

/** 一只角色的完整链路 */
async function buildCharacter(c) {
  const st = mergeStates();
  const key = c.id;
  const out = path.join(ROOT, "public", "asset", c.glb);
  if (st[key]?.final && existsSync(st[key].final)) {
    console.log(`[${c.id}] 已完成，跳过`);
    return { ok: true, skipped: true };
  }

  // ① 文生 3D
  let baseUrl = st[key]?.baseUrl;
  let baseGlb = st[key]?.glb;
  if (!baseGlb || !existsSync(baseGlb)) {
    console.log(`[${c.id}] ① 文生3D（${roster._style}）`);
    const taskid = await createTaskWithRetry("/lux3d/v1/generate/text-to-3d/task/create", {
      prompt: c.prompt, style: roster._style, version: roster._version,
      faceCount: roster._faces, outputFormat: ["glb"], enablePbr: true,
    });
    const d = await waitTask(taskid, { intervalMs: 6000, onTick: () => {} });
    if (d.status !== 3) throw new Error(`文生3D 失败 status=${d.status}`);
    const urls = outputUrls(d);
    const glb = urls.find((u) => /\.glb($|\?)/i.test(u));
    const zip = urls.find((u) => /\.zip($|\?)/i.test(u));
    baseUrl = glb || zip;
    if (!baseUrl) throw new Error("文生3D 无产出");
    const dir = path.join(WORK, key, "base");
    mkdirSync(dir, { recursive: true });
    if (glb) {
      baseGlb = path.join(dir, "textured.glb");
      await download(glb, baseGlb);
    } else {
      const z = path.join(dir, "results.zip");
      await download(zip, z);
      const glbs = await unzipTo(z, dir);
      if (!glbs.length) throw new Error("ZIP 内无 GLB");
      baseGlb = glbs[0];
    }
    writeOneState(key, { taskid, glb: baseGlb, baseUrl });
    console.log(`   ✓ 文生3D taskid=${taskid}`);
  } else {
    console.log(`[${c.id}] ① 文生3D 已有，跳过`);
  }

  // ② 自动绑骨
  let rig = st[key + ":rig"];
  if (!rig?.url || !existsSync(rig.glb)) {
    console.log(`[${c.id}] ② 自动绑骨`);
    const taskid = await createTaskWithRetry("/lux3d/v1/animations/rig/task/create", { modelUrl: baseUrl });
    const d = await waitTask(taskid, { intervalMs: 6000, onTick: () => {} });
    if (d.status !== 3) {
      const err = JSON.stringify(d.outputs).slice(0, 220);
      throw new Error(`绑骨失败：${err}`);
    }
    const glb = outputUrls(d).find((u) => /\.glb($|\?)/i.test(u));
    if (!glb) throw new Error("绑骨无 GLB 产出");
    const dir = path.join(WORK, key);
    mkdirSync(dir, { recursive: true });
    const p = path.join(dir, "rigged.glb");
    await download(glb, p);
    writeOneState(key + ":rig", { taskid, glb: p, url: glb });
    rig = st[key + ":rig"] || { glb: p, url: glb };
    console.log(`   ✓ 绑骨 taskid=${taskid}`);
  } else {
    console.log(`[${c.id}] ② 绑骨已有，跳过`);
  }

  // ③ 动画重定向（10 个官方动作合并）
  const actions = roster._actions.split(",").map((s) => s.trim()).filter(Boolean);
  const animKey = key + ":anim";
  let anim = st[animKey];
  if (!anim?.glb || !existsSync(anim.glb)) {
    console.log(`[${c.id}] ③ 动画重定向（${actions.length} 个官方动作）`);
    const taskid = await createTaskWithRetry("/lux3d/v1/animations/retarget/task/create", {
      rigModelUrl: rig.url, animationIds: actions,
      animationOutputMode: "combined", outFormat: "glb", animateInPlace: true,
    });
    const d = await waitTask(taskid, { intervalMs: 6000, onTick: () => {} });
    if (d.status !== 3) throw new Error(`动画失败：${JSON.stringify(d.outputs).slice(0, 220)}`);
    const glb = outputUrls(d).find((u) => /\.glb($|\?)/i.test(u));
    if (!glb) throw new Error("动画无 GLB 产出");
    const p = path.join(WORK, key, "anim.glb");
    await download(glb, p);
    writeOneState(animKey, { taskid, glb: p, url: glb, actions });
    anim = st[animKey] || { glb: p, url: glb, actions };
    console.log(`   ✓ 动画 taskid=${taskid}`);
  } else {
    console.log(`[${c.id}] ③ 动画已有，跳过`);
  }

  // ④ 定版化（改名 + 压缩 + 落盘）
  console.log(`[${c.id}] ④ 定版化 → public/asset/${c.glb}`);
  execFileSync("node", [
    path.join(ROOT, "scripts", "lux3d", "finalize.mjs"),
    "--in", anim.glb, "--out", out, "--actions", actions.join(","),
  ], { stdio: "inherit", cwd: ROOT });

  writeOneState(key, { final: out });
  return { ok: true };
}

/** 并发调度 */
const targets = roster.characters.filter((c) => !only || c.id === only);
if (dry) {
  console.log("计划（每只：文生3D 13 + 绑骨 15 + 动画 6×" + roster._actions.split(",").length + " = " + (13 + 15 + 6 * roster._actions.split(",").length) + " 积分）");
  targets.forEach((c) => console.log("  " + c.id.padEnd(18) + c.name.padEnd(8) + "→ public/asset/" + c.glb));
  const { appKey } = loadCredentials();
  console.log("凭据:", appKey.slice(0, 4) + "…");
} else {
  const queue = [...targets];
  const results = [];
  const worker = async () => {
    for (;;) {
      const c = queue.shift();
      if (!c) return;
      try {
        await buildCharacter(c);
        results.push({ id: c.id, ok: true });
      } catch (e) {
        console.error(`[${c.id}] ✗ ${String(e.message || e).slice(0, 220)}`);
        results.push({ id: c.id, ok: false, err: String(e.message || e).slice(0, 220) });
      }
      await sleep(1200);
    }
  };
  await Promise.all(Array.from({ length: CONC }, worker));
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n完成 ${ok}/${results.length}`);
  for (const r of results.filter((x) => !x.ok)) console.log(`  ✗ ${r.id}: ${r.err}`);
}
