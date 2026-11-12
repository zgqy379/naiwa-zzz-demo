/**
 * 定版化：把官方产出的 rigged+animated GLB 处理成游戏运行时资产。
 *
 * ① 片段改名：官方 combined 产出的片段名是 animation_1..N（按传入 actionIds 顺序），
 *    这里改成可读动作名（Idle_Loop / Walk_Loop / Sword_Regular_A ...），
 *    游戏侧按名字查片段，不再靠下标猜。
 * ② 压缩：贴图 → 512 JPEG（sharp）；几何/动画量化 + meshopt（@gltf-transform），
 *    目标体积与仓库既有 runtime GLB 同量级（几百 KB）。
 * ③ 校验：骨骼数 / 片段数 / 顶点数，并打印结果。
 *
 * 用法：node scripts/lux3d/finalize.mjs --in <anim.glb> --out public/asset/<name>_runtime.glb
 *                              --actions "Idle_Loop,Walk_Loop,..."
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const IN = arg("in");
const OUT = arg("out");
const ACTIONS = (arg("actions") || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!IN || !OUT) { console.error("用法：--in <anim.glb> --out <target.glb> --actions A,B,C"); process.exit(1); }

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

const doc = await io.read(IN);
const root = doc.getRoot();

// ① 片段改名
const anims = root.listAnimations();
console.log(`片段数 = ${anims.length}，动作表 = ${ACTIONS.length}`);
if (ACTIONS.length && anims.length !== ACTIONS.length) {
  console.warn(`⚠ 数量不一致：官方产出 ${anims.length} 个，动作表 ${ACTIONS.length} 个 → 只改名能对上的部分`);
}
anims.forEach((a, i) => {
  const want = ACTIONS[i] || `clip_${i + 1}`;
  a.setName(want);
});
console.log("片段名 =", anims.map((a) => a.getName()).join(", "));

// ② 贴图压缩：文档内所有贴图统一处理（baseColor/ORM → 512 JPEG；法线 → 512 PNG）
const texSlots = [
  ["baseColor", (m) => m.getBaseColorTexture()],
  ["orm", (m) => m.getMetallicRoughnessTexture()],
  ["normal", (m) => m.getNormalTexture()],
  ["emissive", (m) => m.getEmissiveTexture()],
];
const handled = new Set();
for (const mat of root.listMaterials()) {
  for (const [tag, getter] of texSlots) {
    const tex = getter(mat);
    if (!tex || handled.has(tex)) continue;
    handled.add(tex);
    const img = tex.getImage();
    if (!img) continue;
    try {
      const buf = tag === "normal"
        ? await sharp(img).resize(512, 512, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9, palette: true }).toBuffer()
        : await sharp(img).resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      tex.setImage(buf).setMimeType(tag === "normal" ? "image/png" : "image/jpeg");
      console.log(`  贴图 ${tag}: ${(img.length / 1024).toFixed(0)} KB → ${(buf.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      console.warn(`  贴图 ${tag} 处理失败（保留原样）:`, String(e).slice(0, 80));
    }
  }
}
// 兜底：没被槽位认领的贴图也压一遍
for (const tex of root.listTextures()) {
  if (handled.has(tex)) continue;
  const img = tex.getImage();
  if (!img) continue;
  try {
    const buf = await sharp(img).resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    tex.setImage(buf).setMimeType("image/jpeg");
    console.log(`  贴图(未归槽): ${(img.length / 1024).toFixed(0)} KB → ${(buf.length / 1024).toFixed(0)} KB`);
  } catch { /* 忽略 */ }
}

// ②b 可选：只保留骨骼 + 动画（去掉网格）→ 做成「共享动画库」
if (argv.includes("--anim-only")) {
  // 网格的 accessor 同样会变成孤儿（与动画剥离同一个坑），一并释放
  const meshAccessors = new Set();
  for (const m of root.listMeshes()) {
    for (const pr of m.listPrimitives()) {
      const attrs = pr.getAttributes ? pr.getAttributes() : pr.getAttributeMap?.() ?? {};
      for (const a of Object.values(attrs)) meshAccessors.add(a);
      const idx = pr.getIndices ? pr.getIndices() : null;
      if (idx) meshAccessors.add(idx);
    }
    m.dispose();
  }
  for (const acc of meshAccessors) {
    try { acc.dispose(); } catch { /* 忽略 */ }
  }
  console.log(`  已剥离网格（--anim-only：输出为共享动画库，释放 ${meshAccessors.size} 个网格 accessor）`);
}
// ②c 可选：只保留网格 + 骨骼（去掉动画片段）→ 角色运行时资产
if (argv.includes("--no-animations")) {
  // ⚠ Animation.dispose() 只删动画节点，**采样器引用的 accessor 会变成孤儿仍被写进 buffer**
  // （实测：不去掉时 10 段动画留下 1000+ 个 float accessor，角色文件反而更大）。
  // 先把动画采样器用到的 accessor 收集起来，再连同动画一起释放。
  const animAccessors = new Set();
  for (const a of root.listAnimations()) {
    for (const s of a.listSamplers()) {
      animAccessors.add(s.getInput());
      animAccessors.add(s.getOutput());
    }
  }
  for (const a of root.listAnimations()) a.dispose();
  for (const acc of animAccessors) {
    try { acc.dispose(); } catch { /* 忽略 */ }
  }
  console.log(`  已剥离动画片段（--no-animations：释放 ${animAccessors.size} 个动画 accessor）`);
}

// ③ 量化 + meshopt 压缩（与仓库既有 runtime GLB 同口径：KHR_mesh_quantization + EXT_meshopt_compression）
const fn = await import("@gltf-transform/functions");
try {
  await doc.transform(
    fn.weld(),
    fn.dedup(),
    fn.quantize({
      pattern: /.*/,
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeAnimation: 10,
    }),
  );
} catch (e) {
  console.warn("  量化/焊接跳过:", String(e).slice(0, 120));
}
try {
  const ext = doc.createExtension(EXTMeshoptCompression);
  ext.setRequired(true);
  ext.setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  console.log("  已启用 EXT_meshopt_compression（QUANTIZE 模式）");
} catch (e) {
  console.warn("  meshopt 扩展启用失败:", String(e).slice(0, 120));
}

mkdirSync(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);

// ④ 校验
const bytes = readFileSync(OUT);
const fd = bytes;
const clen = fd.readUInt32LE(12);
const json = JSON.parse(fd.toString("utf8", 20, 20 + clen));
let verts = 0;
for (const m of json.meshes || []) for (const pr of m.primitives || []) if (pr.attributes?.POSITION != null) verts += json.accessors[pr.attributes.POSITION].count;
const bufBytes = (json.buffers || []).reduce((s, b) => s + (b.byteLength || 0), 0);
const imgBytes = (json.images || []).reduce((s, im) => s + (im.bufferView != null ? json.bufferViews[im.bufferView]?.byteLength || 0 : 0), 0);
console.log(JSON.stringify({
  out: OUT,
  bytes: statSync(OUT).size,
  kb: Math.round(statSync(OUT).size / 1024),
  bufferKB: Math.round(bufBytes / 1024),
  imageKB: Math.round(imgBytes / 1024),
  meshes: (json.meshes || []).length,
  skins: (json.skins || []).length,
  joints: (json.skins || []).reduce((s, x) => s + (x.joints || []).length, 0),
  animations: (json.animations || []).length,
  clipNames: (json.animations || []).map((a) => a.name),
  verts,
  materials: (json.materials || []).length,
  images: (json.images || []).map((i) => i.mimeType),
}, null, 1));
