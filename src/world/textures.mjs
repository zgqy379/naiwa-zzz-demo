/**
 * 程序化纹理生成器 —— 用 Canvas 生成 PBR 贴图（零外部资源）。
 *
 * 生成：
 *  - 墙面纹理（混凝土/砖墙感）
 *  - 地面纹理（柏油/石板感）
 *  - 招牌文字纹理（makeNeonSignTexture：真中文字形 + 霓虹辉光，v2 仅保留给「奶」字小霓虹牌；
 *    makeShopSignTexture：v2 店招灯箱——五底色加权 + 真字形 + icon 线稿 + 灯管边框，圣经 §5.1）
 *  - 法线贴图（从高度图推导）
 *
 * 全部程序化，授权合规。
 */
import * as THREE from "three";

/** 生成混凝土/墙面纹理 */
export function makeWallTexture({ size = 256, base = "#2a2f38", seed = 1 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rng = mulberry32(seed);

  // 底色
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // 噪点（混凝土颗粒）
  for (let i = 0; i < size * size * 0.15; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const v = Math.floor(rng() * 40) - 20;
    const c = shade(base, v);
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }

  // 砖缝/面板线
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  const rows = 4 + Math.floor(rng() * 4);
  for (let r = 1; r < rows; r++) {
    const y = (r / rows) * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  // 污渍（竖向水痕）
  for (let i = 0; i < 3; i++) {
    const x = rng() * size;
    const w = 4 + rng() * 12;
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, "rgba(0,0,0,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, w, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 生成地面纹理（柏油 + 石板）。
 *  美术圣经 v2 §5.7：地贴底 #232833→#38404e（黄昏蓝调中灰蓝，路面 0.18–0.30 带内），
 *  石板逐格明度差 ±7 与砖缝对比增强（缝更深、格面有明暗差）条款沿用，保证砖缝/石板在
 *  NPR 量化后仍读得出结构（验收③）。 */
export function makeGroundTexture({ size = 256, seed = 2 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rng = mulberry32(seed);

  // 底色（柏油，圣经 v2 §5.7 黄昏蓝调中灰蓝）
  ctx.fillStyle = "#38404e";
  ctx.fillRect(0, 0, size, size);

  // 颗粒
  for (let i = 0; i < size * size * 0.25; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const v = Math.floor(rng() * 30) - 15;
    ctx.fillStyle = shade("#38404e", v);
    ctx.fillRect(x, y, 1, 1);
  }

  // 石板逐格明暗差（砖缝/石板对比增强：每格随机 ±7 明度）
  const cells = 4;
  const cw = size / cells;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const v = Math.floor(rng() * 14) - 7;
      ctx.fillStyle = shade("#38404e", v);
      ctx.fillRect(cx * cw + 1, cy * cw + 1, cw - 2, cw - 2);
    }
  }

  // 石板缝（网格，缝色加深加宽使结构可读）
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= cells; i++) {
    const p = (i / cells) * size;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 霓虹招牌文字贴图 —— 真中文 + 霓虹管辉光。
 *
 * v2（美术圣经 §5.1）：本纹理**仅保留给「奶」字小霓虹牌**；其余店招一律走
 * makeShopSignTexture（五底色灯箱）。中文走系统字体（微软雅黑 / 苹方 /
 * Noto Sans SC 依次回退），没有中文字体时退化为方块，不会崩。
 */
export function makeNeonSignTexture({ text = "奶", color = "#ffffff", w = 256, h = 128 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const hex = "#" + color.toString(16).padStart(6, "0");

  // 暗底板（不透明，牌面直接贴在招牌上，不需要 alpha 混合）
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, w, h);

  // 霓虹边框
  ctx.save();
  ctx.shadowColor = hex;
  ctx.shadowBlur = 22;
  ctx.strokeStyle = hex;
  ctx.lineWidth = Math.max(3, Math.round(h * 0.045));
  ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
  ctx.restore();

  // 文字：白芯 + 彩晕（双层画，芯亮晕浓）
  const fs = Math.round(h * 0.44);
  ctx.font = `bold ${fs}px "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = hex;
  ctx.shadowBlur = 26;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, w / 2, h / 2 + 1);
  ctx.shadowBlur = 10;
  ctx.strokeStyle = hex;
  ctx.lineWidth = Math.max(1.5, fs * 0.045);
  ctx.strokeText(text, w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * 店招灯箱五底色表（美术圣经 v2 §5.1，唯一权威 hex）。
 * light = 浅底（深字 #2a2a32）；!light = 深底（白字 #f8f6f0）。
 * 加权：暖白 40% / 冷白 20% / 橙 15% / 深青 15% / 奶油 10%。
 */
export const SIGN_TONES = [
  { key: "warmWhite", color: "#f2ead8", light: true, weight: 0.4 },
  { key: "coolWhite", color: "#eef0f4", light: true, weight: 0.2 },
  { key: "orange", color: "#e8863a", light: false, weight: 0.15 },
  { key: "deepTeal", color: "#2e4a52", light: false, weight: 0.15 },
  { key: "cream", color: "#f5eeda", light: true, weight: 0.1 },
];

/** 按圣经权重抽取一个 tone（供悬挂牌/散件；店招主序列走 storefront.signZoneOf） */
export function pickSignTone(rng) {
  const r = rng();
  if (r < 0.4) return SIGN_TONES[0];
  if (r < 0.6) return SIGN_TONES[1];
  if (r < 0.75) return SIGN_TONES[2];
  if (r < 0.9) return SIGN_TONES[3];
  return SIGN_TONES[4];
}

/**
 * 店招灯箱贴图（美术圣经 v2 §5.1）—— canvas 2D 真字形 + 图文组合。
 *
 * - 底色 tone 五选一（加权抽取见 pickSignTone；主街序列由 signZoneOf 保证
 *   「同 tone 连续 ≤3 间必换」的底色明暗节奏）。
 * - 文字色随招牌底色：浅底深字 #2a2a32，深底白字 #f8f6f0。
 * - 灯管边框：tube 色（三族之一）描边 + 同色辉光，承担立面霓虹自发光。
 * - icon 四种 2px 线稿（拉面碗/咖啡杯/酒瓶/书），色随文字色。
 * - vertical：竖招牌 icon 上、字下（逐字纵排）；缺省横排 icon 左、字右。
 * - 字体栈与 makeNeonSignTexture 一致，缺字退 sans-serif 不崩。
 */
export function makeShopSignTexture({
  text = "喫茶",
  tone = SIGN_TONES[0],
  tube = "#fff2d8",
  icon = "none",
  vertical = false,
  w = 512,
  h = 256,
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const rng = mulberry32(0x5166 + text.length * 31 + w);
  const ink = tone.light ? "#2a2a32" : "#f8f6f0";

  // 底色 + 轻噪点（灯箱面板层次）
  ctx.fillStyle = tone.color;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.004; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.04})`;
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }

  // 灯管边框（tube 色描边 + 辉光；这是立面霓虹自发光的主要来源）
  ctx.save();
  ctx.shadowColor = tube;
  ctx.shadowBlur = Math.max(10, h * 0.09);
  ctx.strokeStyle = tube;
  ctx.lineWidth = Math.max(3, Math.round(h * 0.035));
  const inset = ctx.lineWidth + 2;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.restore();

  // 文字（真字形）
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chars = [...text];
  if (vertical) {
    // 竖招牌：icon 上、字下（最多 3 字纵排）
    const fs = Math.min(w * 0.5, (h * 0.52) / Math.min(chars.length, 3));
    ctx.font = `bold ${Math.round(fs)}px "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif`;
    const startY = h * 0.44;
    for (let i = 0; i < Math.min(chars.length, 3); i++) {
      ctx.fillText(chars[i], w / 2, startY + i * fs * 1.12);
    }
    if (icon !== "none") {
      drawSignIcon(ctx, icon, w / 2, h * 0.2, w * 0.34, ink);
    }
  } else {
    // 横招牌：icon 左、字右；无 icon 或 1 字时文字居中
    const hasIcon = icon !== "none" && chars.length > 1;
    const fs = hasIcon
      ? Math.min(h * 0.55, (w * 0.52) / chars.length)
      : Math.min(h * 0.55, (w * 0.82) / chars.length);
    ctx.font = `bold ${Math.round(fs)}px "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif`;
    const cx = hasIcon ? w * 0.62 : w / 2;
    ctx.fillText(text, cx, h / 2 + 1);
    if (hasIcon) {
      drawSignIcon(ctx, icon, w * 0.26, h / 2, h * 0.5, ink);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 店招 icon 线稿（4 种，2px 线宽，色随文字色；圣经 §5.1 图文组合） */
function drawSignIcon(ctx, type, cx, cy, size, ink) {
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const s = size / 2;
  ctx.beginPath();
  if (type === "ramen") {
    // 拉面碗：碗身弧 + 碗沿 + 碗足 + 两斜筷
    ctx.arc(cx, cy - s * 0.15, s, 0, Math.PI);
    ctx.moveTo(cx - s, cy - s * 0.15);
    ctx.lineTo(cx + s, cy - s * 0.15);
    ctx.moveTo(cx - s * 0.3, cy + s * 0.85);
    ctx.lineTo(cx + s * 0.3, cy + s * 0.85);
    ctx.moveTo(cx - s * 0.55, cy - s * 0.45);
    ctx.lineTo(cx + s * 0.85, cy - s * 1.05);
    ctx.moveTo(cx - s * 0.3, cy - s * 0.6);
    ctx.lineTo(cx + s * 1.0, cy - s * 0.75);
  } else if (type === "cup") {
    // 咖啡杯：梯形杯身 + 杯柄 + 汽线
    ctx.moveTo(cx - s * 0.7, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.5, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.3, cy + s * 0.7);
    ctx.lineTo(cx - s * 0.5, cy + s * 0.7);
    ctx.closePath();
    ctx.moveTo(cx + s * 0.5, cy - s * 0.2);
    ctx.quadraticCurveTo(cx + s * 1.1, cy, cx + s * 0.35, cy + s * 0.4);
    ctx.moveTo(cx - s * 0.25, cy - s * 0.8);
    ctx.quadraticCurveTo(cx - s * 0.05, cy - s * 1.05, cx - s * 0.25, cy - s * 1.3);
    ctx.moveTo(cx + s * 0.15, cy - s * 0.8);
    ctx.quadraticCurveTo(cx + s * 0.35, cy - s * 1.05, cx + s * 0.15, cy - s * 1.3);
  } else if (type === "bottle") {
    // 酒瓶：瓶颈 + 瓶身圆角
    ctx.moveTo(cx - s * 0.18, cy - s);
    ctx.lineTo(cx + s * 0.18, cy - s);
    ctx.lineTo(cx + s * 0.18, cy - s * 0.3);
    ctx.quadraticCurveTo(cx + s * 0.6, cy - s * 0.1, cx + s * 0.6, cy + s * 0.3);
    ctx.lineTo(cx + s * 0.6, cy + s);
    ctx.lineTo(cx - s * 0.6, cy + s);
    ctx.lineTo(cx - s * 0.6, cy + s * 0.3);
    ctx.quadraticCurveTo(cx - s * 0.6, cy - s * 0.1, cx - s * 0.18, cy - s * 0.3);
    ctx.closePath();
  } else if (type === "book") {
    // 翻开的书：两页弧 + 中缝
    ctx.moveTo(cx, cy - s * 0.2);
    ctx.quadraticCurveTo(cx - s * 0.7, cy - s * 0.55, cx - s, cy - s * 0.3);
    ctx.lineTo(cx - s, cy + s * 0.6);
    ctx.quadraticCurveTo(cx - s * 0.6, cy + s * 0.4, cx, cy + s * 0.7);
    ctx.moveTo(cx, cy - s * 0.2);
    ctx.quadraticCurveTo(cx + s * 0.7, cy - s * 0.55, cx + s, cy - s * 0.3);
    ctx.lineTo(cx + s, cy + s * 0.6);
    ctx.quadraticCurveTo(cx + s * 0.6, cy + s * 0.4, cx, cy + s * 0.7);
    ctx.moveTo(cx, cy - s * 0.2);
    ctx.lineTo(cx, cy + s * 0.7);
  }
  ctx.stroke();
  ctx.restore();
}

/** 生成法线贴图（从高度噪声推导） */
export function makeNormalMap({ size = 128, strength = 1.5, seed = 4 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const rng = mulberry32(seed);

  // 生成高度图
  const height = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    height[i] = rng();
  }
  // 平滑
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const l = height[y * size + ((x - 1 + size) % size)];
        const r = height[y * size + ((x + 1) % size)];
        const u = height[((y - 1 + size) % size) * size + x];
        const d = height[((y + 1) % size) * size + x];
        height[i] = (height[i] * 2 + l + r + u + d) / 6;
      }
    }
  }

  // 从高度推导法线
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const d = height[((y + 1) % size) * size + x];
      const dx = (r - l) * strength;
      const dy = (d - u) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      img.data[i * 4 + 0] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      img.data[i * 4 + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      img.data[i * 4 + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 颜色明暗调整 */
function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount / 100);
  return `#${c.getHexString()}`;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
