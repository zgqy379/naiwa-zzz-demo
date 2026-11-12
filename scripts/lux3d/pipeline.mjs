/**
 * 奶蛙零 · 官方 Lux3D 资产管线（可复现、可重跑、可断点续跑）
 *
 * 链路（全部走 Aholo 官方 OpenAPI，见 https://labs.aholo3d.cn/api-docs）：
 *   ① 文生 3D   POST /lux3d/v1/generate/text-to-3d/task/create      13 积分
 *      └ 可选：多模态生图 → 单图四视图 → 图生 3D（一致性更好，三视图更标准）
 *   ② 自动绑骨   POST /lux3d/v1/animations/rig/task/create          15 积分
 *      └ 输入必须是公网 HTTPS 的 GLB，且模型处于 T-Pose / A-Pose（双臂不抱胸）
 *   ③ 动画重定向 POST /lux3d/v1/animations/retarget/task/create     6 积分/动作
 *      └ animationIds 取官方 85 个动作之一，单次最多 10 个；combined 模式合成一个 GLB
 *   ④ 本地合并   用 @gltf-transform 把多个 combined 产出的动画片段并进同一个 GLB
 *
 * 关键约束：
 *   - 官方任务结果 URL **有效期 2 小时** → 一拿到就落盘；
 *   - 绑骨输入要 T-Pose/A-Pose，否则报 MODEL_NOT_RIGGABLE。
 *
 * 用法：
 *   node scripts/lux3d/pipeline.mjs char  --name frog-01 --prompt "..." [--style cartoon]
 *                                            [--actions A,B,C] [--version G1]
 *   node scripts/lux3d/pipeline.mjs rig   --name frog-01 --model-url <url>
 *   node scripts/lux3d/pipeline.mjs animate --name frog-01 --actions Idle_Loop,Walk_Loop
 *   node scripts/lux3d/pipeline.mjs inspect <file.glb>
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createTask, call, waitTask, outputUrls, download, loadCredentials } from "./client.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..", "..");
const WORK = path.join(ROOT, ".lux3d-work");        // 本地工作区（gitignored）
const STATE = path.join(WORK, "state.json");

/** 官方 85 个动作 ID（本轮只列游戏用得到的；完整表见官方 OpenAPI 枚举） */
export const GAME_ACTIONS = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  jog: "Jog_Fwd_Loop",
  sprint: "Sprint_Loop",
  atk1: "Sword_Regular_A",
  atk2: "Sword_Regular_B",
  atk3: "Sword_Regular_C",
  combo: "Sword_Regular_Combo",
  heavy: "Sword_Heavy_Combo",
  hit: "Hit_Chest",
  knock: "Hit_Knockback",
  roll: "Roll",
  death: "Death01",
};

function readState() {
  if (!existsSync(STATE)) return {};
  try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return {}; }
}
function writeState(s) {
  mkdirSync(WORK, { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 2), "utf8");
}

/** 解 zip（纯 Node：用系统 tar 解，Windows 10+ 自带） */
async function unzip(zipPath, destDir) {
  const { execFileSync } = await import("node:child_process");
  mkdirSync(destDir, { recursive: true });
  execFileSync("tar", ["-xf", zipPath, "-C", destDir], { stdio: "ignore" });
  return readdirSync(destDir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.glb$/i.test(d.name))
    .map((d) => path.join(destDir, d.name));
}

/** 从任务产出里挑出 GLB / ZIP 的 URL */
function pickUrls(detail) {
  const urls = outputUrls(detail);
  const glb = urls.find((u) => /\.glb($|\?)/i.test(u));
  const zip = urls.find((u) => /\.zip($|\?)/i.test(u));
  return { glb, zip, all: urls };
}

