/**
 * 角色贴图清洗 —— 去掉 Lux3D 生成贴图里的脏斑与烘焙阴影，让表面回到干净圆润。
 *
 * 用法：node scripts/clean-character-textures.mjs [glb 文件…]
 *        不带参数则处理 public/asset/ 下全部角色 GLB。
 *
 * 为什么需要（2026-11-10 诊断）：
 *  1. baseColor 贴图里烘焙了大量**灰褐色污渍、暗斑、杂色**（Lux3D 图生 3D 的
 *     产物特征），渲染出来像「没擦干净」；
 *  2. metallicRoughness 的 G 通道（roughness）均值只有 ~81/255 ≈ 0.32，
 *     表面偏光滑 → 强反光 + 高光碎斑，看着像「湿塑料」；
 *  3. baseColor 是 sRGB，被当 albedo 直接乘光照，暗部叠出褐色脏色。
 *
 * 处理策略（保守：不改几何、不改 UV、不动 meshopt 压缩几何）：
 *  - 去脏：暗于局部中值的像素判为污渍，抬回局部中值；
 *          局部方差高的区域（眼睛、孔洞）不当作污渍。
 *  - 压烘焙阴影：把低频（大半径模糊）明暗往中值压平，只留小尺度纹理，
 *          大尺度明暗交给实时光照表达。
 *  - 保色：只���去脏环节动，色相饱和度基本保留，最后轻微提暖提饱和。
 *  - 提哑光：roughness 提到 ~0.72，metallic 归零，消掉塑料高光。
 *
 * 原图备份：docs/evidence/reference-20261110/tex-backup/（脚本自动，可回滚）
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_DIR = path.join(ROOT, "public", "asset");
const BACKUP_DIR = path.join(ROOT, "docs", "evidence", "reference-20261110", "tex-backup");

// ── 可调参数 ────────────────────────────────────────────────────────────
const FLAT_RADIUS = 128;        // 平涂窗口半径 px（越大压得越平；贴图 1024²，需覆盖大片色块）
const FLAT_STRENGTH = 1.0;      // 平涂强度（1=完全压平到局部中值）
const FLAT_CLAMP_LO = 0.62;     // 补偿系数下限（防止细节区压死）
const FLAT_CLAMP_HI = 1.28;     // 补偿系数上限
const SPOT_THRESHOLD = 0.90;    // 亮度低于局部中值的这个比例 → 判为污渍
const SPOT_LIFT = 0.86;         // 污渍抬到局部中值的这个比例
const ROUGHNESS_TARGET = 0.72;  // 目标粗糙度
const SAT_BOOST = 1.18;         // 饱和度补偿（去脏后发灰，靠这个补回来）
const METALLIC_ZERO = true;

// ── 碎片化资产的兜底参数 ──────────────────────────────────────────────
// 部分 Lux3D 资产（尤其 naiwa_laugh_g1）的 baseColor 贴图是**碎片化**的：
// 大量不连续的黄/褐/银色块拼在一起，像打碎的瓷砖。这种贴图平涂也救不回来，
// 渲染出来是一坨金属疙瘩。判据：低饱和像素占比过高。
const FRAGMENT_GRAY_RATIO = 0.10;  // 低饱和像素占比超过此值 → 判定为碎片化
const FRAGMENT_BODY_MIN = 95;      // 主体像素亮度下限
const FRAGMENT_BODY_SAT = 0.22;    // 主体像素饱和度下限
const FRAGMENT_DARK_LO = 0.18;      // 特征区亮度映射下限（保留眼睛等细节）
const FRAGMENT_DARK_SPAN = 0.55;    // 特征区亮度映射跨度

/**
 * 碎片化贴图 → 扁平化：主体压成纯固有色，只保留深色特征（眼睛/嘴/花纹）。
 * 这是卡通渲染的标准做法：albedo 只提供固有色，明暗交给实时光照。
 *
 * @returns {Promise<{out: Buffer, med: number[]}|null>}
 */
