/**
 * 街道细节 —— 地面、标线、路缘、电线杆、电线、井盖。
 * 全部程序化几何，零外部资产。
 */
import * as THREE from "three";
import { mulberry32, NEON_WORDS, pickTubeColor, signIconOf } from "./storefront.mjs";
import { makeGroundTexture, makeNeonSignTexture, makeShopSignTexture, pickSignTone } from "./textures.mjs";

let _groundTex = null;
function getGroundTex() {
  if (!_groundTex) _groundTex = makeGroundTexture({ size: 256, seed: 8 });
  return _groundTex;
}

/** 街道地面（柏油 + 标线 + 井盖） */
export function makeStreet(opts = {}) {
  const { length = 40, width = 8, seed = 7 } = opts;
  const g = new THREE.Group();
  g.name = "street";

  // 柏油路面（程序化纹理 + 法线，PBR 质感）
  // 圣经 v2 §5.7：沥青 0x1f242d→0x343b48（黄昏蓝调中灰蓝，路面 0.18–0.30 带内，
  // 细节可读）；roughness 分层 0.88（湿感靠 makeWetPatches 光斑，不靠压暗）
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x343b48,
    map: getGroundTex(),
    roughness: 0.88,
    metalness: 0.02,
  });
  const road = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, width), asphaltMat);
  road.position.y = -0.05;
  road.receiveShadow = true;
  g.add(road);

  // 人行道（两侧；0x353b46→0x4a5260，明度序「路面 > 立面」，roughness 0.95 分层）
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x4a5260, roughness: 0.95 });
  for (const side of [-1, 1]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(length, 0.18, 1.6), sidewalkMat);
    sw.position.set(0, 0.09, side * (width / 2 + 0.8));
    sw.receiveShadow = true;
    g.add(sw);
  }

  // 路缘（0x353a44→0x525a68）
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x525a68, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(length, 0.22, 0.2), curbMat);
    curb.position.set(0, 0.11, side * (width / 2 + 0.05));
    g.add(curb);
  }

  // 中央标线（虚线；冷白 0xc8d0dc，无 emissive——自发光仅限灯笼/橱窗/贩卖机窗/招牌灯管/边线，
  // 圣经 v2 §5.7；靠路面提亮后的漫反射对比保持可读）
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xc8d0dc, roughness: 0.85 });
  const rng = mulberry32(seed);
  for (let x = -length / 2 + 1; x < length / 2; x += 3.5) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.012, 0.12), lineMat);
    line.position.set(x, 0.006, 0);
    g.add(line);
  }

  // 斑马线（两端；冷白 0xcfd4de，同上去 emissive）
  const crossMat = new THREE.MeshStandardMaterial({ color: 0xcfd4de, roughness: 0.85 });
  for (const endX of [-length / 2 + 3, length / 2 - 3]) {
    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, width * 0.7), crossMat);
      stripe.position.set(endX - 1.5 + i * 0.6, 0.006, 0);
      g.add(stripe);
    }
  }

  // 井盖（金属构件法则：metalness 0.4–0.6 / roughness 0.35–0.5，圣经 v2 §5.7；
  // 色提亮到掩体同族 0x3a4250，保证验收③「井盖可辨认」）
  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.45, metalness: 0.5 });
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

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.8, metalness: 0.08 });
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

  // 明亮通透版光照（参考图：白天/黄昏暖光，整体提亮）

  // 主光：暖阳（高角度，模拟午后）
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.4);
  sun.position.set(-6, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.bias = -0.001;
  g.add(sun);

  // 天空补光（冷蓝，模拟天光）
  const sky = new THREE.DirectionalLight(0x9ec8ff, 1.1);
  sky.position.set(4, 8, -4);
  g.add(sky);

  // 环境光（明亮，模拟白天散射；圣经 v2 §4：光组不动，实机过曝仅压 amb 3.2→2.6 对冲）
  const amb = new THREE.AmbientLight(0x8a9ab8, 2.6);
  g.add(amb);

  // 顶部半球光（天空蓝 + 地面暖）
  const hemi = new THREE.HemisphereLight(0xa8c8f0, 0x6a5a48, 1.6);
  g.add(hemi);

  // 正面补光（让角色正面明亮）
  const front = new THREE.DirectionalLight(0xfff5e8, 1.2);
  front.position.set(6, 4, 8);
  g.add(front);

  // 街道两侧柔光（店铺内透光）
  for (const side of [-1, 1]) {
    const sideLight = new THREE.PointLight(0xffe0b8, 10, 14, 2);
    sideLight.position.set(0, 3.5, side * 4);
    g.add(sideLight);
  }

  return g;
}

/** 悬挂灯箱招牌（圣经 v2 §5.1：真字形 makeShopSignTexture 灯箱、底色五选一加权、
 *  灯管三族边框；「奶」牌保留 makeNeonSignTexture 霓虹管。自发光靠
 *  map+emissiveMap 且打 __skipNpr——makeNprMaterial 不拷 emissive） */