/** ① 文生 3D → 本地 GLB */
async function textTo3d(name, prompt, { style = "cartoon", version = "G1", faceCount = 30000 } = {}) {
  const st = readState();
  if (st[name]?.glb && existsSync(st[name].glb)) {
    console.log(`[${name}] 文生3D 已存在，跳过：${st[name].glb}`);
    return st[name].glb;
  }
  console.log(`[${name}] 文生3D：${prompt.slice(0, 70)}…`);
  const taskid = await createTask("/lux3d/v1/generate/text-to-3d/task/create", {
    prompt, style, version, faceCount,
    outputFormat: version === "G1" ? ["glb"] : ["glb"],
    enablePbr: true,
  });
  console.log(`[${name}] taskid=${taskid}`);
  const d = await waitTask(taskid, { onTick: (x) => console.log(`  [${name}] status=${x.status}`) });
  if (d.status !== 3) throw new Error(`[${name}] 文生3D 失败：${JSON.stringify(d.outputs).slice(0, 300)}`);
  const { glb, zip } = pickUrls(d);
  const dir = path.join(WORK, name, "base");
  mkdirSync(dir, { recursive: true });
  let out;
  if (glb) {
    out = path.join(dir, path.basename(new URL(glb).pathname) || "base.glb");
    await download(glb, out);
  } else if (zip) {
    const z = path.join(dir, "results.zip");
    await download(zip, z);
    const glbs = await unzip(z, dir);
    if (!glbs.length) throw new Error(`[${name}] ZIP 内没有 GLB`);
    out = glbs[0];
  } else {
    throw new Error(`[${name}] 文生3D 无可用产出：${JSON.stringify(d.outputs).slice(0, 300)}`);
  }
  const s = readState();
  s[name] = { ...(s[name] || {}), taskid, glb: out, baseUrl: glb || zip };
  writeState(s);
  console.log(`[${name}] GLB → ${out}`);
  return out;
}

/** ② 自动绑骨 → rigged GLB（本地 + 公网 URL 都要） */
async function autoRig(name, modelUrl) {
  const s = readState();
  const key = name + ":rig";
  if (s[key]?.glb && existsSync(s[key].glb)) {
    console.log(`[${name}] 绑骨已存在，跳过：${s[key].glb}`);
    return s[key];
  }
  console.log(`[${name}] 自动绑骨：${modelUrl}`);
  const taskid = await createTask("/lux3d/v1/animations/rig/task/create", { modelUrl });
  console.log(`[${name}] taskid=${taskid}`);
  const d = await waitTask(taskid, { onTick: (x) => console.log(`  [${name}] status=${x.status}`) });
  if (d.status !== 3) {
    const err = JSON.stringify(d.outputs).slice(0, 400);
    throw new Error(`[${name}] 绑骨失败：${err}`);
  }
  const { glb } = pickUrls(d);
  if (!glb) throw new Error(`[${name}] 绑骨无 GLB 产出`);
  const out = path.join(WORK, name, "rigged.glb");
  await download(glb, out);
  const st = readState();
  st[key] = { taskid, glb: out, url: glb };
  writeState(st);
  console.log(`[${name}] rigged → ${out}`);
  return st[key];
}

/** ③ 动画重定向（combined：多个动作合一个 GLB） */
async function retarget(name, rigModelUrl, actionIds, reuseTaskid = null) {
  if (!actionIds.length) throw new Error("动作列表为空");
  if (actionIds.length > 10) throw new Error("官方单次最多 10 个动作");
  const s = readState();
  const key = name + ":anim:" + actionIds.join(",");
  if (s[key]?.glb && existsSync(s[key].glb)) {
    console.log(`[${name}] 动画已存在，跳过`);
    return s[key];
  }
  let taskid = reuseTaskid;
  if (!taskid) {
    console.log(`[${name}] 动画重定向：${actionIds.join(", ")}`);
    taskid = await createTask("/lux3d/v1/animations/retarget/task/create", {
      rigModelUrl,
      animationIds: actionIds,
      animationOutputMode: "combined",
      outFormat: "glb",
      animateInPlace: true,
    });
    console.log(`[${name}] taskid=${taskid}`);
  } else {
    console.log(`[${name}] 复用已有 taskid=${taskid}`);
  }
  const d = await waitTask(taskid, { onTick: (x) => console.log(`  [${name}] status=${x.status}`) });
  if (d.status !== 3) throw new Error(`[${name}] 动画重定向失败：${JSON.stringify(d.outputs).slice(0, 400)}`);
  const urls = outputUrls(d);
  const glb = urls.find((u) => /\.glb($|\?)/i.test(u));
  if (!glb) throw new Error(`[${name}] 动画产出结构未知：${JSON.stringify(d.outputs).slice(0, 500)}`);
  const out = path.join(WORK, name, "anim_" + actionIds.length + ".glb");
  await download(glb, out);
  const st = readState();
  st[key] = { taskid, glb: out, url: glb, actions: actionIds };
  writeState(st);
  console.log(`[${name}] animated → ${out}`);
  return st[key];
}

