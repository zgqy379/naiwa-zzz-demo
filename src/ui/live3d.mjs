/**
 * 角色选择页的实时 3D 卡片层。
 *
 * 以前卡片里是 portrait.mjs 生成的静态立绘（自带深色斜纹底），
 * 这里改成直接加载 public/asset 下的运行时 GLB，用一张透明 canvas
 * 按每张卡片的 DOM 位置摆放模型，单 scene / 单 camera / 单 render 画完，
 * 每帧做缓慢转身与浮动；GLB 自带动画时用 AnimationMixer 播放。
 *
 * 卡片 DOM 只保留编号、名称、渐变亮边与高光，背景透明，
 * 3D 模型从下面透出来 —— 这才是真的透明液态玻璃卡片。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";
import { SQUAD } from "../game/squad.mjs";

/**
 * @returns {{ensure:()=>Promise<any>, setSelected:(i:number)=>void}}
 *
 * 2026-11-11 起改为**惰性初始化**：真正的 WebGLRenderer 与 16 只 GLB 加载
 *   推迟到**首次进入选人页**时才发生（此前在 boot 就建 context 并下载全部 16 只 GLB
 *   ≈ 4.98MB，而首屏（标题页）根本用不到——实测首屏瀑布 11,097KB，其中 4,980KB
 *   是这批只在战斗时需要的角色模型）。进选人页后与战斗共用同一批 URL，命中 HTTP 缓存。
 */
export async function initLive3DCards() {
  let api = null;            // 已建好的内部 API
  let initializing = null;   // 正在进行的初始化 Promise
  let pendingIndex = 0;      // 初始化前的选择（记住，等建好再套用）

  async function ensure() {
    if (api) return api;
    if (!initializing) {
      initializing = build().then((a) => {
        api = a;
        a.setSelected(pendingIndex);
        return a;
      }).catch((e) => {
        console.warn("[live3d] 初始化失败", e?.message);
        initializing = null;
        return null;
      });
    }
    return initializing;
  }

  return {
    ensure,
    setSelected(i) {
      pendingIndex = i;
      api?.setSelected(i);
    },
  };
}

