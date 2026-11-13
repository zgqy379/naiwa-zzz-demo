/**
 * 跨角色 rest-姿态校正（2026-11-13）
 *
 * 背景（实测结论）：
 *   官方「自动绑骨」产出 rigged.glb；官方「动画重定向」产出 anim.glb。
 *   **这两者的骨架 rest 姿态并不相同**（retarget 会重新导出模型：顶点数
 *   18355 → 19566，Hips 位移差 0.08、躯干角差 2~5°、手指角差最多 73°），
 *   而官方把动画片段烘焙成了**源角色骨架的绝对局部旋转**。
 *   → 直接把共享动画库套到别的角色上，角色会「躺倒 / 陷进地里」。
 *
 * 本脚本做标准重定向校正（世界空间 delta 法）：
 *   对每个骨骼 b、每帧 k：
 *     D(b,k)   = W_srcRest(b)⁻¹ · W_srcAnim(b,k)          （源角色的运动 delta）
 *     W_tgt(b,k) = W_tgtRest(b) · D(b,k)                  （目标角色自己的 rest + 同样的 delta）
 *     A_tgt(b,k) = W_tgtAnim(parent,k)⁻¹ · W_tgt(b,k)     （换算回局部旋转）
 *   位移同理：T_tgt = T_tgtRest + (T_srcAnim − T_srcRest)
 *   → 动画在每只角色自己的骨架上正确播放，且**在 rest 帧退化为恒等**（网格不被拉扯）。
 *
 * 用法：node scripts/lux3d/apply-rest-correction.mjs [--src shell_naiwa] [--lib libA|libB]
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "E:/naiwa-zzz";
const WORK = path.join(ROOT, ".lux3d-work");
const TMP = path.join(WORK, "corrected");
mkdirSync(TMP, { recursive: true });

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SRC_ID = arg("src", "shell_naiwa");
const LIB = arg("lib", "libA");

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

// ---------------- 四元数（x,y,z,w） ----------------
const qMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qConj = (a) => [-a[0], -a[1], -a[2], a[3]];
const qNorm = (a) => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; };

// ---------------- 读取骨架信息 ----------------
function readSkeleton(doc) {
  const nodes = doc.getRoot().listNodes();
  const byName = new Map();
  nodes.forEach((n) => { if (n.getName()) byName.set(n.getName(), n); });
  // 父节点
  const parentOf = new Map();
  nodes.forEach((n) => (n.listChildren() || []).forEach((c) => parentOf.set(c, n)));
  const rotOf = (n) => n.getRotation() || [0, 0, 0, 1];
  const transOf = (n) => n.getTranslation() || [0, 0, 0];
  // 骨骼 = 名字以 mixamorig 开头
  const bones = new Map();
  nodes.forEach((n) => {
    const nm = n.getName();
    if (!nm || !/^mixamorig/i.test(nm)) return;
    bones.set(nm, { node: n, rot: qNorm(rotOf(n)), trans: transOf(n) });
  });
  // 骨骼的祖先链（从场景根到骨）：含非骨骼节点（Armature 等）
  const chainOf = (boneName) => {
    const chain = [];
    let cur = bones.get(boneName).node;
    while (cur) {
      chain.unshift(cur);
      cur = parentOf.get(cur);
    }
    return chain;
  };
  // rest 世界旋转 / 世界平移
  const restWorldRot = new Map();
  const restWorldTrans = new Map();
  const computeRest = () => {
    const visited = new Set();
    const walk = (node) => {
      if (visited.has(node)) return;
      visited.add(node);
      const p = parentOf.get(node);
      let wr = [0, 0, 0, 1], wt = [0, 0, 0];
      if (p) { walk(p); wr = restWorldRot.get(p); wt = restWorldTrans.get(p); }
      const nm = node.getName();
      const localR = qNorm(rotOf(node)), localT = transOf(node);
      // 简化：忽略缩放（实测缩放差为 0）
      restWorldRot.set(node, qMul(wr, localR));
      restWorldTrans.set(node, [wt[0] + localT[0], wt[1] + localT[1], wt[2] + localT[2]]);
    };
    nodes.forEach((n) => walk(n));
  };
  computeRest();
  return { nodes, byName, parentOf, bones, restWorldRot, restWorldTrans, chainOf };
}

// ---------------- 读取片段 ----------------
function readClips(doc, skel) {
  const clips = [];
  for (const anim of doc.getRoot().listAnimations()) {
    const tracks = new Map(); // boneName → { path, times, values }
    let maxKeys = 0;
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      if (!node) continue;
      const nm = node.getName();
      if (!nm || !skel.bones.has(nm)) continue;
      const s = ch.getSampler();
      const times = Array.from(s.getInput().getArray());
      const values = Array.from(s.getOutput().getArray());
      const path_ = ch.getTargetPath();
      const arr = path_ === "rotation" ? values : values;
      tracks.set(nm, { path: path_, times, values: arr, count: s.getOutput().getCount() });
      maxKeys = Math.max(maxKeys, times.length);
    }
    clips.push({ name: anim.getName(), tracks, maxKeys });
  }
  return clips;
}

// 采样：把某条轨道在时间 t 上的值线性插值（旋转用 nlerp）
function sampleTrack(tr, t) {
  if (!tr) return null;
  const { times, values, path: p } = tr;
  const n = times.length;
  if (n === 0) return null;
  if (t <= times[0]) return slice(values, 0, p);
  if (t >= times[n - 1]) return slice(values, (n - 1) * comp(p), p);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= t) lo = mid; else hi = mid; }
  const span = times[hi] - times[lo] || 1;
  const f = (t - times[lo]) / span;
  const a = slice(values, lo * comp(p), p);
  const b = slice(values, hi * comp(p), p);
  if (p === "rotation") {
    // nlerp（符号对齐，避免走长路）
    const s = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) < 0 ? -1 : 1;
    return qNorm([a[0] + (b[0] * s - a[0]) * f, a[1] + (b[1] * s - a[1]) * f, a[2] + (b[2] * s - a[2]) * f, a[3] + (b[3] * s - a[3]) * f]);
  }
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const comp = (p) => (p === "rotation" ? 4 : 3);
const slice = (arr, off, p) => arr.slice(off, off + comp(p));

// ---------------- 核心：把源片段校正到目标骨架 ----------------
function correctClip(clip, srcSkel, tgtSkel) {
  // 时间网格：取该片段所有轨道里最多的关键帧（用源片段最长轨道的时间轴）
  let times = [];
  for (const tr of clip.tracks.values()) if (tr.times.length > times.length) times = tr.times;
  if (!times.length) return null;
  const K = times.length;

  // 源：每帧每骨的世界旋转
  const srcAnimLocal = new Map();  // bone → [K] quat
  const srcAnimTrans = new Map();  // bone → [K] vec3
  for (const [bone, tr] of clip.tracks) {
    const isRot = tr.path === "rotation";
    const arr = [];
    for (let k = 0; k < K; k++) {
      const v = sampleTrack(tr, times[k]);
      arr.push(v);
    }
    if (isRot) srcAnimLocal.set(bone, arr);
    else srcAnimTrans.set(bone, arr);
  }
  // 源：世界旋转（沿链累乘，含非骨骼祖先）
  const srcWorld = new Map();  // bone → [K] quat
  const srcWorldNonBone = new Map(); // node → [K] quat（祖先节点）
  const srcChainCache = new Map();
  const chainOfBone = (bone) => {
    if (!srcChainCache.has(bone)) srcChainCache.set(bone, srcSkel.chainOf(bone));
    return srcChainCache.get(bone);
  };
  for (let k = 0; k < K; k++) {
    for (const [bone, info] of srcSkel.bones) {
      const chain = chainOfBone(bone);
      let w = [0, 0, 0, 1];
      for (const node of chain) {
        const nm = node.getName();
        const isBone = srcSkel.bones.has(nm);
        const localRot = isBone ? (srcAnimLocal.get(nm)?.[k] || info.rot) : (node.getRotation() || [0, 0, 0, 1]);
        w = qMul(w, qNorm(localRot));
        if (!isBone) {
          if (!srcWorldNonBone.has(node)) srcWorldNonBone.set(node, []);
          srcWorldNonBone.get(node).push(w);
        }
      }
      if (!srcWorld.has(bone)) srcWorld.set(bone, []);
      srcWorld.get(bone).push(w);
    }
  }

  // 目标：世界旋转与局部旋转
  const tgtWorldAnim = new Map(); // bone → [K] quat
  const tgtLocal = new Map();    // bone → [K] quat
  const tgtLocalTrans = new Map(); // bone → [K] vec3
  const tgtChainCache = new Map();
  const tgtChainOf = (bone) => {
    if (!tgtChainCache.has(bone)) tgtChainCache.set(bone, tgtSkel.chainOf(bone));
    return tgtChainCache.get(bone);
  };
  const processed = new Set();
  const process = (bone) => {
    if (processed.has(bone)) return;
    const info = tgtSkel.bones.get(bone);
    if (!info) return;
    // 先处理父级（可能是非骨骼祖先）
    const chain = tgtChainOf(bone);
    for (let i = 0; i < chain.length - 1; i++) {
      const anc = chain[i];
      const ancNm = anc.getName();
      if (tgtSkel.bones.has(ancNm)) process(ancNm);
    }
    processed.add(bone);

    const srcInfo = srcSkel.bones.get(bone);
    const srcRestW = srcInfo ? srcSkel.restWorldRot.get(srcInfo.node) : [0, 0, 0, 1];
    const tgtRestW = tgtSkel.restWorldRot.get(info.node);
    const D = new Array(K);
    for (let k = 0; k < K; k++) {
      const srcW = srcWorld.get(bone)?.[k] || srcRestW;
      D[k] = qMul(qConj(srcRestW), srcW);
    }
    // 目标世界旋转
    const wAnim = new Array(K);
    for (let k = 0; k < K; k++) {
      let parentW = tgtRestW; // 非骨骼祖先按 rest（实测差异极小）
      const chainNodes = tgtChainOf(bone);
      const parent = chainNodes[chainNodes.length - 2];
      if (parent) {
        const pn = parent.getName();
        if (tgtSkel.bones.has(pn) && tgtWorldAnim.has(pn)) parentW = tgtWorldAnim.get(pn)[k];
        else parentW = tgtSkel.restWorldRot.get(parent);
      }
      const w = qMul(tgtRestW, D[k]);
      wAnim[k] = w;
      tgtLocal.set(bone, wAnim.map(() => [0, 0, 0, 1])); // 占位，稍后填
      const local = qMul(qConj(parentW), w);
      const arr = tgtLocal.get(bone);
      arr[k] = local;
    }
    tgtWorldAnim.set(bone, wAnim);

    // 位移：目标 rest + 源的相对位移
    const srcRestT = srcInfo ? srcSkel.restWorldTrans.get(srcInfo.node) : [0, 0, 0];
    const tgtRestT = tgtSkel.restWorldTrans.get(info.node);
    const srcT = srcAnimTrans.get(bone);
    if (srcT) {
      const arr = new Array(K);
      for (let k = 0; k < K; k++) {
        const d = srcT[k];
        arr[k] = [tgtRestT[0] + (d[0] - srcRestT[0]), tgtRestT[1] + (d[1] - srcRestT[1]), tgtRestT[2] + (d[2] - srcRestT[2])];
      }
      tgtLocalTrans.set(bone, arr);
    } else {
      const arr = new Array(K);
      for (let k = 0; k < K; k++) arr[k] = [tgtRestT[0], tgtRestT[1], tgtRestT[2]];
      tgtLocalTrans.set(bone, arr);
    }
  };
  for (const bone of tgtSkel.bones.keys()) process(bone);

  return { times, tgtLocal, tgtLocalTrans };
}

// ---------------- 主流程 ----------------
const roster = JSON.parse(readFileSync(path.join(ROOT, "scripts", "lux3d", "roster.json"), "utf8"));
const ACTIONS = roster._actions.split(",").map((s) => s.trim()).filter(Boolean);
const ACTIONS2 = ["Sword_Heavy_Combo", "Sword_Regular_A_Rec", "Sword_Regular_B_Rec", "Melee_Hook_Rec", "LayToIdle", "Sitting_Enter", "Sitting_Exit", "Shield_OneShot", "Punch_Jab", "Spell_Simple_Shoot"];

const srcFile = LIB === "libB"
  ? path.join(WORK, "animlib2_raw.glb")
  : path.join(WORK, SRC_ID, "anim.glb");
if (!existsSync(srcFile)) { console.error("✗ 找不到源动画文件: " + srcFile); process.exit(1); }
console.log(`源 = ${srcFile}`);
const srcDoc = await io.read(srcFile);
const srcSkel = readSkeleton(srcDoc);
const srcClips = readClips(srcDoc, srcSkel);
console.log(`  源骨骼 ${srcSkel.bones.size} 根，片段 ${srcClips.length} 个：${srcClips.map((c) => c.name).join(", ")}`);

const actionTable = LIB === "libB" ? ACTIONS2 : ACTIONS;
let done = 0, failed = [];
for (const c of roster.characters) {
  const rigged = path.join(WORK, c.id, "rigged.glb");
  if (!existsSync(rigged)) { failed.push(c.id + "（无 rigged.glb）"); continue; }
  try {
    const doc = await io.read(rigged);
    const tgtSkel = readSkeleton(doc);
    // 目标文档：清掉已有动画（rigged 本就没有），加校正后的片段
    // GLB 只能有 0–1 个 buffer → 复用文档已有的 buffer，没有才新建
    const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer();
    const made = [];
    for (let i = 0; i < srcClips.length; i++) {
      const clip = srcClips[i];
      const res = correctClip(clip, srcSkel, tgtSkel);
      if (!res) continue;
      const name = actionTable[i] || `clip_${i + 1}`;
      const anim = doc.createAnimation(name);
      // 时间轴
      const inAcc = doc.createAccessor().setType("SCALAR").setArray(new Float32Array(res.times)).setBuffer(buffer);
      for (const [bone, arr] of res.tgtLocal) {
        const out = new Float32Array(arr.length * 4);
        for (let k = 0; k < arr.length; k++) { out[k * 4] = arr[k][0]; out[k * 4 + 1] = arr[k][1]; out[k * 4 + 2] = arr[k][2]; out[k * 4 + 3] = arr[k][3]; }
        const outAcc = doc.createAccessor().setType("VEC4").setArray(out).setBuffer(buffer);
        const sampler = doc.createAnimationSampler().setInput(inAcc).setOutput(outAcc).setInterpolation("LINEAR");
        anim.addSampler(sampler);
        const channel = doc.createAnimationChannel().setTargetPath("rotation").setTargetNode(tgtSkel.bones.get(bone).node).setSampler(sampler);
        anim.addChannel(channel);
      }
      for (const [bone, arr] of res.tgtLocalTrans) {
        // 只输出与源同样有位移轨道的骨骼（通常是根）
        const srcHad = srcClips[i].tracks.get(bone);
        if (!srcHad || srcHad.path !== "translation") continue;
        const out = new Float32Array(arr.length * 3);
        for (let k = 0; k < arr.length; k++) { out[k * 3] = arr[k][0]; out[k * 3 + 1] = arr[k][1]; out[k * 3 + 2] = arr[k][2]; }
        const outAcc = doc.createAccessor().setType("VEC3").setArray(out).setBuffer(buffer);
        const sampler = doc.createAnimationSampler().setInput(inAcc).setOutput(outAcc).setInterpolation("LINEAR");
        anim.addSampler(sampler);
        const channel = doc.createAnimationChannel().setTargetPath("translation").setTargetNode(tgtSkel.bones.get(bone).node).setSampler(sampler);
        anim.addChannel(channel);
      }
      made.push(name);
    }
    const tmpOut = path.join(TMP, `${c.id}${LIB}.glb`);
    await io.write(tmpOut, doc);
    // 走既有定版化管线（贴图压缩 + 量化 + meshopt），片段按索引改名
    execFileSync("node", [
      path.join(ROOT, "scripts", "lux3d", "finalize.mjs"),
      "--in", tmpOut, "--out", path.join(ROOT, "public", "asset", c.glb),
      "--actions", actionTable.join(","),
    ], { stdio: "ignore", cwd: ROOT });
    console.log(`  [${c.id}] 校正片段 ${made.length} 段 → public/asset/${c.glb}`);
    done++;
  } catch (e) {
    failed.push(c.id + ": " + String(e).slice(0, 90));
    console.log(`  [${c.id}] ✗ ${String(e && e.stack ? e.stack : e).slice(0, 900)}`);
  }
}
console.log(`\n完成 ${done}/16${failed.length ? "；失败: " + failed.join(" | ") : ""}`);
