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

/** 共享官方动画库的片段（角色文件不带片段时，驱动全体卡片；骨架跨角色一致） */
let sharedClips = null;

/**
 * @returns {{ensure:()=>Promise<any>, setSelected:(i:number)=>void}}
 *
 * 2026-11-11 起改为**惰性初始化**：真正的 WebGLRenderer 与 16 只 GLB 加载
 *   推迟到**首次进入选人页**时才发生（此前在 boot 就建 context 并下载全部 16 只 GLB
 *   ≈ 4.98MB，而首屏（标题页）根本用不到——实测首屏瀑布 11,097KB，其中 4,980KB
 *   是这批只在战斗时需要的角色模型）。进选人页后与战斗共用同一批 URL，命中 HTTP 缓存。
 *   模型未到齐时通过 onProgress 回报进度，由界面层显示「载入中…」。
 */
export async function initLive3DCards(onProgress, opts = {}) {
  let api = null;            // 已建好的内部 API
  let initializing = null;   // 正在进行的初始化 Promise
  let pendingIndex = 0;      // 初始化前的选择（记住，等建好再套用）

  /** 共享官方动画库的片段（角色文件本身不带片段时用；骨架跨角色一致，可直接驱动） */
  function setSharedClips(clips) {
    sharedClips = clips || null;
    api?.setSharedClips?.(sharedClips);
  }
  sharedClips = opts.sharedClips || null;

  async function ensure() {
    if (api) return api;
    if (!initializing) {
      initializing = build(onProgress).then((a) => {
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
    setSharedClips(clips) {
      sharedClips = clips || null;
      api?.setSharedClips?.(sharedClips);
    },
  };
}

/** 真正建 renderer + 载 16 只 GLB + 起渲染循环 */
async function build(onProgress) {
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
      e.root = root;
      scene.add(group);
      // 动画：优先角色自带片段；没有则等共享动画库（骨架跨角色一致，可直接驱动）
      const clips = gltf.animations?.length ? gltf.animations : sharedClips;
      if (clips?.length) {
        e.mixer = new THREE.AnimationMixer(root);
        const idle = clips.find((c) => c.name === "Idle_Loop") || clips[0];
        e.mixer.clipAction(idle).play();
      }
    } catch (err) {
      console.warn("[live3d] GLB 加载失败", e.m.glb, err?.message);
    }
    onProgress?.(entries.filter((x) => x.group).length, entries.length);
  }));

  let selected = 0;
  let showcase = null;
  let showcaseMixer = null;      // 展示台角色的驱动（播登场动作）
  let showcaseAction = null;     // 当前片段
  const ENTRANCE_CLIPS = ["Sword_Heavy_Combo", "Sword_Regular_Combo", "LayToIdle", "Idle_No_Loop"];

  /** 共享动画库到达 → 给还没驱动的卡片补上官方待机动作（骨架跨角色一致，可直接驱动） */
  function setSharedClipsInner(clips) {
    if (!clips?.length) return;
    for (const e of entries) {
      if (!e.root || e.mixer) continue;
      e.mixer = new THREE.AnimationMixer(e.root);
      const idle = clips.find((c) => c.name === "Idle_Loop") || clips[0];
      e.mixer.clipAction(idle).play();
    }
  }

  /**
   * 选人页的「登场动作」：选中一只时，展示台上的角色先打一段官方登场片段
   * （重剑连招 / 躺卧起身），播完回到待机——比原来只做缓慢转身更像动作游戏。
   */
  function playEntrance(root) {
    try {
      if (!root || !sharedClips?.length) return;
      // 换角色时展示台是**新的克隆**，mixer 需要换根：three.js 的 AnimationMixer 没有
      // setRoot()，正确做法是 uncacheRoot(旧根) 后新建 mixer（或用 clipAction(clip, 新根)）。
      if (showcaseMixer) {
        showcaseMixer.stopAllAction();
        showcaseMixer.uncacheRoot(showcaseMixer.getRoot());
        showcaseMixer = null;
      }
      const mixer = new THREE.AnimationMixer(root);
      showcaseMixer = mixer;
      mixer.stopAllAction();
      const name = ENTRANCE_CLIPS.find((n) => sharedClips.some((c) => c.name === n));
      const clip = name ? sharedClips.find((c) => c.name === name) : sharedClips[0];
      if (!clip) return;
      const a = mixer.clipAction(clip);
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.fadeIn(0.08).play();
      showcaseAction = clip.name;
      // 播完回到待机
      mixer.addEventListener("finished", (e) => {
        if (e.action !== showcaseAction) return;
        const idle = sharedClips.find((c) => c.name === "Idle_Loop");
        if (idle) { mixer.clipAction(idle).reset().fadeIn(0.25).play(); showcaseAction = "Idle_Loop"; }
      });
    } catch (err) {
      // 登场动作失败不影响选人页（模型照常展示）
      window.__live3dErr = String(err && err.stack ? err.stack : err);
      console.warn("[live3d] 登场动作失败", err);
    }
  }

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
    // 登场动作：选中角色时展示台播一段官方片段（重剑连招 / 躺卧起身），播完回待机
    playEntrance(showcase);
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
    showcaseMixer?.update(dt);   // 展示台角色的登场动作

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

  return { setSelected, setSharedClips: (clips) => setSharedClipsInner(clips) };
}
