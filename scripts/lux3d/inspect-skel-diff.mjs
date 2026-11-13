/**
 * 量化 rigged.glb（绑骨产出）与 anim.glb（retarget 产出）之间的骨架差异，
 * 判断差异性质：
 *   ① 仅全局变换（可用一个补偿矩阵解决 → 零积分）
 *   ② 每节点 rest 旋转不同（蒙皮绑定矩阵失配 → 需要重绑定或逐只重定向）
 */
import fs from "node:fs";

function load(p) {
  const b = fs.readFileSync(p);
  const len = b.readUInt32LE(12);
  const g = JSON.parse(b.toString("utf8", 20, 20 + len));
  return g;
}

function bonesOf(g) {
  const map = new Map();
  g.nodes.forEach((n, i) => { if (n.name && /^mixamorig/.test(n.name)) map.set(n.name, { i, t: n.translation || [0, 0, 0], r: n.rotation || [0, 0, 0, 1], s: n.scale || [1, 1, 1] }); });
  return map;
}

function qAngleDeg(a, b) {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const A = load(".lux3d-work/shell_naiwa/rigged.glb");
const B = load(".lux3d-work/shell_naiwa/anim.glb");
const ba = bonesOf(A), bb = bonesOf(B);

console.log(`  rigged.glb 骨骼数 = ${ba.size}   anim.glb 骨骼数 = ${bb.size}`);

// 名称集合是否一致
const onlyA = [...ba.keys()].filter((k) => !bb.has(k));
const onlyB = [...bb.keys()].filter((k) => !ba.has(k));
console.log(`  仅 rigged 有: ${onlyA.slice(0, 5).join(",") || "无"}`);
console.log(`  仅 anim 有:   ${onlyB.slice(0, 5).join(",") || "无"}`);

const torso = ["mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head", "mixamorig:LeftShoulder", "mixamorig:RightShoulder", "mixamorig:LeftUpLeg", "mixamorig:RightUpLeg"];
let n = 0, sumDeg = 0, maxDeg = 0, sumT = 0, maxT = 0, sumS = 0;
const worst = [];
for (const [name, a] of ba) {
  const b = bb.get(name);
  if (!b) continue;
  const d = qAngleDeg(a.r, b.r);
  const dt = dist3(a.t, b.t);
  const ds = Math.abs(a.s[0] - b.s[0]) + Math.abs(a.s[1] - b.s[1]) + Math.abs(a.s[2] - b.s[2]);
  n++; sumDeg += d; sumT += dt; sumS += ds;
  if (d > maxDeg) maxDeg = d;
  if (dt > maxT) maxT = dt;
  worst.push({ name, deg: +d.toFixed(2), dt: +dt.toFixed(4), ds: +ds.toFixed(4) });
}
console.log(`\n  共 ${n} 根同名骨骼：平均角差 ${(sumDeg / n).toFixed(2)}°  最大 ${maxDeg.toFixed(2)}°  平均位移差 ${(sumT / n).toFixed(4)}  最大位移差 ${maxT.toFixed(4)}  平均缩放差 ${(sumS / n).toFixed(4)}`);
worst.sort((x, y) => y.deg - x.deg);
console.log("  角差最大 8 根:");
worst.slice(0, 8).forEach((w) => console.log(`    ${w.name.padEnd(26)} ${String(w.deg).padStart(6)}°  dt=${w.dt}  ds=${w.ds}`));
console.log("  躯干关键骨:");
torso.forEach((k) => {
  const w = worst.find((x) => x.name === k);
  if (w) console.log(`    ${w.name.padEnd(26)} ${String(w.deg).padStart(6)}°  dt=${w.dt}  ds=${w.ds}`);
});

// 整体是否只是一个全局旋转？看 Hips 的相对关系
const hA = ba.get("mixamorig:Hips"), hB = bb.get("mixamorig:Hips");
console.log(`\n  Hips: rigged r=[${hA.r.map((x) => +x.toFixed(4))}] t=[${hA.t.map((x) => +x.toFixed(4))}] s=[${hA.s.map((x) => +x.toFixed(4))}]`);
console.log(`  Hips: anim   r=[${hB.r.map((x) => +x.toFixed(4))}] t=[${hB.t.map((x) => +x.toFixed(4))}] s=[${hB.s.map((x) => +x.toFixed(4))}]`);

// 网格顶点数与蒙皮权重是否一致
const skinA = (A.skins || [])[0], skinB = (B.skins || [])[0];
console.log(`\n  rigged: joints=${skinA?.joints?.length} ibm=${A.accessors[skinA?.inverseBindMatrices]?.count}`);
console.log(`  anim  : joints=${skinB?.joints?.length} ibm=${B.accessors[skinB?.inverseBindMatrices]?.count}`);
const vertsA = (A.meshes || []).reduce((s, m) => s + (m.primitives || []).reduce((a, p) => a + (A.accessors[p.attributes.POSITION]?.count || 0), 0), 0);
const vertsB = (B.meshes || []).reduce((s, m) => s + (m.primitives || []).reduce((a, p) => a + (B.accessors[p.attributes.POSITION]?.count || 0), 0), 0);
console.log(`  顶点数: rigged=${vertsA}  anim=${vertsB}`);
