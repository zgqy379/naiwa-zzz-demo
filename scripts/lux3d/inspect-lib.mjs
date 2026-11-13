import fs from "node:fs";

function info(p, label) {
  const b = fs.readFileSync(p);
  const len = b.readUInt32LE(12);
  const g = JSON.parse(b.toString("utf8", 20, 20 + len));
  const nodes = g.nodes || [];
  let bones = 0;
  nodes.forEach((n) => { if (n.name && /^mixamorig/i.test(n.name)) bones++; });
  const anims = g.animations || [];
  console.log(`  [${label}] nodes=${nodes.length} bones=${bones} skins=${(g.skins || []).length} anims=${anims.length} meshes=${(g.meshes || []).length}`);
  for (const a of anims.slice(0, 2)) {
    const chans = a.channels || [];
    let bad = 0, quat = 0, pos = 0;
    for (const c of chans) {
      const t = c.target.node;
      if (t == null || t < 0 || t >= nodes.length) bad++;
      if (c.target.path === "rotation") quat++;
      if (c.target.path === "translation") pos++;
    }
    console.log(`    clip ${a.name} channels=${chans.length} rotation=${quat} translation=${pos} invalidTargets=${bad}`);
    // 采样第一条 rotation 轨道：看是否非单位四元数（若全是单位四元数 = 动画被清空）
    for (const c of chans) {
      if (c.target.path !== "rotation") continue;
      const s = a.samplers[c.sampler];
      const acc = g.accessors[s.output];
      const buf = Buffer.from(g.bufferViews[acc.bufferView].buffer, "base64");
      const off = (g.bufferViews[acc.bufferView].byteOffset || 0) + (acc.byteOffset || 0);
      const vals = [];
      for (let i = 0; i < Math.min(3, acc.count); i++) {
        const o = off + i * 16;
        vals.push([buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8), buf.readFloatLE(o + 12)].map((x) => +x.toFixed(3)).join(","));
      }
      console.log(`      首条 rotation 轨道 target=#${c.target.node} ${nodes[c.target.node]?.name} 前3帧=[${vals.join(" | ")}]`);
      break;
    }
  }
}

console.log("=== 定版后的共享库 vs 源 anim.glb ===");
info("public/asset/naiwa_anim_lib.glb", "定版库 A");
info(".lux3d-work/shell_naiwa/anim.glb", "源 anim.glb");
