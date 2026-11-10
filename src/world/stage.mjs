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
import { makeStorefrontRow, makeBuilding, mulberry32 } from "./storefront.mjs";
import { instanceStorefronts } from "./instanced_storefront.mjs";
import { makeStreet, makePowerLines, makeAtmosphereLights, makeNeonSigns, makeLanternChain } from "./streetdetail.mjs";
import { scatterProps } from "./props.mjs";
import { optimizeScene } from "./instanced.mjs";
import { addLightShafts, makeRunwayStrip, makeWetPatches, makeBokehDots } from "./atmosphere.mjs";
import { attachAholoStreet } from "./aholo-street.mjs";

const FOG_COLOR = 0x9ab0cc;  // 黄昏蓝灰（圣经 v2 §0，与 main.mjs:53 scene.background 同源；并行线已落地，保留）
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

  // ---------- 蓝跑道条（圣经 v2 §5.6：冷调磨砂标线 0x4a5568 宽 1.2m/opacity 0.10 + 金属贴花边线）----------
  group.add(makeRunwayStrip({ length: 10, width: 1.2, opacity: 0.1 }));

  // ---------- 体积光柱（移除：视觉负担大，收益小）----------

  // ---------- 街道地面 ----------
  group.add(makeStreet({ length: 44, width: 8, seed: 7 }));

  // ---------- 中景：连续店铺（先收集，最后实例化合并，性能优化）----------
  const storefrontGroups = [];
  for (const side of [-1, 1]) {
    const rowGroup = makeStorefrontRow({
      count: 9,
      startX: -18,
      z: side * 4.6,
      facing: side > 0 ? -1 : 1,
      floorHeight: 3.6,
      seed: side * 10,
    });
    storefrontGroups.push(rowGroup);
  }
  // 实例化合并（324 mesh → 约 20 个 InstancedMesh）
  const instanced = instanceStorefronts(storefrontGroups);
  group.add(instanced);

  // ---------- 灯笼链（圣经 v2 §5.2：每 3 间店 1 链、檐下 z ±3.9；灯位收集供湿光斑对位）----------
  const lanternPoints = [];
  for (const side of [-1, 1]) {
    for (const i of [1, 4, 7]) {
      const chain = makeLanternChain({ x: -18 + (i + 0.5) * 3.3, z: side * 3.9, seed: side * 10 + i });
      group.add(chain.group);
      lanternPoints.push(...chain.points);
    }
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

  // ---------- 可破坏箱（战斗用；0x3a2f28→0x4a4038，圣经 v2 §5.7 暖棕归板）----------
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.85 });
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

  // ---------- 掩体（0x2a3038→0x3a4250，圣经 v2 §5.7 冷蓝灰归板）----------
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.8 });
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

  // v2（圣经 §5.1/§5.7）：NPR 材质（makeNprMaterial）不拷 emissive，且合批会新建
  // InstancedMesh 丢掉源 mesh 的 userData——因此在合批之后、applyNpr 之前，对一切
  // 自发光材质的合批体打 __skipNpr，保住招牌灯箱/亮橱窗/灯笼/贩卖机窗的自发光
  // （自发光仅限清单：灯笼/橱窗/贩卖机窗/招牌灯管/边线；暗窗 emissive=0 照常进 NPR）。
  group.traverse((o) => {
    if (o.isInstancedMesh && o.material?.emissive && (o.material.emissiveIntensity ?? 0) > 0) {
      o.userData.__skipNpr = true;
    }
  });

  // ---------- NPR 风格化（场景模式：只换材质，不加描边壳；档位对齐圣经 v2 §2 软两档）----------
  if (npr) {
    // 地面/人行道：关闭高光 + 降低 rim，避免色调分离出亮白块
    applyNpr(group, {
      specularStrength: 0.0,
      rimStrength: 0.12,   // 0.15 → 0.12（圣经 v2 §2）
      shadowLift: 0.42,    // 0.35 → 0.42（暗部抬升，高环境不塌）
      steps: 2,            // 4 → 2（软两档赛璐璐）
    }, { width: 0.008, addOutline: false });
  }

  // ---------- 湿光斑 + 远景散景（圣经 v2 §5.4/§5.5；Basic/Sprite 材质，挂在 NPR 后防换材质）----------
  const wetSources = [];
  for (const p of lanternPoints) {
    // 灯笼暖橙光斑（向路中投影）
    wetSources.push({ x: p.x, z: p.z * 0.92, dir: -Math.sign(p.z) || -1, color: 0xff8a4a, width: 0.34 });
  }
  for (let i = 0; i < 4; i++) {
    // 贩卖机冷白光斑（scatterProps length 40 的固定布点：x=-15+i*8，z=±4.2）
    const side = i % 2 === 0 ? -1 : 1;
    wetSources.push({ x: -15 + i * 8, z: side * 3.6, dir: -side, color: 0xcfe0f2, width: 0.55 });
  }
  for (const side of [-1, 1]) {
    // 橱窗暖黄光斑（每侧抽 4 处近似店位）
    for (const i of [0, 3, 5, 8]) {
      wetSources.push({ x: -18 + (i + 0.5) * 3.3, z: side * 3.6, dir: -side, color: 0xffd98a, width: 0.8 });
    }
  }
  group.add(makeWetPatches({ sources: wetSources, seed: 91 }));
  group.add(makeBokehDots({ count: 28, seed: 77 }));

  // ---------- Aholo World 真实街区表面：写实底 / 视差背景 ----------
  // 必须放在 optimizeScene 与 applyNpr 之后：前者会把 mesh 拿去合批，
  // 后者会把顶点色材质换成 NPR 材质，两层都会毁掉这个背景。
  // lite（移动端）跳过，省掉 2.9 万面与一次 draw call。
  if (!lite) attachAholoStreet(group);

  return { group, fog, lite };
}
