/**
 * 角色缩略图生成器 —— 离屏渲染每只角色的 2D 头像。
 *
 * 用途：
 *  - 选人卡片（左侧列表）
 *  - 展示台（右侧大图，可复用同一渲染器）
 *  - 主界面立绘
 *
 * 实现：用独立的 WebGLRenderer + 离屏 canvas，
 * 加载 GLB → 摆好姿势 → 渲染 → 转成 dataURL → 给 <img> 用。
 *
 * 注意：只渲染一次并缓存（16 只各一张），避免每帧渲染。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

let _renderer = null;
let _loader = null;
let _cache = new Map();

/** 初始化离屏渲染器 */
function getRenderer() {
  if (_renderer) return _renderer;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  _renderer.outputColorSpace = THREE.SRGBColorSpace;
  _renderer.toneMapping = THREE.ACESFilmicToneMapping;
  _renderer.toneMappingExposure = 1.1;
  return _renderer;
}

function getLoader() {
  if (_loader) return _loader;
  _loader = new GLTFLoader();
  _loader.setMeshoptDecoder(MeshoptDecoder);
  return _loader;
}

/**
 * 生成一只角色的缩略图（dataURL）。
 * @param {object} member { id, glb, color }
 * @param {object} opts { size, bgColor, pose }
 * @returns {Promise<string>} dataURL
 */
export async function makePortrait(member, opts = {}) {
  const cacheKey = `${member.id}_${opts.size ?? 512}_${opts.bgColor ?? "dark"}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  const size = opts.size ?? 512;
  const renderer = getRenderer();
  renderer.setSize(size, size);

  const scene = new THREE.Scene();
  // 背景：深色渐变（用纯色 + 打光模拟）
  scene.background = new THREE.Color(opts.bgColor === "light" ? 0x2a2f38 : 0x141821);

  // 三点光
  const key = new THREE.DirectionalLight(0xfff2d0, 2.2);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(member.color ?? 0xf5c542, 1.2);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x404050, 1.6));

  // 相机（正面偏上）
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 1.2, 3.2);
  camera.lookAt(0, 0.8, 0);

  // 加载模型（支持完整路径或裸文件名）
  const glbPath = member.glb.startsWith("/") ? member.glb : `/asset/${member.glb}`;
  const glb = await new Promise((resolve, reject) => {
    getLoader().load(glbPath, resolve, undefined, reject);
  });

  const model = glb.scene;
  // 归一化缩放（包围盒适配）
  const box = new THREE.Box3().setFromObject(model);
  const sizeVec = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) || 1;
  const s = 1.6 / maxDim;
  model.scale.set(s, s, s);
  // 居中 + 贴地
  const box2 = new THREE.Box3().setFromObject(model);
  const center = box2.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += (box2.max.y - box2.min.y) / 2;

  scene.add(model);

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
