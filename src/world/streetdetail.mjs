/**
 * 街道细节 —— 地面、标线、路缘、电线杆、电线、井盖。
 * 全部程序化几何，零外部资产。
 */
import * as THREE from "three";
import { mulberry32, NEON_PALETTE } from "./storefront.mjs";

/** 街道地面（柏油 + 标线 + 井盖） */
export function makeStreet(opts = {}) {
  const { length = 40, width = 8, seed = 7 } = opts;
  const g = new THREE.Group();
  g.name = "street";

  // 柏油路面（提高 roughness，避免 NPR 把地面量化成亮白块）
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 1.0, metalness: 0 });
  const road = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, width), asphaltMat);
  road.position.y = -0.05;
  road.receiveShadow = true;
  g.add(road);

  // 人行道（两侧）
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.95 });
  for (const side of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, 1.6), sidewalkMat);
    sw.position.set(0, 0.09, side * (width / 2 + 0.8));
    sw.receiveShadow = true;
    g.add(sw);
  }

  // 路缘
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.85 });
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(length, 0.22, 0.2), curbMat);
    curb.position.set(0, 0.11, side * (width / 2 + 0.05));
    g.add(curb);
  }

  // 中央标线（虚线）
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x8a8a70, roughness: 0.8, emissive: 0x2a2a1a, emissiveIntensity: 0.2 });
  const rng = mulberry32(seed);
  for (let x = -length / 2 + 1; x < length / 2; x += 3.5) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.012, 0.12), lineMat);
    line.position.set(x, 0.006, 0);
    g.add(line);
  }

  // 斑马线（两端）
  const crossMat = new THREE.MeshStandardMaterial({ color: 0x9a9a8a, roughness: 0.8, emissive: 0x22221a, emissiveIntensity: 0.15 });
  for (const endX of [-length / 2 + 3, length / 2 - 3]) {
    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, width * 0.7), crossMat);
      stripe.position.set(endX - 1.5 + i * 0.6, 0.006, 0);
      g.add(stripe);
    }
  }

  // 井盖
  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.7, metalness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const mh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 12), manholeMat);
    mh.position.set(-length / 3 + rng() * (length * 0.6), 0.015, (rng() - 0.5) * (width * 0.6));
    mh.receiveShadow = true;
    g.add(mh);
  }

  return g;
}

/** 电线杆 + 电线 */
export function makePowerLines(opts = {}) {
  const { length = 40, z = -3.5, seed = 11 } = opts;
  const g = new THREE.Group();
  g.name = "power-lines";

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.8, metalness: 0.2 });
  const rng = mulberry32(seed);
  const polePositions = [];

  for (let x = -length / 2 + 2; x < length / 2; x += 8) {
    const h = 5 + rng() * 1.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 8), poleMat);
    pole.position.set(x, h / 2, z);
    pole.castShadow = true;
    g.add(pole);
    // 横担
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), poleMat);
    cross.position.set(x, h - 0.3, z);
    g.add(cross);
    polePositions.push(new THREE.Vector3(x, h - 0.3, z));
  }

  // 电线（用细长的盒子近似弧线）
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x0a0c10 });
  for (let i = 0; i < polePositions.length - 1; i++) {
    const a = polePositions[i];
    const b = polePositions[i + 1];
    const segs = 6;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const p0 = new THREE.Vector3().lerpVectors(a, b, t0);
      const p1 = new THREE.Vector3().lerpVectors(a, b, t1);
      // 电线下垂
      p0.y -= Math.sin(t0 * Math.PI) * 0.5;
      p1.y -= Math.sin(t1 * Math.PI) * 0.5;
      const mid = new THREE.Vector3().lerpVectors(p0, p1, 0.5);
      const len = p0.distanceTo(p1);
      const wire = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.02), wireMat);
      wire.position.copy(mid);
      wire.lookAt(p1);
      g.add(wire);
    }
  }

  return g;
}

/** 氛围光照（黄昏主光 + 补光 + 环境） */
export function makeAtmosphereLights(opts = {}) {
  const g = new THREE.Group();
  g.name = "atmosphere";

  // 黄昏主光（暖色，低角度）
  const sun = new THREE.DirectionalLight(0xffb070, 1.6);
  sun.position.set(-8, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  g.add(sun);

  // 冷色补光（蓝紫，从对面）
  const fill = new THREE.DirectionalLight(0x6a8aff, 0.7);
  fill.position.set(6, 8, -6);
  g.add(fill);

  // 环境光（提亮店铺墙面，避免全黑）
  const amb = new THREE.AmbientLight(0x3a4258, 1.8);
  g.add(amb);

  // 顶部半球光（模拟天空反光）
  const hemi = new THREE.HemisphereLight(0x5a6a90, 0x2a2018, 0.7);
  g.add(hemi);

  // 街道两侧补光（模拟店铺内透光映到街上）
  for (const side of [-1, 1]) {
    const sideLight = new THREE.PointLight(0xffc880, 8, 12, 2);
    sideLight.position.set(0, 3, side * 4);
    g.add(sideLight);
  }

  return g;
}

/** 霓虹灯箱（独立悬挂的招牌） */
export function makeNeonSigns(opts = {}) {
  const { count = 8, length = 30, z = -4, seed = 21 } = opts;
  const g = new THREE.Group();
  g.name = "neon-signs";
  const rng = mulberry32(seed);

  for (let i = 0; i < count; i++) {
    const color = NEON_PALETTE[Math.floor(rng() * NEON_PALETTE.length)];
    const w = 0.6 + rng() * 1.2;
    const h = 0.3 + rng() * 0.8;
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.5, emissive: color, emissiveIntensity: 1.0,
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), mat);
    const side = rng() > 0.5 ? 1 : -1;
    sign.position.set(
      -length / 2 + rng() * length,
      2 + rng() * 3,
      z + side * 0.5
    );
    sign.rotation.y = side > 0 ? -0.2 : 0.2;
    g.add(sign);

    // 悬挂支架
    const armMat = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.8 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), armMat);
    arm.position.set(sign.position.x, sign.position.y + h / 2 + 0.1, sign.position.z - side * 0.4);
    g.add(arm);
  }

  return g;
}
