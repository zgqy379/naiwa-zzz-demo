/**
 * 店铺立面模块库 —— 高密度街道的基础构件。
 *
 * 绝区零式街道特征（公共设计语汇，自研实现）：
 *  - 多层店铺：招牌（横/竖）、橱窗、门脸、卷帘门、空调外机
 *  - 材质对比：黄昏蓝灰立面 + 真字形灯箱招牌 + 灯管三族点缀
 *  - 生活感：招牌大小不一、底色明暗节奏、层叠错落
 *
 * 美术圣经 v2（docs/美术圣经-重做线-20261110.md）§5.1：墙面亮蓝灰三档、
 * 招牌 makeShopSignTexture 真字形灯箱（文字色随底色）、灯管三族加权
 * （暖白 ≥60% / 橙 ≤25% / 冷青 ≤15%）、分区 = 底色明暗节奏（同 tone 连续 ≤3 间）。
 *
 * 全部程序化几何，零外部资产。授权合规。
 */
import * as THREE from "three";
import { makeWallTexture, makeNormalMap, makeNeonSignTexture, makeShopSignTexture, SIGN_TONES } from "./textures.mjs";
import { tagPart } from "./instanced_storefront.mjs";

// 共享纹理（只生成一次，所有店铺复用）
let _wallTex = null;
let _wallNormal = null;
function getWallTex() {
  if (!_wallTex) _wallTex = makeWallTexture({ size: 256, base: "#5a6474", seed: 5 });
  return _wallTex;
}
function getWallNormal() {
  if (!_wallNormal) _wallNormal = makeNormalMap({ size: 128, strength: 1.2, seed: 6 });
  return _wallNormal;
}

/**
 * 灯管色三族（美术圣经 v2 §5.1）：暖白 0xfff2d8 ≥60%、橙 0xff9a4a ≤25%、冷青 0x9adfff ≤15%
 * （按每屏立面霓虹自发光面积计，抽取一律走 pickTubeColor 加权，不许均匀随机）。
 * v1 金/洋红/薄荷/青紫表作废：洋红只活在 UI（圣经 §6）、青 0x2fe6ff/紫 0xb46bff 禁上立面。
 */
export const NEON_PALETTE = [
  0xfff2d8, // 暖白（主，≥60%）
  0xff9a4a, // 橙（≤25%）
  0x9adfff, // 冷青（≤15%）
];

/** 按三族权重抽取灯管色（暖白 60% / 橙 25% / 冷青 15%，圣经 v2 §5.1） */
export function pickTubeColor(rng) {
  const r = rng();
  if (r < 0.6) return 0xfff2d8;
  if (r < 0.85) return 0xff9a4a;
  return 0x9adfff;
}

/** 墙面配色（美术圣经 v2 §5.1 立面蓝灰三档 + 衍生档，中亮值 0.30–0.45 明度带）。
 *  注：v1（01:33 补回的暗色 #1a1f28 系）随 v2 黄昏蓝调方向作废；原登记行保留不删改。 */
export const WALL_PALETTE = [
  0x5a6474, 0x647080, 0x6e7a8a, 0x566272, 0x687484, 0x606c7c,
];

/**
 * 街面店招词表（美术圣经 v2 §5.1）—— 2–4 字通用生活短词，不含真实品牌名。
 * 「奶」是品牌主牌，走 makeNeonSignTexture 霓虹管；其余全部 makeShopSignTexture 灯箱。
 */
export const NEON_WORDS = [
  "喫茶", "拉麵", "漫喫", "奶", "酒場", "壽司",
  "藥妝", "澡堂", "串燒", "書店", "菓子", "鍋",
];

/** 词 → icon 映射（4 种线稿：拉面碗/咖啡杯/酒瓶/书；圣经 v2 §5.1 图文组合） */
const SIGN_ICON_OF = {
  "喫茶": "cup", "漫喫": "cup", "菓子": "cup",
  "拉麵": "ramen", "壽司": "ramen", "鍋": "ramen",
  "酒場": "bottle", "藥妝": "bottle", "串燒": "bottle",
  "書店": "book",
};
export function signIconOf(word) {
  return SIGN_ICON_OF[word] ?? "none";
}

/**
 * 招牌底色明暗节奏（美术圣经 v2 §5.1「分区规则」）：signZoneOf 由 v1 的 A/B
 * 金/洋红分区改为映射五底色 tone——12 周期确定性序列，同 tone 连续 ≤2 间（≤3 达标），
 * 底色占比 暖白 5/12≈42%、冷白 2/12≈17%、橙 2/12≈17%、深青 2/12≈17%、奶油 1/12≈8%，
 * 落在圣经五底色加权（40/20/15/15/10）邻域。
 * @param {number} shopIndex 店面序号（行内从 0 递增；建筑层传确定性的楼层/侧索引）
 * @returns {string} SIGN_TONES 的 key
 */