async function flattenFragmented(rgb, w, h) {
  const { data } = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = w * h;
  const lum = new Float32Array(n);
  const sat = new Float32Array(n);
  const bodyIdx = [];
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    lum[i] = (r + g + b) / 3;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat[i] = (mx - mn) / Math.max(mx, 1);
    if (lum[i] > FRAGMENT_BODY_MIN && sat[i] > FRAGMENT_BODY_SAT) bodyIdx.push(i);
  }
  if (bodyIdx.length < n * 0.2) return null; // 主体太少，判据不成立

  // 主体中位色（分通道取中位）
  const chans = [[], [], []];
  for (const i of bodyIdx) {
    chans[0].push(data[i * 3]);
    chans[1].push(data[i * 3 + 1]);
    chans[2].push(data[i * 3 + 2]);
  }
  const med = chans.map((c) => {
    c.sort((a, b) => a - b);
    return c[c.length >> 1];
  });

  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const isBody = lum[i] > FRAGMENT_BODY_MIN && sat[i] > FRAGMENT_BODY_SAT;
    if (isBody) {
      out[i * 3] = med[0];
      out[i * 3 + 1] = med[1];
      out[i * 3 + 2] = med[2];
    } else {
      // 特征区：保留相对明暗，压到固有色上
      const fl = Math.min(1, Math.max(0, lum[i] / 255));
      const k = FRAGMENT_DARK_LO + fl * FRAGMENT_DARK_SPAN;
      out[i * 3] = Math.min(255, Math.round(med[0] * k));
      out[i * 3 + 1] = Math.min(255, Math.round(med[1] * k));
      out[i * 3 + 2] = Math.min(255, Math.round(med[2] * k));
    }
  }
  return { out, med };
}

/**
 * 平涂固有色 + 去污渍。
 *
 * 核心思路（卡通渲染的标准做法）：Lux3D 生成的 baseColor 是**照片烘焙**产物，
 * 里面混了环境光、阴影、灰褐污渍。直接当 albedo 用，暗部叠出褐色脏色。
 * 所以把「明暗」从贴图里剥掉——只保留色相与饱和度（固有色），
 * 让实时光照 + NPR 色调分离去表达体积。这正是参考图里那种干净圆润质感。
 *
 * @param {Buffer} srcBuf 原图
 * @returns {Promise<Buffer>} 处理后的 WebP
 */
async function cleanBaseColor(srcBuf) {
  const { data, info } = await sharp(srcBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;

  const rgb = Buffer.alloc(w * h * 3);
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = data[i * ch];
    rgb[i * 3 + 1] = data[i * ch + 1];
    rgb[i * 3 + 2] = data[i * ch + 2];
    alpha[i] = data[i * ch + 3];
  }
  const raw3 = { raw: { width: w, height: h, channels: 3 } };

  // ── 碎片化检测 ────────────────────────────────────────────────────
  // 低饱和（灰/银）像素占比过高 → 贴图本身是碎的，平涂救不回来，
  // 改走「主体纯色 + 保留深色特征」的扁平化路线。
  let grayCount = 0;
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if ((mx - mn) / Math.max(mx, 1) < 0.16) grayCount++;
  }
  const grayRatio = grayCount / (w * h);
  if (grayRatio > FRAGMENT_GRAY_RATIO) {
    const flat = await flattenFragmented(rgb, w, h);
    if (flat) {
      console.log(
        `      ↳ 碎片化贴图（灰像素 ${(grayRatio * 100).toFixed(1)}%）→ 扁平化，固有色 rgb(${flat.med.join(",")})`,
      );
      return sharp(flat.out, raw3)
        .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
        .webp({ quality: 90, effort: 5 })
        .toBuffer();
    }
  }

  const lumRaw = await sharp(rgb, raw3).greyscale().raw().toBuffer();
  // 局部中值（去噪、保留边缘）
  const medRaw = await sharp(rgb, raw3).greyscale().median(9).raw().toBuffer();
  // 大窗口模糊 ≈ 烘焙阴影的分布
  const flatRaw = await sharp(rgb, raw3).greyscale().blur(FLAT_RADIUS).raw().toBuffer();
  // 中值 + 大模糊：稳健的「局部固有明度」估计
  const baseRaw = await sharp(rgb, raw3)
    .median(9)
    .blur(FLAT_RADIUS)
    .greyscale()
    .raw()
    .toBuffer();

  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const lum = lumRaw[i] / 255;
    const med = medRaw[i] / 255;
    const base = baseRaw[i] / 255;

    // ① 平涂：把明暗往局部固有明度拉（剥掉烘焙阴影与照片明暗）
    let k = 1 + ((base - lum) / Math.max(lum, 1e-4)) * FLAT_STRENGTH;
    k = Math.min(FLAT_CLAMP_HI, Math.max(FLAT_CLAMP_LO, k));

    // ② 污渍：显著暗于局部中值 → 抬回
    const spot = lum < med * SPOT_THRESHOLD;
    if (spot) {
      const target = med * SPOT_LIFT;
      if (lum < target) k *= target / Math.max(lum, 1e-4);
    }

    out[i * 3] = Math.min(255, Math.round(rgb[i * 3] * k));
    out[i * 3 + 1] = Math.min(255, Math.round(rgb[i * 3 + 1] * k));
    out[i * 3 + 2] = Math.min(255, Math.round(rgb[i * 3 + 2] * k));
  }

  // ③ 提饱和 + 轻微提暖，抵消去平涂后的发灰
  const tuned = await sharp(out, raw3)
    .modulate({ saturation: SAT_BOOST, brightness: 1.02 })
    .raw()
    .toBuffer();

  return sharp(tuned, raw3)
    .joinChannel(alpha, { raw: { width: w, height: h, channels: 1 } })
    .webp({ quality: 90, effort: 5 })
    .toBuffer();
}

