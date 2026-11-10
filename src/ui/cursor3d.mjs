/**
 * 实时 3D 鼠标光标。
 *
 * 隐藏系统光标，用一个透明 canvas 跟着指针，渲染官方工具生成的
 * 奶蛙手 GLB（压缩版 public/asset/naiwa_hand_cursor.glb）。
 * 模型会有轻微呼吸/摆动，按下时做一个压按反馈。
 *
 * 初始化或 GLB 加载失败时**不隐藏系统光标**，自动退回之前的 PNG 手型光标。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SIZE = 160;
// 模型指尖在 canvas 内的位置，指针热点对齐到这里
const HOT_X = 20;
const HOT_Y = 88;

export async function initCursor3D() {
  const canvas = document.createElement("canvas");
  canvas.id = "cursor3d-layer";
  document.body.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
  } catch (e) {
    console.warn("[cursor3d] WebGL 不可用，保留 PNG 光标", e?.message);
    canvas.remove();
    return false;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  const key = new THREE.DirectionalLight(0xffe8c8, 1.5);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ec8ff, 0.65);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  let model = null;
  let baseScale = 1;
  try {
    const gltf = await new GLTFLoader().loadAsync("./asset/naiwa_hand_cursor.glb");
    model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    baseScale = 3.1 / Math.max(size.x, size.y, size.z, 0.001);
    model.scale.setScalar(baseScale);
    scene.add(model);
  } catch (e) {
    console.warn("[cursor3d] GLB 加载失败，保留 PNG 光标", e?.message);
    canvas.remove();
    renderer.dispose();
    return false;
  }

  // 到这里才隐藏系统光标 —— 失败路径仍能用之前的 PNG 手型光标
  document.body.dataset.cursor3d = "on";

  // 姿态基准（图生 3D 的原始朝向是侧面，需绕轴转到能看见掌心）
  // -1.15 让掌心朝上、五指张开（四姿态实机对比后选定）
  const pose = { x: -1.15, y: 0, z: -0.14 };
  window.__cursor3d = { pose, setPose: (p) => Object.assign(pose, p) };

  let x = -999;
  let y = -999;
  let visible = false;
  let pressed = false;

  window.addEventListener("pointermove", (e) => {
    x = e.clientX;
    y = e.clientY;
    visible = true;
  }, { passive: true });
  window.addEventListener("pointerdown", () => { pressed = true; }, { passive: true });
  window.addEventListener("pointerup", () => { pressed = false; }, { passive: true });
  document.addEventListener("pointerleave", () => { visible = false; });
  window.addEventListener("blur", () => { visible = false; pressed = false; });

  function frame() {
    requestAnimationFrame(frame);
    const t = performance.now() * 0.001;
    canvas.style.opacity = visible ? "1" : "0";
    canvas.style.transform = `translate3d(${x - HOT_X}px, ${y - HOT_Y}px, 0)`;
    if (model) {
      const press = pressed ? 0.86 : 1;
      model.scale.setScalar(baseScale * press * (1 + Math.sin(t * 2.1) * 0.012));
      model.rotation.x = pose.x;
      model.rotation.y = pose.y + Math.sin(t * 0.8) * 0.18;
      model.rotation.z = pose.z + Math.sin(t * 1.1) * 0.03;
      model.position.y = Math.sin(t * 1.6) * 0.045;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  return true;
}
