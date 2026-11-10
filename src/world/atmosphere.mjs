/**
 * 氛围升级 —— 体积光 + 灯光闪烁 + 湿光斑 + 跑道条 + 散景光点。
 *
 * 美术圣经 v2（docs/美术圣经-重做线-20261110.md）：
 *  - 体积光（假）：柔体积感双层锥；默认色冷白 0xdce8f5（§4）
 *  - 灯光闪烁：霓虹轻微呼吸/闪烁（自发光强度变化，保留不动）
 *  - 湿地面：makeWetPatches 水渍状反射光斑（色随光源，§5.4）——
 *    旧 makeWetReflection 均匀长条已删（§5.6 旧默认 0x4a6a9a 随之清除）
 *  - 跑道条：makeRunwayStrip 冷调磨砂标线 + 金属贴花边线（§5.6，ref-06）
 *  - 散景：makeBokehDots 远景软边光点 sprite（§5.5，ref-09）
 *
 * 全部程序化，零外部资产。
 */
import * as THREE from "three";
import { mulberry32 } from "./storefront.mjs";

/** 体积光柱（半透明双层锥体：外层柔边 + 内层核心，柔和体积感；从光源向下） */
export function makeLightShaft(opts = {}) {
  const { color = 0xdce8f5, height = 4, radius = 0.8, opacity = 0.12, position = [0, 0, 0] } = opts;
  const g = new THREE.Group();

  const mkCone = (r, op) => {
    const geo = new THREE.ConeGeometry(r, height, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: op,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.y = height / 2;
    return cone;
  };
  // 外层（宽、淡）+ 内层（窄、稍浓）叠加出软边体积感
  g.add(mkCone(radius, opacity * 0.5));
  g.add(mkCone(radius * 0.55, opacity * 0.6));

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
 * 蓝跑道条 → 冷调磨砂标线 + 金属贴花（美术圣经 v2 §5.6，ref-06 金属地面语言）。
 * 主体 0x4a5568 宽 1.2m additive opacity 0.10；边线 ×2 为冷白银 0x8c9ab0 金属贴花
 * （metalness 0.6 / roughness 0.35 / emissiveIntensity 0.25），位于 ±0.63m。
 * 旧 makeWetReflection（0x4a6a9a 均匀长条）删除，默认值随之清除。
 */
export function makeRunwayStrip(opts = {}) {
  const { length = 10, width = 1.2, color = 0x4a5568, opacity = 0.1 } = opts;
  const g = new THREE.Group();
  g.name = "runway-strip";
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending, // 加色，只增亮不压暗
    depthWrite: false,
  });
  const body = new THREE.Mesh(new THREE.PlaneGeometry(length, width), mat);
  body.rotation.x = -Math.PI / 2;
  body.position.y = 0.008;
  body.userData.__skipNpr = true;
  g.add(body);
  // 金属贴花边线 ×2（±0.63m = 宽/2 + 0.03）
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0x8c9ab0,
    metalness: 0.6,
    roughness: 0.35,
    emissive: 0x8c9ab0,
    emissiveIntensity: 0.25,
  });
  const edgeGeo = new THREE.BoxGeometry(length, 0.015, 0.05);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.set(0, 0.012, side * (width / 2 + 0.03));
    edge.userData.__skipNpr = true;
    g.add(edge);
  }
  return g;
}

/**
 * 湿光斑（美术圣经 v2 §5.4）：在每个暖光源（灯笼/橱窗/贩卖机）正下方路面放一块
 * 竖向拉伸加色光斑——宽 ≈ 光源宽 ×0.6（调用方折算后传 width），投影向长 1.5–2.5m，
 * 色随光源（暖橙 0xff8a4a / 冷白 0xcfe0f2 / 橱窗暖黄 0xffd98a），opacity 0.08，
 * AdditiveBlending、depthWrite false——湿感来自光斑，不靠压暗路面（§1 硬规则）。
 * @param {Array<{x:number,z:number,dir?:number,color?:number,width?:number}>} sources 光源点位（dir=-1 光斑向 -z 投影）
 */
export function makeWetPatches(opts = {}) {
  const { sources = [], seed = 5 } = opts;
  const rng = mulberry32(Math.floor(seed));
  const g = new THREE.Group();
  g.name = "wet-patches";
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const len = 1.5 + rng() * 1.0;
    const w = Math.max(0.25, s.width ?? 0.6);
    const dir = s.dir ?? -1;
    const mat = new THREE.MeshBasicMaterial({
      color: s.color ?? 0xff8a4a,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
    m.rotation.x = -Math.PI / 2;
    // 光斑从光源正下方向路中投影拉伸；y 随序号微抬避免共面闪烁
    m.position.set(s.x, 0.009 + i * 0.0004, s.z + (len / 2) * dir);
    m.userData.__skipNpr = true;
    g.add(m);
  }
  return g;
}

/**
 * 远景散景光点（美术圣经 v2 §5.5，ref-09）：24–32 枚软边圆盘 sprite（canvas 径向渐变），
 * 色三族 0xffb066 / 0xffd98a / 0xdce8f5 随机，AdditiveBlending，opacity 0.15–0.35，
 * size 0.12–0.4m，分布 z ±8–14m、y 1.5–5m；bloom threshold 0.90 下只留微辉。
 * 注：main.mjs 无场景级 per-frame 钩子（FlickerController 同样未被驱动），
 * §5.5 的 sin 缓漂暂不可驱动，本实现为静态散景——视觉验收不受影响。
 */
export function makeBokehDots(opts = {}) {
  const { count = 28, spreadX = 12, seed = 7 } = opts;
  const rng = mulberry32(Math.floor(seed));
  const g = new THREE.Group();
  g.name = "bokeh-dots";
  const palette = [0xffb066, 0xffd98a, 0xdce8f5];
  const tex = makeBokehTexture();
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: palette[Math.floor(rng() * palette.length)],
      transparent: true,
      opacity: 0.15 + rng() * 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.position.set(
      (rng() - 0.5) * 2 * spreadX,
      1.5 + rng() * 3.5,
      (8 + rng() * 6) * (rng() > 0.5 ? 1 : -1),
    );
    const s = 0.12 + rng() * 0.28;
    sp.scale.set(s, s, 1);
    g.add(sp);
  }
  return g;
}

/** 散景软边圆盘贴图（canvas 径向渐变，共享一张） */
function makeBokehTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
