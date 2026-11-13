/**
 * 正确解码对比（meshopt + KHR_mesh_quantization 都要走 gltf-transform 的解码路径）：
 *   原始 retarget 产出 vs 定版后的共享库 A vs 上一轮的共享库 A
 * 输出：片段名、关键帧数、若干旋转采样的实际值 → 判定「定版化是否损坏动画」与「片段名映射是否错位」。
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

async function report(p, label) {
  console.log(`\n=== ${label} ===`);
  let doc;
  try {
    doc = await io.read(p);
  } catch (e) {
    console.log("  读取失败: " + String(e).slice(0, 140));
    return;
  }
  const anims = doc.getRoot().listAnimations();
  console.log(`  片段数 = ${anims.length}`);
  for (const a of anims.slice(0, 4)) {
    const tracks = a.listChannels();
    let maxKeys = 0;
    const rots = [];
    for (const t of tracks) {
      const s = t.getSampler();
      const n = s.getOutput().getCount();
      maxKeys = Math.max(maxKeys, n);
      if (t.getTargetPath() === "rotation" && rots.length < 2) {
        const v = s.getOutput().getElement(0, []);
        rots.push(`${t.getTargetNode()?.getName() || "?"} = [${v.map((x) => +x.toFixed(4)).join(", ")}]`);
      }
    }
    console.log(`  "${a.getName()}" 轨道=${tracks.length} 最大关键帧=${maxKeys}`);
    rots.forEach((r) => console.log("      " + r));
  }
  const names = anims.map((a) => a.getName());
  console.log("  全部片段名: " + names.join(", "));
}

await report(".lux3d-work/shell_naiwa/anim.glb", "原始 retarget 产出（IP 奶蛙源）");
await report("public/asset/naiwa_anim_lib.glb", "定版后的共享库 A（本轮重建）");
await report(".lux3d-work/oldlib/naiwa_anim_lib_old.glb", "上一轮的共享库 A（人形源）");