export function makeNeonSigns(opts = {}) {
  const { count = 8, length = 30, z = -4, seed = 21 } = opts;
  const g = new THREE.Group();
  g.name = "neon-signs";
  const rng = mulberry32(seed);

  for (let i = 0; i < count; i++) {
    const tubeColor = pickTubeColor(rng);
    const tubeHex = "#" + tubeColor.toString(16).padStart(6, "0");
    const tone = pickSignTone(rng);
    const w = 0.6 + rng() * 1.2;
    const h = 0.3 + rng() * 0.8;
    const word = NEON_WORDS[Math.floor(rng() * NEON_WORDS.length)];
    const faceW = w * 0.92;
    const faceH = h * 0.85;
    const texH = Math.max(48, Math.round(512 * (faceH / faceW)));
    const tex = word === "奶"
      ? makeNeonSignTexture({ text: "奶", color: tubeHex, w: 512, h: texH })
      : makeShopSignTexture({ text: word, tone, tube: tubeHex, icon: signIconOf(word), w: 512, h: texH });
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a4250,
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.75,
      roughness: 0.5,
      metalness: 0.4,
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), mat);
    sign.userData.__skipNpr = true; // 灯箱自发光不进 NPR 量化
    const side = rng() > 0.5 ? 1 : -1;
    sign.position.set(
      -length / 2 + rng() * length,
      2 + rng() * 3,
      z + side * 0.5
    );
    sign.rotation.y = side > 0 ? -0.2 : 0.2;
    g.add(sign);

    // 悬挂支架
    const armMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.8 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), armMat);
    arm.position.set(sign.position.x, sign.position.y + h / 2 + 0.1, sign.position.z - side * 0.4);
    g.add(arm);
  }

  return g;
}

/**
 * 灯笼链（美术圣经 v2 §5.2）：每链 4–6 只鼓形红灯笼 + 挂杆，檐下挂高 2.6–3.0m。
 * 笼身 0xd8452e、内发光 emissive 0xff7a3d / 0.5、横棱纹、下挂黄穗 0xf0c060。
 * 返回 { group, points }——points 为每只灯笼灯位，供 makeWetPatches 湿光斑对位。
 * 灯笼自发光打 __skipNpr（makeNprMaterial 不拷 emissive）。
 */
export function makeLanternChain(opts = {}) {
  const { x = 0, z = -3.9, seed = 1, hangY = 2.8 } = opts;
  const rng = mulberry32(Math.floor(seed) * 977 + 3);
  const g = new THREE.Group();
  g.name = "lantern-chain";
  const n = 4 + Math.floor(rng() * 3); // 4–6 只
  const points = [];

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.5, metalness: 0.4 });
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xd8452e, emissive: 0xff7a3d, emissiveIntensity: 0.5, roughness: 0.85,
  });
  const ribMat = new THREE.MeshStandardMaterial({ color: 0xb83a26, roughness: 0.85 });
  const tasselMat = new THREE.MeshStandardMaterial({
    color: 0xf0c060, emissive: 0xf0c060, emissiveIntensity: 0.25, roughness: 0.8,
  });
  const bodyGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.38, 10);
  const capGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.06, 10);
  const ribGeo = new THREE.TorusGeometry(0.2, 0.012, 6, 14);
  const tasselGeo = new THREE.ConeGeometry(0.045, 0.16, 6);
  const chainGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.24, 4);

  // 挂杆（贴墙横杆）
  const bar = new THREE.Mesh(new THREE.BoxGeometry(n * 0.5 + 0.4, 0.04, 0.04), metalMat);
  bar.position.set(x, hangY, z);
  g.add(bar);

  for (let i = 0; i < n; i++) {
    const lx = x + (i - (n - 1) / 2) * 0.5;
    const drop = 0.12 + rng() * 0.1; // 挂绳长度微差（错落）
    const ly = hangY - drop - 0.19;  // 灯笼中心（笼高 0.38）
    const chain = new THREE.Mesh(chainGeo, metalMat);
    chain.position.set(lx, hangY - drop / 2, z);
    g.add(chain);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(lx, ly, z);
    body.userData.__skipNpr = true;
    g.add(body);
    for (const dy of [0.2, -0.2]) {
      const cap = new THREE.Mesh(capGeo, ribMat);
      cap.position.set(lx, ly + dy, z);
      g.add(cap);
    }
    for (const dy of [0.07, -0.07]) {
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.set(lx, ly + dy, z);
      g.add(rib);
    }
    const tassel = new THREE.Mesh(tasselGeo, tasselMat);
    tassel.position.set(lx, ly - 0.31, z);
    tassel.userData.__skipNpr = true;
    g.add(tassel);
    points.push({ x: lx, z, y: ly });
  }

  return { group: g, points };
}
