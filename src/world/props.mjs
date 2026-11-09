/**
 * 生活道具 —— 自动贩卖机、垃圾桶、自行车、路牌、海报、盆栽。
 * 全部程序化几何，零外部资产。
 */
import * as THREE from "three";
import { mulberry32, NEON_PALETTE } from "./storefront.mjs";

/** 自动贩卖机 */
export function makeVendingMachine(seed = 1) {
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  const color = [0xd43a3a, 0x3a6ad4, 0x3ad47a, 0xf5c542][Math.floor(rng() * 4)];

  // 主体
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.9, 0.7),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 })
  );
  body.position.y = 0.95;
  body.castShadow = true;
  g.add(body);

  // 展示窗（发光）
  const winColor = 0xffffff;
  const win = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.0, 0.06),
    new THREE.MeshStandardMaterial({ color: winColor, emissive: winColor, emissiveIntensity: 0.7, roughness: 0.3 })
  );
  win.position.set(0, 1.2, 0.36);
  g.add(win);

  // 取货口
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.7 })
  );
  slot.position.set(0, 0.4, 0.36);
  g.add(slot);

  // 侧面灯条
  const sideGlow = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1.6, 0.05),
    new THREE.MeshStandardMaterial({ color: winColor, emissive: winColor, emissiveIntensity: 0.5 })
  );
  sideGlow.position.set(0.42, 1.0, 0.3);
  g.add(sideGlow);

  return g;
}

/** 垃圾桶 */
export function makeTrashCan(seed = 1) {
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a3a2e, roughness: 0.8, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.75, 10), mat);
  body.position.y = 0.38;
  body.castShadow = true;
  g.add(body);
  // 盖子
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 10), mat);
  lid.position.y = 0.78;
  g.add(lid);
  return g;
}

/** 自行车（简化） */
export function makeBicycle(seed = 1) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.5, metalness: 0.4 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.9 });

  // 两个轮子
  for (const dx of [-0.45, 0.45]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 16), tireMat);
    wheel.position.set(dx, 0.3, 0);
    wheel.castShadow = true;
    g.add(wheel);
  }
  // 车架
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.04), frameMat);
  frame.position.set(0, 0.55, 0);
  g.add(frame);
  // 座垫
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.1), frameMat);
  seat.position.set(-0.25, 0.75, 0);
  g.add(seat);
  // 车把
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 0.3), frameMat);
  bar.position.set(0.42, 0.75, 0);
  g.add(bar);
  return g;
}

/** 路牌 */
export function makeStreetSign(seed = 1) {
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.7, metalness: 0.3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8), poleMat);
  pole.position.y = 1.3;
  pole.castShadow = true;
  g.add(pole);

  // 牌面
  const color = NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)];
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.5, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, emissive: color, emissiveIntensity: 0.4, roughness: 0.6 })
  );
  sign.position.y = 2.5;
  g.add(sign);

  // 文字块
  const textMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444, emissiveIntensity: 0.3 });
  const text = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.02), textMat);
  text.position.set(0, 2.5, 0.03);
  g.add(text);
  return g;
}

/** 海报板（贴在墙上） */
export function makePoster(seed = 1) {
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  const color = NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)];
  const poster = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, emissive: color, emissiveIntensity: 0.25, roughness: 0.8 })
  );
  // 图案块
  const art = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.6, 0.01),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
  );
  art.position.z = 0.02;
  g.add(art);
  g.add(poster);
  return g;
}

/** 盆栽 */
export function makePlant(seed = 1) {
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  // 盆
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.2, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a2e28, roughness: 0.9 })
  );
  pot.position.y = 0.18;
  pot.castShadow = true;
  g.add(pot);
  // 叶子（几个绿色球）
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e6a3a, roughness: 0.8 });
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18 + rng() * 0.1, 8, 6), leafMat);
    leaf.position.set((rng() - 0.5) * 0.3, 0.5 + rng() * 0.3, (rng() - 0.5) * 0.3);
    g.add(leaf);
  }
  return g;
}

/** 批量布置道具 */
export function scatterProps(opts = {}) {
  const { length = 36, seed = 31 } = opts;
  const rng = mulberry32(seed);
  const g = new THREE.Group();
  g.name = "props";

  // 贩卖机（4 台）
  for (let i = 0; i < 4; i++) {
    const v = makeVendingMachine(seed + i);
    const side = i % 2 === 0 ? -1 : 1;
    v.position.set(-length / 2 + 5 + i * 8, 0, side * 4.2);
    v.rotation.y = side > 0 ? Math.PI : 0;
    g.add(v);
  }

  // 垃圾桶（6 个）
  for (let i = 0; i < 6; i++) {
    const t = makeTrashCan(seed + i);
    const side = i % 2 === 0 ? -1 : 1;
    t.position.set(-length / 2 + 3 + i * 6, 0, side * 4.4);
    g.add(t);
  }

  // 自行车（2 辆）
  for (let i = 0; i < 2; i++) {
    const b = makeBicycle(seed + i);
    b.position.set(-8 + i * 14, 0, -3.8);
    b.rotation.y = Math.PI / 2;
    g.add(b);
  }

  // 路牌（3 个）
  for (let i = 0; i < 3; i++) {
    const s = makeStreetSign(seed + i);
    s.position.set(-10 + i * 10, 0, 4.6);
    g.add(s);
  }

  // 盆栽（8 个）
  for (let i = 0; i < 8; i++) {
    const p = makePlant(seed + i);
    const side = i % 2 === 0 ? -1 : 1;
    p.position.set(-length / 2 + 2 + i * 4.5, 0, side * 4.2);
    g.add(p);
  }

  // 海报（贴墙，6 张）
  for (let i = 0; i < 6; i++) {
    const p = makePoster(seed + i);
    const side = i % 2 === 0 ? -1 : 1;
    p.position.set(-length / 2 + 4 + i * 6, 1.6, side * 4.7);
    p.rotation.y = side > 0 ? Math.PI : 0;
    g.add(p);
  }

  return g;
}
