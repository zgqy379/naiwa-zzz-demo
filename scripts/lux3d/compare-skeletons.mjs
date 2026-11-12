/** 比对多个 GLB 的骨架（关节名 + 层级 + 蒙皮权重），判断能否共用一套官方动画片段。 */
import fs from "node:fs";

function gltfJson(file) {
  const b = fs.readFileSync(file);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.toString("utf8", 20, 20 + len));
}

const files = process.argv.slice(2);
const infos = files.map((file) => {
  const g = gltfJson(file);
  const skin = (g.skins || [])[0];
  const joints = (skin?.joints || []).map((i) => g.nodes?.[i]?.name || ("node" + i));
  // 关节的父链（判断层级是否一致）
  const parentOf = new Map();
  (g.nodes || []).forEach((n, i) => { if (n.children) for (const c of n.children) parentOf.set(c, i); });
  const chainOf = (i) => { const out = []; let cur = i; let guard = 0; while (cur != null && guard++ < 20) { out.push(g.nodes[cur]?.name || cur); cur = parentOf.get(cur); } return out.join("<"); };
  const chains = (skin?.joints || []).map((i) => chainOf(i));
  return {
    file,
    skinCount: (g.skins || []).length,
    jointCount: joints.length,
    joints,
    chains,
    animCount: (g.animations || []).length,
    clipNames: (g.animations || []).map((a) => a.name),
  };
});

for (const i of infos) {
  console.log(`\n=== ${i.file}`);
  console.log(`  skins=${i.skinCount} joints=${i.jointCount} anims=${i.animCount}`);
  console.log("  关节名 =", i.joints.join(", "));
}
if (infos.length >= 2) {
  const a = infos[0], b = infos[1];
  const sameNames = JSON.stringify(a.joints) === JSON.stringify(b.joints);
  const sameSet = JSON.stringify([...a.joints].sort()) === JSON.stringify([...b.joints].sort());
  const sameChain = JSON.stringify(a.chains) === JSON.stringify(b.chains);
  console.log("\n=== 跨角色一致性 ===");
  console.log("  关节名顺序完全一致 =", sameNames);
  console.log("  关节名集合一致     =", sameSet);
  console.log("  层级链完全一致     =", sameChain);
  if (!sameSet) {
    const setA = new Set(a.joints), setB = new Set(b.joints);
    console.log("  仅 A 有 =", a.joints.filter((x) => !setB.has(x)).join(", "));
    console.log("  仅 B 有 =", b.joints.filter((x) => !setA.has(x)).join(", "));
  }
  if (infos.length >= 3) {
    const all = infos.every((x) => JSON.stringify([...x.joints].sort()) === JSON.stringify([...infos[0].joints].sort()));
    console.log("  全部角色关节集合一致 =", all);
  }
}
