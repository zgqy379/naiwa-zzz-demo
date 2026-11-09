/**
 * 程序化纹理生成器 —— 用 Canvas 生成 PBR 贴图（零外部资源）。
 *
 * 生成：
 *  - 墙面纹理（混凝土/砖墙感）
 *  - 地面纹理（柏油/石板感）
 *  - 招牌文字纹理（示意文字块）
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

/** 生成地面纹理（柏油 + 石板） */
export function makeGroundTexture({ size = 256, seed = 2 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const rng = mulberry32(seed);

  // 底色（柏油）
  ctx.fillStyle = "#1a1d24";
  ctx.fillRect(0, 0, size, size);

  // 颗粒
  for (let i = 0; i < size * size * 0.25; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const v = Math.floor(rng() * 30) - 15;
    ctx.fillStyle = shade("#1a1d24", v);
    ctx.fillRect(x, y, 1, 1);
  }

  // 石板缝（网格）
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  const cells = 4;
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

/** 生成招牌文字纹理（示意文字块） */
export function makeSignTexture({ text = "奶", color = "#ffffff", bg = "#1a1a22", size = 128, seed = 3 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  // 背景
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // 文字（用几何块示意，避免字体依赖）
  ctx.fillStyle = color;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const w = size * (0.15 + Math.random() * 0.15);
    const h = size * (0.4 + Math.random() * 0.3);
    const x = size * 0.15 + i * (size * 0.3);
    const y = size * 0.25;
    ctx.fillRect(x, y, w, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