/**
 * metallicRoughness：R=AO 保留，G=roughness 提到哑光，B=metallic 归零。
 */
async function makeMatte(pngBuf) {
  const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;

  // 先算 G 通道均值，再整体缩放到目标粗糙度
  let gSum = 0;
  for (let i = 0; i < w * h; i++) gSum += data[i * ch + 1];
  const gMean = gSum / (w * h);
  const scale = (ROUGHNESS_TARGET * 255) / Math.max(gMean, 1e-4);

  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    out[i * 3] = data[i * ch]; // AO 保留
    out[i * 3 + 1] = Math.min(255, Math.max(0.55 * 255, Math.min(0.95 * 255, data[i * ch + 1] * scale)));
    out[i * 3 + 2] = METALLIC_ZERO ? 0 : data[i * ch + 2];
  }
  return sharp(out, { raw: { width: w, height: h, channels: 3 } })
    .webp({ quality: 88, effort: 5 })
    .toBuffer();
}

async function main() {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });

  const args = process.argv.slice(2);
  const files = args.length
    ? args.map((f) => path.resolve(f))
    : (await fs.readdir(ASSET_DIR))
        .filter((f) => f.endsWith(".glb"))
        .map((f) => path.join(ASSET_DIR, f));

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  console.log("=== 角色贴图清洗 ===");

  for (const file of files) {
    const name = path.basename(file);
    const bak = path.join(BACKUP_DIR, name);
    try {
      // 幂等：每次都从备份重跑
      try {
        await fs.access(bak);
        await fs.copyFile(bak, file);
      } catch {
        await fs.copyFile(file, bak);
      }

      const doc = await io.read(file);
      const textures = doc.getRoot().listTextures();
      if (!textures.length) {
        console.log(`  ${name.padEnd(34)} skip: 无贴图`);
        continue;
      }

      const notes = [];
      for (const tex of textures) {
        const img = tex.getImage();
        if (!img) continue;
        const isBase = tex === textures[0];
        const cleaned = isBase
          ? await cleanBaseColor(Buffer.from(img))
          : await makeMatte(Buffer.from(img));
        tex.setImage(cleaned, "image/webp");
        notes.push(
          `${isBase ? "baseColor" : "roughness"} ${img.byteLength}→${cleaned.byteLength}B`
        );
      }

      await io.write(file, doc);
      console.log(`  ${name.padEnd(34)} ${notes.join("; ")}`);
    } catch (e) {
      console.log(`  ${name.padEnd(34)} FAIL ${e.message}`);
    }
  }
  console.log(`原图备份: ${BACKUP_DIR}`);
}

main();
