/**
 * 高密度箱庭街道 —— 绝区零式复古都市（真 3D，相机自由）。
 *
 * 三层结构（从远到近）：
 *  1. 远景：多层建筑剪影（带窗户灯光）
 *  2. 中景：连续店铺立面（招牌/橱窗/门脸/卷帘门/空调）+ 电线杆电线
 *  3. 近景：街道地面 + 路缘 + 道具（贩卖机/垃圾桶/自行车/路牌/盆栽/海报）
 *
 * 全部程序化几何，零外部资产。授权合规。
 */
import * as THREE from "three";
import { applyNpr } from "../render/npr.mjs";
import { makeStorefrontRow, makeBuilding, NEON_PALETTE, WALL_PALETTE, mulberry32 } from "./storefront.mjs";
import { makeStreet, makePowerLines, makeAtmosphereLights, makeNeonSigns } from "./streetdetail.mjs";
import { scatterProps } from "./props.mjs";
import { optimizeScene } from "./instanced.mjs";
import { addLightShafts, makeWetReflection } from "./atmosphere.mjs";
import { attachAholoStreet } from "./aholo-street.mjs";

const FOG_COLOR = 0x0b0f14;
const FOG_NEAR = 18;
const FOG_FAR = 55;

export function buildStage(opts = {}) {
  const { npr = true, lite = false } = opts;
  const group = new THREE.Group();
  group.name = "stage";
  const rng = mulberry32(42);

  const fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  // ---------- 氛围光照 ----------
  group.add(makeAtmosphereLights());

  // ---------- 湿反射地面（极淡，只在中段一条）----------
  group.add(makeWetReflection({ length: 10, width: 1.6, opacity: 0.05 }));

  // ---------- 体积光柱（极淡，只 4 个）----------
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      addLightShafts(group, [{
        color: 0xffc880,
        height: 3.0,
        radius: 0.4,
        opacity: 0.03,
        position: [-8 + i * 14, 0, side * 3.6],
      }]);
    }
  }

  // ---------- 街道地面 ----------
  group.add(makeStreet({ length: 44, width: 8, seed: 7 }));

  // ---------- 中景：连续店铺（街道两侧，只放一排，避免堵相机）----------
  for (const side of [-1, 1]) {
    const rowGroup = makeStorefrontRow({
      count: 9,
      startX: -18,
      z: side * 4.6,
      facing: side > 0 ? -1 : 1,
      floorHeight: 3.6,
      seed: side * 10,
    });
    group.add(rowGroup);
  }

  // ---------- 远景：多层建筑 ----------
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const w = 6 + rng() * 4;
      const floors = 2 + Math.floor(rng() * 3);
      const b = makeBuilding({
        width: w,
        floors,
        depth: 4,
        z: side * (12 + i * 1.5),
        floorHeight: 3.6,
        seed: side * 100 + i,
      });
      b.position.x = -16 + i * 9 + (rng() - 0.5) * 2;
      group.add(b);
    }
  }

  // ---------- 电线杆 + 电线 ----------
  group.add(makePowerLines({ length: 44, z: -3.2, seed: 11 }));
  group.add(makePowerLines({ length: 44, z: 3.2, seed: 13 }));

  // ---------- 悬挂霓虹招牌 ----------
  group.add(makeNeonSigns({ count: 12, length: 36, z: -3.8, seed: 21 }));
  group.add(makeNeonSigns({ count: 12, length: 36, z: 3.8, seed: 23 }));

  // ---------- 生活道具 ----------
  group.add(scatterProps({ length: 40, seed: 31 }));

  // ---------- 可破坏箱（战斗用）----------
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.85 });
  for (let i = 0; i < 6; i++) {
    const size = 0.5 + rng() * 0.4;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat.clone());
    const side = i % 2 === 0 ? -1 : 1;
    crate.position.set(side * (2.5 + rng() * 4), size / 2, -1 - rng() * 4);
    crate.castShadow = true;
    crate.receiveShadow = true;
    crate.userData = { type: "crate", hp: 2, alive: true, size };
    group.add(crate);
  }

  // ---------- 掩体 ----------
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.8 });
  for (let i = 0; i < 3; i++) {
    const cover = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.5), coverMat.clone());
    cover.position.set(-4 + i * 4 + (rng() - 0.5), 0.9, -3 - rng() * 2);
    cover.castShadow = true;
    cover.receiveShadow = true;
    cover.userData = { type: "cover", alive: true };
    group.add(cover);
  }

  // ---------- 性能优化：合并同类 mesh 为 InstancedMesh ----------
  // 注意：要在 NPR 之前做，因为 InstancedMesh 材质共享，不能逐 mesh 换 NPR
  const optStats = optimizeScene(group);
  if (opts.onOptimize) opts.onOptimize(optStats);

  // ---------- NPR 风格化（场景模式：只换材质，不加描边壳）----------
  if (npr) {
    // 地面/人行道：关闭高光 + 降低 rim，避免色调分离出亮白块
    applyNpr(group, {
      specularStrength: 0.0,
      rimStrength: 0.15,
      shadowLift: 0.35,
      steps: 4,
    }, { width: 0.008, addOutline: false });
  }

  // ---------- Aholo World 真实街区表面：写实底 / 视差背景 ----------
  // 必须放在 optimizeScene 与 applyNpr 之后：前者会把 mesh 拿去合批，
  // 后者会把顶点色材质换成 NPR 材质，两层都会毁掉这个背景。
  // lite（移动端）跳过，省掉 2.9 万面与一次 draw call。
  if (!lite) attachAholoStreet(group);

  return { group, fog, lite };
}
