/**
 * GLB 结构自检 —— 替代报告书里无法验证的「glTF-Validator 0 error / 0 warning」外部工具声明。
 *
 * 本脚本不依赖任何外部工具，纯 Node 解析 GLB 二进制，按 glTF 2.0 规范逐项检查：
 *   1. 容器头：magic 'glTF' / version=2 / 声明长度 == 实际长度
 *   2. chunk 序列：长度 4 字节对齐、类型合法（JSON=0x4E4F534A / BIN=0x004E4942）、
 *      JSON 必须在最前、BIN chunk 边界不越界
 *   3. JSON 可解析；buffers / bufferViews / accessors / meshes 的索引引用全部在界内
 *   4. bufferView 的 byteOffset+byteLength 不越出**它所属的 buffer**（GLB 的 BIN chunk
 *      内多 buffer 连续排布，buffer.byteOffset 是相对 BIN chunk 的偏移）
 *   5. accessor 的 byteOffset+元素大小不超出所属 bufferView
 *   6. primitive 的 index accessor：未压缩时逐个读索引取最大值，与 POSITION 的 count 比对
 *      （越界会让 GPU 读到邻接内存）；走 EXT_meshopt_compression 时改用 accessor 自带的
 *      max 声明比对（压缩数据不可直接解码）
 *
 * ⚠ 上一版曾误报 47 项，根因有二：(a) 读取原始字节时漏加 BIN chunk 在文件中的起始偏移；
 *   (b) 把 bufferView.byteLength 与 buffers[0].byteLength 直接比——meshopt 压缩视图的
 *   byteLength 是**解压后**长度，且 runtime GLB 的 bufferView 指向 buffer:1（解压回退缓冲）。
 *   本版按规范修正。
 *
 * 产出：docs/evidence/v3-glb-selfcheck-20261111.json
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const OUT_DIR = path.join(ROOT, "docs", "evidence");
const OUT = path.join(OUT_DIR, "v3-glb-selfcheck-20261111.json");

const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function parseGLB(buf, label) {
  const errors = [];
  const info = { file: label, bytes: buf.length };

  if (buf.length < 12) { errors.push("文件小于 12 字节容器头"); return { info, errors }; }
  if (buf.readUInt32LE(0) !== 0x46546c67) errors.push("magic 不是 'glTF'");
  const version = buf.readUInt32LE(4);
  if (version !== 2) errors.push("version 不是 2（实为 " + version + "）");
  const declared = buf.readUInt32LE(8);
  if (declared !== buf.length) errors.push("容器头声明长度 " + declared + " != 实际 " + buf.length);

  let off = 12, json = null, binStart = -1, binLength = 0, chunkIndex = 0;
  while (off < buf.length) {
    if (off + 8 > buf.length) { errors.push("chunk 头越界 @" + off); break; }
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const dataStart = off + 8, dataEnd = dataStart + len;
    if (dataEnd > buf.length) { errors.push("chunk 数据越界 @" + off + "（len=" + len + "）"); break; }
    if (len % 4 !== 0) errors.push("chunk 长度未 4 字节对齐 @" + off + "（len=" + len + "）");
    if (chunkIndex === 0 && type !== CHUNK_JSON) errors.push("首个 chunk 不是 JSON");
    if (type === CHUNK_JSON) {
      if (json) errors.push("出现第二个 JSON chunk");
      try { json = JSON.parse(buf.toString("utf8", dataStart, dataEnd).replace(/\0+$/, "")); }
      catch (e) { errors.push("JSON chunk 解析失败: " + e.message); }
    } else if (type === CHUNK_BIN) {
      binStart = dataStart; binLength = len;
    } else {
      errors.push("未知 chunk 类型 0x" + type.toString(16) + " @" + off);
    }
    off = dataEnd; chunkIndex++;
  }
  if (!json) { errors.push("无 JSON chunk"); return { info, errors }; }
  if (binStart < 0) errors.push("无 BIN chunk");

  const accessors = json.accessors || [];
  const bufferViews = json.bufferViews || [];
  const buffers = json.buffers || [];
  const meshes = json.meshes || [];

  // buffer 边界：buffer.byteOffset 是相对 BIN chunk 的偏移
  // ⚠ EXT_meshopt_compression 的**回退缓冲（fallback buffer）不存放在 BIN chunk 里**
  //   ——文件里只有压缩数据；回退缓冲只是给不支持该扩展的解码器一个布局占位。
  //   故：只被 meshopt 压缩视图引用的 buffer 不做「必须在 BIN chunk 内」检查。
  const fallbackOnly = new Set();
  for (const bv of bufferViews) {
    if (bv.extensions && bv.extensions.EXT_meshopt_compression) fallbackOnly.add(bv.buffer);
  }
  buffers.forEach((b, i) => {
    if (fallbackOnly.has(i) && buffers.length > 1) return; // 回退缓冲：不在 BIN chunk 内
    const end = (b.byteOffset || 0) + b.byteLength;
    if (end > binLength) errors.push("buffers[" + i + "] 越出 BIN chunk（end=" + end + " > " + binLength + "）");
  });

  // bufferView 边界：相对它所属的 buffer
  bufferViews.forEach((bv, i) => {
    const buf = buffers[bv.buffer];
    if (!buf) { errors.push("bufferViews[" + i + "] 引用了不存在的 buffer " + bv.buffer); return; }
    const end = (bv.byteOffset || 0) + (bv.byteLength || 0);
    if (end > buf.byteLength) {
      errors.push("bufferViews[" + i + "] 越出所属 buffer[" + bv.buffer + "]（end=" + end + " > " + buf.byteLength + "）");
    }
  });

  // accessor 边界：相对所属 bufferView
  accessors.forEach((a, i) => {
    const n = TYPE_COUNT[a.type];
    if (!n) { errors.push("accessors[" + i + "].type 非法: " + a.type); return; }
    const cb = COMPONENT_BYTES[a.componentType];
    if (!cb) { errors.push("accessors[" + i + "].componentType 非法: " + a.componentType); return; }
    if (a.bufferView === undefined) return;
    const bv = bufferViews[a.bufferView];
    if (!bv) { errors.push("accessors[" + i + "] 引用了不存在的 bufferView " + a.bufferView); return; }
    const accEnd = (a.byteOffset || 0) + n * cb * a.count;
    if (accEnd > (bv.byteLength || 0)) {
      errors.push("accessors[" + i + "] 超出所属 bufferView（end=" + accEnd + " > " + (bv.byteLength || 0) + "）");
    }
  });

  // primitive 索引检查
  let tris = 0, prims = 0, idxChecked = 0, idxSkipped = 0;
  meshes.forEach((m, mi) => {
    (m.primitives || []).forEach((p, pi) => {
      prims++;
      const where = "meshes[" + mi + "].primitives[" + pi + "]";
      const pos = p.attributes && p.attributes.POSITION;
      if (pos === undefined) { errors.push(where + " 缺 POSITION"); return; }
      const posAcc = accessors[pos];
      if (!posAcc) { errors.push(where + ".POSITION 指向不存在的 accessor " + pos); return; }
      if (p.indices === undefined) { tris += (posAcc.count || 0) / 3; return; }
      const idxAcc = accessors[p.indices];
      if (!idxAcc) { errors.push(where + ".indices 指向不存在的 accessor " + p.indices); return; }
      const idxBV = bufferViews[idxAcc.bufferView];
      if (!idxBV) { errors.push(where + ".indices 的 bufferView 不存在"); return; }
      const comp = COMPONENT_BYTES[idxAcc.componentType];
      const n = TYPE_COUNT[idxAcc.type];
      const elem = comp * n;
      const compressed = !!(idxBV.extensions && idxBV.extensions.EXT_meshopt_compression);

      if (compressed) {
        // 压缩数据不可直接解码：改用 accessor 自带的 max 声明比对
        idxSkipped++;
        if (Array.isArray(idxAcc.max)) {
          const declaredMax = idxAcc.max[0];
          if (declaredMax >= posAcc.count) {
            errors.push(where + " 索引最大值声明 " + declaredMax + " >= 顶点数 " + posAcc.count);
          }
        }
        tris += idxAcc.count / 3;
        return;
      }

      const bufMeta = buffers[idxBV.buffer];
      if (!bufMeta) { errors.push(where + " 的 bufferView 指向不存在的 buffer"); return; }
      const base = binStart + (bufMeta.byteOffset || 0) + (idxBV.byteOffset || 0) + (idxAcc.byteOffset || 0);
      let max = -1;
      for (let k = 0; k < idxAcc.count; k++) {
        const p0 = base + k * elem;
        if (p0 + comp > buf.length) { errors.push(where + " 索引数据越出文件"); break; }
        let v;
        if (idxAcc.componentType === 5123) v = buf.readUInt16LE(p0);
        else if (idxAcc.componentType === 5125) v = buf.readUInt32LE(p0);
        else if (idxAcc.componentType === 5121) v = buf.readUInt8(p0);
        else { errors.push(where + " 索引 componentType 不支持: " + idxAcc.componentType); break; }
        if (v > max) max = v;
      }
      idxChecked++;
      if (max >= 0 && max >= posAcc.count) {
        errors.push(where + " 索引最大值 " + max + " >= 顶点数 " + posAcc.count);
      }
      tris += idxAcc.count / 3;
    });
  });

  info.meshes = meshes.length;
  info.primitives = prims;
  info.triangles = tris;
  info.accessors = accessors.length;
  info.bufferViews = bufferViews.length;
  info.buffers = buffers.length;
  info.binBytes = binLength;
  info.textures = (json.textures || []).length;
  info.materials = (json.materials || []).length;
  info.extensionsUsed = (json.extensionsUsed || []).join(",") || null;
  info.indexChecked = idxChecked;
  info.indexCheckedByAccessorMax = idxSkipped;
  return { info, errors };
}

function walkGlb(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkGlb(p, out);
    else if (name.toLowerCase().endsWith(".glb")) out.push(p);
  }
  return out;
}

const targets = [];
for (const rel of ["public/asset", "public/world"]) {
  const dir = path.join(ROOT, rel);
  if (existsSync(dir)) for (const f of walkGlb(dir)) targets.push(f);
}

const files = [];
let totalErrors = 0;
for (const f of targets) {
  const buf = readFileSync(f);
  const { info, errors } = parseGLB(buf, path.relative(ROOT, f).replace(/\\/g, "/"));
  totalErrors += errors.length;
  files.push({ ...info, errors });
}

const summary = {
  checkedAt: new Date().toISOString(),
  tool: "scripts/verify-glb.mjs（自研结构自检；非外部 glTF-Validator）",
  scope: "public/asset/*.glb + public/world/*.glb",
  fileCount: files.length,
  totalErrors,
  pass: totalErrors === 0,
  triangleTotal: files.reduce((s, f) => s + (f.triangles || 0), 0),
  files,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(summary, null, 2), "utf8");
console.log("WROTE " + OUT);
console.log("files=" + files.length + " errors=" + totalErrors + " pass=" + summary.pass);
for (const f of files) {
  console.log(`  ${f.file}: tris=${f.triangles} prims=${f.primitives} idx=${f.indexChecked}+${f.indexCheckedByAccessorMax} ext=${f.extensionsUsed || "-"}` + (f.errors.length ? "\n      ERR: " + f.errors.join(" | ") : ""));
}
