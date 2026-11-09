/**
 * 店铺立面模块库 —— 高密度街道的基础构件。
 *
 * 绝区零式街道特征（公共设计语汇，自研实现）：
 *  - 多层店铺：招牌（横/竖）、橱窗、门脸、卷帘门、空调外机
 *  - 材质对比：暗色底 + 高饱和霓虹点缀
 *  - 生活感：招牌大小不一、颜色多样、层叠错落
 *
 * 全部程序化几何，零外部资产。授权合规。
 */
import * as THREE from "three";
import { makeWallTexture, makeNormalMap } from "./textures.mjs";

// 共享纹理（只生成一次，所有店铺复用）
let _wallTex = null;
let _wallNormal = null;
function getWallTex() {
  if (!_wallTex) _wallTex = makeWallTexture({ size: 256, base: "#2a2f38", seed: 5 });
  return _wallTex;
}
function getWallNormal() {
  if (!_wallNormal) _wallNormal = makeNormalMap({ size: 128, strength: 1.2, seed: 6 });
  return _wallNormal;
}

/** 霓虹配色（深色底 + 高饱和点缀） */
export const NEON_PALETTE = [
  0x2fe6ff, // 青
  0xffb03a, // 暖橙
  0xff3d8b, // 洋红
  0x7df3c1, // 薄荷
  0xb46bff, // 紫
  0xffe14d, // 明黄
  0xff6b4d, // 橙红
];

/** 墙面配色（暗色系） */
export const WALL_PALETTE = [
  0x1a1f28, 0x222831, 0x2a2f3a, 0x1f2530, 0x252b36, 0x1c222c,
];

/** 招牌文字色（亮色） */
export const SIGN_TEXT_PALETTE = [
  0xffffff, 0xfff2d0, 0xf5c542, 0xff9ec4, 0x9ecfff,
];

/**
 * 建一个店铺立面（门脸 + 招牌 + 橱窗）。
 * @param {object} opts
 *  - width 宽度
 *  - height 高度
 *  - depth 深度
 *  - floorIndex 楼层（0=底层）
 *  - seed 随机种子
 */
