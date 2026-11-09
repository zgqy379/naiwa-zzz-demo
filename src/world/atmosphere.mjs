/**
 * 氛围升级 —— 体积光 + 灯光闪烁 + 反射地面。
 *
 * 绝区零式街道氛围：
 *  - 体积光（假）：从店铺橱窗/路灯发出的「光柱」（半透明面片）
 *  - 灯光闪烁：霓虹轻微呼吸/闪烁（自发光强度变化）
 *  - 反射地面：地面加一层「湿反射」（半镜面材质叠加）
 *
 * 全部程序化，零外部资产。
 */
import * as THREE from "three";

/** 体积光柱（半透明锥体，从光源向下） */
export function makeLightShaft(opts = {}) {
  const { color = 0xffc880, height = 4, radius = 0.8, opacity = 0.12, position = [0, 0, 0] } = opts;
  const g = new THREE.Group();

  // 用锥体近似体积光
  const geo = new THREE.ConeGeometry(radius, height, 12, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cone = new THREE.Mesh(geo, mat);
  cone.position.y = height / 2;
  g.add(cone);

  g.position.set(position[0], position[1], position[2]);
  return g;
}

/** 灯光闪烁控制器（霓虹呼吸） */
export class FlickerController {
  constructor() {
    // 收集所有自发光 mesh
    this.flickers = [];
  }

  /** 注册一个闪烁体（mesh + 基础强度 + 速度 + 幅度） */
  add(mesh, { base = 1, speed = 1.5, amount = 0.15, phase = 0 }) {
    this.flickers.push({
      mesh,
      material: mesh.material,
      baseIntensity: mesh.material?.emissiveIntensity ?? base,
      baseEmissive: mesh.material?.emissive?.clone?.() ?? new THREE.Color(colorOf(mesh)),
      speed,
      amount,
      phase,
    });
  }

  /** 每帧更新 */
  update(time) {
    for (const f of this.flickers) {
      const m = f.material;
      if (!m) continue;
      // 呼吸 + 轻微随机
      const v = Math.sin(time * f.speed + f.phase) * f.amount
        + Math.sin(time * f.speed * 2.7 + f.phase) * f.amount * 0.3;
      if (m.emissiveIntensity !== undefined) {
        m.emissiveIntensity = f.baseIntensity * (1 + v);
      }
    }
  }
}

function colorOf(mesh) {
  return mesh.material?.color?.getHex?.() ?? 0xffffff;
}

/**
 * 湿反射地面（只在街道中段的一条湿痕，不是整层覆盖）。
 * 用 additive 混合，避免压暗地面。
 */
export function makeWetReflection(opts = {}) {
  const { length = 12, width = 2.4, color = 0x4a6a9a, opacity = 0.15 } = opts;
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending, // 加色，只增亮不压暗
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, width), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.008;
  return mesh;
}

/** 给场景批量加体积光 */
export function addLightShafts(scene, positions) {
  const shafts = new THREE.Group();
  shafts.name = "light-shafts";
  for (const p of positions) {
    shafts.add(makeLightShaft({
      color: p.color ?? 0xffc880,
      height: p.height ?? 4,
      radius: p.radius ?? 0.7,
      opacity: p.opacity ?? 0.1,
      position: p.position,
    }));
  }
  scene.add(shafts);
  return shafts;
}