/** 真正建 renderer + 载 16 只 GLB + 起渲染循环 */
async function build() {
  const canvas = document.getElementById("live3d-layer");
  const screen = document.getElementById("screen-select");
  if (!canvas || !screen) return null;

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
    console.warn("[live3d] WebGL 不可用", e?.message);
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // 与主渲染同一套色调映射，避免强光把奶油黄贴图烧成纯白
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;

  const scene = new THREE.Scene();
  // 像素正交坐标：Y 向上，DOM 的 y 需要用 H - y 换算
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -2000, 2000);
  camera.position.z = 600;

  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const key = new THREE.DirectionalLight(0xffe8c8, 1.25);
  key.position.set(4, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ec8ff, 0.55);
  rim.position.set(-6, 4, -4);
  scene.add(rim);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const entries = SQUAD.map((m, i) => ({
    m, i, group: null, mixer: null, scaleUnit: 0, phase: i * 0.7,
  }));

  // 16 只并行加载；失败的那只保持空位，不再退回黑底静态图
  await Promise.all(entries.map(async (e) => {
    try {
      const gltf = await loader.loadAsync(e.m.glb);
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      root.position.sub(center);            // 以包围盒中心为原点
      const group = new THREE.Group();
      group.add(root);
      e.scaleUnit = 1 / Math.max(size.y, 0.001);  // 每 1 像素高度对应的缩放
      e.group = group;
      scene.add(group);
      if (gltf.animations?.length) {
        e.mixer = new THREE.AnimationMixer(root);
        e.mixer.clipAction(gltf.animations[0]).play();
      }
    } catch (err) {
      console.warn("[live3d] GLB 加载失败", e.m.glb, err?.message);
    }
  }));

  let selected = 0;
  let showcase = null;

  function setSelected(i) {
    selected = i;
    if (showcase) {
      scene.remove(showcase);
      showcase = null;
    }
    const src = entries[i];
    if (!src?.group) return;
    // 有骨骼时用 SkeletonUtils.clone，普通 Mesh 也兼容
    try {
      showcase = skeletonClone(src.group);
    } catch {
      showcase = src.group.clone(true);
    }
    scene.add(showcase);
  }
  setSelected(0);

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.left = 0;
    camera.right = w;
    camera.top = h;
    camera.bottom = 0;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const clock = new THREE.Clock();

  // ---- 渲染循环：选人页不可见时**整条 rAF 停掉**（此前每帧仍调 renderer.clear()，
  //      白占一个 GL 调用与一个 rAF 槽位）；重新可见时自动恢复 ----
  let running = false;
  let rafId = 0;
  const startLoop = () => { if (running) return; running = true; rafId = requestAnimationFrame(frame); };
  const stopLoop = () => { if (!running) return; running = false; cancelAnimationFrame(rafId); };

  // ---- 每帧 DOM 查询消除：缓存卡片元素与展示台元素；卡片位置只在滚动/尺寸变化时重算 ----
  const listEl = document.getElementById("select-list");
  const artEl = document.getElementById("showcase-img");
  let cards = [];
  let cardRects = [];
  let rectsDirty = true;
  const refreshCards = () => {
    cards = listEl ? Array.from(listEl.querySelectorAll(".char-card")) : [];
    rectsDirty = true;
  };
  refreshCards();
  if (listEl) {
    new MutationObserver(refreshCards).observe(listEl, { childList: true, subtree: false });
    listEl.addEventListener("scroll", () => { rectsDirty = true; }, { passive: true });
  }
  window.addEventListener("resize", () => { rectsDirty = true; }, { passive: true });

  // 选人屏显隐变化 → 起/停循环
  new MutationObserver(() => {
    if (screen.classList.contains("hidden")) stopLoop();
    else { rectsDirty = true; startLoop(); }
  }).observe(screen, { attributes: true, attributeFilter: ["class"] });

  function frame() {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (screen.classList.contains("hidden")) {
      clock.getDelta();
      return;
    }
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = performance.now() * 0.001;
    const cr = canvas.getBoundingClientRect();
    const H = cr.height;
    if (H < 1) return;

    if (rectsDirty) {
      cardRects = cards.map((el) => el.getBoundingClientRect());
      rectsDirty = false;
    }
    for (const e of entries) {
      if (!e.group) continue;
      const r = cardRects[e.i];
      if (!r) { e.group.visible = false; continue; }
      const lx = r.x - cr.x;
      const ly = r.y - cr.y;
      // 滚动出容器就不画，省 draw call
      if (ly + r.height < -20 || ly > H + 20) {
        e.group.visible = false;
        continue;
      }
      e.group.visible = true;
      // 模型落在卡片上部的图片区（.cc-img 约占卡片高度 60%）
      const targetH = Math.min(r.height * 0.60, 88);
      e.group.scale.setScalar(e.scaleUnit * targetH);
      const cx = lx + r.width * 0.5;
      const cy = H - (ly + r.height * 0.34);
      e.group.position.set(cx, cy + Math.sin(t * 1.7 + e.phase) * 3, 0);
      e.group.rotation.y = Math.sin(t * 0.7 + e.phase) * 0.42;
      e.mixer?.update(dt);
    }

    const art = artEl;
    if (showcase && art) {
      const r = art.getBoundingClientRect();
      const lx = r.x - cr.x;
      const ly = r.y - cr.y;
      const onScreen = ly + r.height > -40 && ly < H + 40;
      showcase.visible = onScreen;
      if (onScreen) {
        const targetH = Math.min(r.height * 0.72, 260);
        showcase.scale.setScalar(entries[selected].scaleUnit * targetH);
        showcase.position.set(
          lx + r.width * 0.5,
          H - (ly + r.height * 0.5) + Math.sin(t * 1.2) * 5,
          0,
        );
        // 在正面附近摆动，别一直转到背面（背面贴图糊、细节少）
        showcase.rotation.y = 0.3 + Math.sin(t * 0.5) * 0.55;
      }
    }

    renderer.render(scene, camera);
  }
  startLoop();

  return { setSelected };
}
