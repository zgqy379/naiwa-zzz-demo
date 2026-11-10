/**
 * 角色缩略图生成器 —— 离屏渲染每只角色的 2D 头像。
 *
 * 用途：
 *  - 选人卡片（左侧列表）
 *  - 展示台（右侧大图，可复用同一渲染器）
 *  - 主界面立绘
 *
 * 实现：两条路，静态优先
 *  1) **静态立绘**：`public/portrait/<id>.png`（离线预渲染，脚本见
 *     `scripts/render-portraits.mjs`）。命中就直接返回 URL，界面秒开、
 *     不吃 WebGL 上下文，也不受首帧 shader 编译拖累。
 *  2) **实时离屏渲染**：静态图缺失时兜底——独立 WebGLRenderer + 离屏
 *     canvas，加载 GLB → 摆好姿势 → NPR 材质 + 描边 → 渲染 → dataURL。
 *
 * 为什么要静态化：实时渲染 16 只约 35 秒（首只含 shader 编译要 6 秒），
 * 选人界面会长时间挂着占位色块；而且中途服务被重启就会整批失败。
 * 静态图一次性生成、随构建分发，运行期零成本。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { applyNpr, NPR_PRESET } from "../render/npr.mjs";

let _renderer = null;
let _loader = null;
let _cache = new Map();

/** 静态立绘目录（相对路径，兼容 vite base "./" 的子路径部署） */
const STATIC_DIR = "./portrait/";
const _staticCache = new Map();

/** 初始化离屏渲染器 */
function getRenderer() {
  if (_renderer) return _renderer;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  _renderer.outputColorSpace = THREE.SRGBColorSpace;
  _renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // 美术圣经 §2：全局曝光统一 0.85（与 main.mjs 主渲染器同口径，禁回弹）
  _renderer.toneMappingExposure = 0.85;
  return _renderer;
}

function getLoader() {
  if (_loader) return _loader;
  _loader = new GLTFLoader();
  _loader.setMeshoptDecoder(MeshoptDecoder);
  return _loader;
}

/**
 * 深色斜条纹底 —— 呼应主界面的黑黄警戒斜条，避免纯色背景的「空」。
 */
function makeStripedTexture(base = 0x141821, stripe = 0x1d232e, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#" + base.toString(16).padStart(6, "0");
  g.fillRect(0, 0, size, size);
  g.strokeStyle = "#" + stripe.toString(16).padStart(6, "0");
  g.lineWidth = 12;
  for (let i = -size; i < size * 2; i += 34) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + size, size);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/**
 * 读一张已预渲染的静态立绘；没有就返回 null（走实时渲染兜底）。
 * 用 Image 探测而不是 fetch，避免把 404 也算成有效图。
 * transparent=true 时取 hero_ 前缀的透明底版本（主界面大图用，
 * 避免立绘自带条纹底和主界面的警戒斜条撞在一起）。
 */
function loadStaticPortrait(member, transparent = false) {
  const key = transparent ? `hero_${member.id}` : member.id;
  if (_staticCache.has(key)) return _staticCache.get(key);
  const url = `${STATIC_DIR}${key}.png`;
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  _staticCache.set(key, p);
  return p;
}

/**
 * 生成一只角色的缩略图。
 * @param {object} member { id, glb, color }
 * @param {object} opts { size, bgColor, pose }
 * @returns {Promise<string>} dataURL 或静态图 URL
 */