/** 本地检查 GLB 的骨骼 / 动画 / 顶点数 */
export async function inspectGlb(file) {
  const fs = await import("node:fs");
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(20);
  fs.readSync(fd, head, 0, 20, 0);
  // GLB：12 字节头 → chunk0：4 字节长度 + 4 字节类型 + JSON 数据（从偏移 20 起）
  const clen = head.readUInt32LE(12);
  const cbuf = Buffer.alloc(clen);
  fs.readSync(fd, cbuf, 0, clen, 20);
  fs.closeSync(fd);
  const json = JSON.parse(cbuf.toString("utf8"));
  let verts = 0;
  for (const m of json.meshes || []) {
    for (const pr of m.primitives || []) {
      if (pr.attributes?.POSITION != null) verts += json.accessors[pr.attributes.POSITION].count;
    }
  }
  return {
    file,
    meshes: (json.meshes || []).length,
    skins: (json.skins || []).length,
    joints: (json.skins || []).reduce((s, x) => s + (x.joints || []).length, 0),
    animations: (json.animations || []).length,
    clipNames: (json.animations || []).map((a) => a.name),
    verts,
    materials: (json.materials || []).length,
  };
}

// ---------------- CLI ----------------
const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (k, d = null) => {
  const i = argv.indexOf("--" + k);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};

if (cmd === "char") {
  const name = arg("name");
  const prompt = arg("prompt");
  if (!name || !prompt) { console.error("用法：--name <id> --prompt <text> [--style cartoon] [--actions a,b,c]"); process.exit(1); }
  const actions = (arg("actions") || "Idle_Loop,Walk_Loop,Jog_Fwd_Loop,Sword_Regular_A,Sword_Regular_B,Sword_Regular_C,Sword_Regular_Combo,Hit_Chest,Roll,Death01").split(",").map((s) => s.trim()).filter(Boolean);
  const glb = await textTo3d(name, prompt, { style: arg("style", "cartoon"), version: arg("version", "G1"), faceCount: Number(arg("faces", 30000)) });
  console.log("  base:", JSON.stringify(await inspectGlb(glb)));
  const rig = await autoRig(name, readState()[name].baseUrl);
  console.log("  rigged:", JSON.stringify(await inspectGlb(rig.glb)));
  const anim = await retarget(name, rig.url, actions);
  console.log("  animated:", JSON.stringify(await inspectGlb(anim.glb)));
} else if (cmd === "rig") {
  const r = await autoRig(arg("name"), arg("model-url"));
  console.log(JSON.stringify(await inspectGlb(r.glb), null, 1));
} else if (cmd === "animate") {
  const name = arg("name");
  const st = readState();
  const rigUrl = st[name + ":rig"]?.url || arg("rig-url");
  if (!rigUrl) { console.error("缺少已绑骨模型 URL（先跑 rig）"); process.exit(1); }
  const actions = arg("actions").split(",").map((s) => s.trim()).filter(Boolean);
  const a = await retarget(name, rigUrl, actions, arg("taskid") ? Number(arg("taskid")) : null);
  console.log(JSON.stringify(await inspectGlb(a.glb), null, 1));
} else if (cmd === "inspect") {
  const f = arg("file") || argv[1];
  console.log(JSON.stringify(await inspectGlb(f), null, 1));
} else {
  console.log("用法：node scripts/lux3d/pipeline.mjs <char|rig|animate|inspect> ...");
}