export function makeStorefront(opts = {}) {
  const { width = 3.2, height = 3.6, depth = 0.6, floorIndex = 0, seed = Math.random() * 1000 } = opts;
  const g = new THREE.Group();
  g.name = "storefront";

  const rng = mulberry32(Math.floor(seed));
  const wallColor = WALL_PALETTE[Math.floor(rng() * WALL_PALETTE.length)];
  const neonColor = NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)];

  // 墙体（带程序化纹理 + 法线，PBR 质感）
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    map: getWallTex(),
    normalMap: getWallNormal(),
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.85,
    metalness: 0.05,
  });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
  wall.position.y = height / 2;
  wall.receiveShadow = true;
  g.add(wall);

  // 门脸（内凹的入口）
  const doorW = Math.min(1.2, width * 0.35);
  const doorH = Math.min(2.2, height * 0.6);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.7, metalness: 0.1 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), doorMat);
  door.position.set((rng() - 0.5) * (width - doorW), doorH / 2, depth / 2 + 0.04);
  g.add(door);

  // 橱窗（发光内透光）
  const winW = width * (0.3 + rng() * 0.25);
  const winH = Math.min(1.6, height * 0.45);
  const isLit = rng() > 0.35;
  const winColor = isLit ? NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)] : 0x0e1218;
  const winMat = new THREE.MeshStandardMaterial({
    color: winColor,
    roughness: 0.4,
    metalness: 0,
    emissive: isLit ? winColor : 0x000000,
    emissiveIntensity: isLit ? 0.6 : 0,
  });
  const win = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.06), winMat);
  win.position.set((rng() - 0.5) * (width - winW), doorH * 0.7, depth / 2 + 0.03);
  g.add(win);

  // 横向招牌（门脸上方）
  const signW = width * (0.7 + rng() * 0.3);
  const signH = 0.4 + rng() * 0.3;
  const signColor = NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)];
  const signMat = new THREE.MeshStandardMaterial({
    color: signColor,
    roughness: 0.5,
    metalness: 0,
    emissive: signColor,
    emissiveIntensity: 0.6,
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.12), signMat);
  sign.position.set(0, doorH + signH * 0.7, depth / 2 + 0.08);
  g.add(sign);

  // 招牌文字块（亮色小方块，示意文字）
  const textCount = 2 + Math.floor(rng() * 3);
  const textMat = new THREE.MeshStandardMaterial({
    color: SIGN_TEXT_PALETTE[Math.floor(rng() * SIGN_TEXT_PALETTE.length)],
    roughness: 0.6,
    emissive: 0x333333,
    emissiveIntensity: 0.3,
  });
  for (let i = 0; i < textCount; i++) {
    const tw = signW * (0.1 + rng() * 0.12);
    const th = signH * (0.5 + rng() * 0.3);
    const t = new THREE.Mesh(new THREE.BoxGeometry(tw, th, 0.02), textMat);
    t.position.set(
      -signW / 2 + signW * 0.15 + i * (signW / textCount) + (rng() - 0.5) * 0.1,
      doorH + signH * 0.7,
      depth / 2 + 0.15
    );
    g.add(t);
  }

  // 竖招牌（挂在侧面，垂直）
  if (rng() > 0.4) {
    const vSignW = 0.3 + rng() * 0.15;
    const vSignH = 1.2 + rng() * 1.0;
    const vColor = NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)];
    const vMat = new THREE.MeshStandardMaterial({
      color: vColor, roughness: 0.5, emissive: vColor, emissiveIntensity: 0.55,
    });
    const vSign = new THREE.Mesh(new THREE.BoxGeometry(vSignW, vSignH, 0.1), vMat);
    vSign.position.set(width / 2 + 0.15, doorH + vSignH * 0.5, depth / 2 + 0.1);
    g.add(vSign);
  }

  // 空调外机（挂在墙上）
  if (rng() > 0.5) {
    const acW = 0.5 + rng() * 0.2;
    const acH = 0.35 + rng() * 0.1;
    const acMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.8, metalness: 0.2 });
    const ac = new THREE.Mesh(new THREE.BoxGeometry(acW, acH, 0.25), acMat);
    ac.position.set(
      (rng() - 0.5) * (width - acW),
      doorH * (0.5 + rng() * 0.5),
      depth / 2 + 0.15
    );
    g.add(ac);
  }

  // 卷帘门（部分店铺有关闭的卷帘）
  if (rng() > 0.7) {
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.7, metalness: 0.3 });
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(doorW * 1.1, doorH * 0.9, 0.05), shutterMat);
    shutter.position.set(door.position.x, doorH * 0.45, depth / 2 + 0.06);
    g.add(shutter);
    // 卷帘条纹
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(doorW * 1.1, 0.03, 0.055),
        new THREE.MeshStandardMaterial({ color: 0x1f2530, roughness: 0.8 })
      );
      stripe.position.set(door.position.x, doorH * 0.08 + i * doorH * 0.16, depth / 2 + 0.06);
      g.add(stripe);
    }
  }

  return g;
}

/** 简单可复现随机数生成器 */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 建一层连续店铺（沿街排列）。
 * @param {object} opts
 *  - count 店铺数
 *  - startX 起始 X
 *  - z 深度位置
 *  - facing 朝向（1=朝 +Z，-1=朝 -Z）
 *  - floorHeight 层高
 */
export function makeStorefrontRow(opts = {}) {
  const { count = 8, startX = -12, z = -6, facing = 1, floorHeight = 3.6, seed = 1 } = opts;
  const row = new THREE.Group();
  row.name = "storefront-row";

  let x = startX;
  for (let i = 0; i < count; i++) {
    const w = 2.4 + Math.random() * 1.4;
    const sf = makeStorefront({
      width: w,
      height: floorHeight,
      depth: 0.6,
      seed: seed * 100 + i,
    });
    sf.position.set(x + w / 2, 0, z);
    if (facing < 0) sf.rotation.y = Math.PI;
    row.add(sf);
    x += w + 0.15; // 店铺间小缝隙
  }
  return row;
}

/**
 * 建多层建筑（叠加店铺 + 上层窗户）。
 * @param {object} opts
 *  - floors 层数
 */
export function makeBuilding(opts = {}) {
  const { width = 8, floors = 2, depth = 3, z = -10, floorHeight = 3.6, seed = 1 } = opts;
  const g = new THREE.Group();
  g.name = "building";

  // 每层左右各一间店铺
  for (let f = 0; f < floors; f++) {
    const y = f * floorHeight;
    for (let side = -1; side <= 1; side += 2) {
      const w = width / 2 - 0.2;
      const sf = makeStorefront({
        width: w,
        height: floorHeight,
        depth: 0.5,
        seed: seed * 1000 + f * 10 + (side + 1),
      });
      sf.position.set(side * (width / 4), y, z + (facing0(depth)));
      g.add(sf);
    }
  }
  return g;
}
function facing0(d) { return d / 2 - 0.3; }