export async function makePortrait(member, opts = {}) {
  // cacheKey 要区分 force —— 否则离线重渲染时会命中上一次的旧缓存
  // （bug：2026-11-10 洗贴图后重渲，奶蛙本体一直返回旧静态图）
  const cacheKey = `${member.id}_${opts.size ?? 512}_${opts.bgColor ?? "dark"}_${opts.transparent ? "t" : "o"}_${opts.force ? "f" : "c"}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  // ① 静态立绘优先：命中即返回，界面不用等
  //    force=true 时跳过（离线重新生成静态图时用）
  if (!opts.force) {
    const staticUrl = await loadStaticPortrait(member, !!opts.transparent);
    if (staticUrl) {
      _cache.set(cacheKey, staticUrl);
      return staticUrl;
    }
  }

  // ② 实时离屏渲染兜底
  const size = opts.size ?? 512;
  const renderer = getRenderer();
  renderer.setSize(size, size);

  const scene = new THREE.Scene();
  // 透明底（主界面大图用）：alpha 通道留给 CSS 背景
  scene.background = opts.transparent
    ? null
    : makeStripedTexture(
        opts.bgColor === "light" ? 0x2a2f38 : 0x141821,
        opts.bgColor === "light" ? 0x353c48 : 0x1d232e,
      );

  // 三点光：比原来更硬（key 拉高、ambient 压低），出硬边高光
  const key = new THREE.DirectionalLight(0xfff2d0, 3.1);
  key.position.set(2.2, 4.2, 2.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(member.color ?? 0xf5c542, 1.9);
  rim.position.set(-3, 1.6, -2.4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.55);
  fill.position.set(-1.5, -1, 2.5);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0x30343f, 0.85));

  // 相机：略低机位 + 更近，取「仰视压迫感」，比平视更像角色海报
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  // 加载模型（./ 或 / 开头视为完整路径直接用；裸文件名补 ./asset/ 前缀——相对路径，兼容子路径部署，与 STATIC_DIR 同策略）
  const glbPath = member.glb.startsWith(".") || member.glb.startsWith("/") ? member.glb : `./asset/${member.glb}`;
  const glb = await new Promise((resolve, reject) => {
    getLoader().load(glbPath, resolve, undefined, reject);
  });

  const model = glb.scene;
  // 归一化缩放（包围盒适配）：先缩到最大边 1，再按相机距离做取景
  const box = new THREE.Box3().setFromObject(model);
  const sizeVec = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) || 1;
  const s = 1 / maxDim;
  model.scale.set(s, s, s);
  // 居中 + 贴地
  const box2 = new THREE.Box3().setFromObject(model);
  const center = box2.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += (box2.max.y - box2.min.y) / 2;

  scene.add(model);

  // 取景：按体型自动算距离，保证**整只角色完整入画**（占画面高度约 74%），
  // 不再出现「半身特写」——家族卡要看得清剪影，不是看局部。
  const box3 = new THREE.Box3().setFromObject(model);
  const h = Math.max(box3.max.y - box3.min.y, 0.001);
  const fov = (camera.fov * Math.PI) / 180;
  const dist = (h * 0.5) / Math.tan(fov / 2) / 0.74;
  camera.position.set(0, box3.max.y - h * 0.08, dist);
  camera.lookAt(0, box3.min.y + h * 0.45, 0);
  camera.updateProjectionMatrix();

  // NPR 材质 + 细边描边（与游戏内一致，缩略图才不像「发光果冻」）
  // 圣经 v2 §2：立绘 banding 2 档 + 描边 0.005（预设与壳宽同步）；keyDir 对齐本画室 key 灯 (2.2,4.2,2.6)（方向统一）
  applyNpr(model, { ...NPR_PRESET, steps: 2, outlineColor: 0x4a3a28, outlineWidth: 0.005, keyDir: new THREE.Vector3(2.2, 4.2, 2.6).normalize() }, { width: 0.005, addOutline: true });

  // 渲染
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");

  // 清理
  scene.remove(model);
  model.traverse((c) => {
    if (c.isMesh) {
      c.geometry?.dispose();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material?.dispose();
    }
  });

  _cache.set(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * 批量生成（16 只）。
 *
 * 注意：共享同一个 WebGL 上下文，必须串行渲染（并行会冲突）。
 * 优化：尺寸小（256）+ 渲染后立即释放几何体。
 */
export async function makeAllPortraits(members, opts = {}) {
  const out = new Map();
  for (const m of members) {
    try {
      const url = await makePortrait(m, opts);
      out.set(m.id, url);
    } catch (e) {
      console.warn(`缩略图生成失败: ${m.id}`, e?.message);
    }
  }
  return out;
}
