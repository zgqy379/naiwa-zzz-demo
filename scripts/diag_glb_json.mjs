/**
 * 只读诊断：直接解析 GLB 的 JSON chunk（不依赖 three），列出
 *  - 每个 node 的 name / translation / rotation / scale
 *  - 每个 mesh primitive 的 POSITION accessor min/max（bind pose 局部包围盒）
 *  - 材质 alphaMode / baseColorFactor 透明度 / 是否 doubleSided
 *  - skins 数量
 *
 * 目的：定位「奶鱼本体屏占比 17.5% 离群」是否因为
 *  (a) 模型本身矮；(b) Box3.setFromObject 测到的是 bind pose 而非实际渲染姿态；(c) 存在不可见大几何拉高 bbox。
 *
 * 用法：node scripts/diag_glb_json.mjs [glb文件名...]
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DEFAULTS = [
  "naiwa_laugh_g1_runtime.glb",
  "naiwa_naifen_runtime.glb",
  "naiwa_naimao_runtime.glb",
  "naiwa_naishi_runtime.glb",
  "naiwa_naiyu_runtime.glb",
  "naiwa_xigema_runtime.glb",
  "naiwa_nashu_runtime.glb",
  "naiwa_naitu_runtime.glb",
];
const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS;

function parseGlb(file) {
  const buf = readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not glb: " + file);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  while (off + 8 <= total) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8")); // JSON
    off += 8 + len;
  }
  return { json, bytes: buf.length };
}

const rows = [];
const outPath = path.join(ROOT, "docs", "evidence", "v3-show2-glb-diag.json");
mkdirSync(path.dirname(outPath), { recursive: true });

for (const name of files) {
  const file = path.join(ROOT, "public", "asset", name);
  const { json: g, bytes } = parseGlb(file);
  const acc = g.accessors || [];
  const nodes = g.nodes || [];
  const meshes = g.meshes || [];
  const mats = g.materials || [];
  const prims = [];
  meshes.forEach((mesh, mi) => {
    (mesh.primitives || []).forEach((p, pi) => {
      const a = acc[p.attributes?.POSITION ?? -1];
      if (!a?.min || !a?.max) return;
      const mat = p.material != null ? mats[p.material] : null;
      prims.push({
        mesh: mesh.name ?? mi,
        prim: pi,
        mat: mat?.name ?? null,
        alphaMode: mat?.alphaMode ?? "OPAQUE",
        baseAlpha: mat?.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1,
        doubleSided: !!mat?.doubleSided,
        count: a.count,
        min: a.min,
        max: a.max,
        height: +(a.max[1] - a.min[1]).toFixed(4),
        widthX: +(a.max[0] - a.min[0]).toFixed(4),
        depthZ: +(a.max[2] - a.min[2]).toFixed(4),
      });
    });
  });
  const nodeSummary = nodes.map((n, i) => ({
    i,
    name: n.name ?? null,
    mesh: n.mesh ?? null,
    skin: n.skin ?? null,
    scale: n.scale ?? null,
    translation: n.translation ?? null,
    rotation: n.rotation ?? null,
  }));
  const totalBindHeight = prims.length
    ? +(Math.max(...prims.map((p) => p.max[1])) - Math.min(...prims.map((p) => p.min[1]))).toFixed(4)
    : 0;
  rows.push({
    file: name,
    bytes,
    nodeCount: nodes.length,
    meshCount: meshes.length,
    skinCount: (g.skins || []).length,
    animationCount: (g.animations || []).length,
    totalBindHeight,
    prims,
    nodes: nodeSummary,
  });
}

writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2), "utf8");
for (const r of rows) {
  const line = `[glb] ${r.file} bytes=${r.bytes} nodes=${r.nodeCount} meshes=${r.meshCount} skins=${r.skinCount} anims=${r.animationCount} bindH=${r.totalBindHeight}`;
  console.log(line);
  appendFileSync(path.join(ROOT, ".tmp-show2-glb-diag.log"), line + "\n");
  for (const p of r.prims) {
    const s = `  prim ${p.mesh}/${p.prim} mat=${p.mat} alpha=${p.alphaMode} a=${p.baseAlpha} count=${p.count} h=${p.height} w=${p.widthX} d=${p.depthZ} minY=${p.min[1]} maxY=${p.max[1]}`;
    console.log(s);
    appendFileSync(path.join(ROOT, ".tmp-show2-glb-diag.log"), s + "\n");
  }
}
console.log("[out] " + outPath);