const TONE_RUN = [
  "warmWhite", "warmWhite", "coolWhite", "orange", "warmWhite", "deepTeal",
  "warmWhite", "cream", "warmWhite", "coolWhite", "orange", "deepTeal",
];
export function signZoneOf(shopIndex) {
  return TONE_RUN[Math.abs(Math.floor(shopIndex || 0)) % TONE_RUN.length];
}

/** tone key → tone 对象（SIGN_TONES 查表） */
function toneOf(key) {
  return SIGN_TONES.find((t) => t.key === key) ?? SIGN_TONES[0];
}

/**
 * 建一个店铺立面（门脸 + 招牌 + 橱窗）。
 * @param {object} opts
 *  - width 宽度
 *  - height 高度
 *  - depth 深度
 *  - floorIndex 楼层（0=底层）
 *  - seed 随机种子
 *  - shopIndex 店面序号（决定主色分区，见 signZoneOf）
 *  - windowLit 亮窗与否；缺省时按店内随机（行构造器会传入以执行亮窗韵律）
 *  - forceDarkWindow 该店因「连续 ≥2 亮窗」被强制压暗（此时优先用卷帘兑现）
 *  - emissiveScale 自发光缩放（远景建筑层传 <1，压立面亮度）
 */
export function makeStorefront(opts = {}) {
  const {
    width = 3.2, height = 3.6, depth = 0.6, floorIndex = 0,
    seed = Math.random() * 1000,
    shopIndex = 0, windowLit, forceDarkWindow = false, emissiveScale = 1,
  } = opts;
  const g = new THREE.Group();
  g.name = "storefront";

  const rng = mulberry32(Math.floor(seed));
  const wallColor = WALL_PALETTE[Math.floor(rng() * WALL_PALETTE.length)];
  const tone = toneOf(signZoneOf(shopIndex)); // 底色明暗节奏（圣经 v2 §5.1：同 tone 连续 ≤3 间）

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
  tagPart(wall, "wall"); g.add(wall);

  // 门脸（内凹的入口）
  const doorW = Math.min(1.2, width * 0.35);
  const doorH = Math.min(2.2, height * 0.6);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.75, metalness: 0.1 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), doorMat);
  door.position.set((rng() - 0.5) * (width - doorW), doorH / 2, depth / 2 + 0.04);
  tagPart(door, "door"); g.add(door);

  // 橱窗（发光内透光；亮/暗由行构造器的韵律决定，圣经 §4：连续 ≥2 亮窗后必须 1 暗窗/卷帘）
  const winW = width * (0.3 + rng() * 0.25);
  const winH = Math.min(1.6, height * 0.45);
  const isLit = windowLit !== undefined ? windowLit : rng() > 0.35;
  // 亮窗统一暖黄 0xffd98a（圣经 v2 §0 橱窗暖黄；自发光仅限清单成员）
  const winColor = isLit ? 0xffd98a : 0x0e1218;
  const winMat = new THREE.MeshStandardMaterial({
    color: winColor,
    roughness: 0.4,
    metalness: 0,
    emissive: isLit ? winColor : 0x000000,
    emissiveIntensity: isLit ? 0.6 * emissiveScale : 0,
  });
  const win = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.06), winMat);
  win.position.set((rng() - 0.5) * (width - winW), doorH * 0.7, depth / 2 + 0.03);
  tagPart(win, "window"); g.add(win);

  // 横向招牌（门脸上方；每 3.6m 开间 1 个招牌位由行排布保证）
  // 圣经 v2 §5.1：makeShopSignTexture 真字形灯箱——底色随 tone、文字色随底色、
  // icon 图文组合、灯管边框走三族 tube 色；「奶」牌保留 makeNeonSignTexture 霓虹管。
  // 贴图并入箱体材质（map + emissiveMap 自发光灯箱）；此前独立 signFace 面片因未
  // tagPart 从未进入 instanceStorefronts 的场景——本结构顺带修复该缺陷。
  const signW = width * (0.7 + rng() * 0.3);
  const signH = 0.4 + rng() * 0.3;
  const word = NEON_WORDS[Math.floor(rng() * NEON_WORDS.length)];
  const tubeColor = pickTubeColor(rng);
  const tubeHex = "#" + tubeColor.toString(16).padStart(6, "0");
  const texH = Math.max(48, Math.round(512 * (signH * 0.88 / (signW * 0.95))));
  const signTex = word === "奶"
    ? makeNeonSignTexture({ text: "奶", color: tubeHex, w: 512, h: texH })
    : makeShopSignTexture({ text: word, tone, tube: tubeHex, icon: signIconOf(word), w: 512, h: texH });
  const signMat = new THREE.MeshStandardMaterial({
    color: 0x3a4250, // 金属箱体（圣经 v2 §5.7 金属构件）
    map: signTex,
    emissive: 0xffffff,
    emissiveMap: signTex,
    emissiveIntensity: 0.85 * emissiveScale,
    roughness: 0.5,
    metalness: 0.4,
  });
  // 招牌面高度错落 ±0.3m（圣经 §4 韵律），箱体与牌面同高
  const signY = doorH + signH * 0.7 + (rng() - 0.5) * 0.6;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.12), signMat);
  sign.position.set(0, signY, depth / 2 + 0.08);
  tagPart(sign, "hSign"); g.add(sign);

  // 竖招牌（挂在侧面，垂直；横招已是每开间 1 位，竖招降为点缀密度 60%→35%，保招牌节奏）
  // 圣经 v2 §5.1：竖招牌 icon 上、字下（vertical 贴图），底色随 tone、灯管走三族
  if (rng() > 0.65) {
    const vSignW = 0.3 + rng() * 0.15;
    const vSignH = 1.2 + rng() * 1.0;
    const vTubeColor = pickTubeColor(rng);
    const vTubeHex = "#" + vTubeColor.toString(16).padStart(6, "0");
    const vTex = word === "奶"
      ? makeNeonSignTexture({ text: "奶", color: vTubeHex, w: 256, h: 512 })
      : makeShopSignTexture({ text: word, tone, tube: vTubeHex, icon: signIconOf(word), vertical: true, w: 256, h: 512 });
    const vMat = new THREE.MeshStandardMaterial({
      color: 0x3a4250,
      map: vTex,
      emissive: 0xffffff,
      emissiveMap: vTex,
      emissiveIntensity: 0.8 * emissiveScale,
      roughness: 0.5,
      metalness: 0.4,
    });
    const vSign = new THREE.Mesh(new THREE.BoxGeometry(vSignW, vSignH, 0.1), vMat);
    vSign.position.set(width / 2 + 0.15, doorH + vSignH * 0.5, depth / 2 + 0.1);
    tagPart(vSign, "vSign"); g.add(vSign);
  }

  // 空调外机（挂在墙上；金属构件法则：metalness 0.4–0.6 / roughness 0.35–0.5，圣经 v2 §5.7）
  if (rng() > 0.5) {
    const acW = 0.5 + rng() * 0.2;
    const acH = 0.35 + rng() * 0.1;
    const acMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.45, metalness: 0.4 });
    const ac = new THREE.Mesh(new THREE.BoxGeometry(acW, acH, 0.25), acMat);
    ac.position.set(
      (rng() - 0.5) * (width - acW),
      doorH * (0.5 + rng() * 0.5),
      depth / 2 + 0.15
    );
    tagPart(ac, "ac"); g.add(ac);
  }

  // 卷帘门（部分店铺有关闭的卷帘；被韵律强制压暗的店优先用卷帘兑现「暗窗/卷帘」，概率 30%→65%）
  // v2：色随立面上调一档但仍暗于墙面（暗窗辨识优先），0x3a4250 属掩体同族冷蓝灰
  const wantShutter = forceDarkWindow ? rng() > 0.35 : rng() > 0.7;
  if (wantShutter) {
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.78, metalness: 0.08 });
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(doorW * 1.1, doorH * 0.9, 0.05), shutterMat);
    shutter.position.set(door.position.x, doorH * 0.45, depth / 2 + 0.06);
    tagPart(shutter, "shutter"); g.add(shutter);
    // 卷帘条纹
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(doorW * 1.1, 0.03, 0.055),
        new THREE.MeshStandardMaterial({ color: 0x2a3442, roughness: 0.8 })
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
  const rng = mulberry32(seed * 13 + 7); // 亮窗韵律的可复现随机源

  let x = startX;
  let litRun = 0; // 连续亮窗计数（圣经 §4：连续 ≥2 间亮窗后必须 1 间暗窗/卷帘）
  for (let i = 0; i < count; i++) {
    const w = 2.4 + Math.random() * 1.4;
    const forceDark = litRun >= 2;
    const windowLit = forceDark ? false : rng() > 0.35;
    litRun = windowLit ? litRun + 1 : 0;
    const sf = makeStorefront({
      width: w,
      height: floorHeight,
      depth: 0.6,
      seed: seed * 100 + i,
      shopIndex: i,          // 主色分区（A/B 区块，相邻店面同区同主色）
      windowLit,             // 亮窗韵律
      forceDarkWindow: forceDark,
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
        shopIndex: f * 10 + (side + 1), // 远景同样走分区色
        emissiveScale: 0.5, // 远景立面 emissive 下调（圣经 §1：立面中景 0.06–0.12，不与路面抢亮）
      });
      sf.position.set(side * (width / 4), y, z + (facing0(depth)));
      g.add(sf);
    }
  }
  return g;
}
function facing0(d) { return d / 2 - 0.3; }
