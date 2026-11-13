/**
 * 定位「finalize --anim-only 破坏动画」的根因：逐字段对比
 *   原始 retarget 产出（.lux3d-work/shell_naiwa/anim.glb）
 *   vs 定版后的共享库（public/asset/naiwa_anim_lib.glb）
 * 对比项：片段名、每片段通道数、轨道目标节点名、关键帧数、采样值分布。
 */
import fs from "node:fs";

function load(p) {
  const b = fs.readFileSync(p);
  const len = b.readUInt32LE(12);
  const g = JSON.parse(b.toString("utf8", 20, 20 + len));
  const bin = g.buffers?.[0];
  let buffer = null;
  if (!bin || !bin.uri) {
    // GLB 内嵌：JSON chunk 后紧跟 BIN chunk
    const jsonLen = b.readUInt32LE(12);
    const binOff = 20 + jsonLen + 8;
    const binLen = b.readUInt32LE(binOff);
    buffer = b.subarray(binOff + 8, binOff + 8 + binLen);
  }
  return { g, buffer };
}

function readFloats(g, buffer, accIdx) {
  const acc = g.accessors[accIdx];
  const bv = g.bufferViews[acc.bufferView];
  const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const n = acc.count * 4;
  const arr = new Float32Array(buffer.buffer, buffer.byteOffset + off, n);
  return arr;
}

function report(p, label) {
  const { g, buffer } = load(p);
  const boneNames = new Map();
  g.nodes.forEach((n, i) => { if (n.name) boneNames.set(i, n.name); });
  console.log(`\n=== ${label} ===`);
  console.log(`  nodes=${g.nodes.length} anims=${(g.animations || []).length} extUsed=${JSON.stringify(g.extensionsUsed || [])}`);
  for (const a of (g.animations || []).slice(0, 3)) {
    const chans = a.channels || [];
    const byPath = {};
    let maxKeys = 0;
    const samples = [];
    for (const c of chans) {
      const s = a.samplers[c.sampler];
      const acc = g.accessors[s.output];
      maxKeys = Math.max(maxKeys, acc.count);
      byPath[c.target.path] = (byPath[c.target.path] || 0) + 1;
      if (c.target.path === "rotation" && samples.length < 2) {
        const f = readFloats(g, buffer, s.output);
        const vals = [];
        for (let i = 0; i < Math.min(3, acc.count); i++) vals.push([f[i*4], f[i*4+1], f[i*4+2], f[i*4+3]].map(x => +x.toFixed(4)).join(","));
        samples.push(`${boneNames.get(c.target.node)}#${c.target.node} [${vals.join(" | ")}]`);
      }
    }
    console.log(`  clip "${a.name}" 通道=${chans.length} 轨道分布=${JSON.stringify(byPath)} 最大关键帧=${maxKeys} 插值=${a.samplers?.[0]?.interpolation || "LINEAR"}`);
    samples.forEach(s => console.log(`      ${s}`));
  }
}

report(".lux3d-work/shell_naiwa/anim.glb", "原始 retarget 产出（combined）");
report("public/asset/naiwa_anim_lib.glb", "定版后的共享库 A");
report(".lux3d-work/oldlib/naiwa_anim_lib_old.glb", "上一轮的共享库 A（人形模型源）");
