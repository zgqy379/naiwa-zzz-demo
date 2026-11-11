/**
 * 奶蛙零 · 绝区零风格化动作 Demo 入口（v3 — 完整系统）
 *
 * 整合：NPR 渲染 + 3D 移动 + 程序化动画 + 连段 + 运镜
 *      + 多角色队伍 + 弹反博弈 + 场景交互
 *
 * 操作：
 *   WASD 移动 · 空格 攻击（连按出连段）· Shift 闪避/弹反
 *   Tab 循环换壳 · Q/E 上一个/下一个 · R 直选 3 号位 · 1–9 直选前 9 只 / 0 直选第 10 只
 *   N 切换 PBR/NPR · [ / ] 调色调分离档数 · 鼠标拖动旋转
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { applyNpr, NPR_PRESET, FACTION_RIM, attachThemeBand } from "./render/npr.mjs";
import { PostFX } from "./render/postfx.mjs";
import { buildStage } from "./world/stage.mjs";
import { InteractiveProps } from "./world/interactive.mjs";
import { Hud } from "./ui/hud.mjs";
import { initTitleFX } from "./ui/titlefx.mjs";
import { AudioSystem } from "./audio/audio.mjs";
import { Movement } from "./game/movement.mjs";
import { ProceduralAnim, ACTION } from "./game/animation.mjs";
import { ComboSystem } from "./game/combo.mjs";
import { CounterSystem } from "./game/counter.mjs";
import { StaggerSystem, STAGGER_TUNING } from "./game/stagger.mjs";
import { Squad, SQUAD } from "./game/squad.mjs";
import { getMove, styleRelation, STYLE_MULTIPLIER, STYLE_LABEL, STYLE_COUNTER } from "./game/moves.mjs";
import { InputManager } from "./game/input.mjs";
import { Cinematic } from "./vfx/cinematic.mjs";
import { ImpactFX } from "./vfx/impact.mjs";
import { CameraRig } from "./vfx/camerarig.mjs";
import { makeShadowBlob, updateShadowBlob } from "./vfx/shadowblob.mjs";
import { HitFeedback } from "./vfx/hitflash.mjs";
import { TUNING } from "./game/tuning.mjs";

// ---------- 渲染器 ----------
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
// 修：DPR 上限降到 1.5（原 2 在 NPR + 后处理下渲染过重，导致页面无响应）
// 性能优化：DPR 上限降到 1.25（原 1.5 仍偏重）
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;   // 1.0→0.85：压曝光，避免高光糊掉剪影
// 性能优化：关阴影（NPR 风格化用假阴影代替）
renderer.shadowMap.enabled = false;

// ---------- 场景 ----------
const scene = new THREE.Scene();
// 美术圣经 v2 §4：黄昏蓝灰 0x9ab0cc（= stage.mjs:21 FOG_COLOR 同源；冷调统治，角色是唯一暖焦点）
scene.background = new THREE.Color(0x9ab0cc);

// 2026-11-11 定版前收口：原三点光（key 2.0 / rim 0.7 / ambient 1.1）叠加 NPR shader 的
// 额外补光后，奶油黄贴图高光溢出、五官被烧平。这里只降强度、不动方向与色相，
// 让角色回到「亮但看得见细节」，街道/背景亮度不受 toneMappingExposure 全局压暗影响。
const key = new THREE.DirectionalLight(0xffe8c8, 1.5);   // 2.0→1.5（方向 4,8,6 不动）
key.position.set(4, 8, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9ec8ff, 0.55);  // 0.7→0.55（冷天光逆光）
rim.position.set(-6, 4, -4);
scene.add(rim);
scene.add(new THREE.AmbientLight(0x8090a8, 0.85));  // 1.1→0.85（黄昏蓝灰环境抬升）

const lite = new URLSearchParams(location.search).get("lite") === "1";
const stage = buildStage({ npr: true, lite });
scene.add(stage.group);
if (!lite) scene.fog = stage.fog;

// 交互物
const props = new InteractiveProps(scene);
props.spawnCrates(6);
props.spawnCover(3);

// ---------- 相机 ----------
const camera = new THREE.PerspectiveCamera(TUNING.camera.fovVertical, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.copy(new THREE.Vector3(0, TUNING.camera.height, TUNING.camera.distance));
camera.lookAt(0, TUNING.camera.lookAtHeight, 0);

// ---------- 后处理 ----------
const liteMode = new URLSearchParams(location.search).get("lite") === "1";
const postfx = new PostFX(renderer, scene, camera, {
  // 美术圣经 v2 §3：strength 0.20 不动 / radius 0.55 / threshold 0.90（低强度柔辉光；lite 模式 bloom=0 行为不变）
  bloomStrength: liteMode ? 0.0 : 0.20,
  bloomRadius: 0.55,
  bloomThreshold: 0.90,
});
if (liteMode) postfx.setLowQuality();

// ---------- 音效 ----------
const audio = new AudioSystem();
const initAudio = () => {
  audio.init();
  audio.startAmbient();
  audio.playBgm("title");
};
window.addEventListener("click", initAudio, { once: true });
window.addEventListener("keydown", initAudio, { once: true });

// ---------- HUD ----------
const uiRoot = document.getElementById("ui");
const hud = new Hud(uiRoot);

// ---------- 界面管理 ----------
/**
 * 降级界面层：界面 chunk 未就绪或加载失败时的最小实现。
 * 只做 DOM 显隐（与 ScreenManager.show 的 hidden 约定一致），不绑定任何按钮监听
 * （避免真实实例装配后出现重复监听）；toast/showResult 为空实现。
 */
function makeFallbackScreens() {
  const root = document.getElementById("ui");
  const show = (name) => {
    for (const el of document.querySelectorAll(".screen")) el.classList.add("hidden");
    if (name !== "battle") document.getElementById(`screen-${name}`)?.classList.remove("hidden");
    if (root) root.style.display = name === "battle" ? "block" : "none";
  };
  return { current: "title", selectedIndex: 0, show, toast: () => {}, showResult: () => {} };
}

let screens = makeFallbackScreens();

// 界面层懒加载：先让 3D/HUD 首帧跑起来，再异步装配真实界面管理器（失败则保留降级层，不白屏）
(async () => {
  try {
    const { ScreenManager } = await import("./ui/screens.mjs");
    const real = new ScreenManager({
      onStart: (idx) => startBattle(idx),
      onRestart: () => startBattle(screens.selectedIndex),
      onBack: () => { screens.show("title"); audio.playBgm("title"); input.setEnabled(false); },   // UI-1：回标题禁用战斗输入
      setCharactersVisible: (v) => {
        // 延迟到下一帧执行（此时 squad/scene 已初始化）
        setTimeout(() => {
          if (v) {
            if (typeof syncActiveVisibility === "function") syncActiveVisibility();
          } else {
            squad.members.forEach((m) => { if (m.group) m.group.visible = false; });
            const og = scene.getObjectByName("opponent");
            if (og) og.visible = false;
          }
        }, 0);
      },
      onSetMode: (m) => { mode = m; restyleAll(); },
      onSetSteps: (s) => { steps = s; restyleAll(); },
      onSetQuality: (q) => {
        quality = q; // 修（UI-3）：记录当前画质行状态，供设置屏回填高亮
        if (q === "low") { postfx.setBloom(false); postfx.setLowQuality(); }
        else { postfx.setBloom(true); } // 强度不传，沿用构造期 L79 bloomStrength，消除双入口漂移
      },
      onSetVolume: (v) => audio.setVolume(v),
      // 首次进入选人页时才加载 16 只队员 GLB（约 4.98MB，标题页用不到）
      onShow: (name) => {
        if (name === "select") ensureSquadModels();
      },
      // 修（UI-3）：设置屏打开时读取当前运行状态回填高亮（getter 惰性求值，mode/steps/quality 声明在后无 TDZ 问题）
      getState: () => ({ mode, steps, quality }),
    });
    if (screens.current !== "title") real.show(screens.current); // 极端时序下迁移当前界面
    screens = real;
  } catch (e) {
    console.error("[boot] 界面模块加载失败，保持降级界面层:", e?.message ?? e);
  }
})();

// ---------- 模式 ----------
let mode = "NPR";
let steps = 2;   // 美术圣经 v2 §2：banding 统一 2 档软边界（与场景 stage.mjs、立绘 portrait.mjs 同一条 toon 语言；[ ] 键限 2–3）
let quality = liteMode ? "low" : "med"; // 修（UI-3）：画质行状态跟踪（lite 启动即低画质，与上方 setLowQuality 对应；默认「中」与 index.html 初始高亮一致）

// ---------- 队伍 ----------
const squad = new Squad();
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * 预取 16 只队员 GLB（≈4.98MB）。
 *
 * 触发时机：**首页视频就绪之后**（canplaythrough）——这样
 *   ① 首屏视频（8.33MB）优先拿到带宽，不被模型下载拖慢；
 *   ② 玩家在首页停留的这几秒里，模型在后台下载完；
 *   ③ 进选人页时 live3d 要的同一批 URL 命中 HTTP 缓存，卡片立即有模型。
 * 若玩家手快，select 屏会显示「载入中…」提示（见 screens.mjs 的 live3d 进度回调）。
 *
 * ⚠ 不能只依赖视频事件：部分 Chromium 构建（实测 ego lite）不带 H.264，<video> 直接
 *   报错不触发 canplaythrough → 预取永不执行 → 选人页长时间空卡片。
 *   故三选一触发：视频就绪 / 视频报错 / 2.5s 兜底。
 */
function kickModelPrefetch() {
  const v = document.getElementById("title-video");
  let fired = false;
  const fire = () => {
    if (fired) return;
    fired = true;
    setTimeout(() => { ensureSquadModels(); }, 300);
  };
  if (v) {
    if (v.readyState >= 3) fire();
    else {
      v.addEventListener("canplaythrough", fire, { once: true });
      v.addEventListener("error", fire, { once: true });
    }
  }
  setTimeout(fire, 2500);   // 兜底：视频不可播 / 迟迟不就绪
}

// 每个队员一个 group（只显示活跃角色）
for (const member of squad.members) {
  const g = new THREE.Group();
  g.visible = false;
  scene.add(g);
  member.group = g;
  member.move = new Movement({ group: g, camera });
  // 玩家沿 +X 站位（对手在 -X，间距 4.8 > 2.4，对手 AI 会靠近）
  member.move.pos.set(2.4, 0, 0);
  g.position.set(2.4, 0, 0);
  member.anim = new ProceduralAnim({ modelRoot: g, movement: member.move });
  // 占位球：GLB 加载中 / 加载失败时先顶一个同色球，避免角色凭空消失
  //   （延迟加载后模型可能晚于开战到达，见 ensureSquadModels）
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 24), new THREE.MeshStandardMaterial({ color: member.color }));
  ball.castShadow = true;
  g.add(ball);
  member.placeholder = ball;
}

/**
 * 加载 16 只队员 GLB。
 * 2026-11-11 起**延迟到首次进入选人页**才发起：此前在 boot 就下载全部 16 只（≈4.98MB），
 *   而首屏（标题页）根本用不到——实测首屏瀑布 11,097KB，其中 4,980KB 是这批只在战斗时
 *   需要的模型。选人页同时会加载同一批 URL（live3d 实时 3D 卡片），命中 HTTP 缓存；
 *   进战斗时模型早已就位，占位球早已被替换。
 * 幂等：重复调用只会生效一次。
 */
let squadModelsRequested = false;
function ensureSquadModels() {
  if (squadModelsRequested) return;
  squadModelsRequested = true;
  for (const member of squad.members) {
    loader.load(member.glb, (gltf) => {
      const m = gltf.scene;
      const g = member.group;
      // 占位球退场（真正的模型接管）
      if (member.placeholder) {
        member.placeholder.parent?.remove(member.placeholder);
        member.placeholder = null;
      }
      g.add(m);
      // 包 wrapper（外层：负责贴地/缩放）
      const wrapper = new THREE.Group();
      wrapper.name = "model-wrapper";
      // 内层 anim-root（动画层操作这个，不碰 wrapper 的贴地偏移）
      const animRoot = new THREE.Group();
      animRoot.name = "anim-root";
      const existing = [...g.children];
      for (const c of existing) animRoot.add(c);
      wrapper.add(animRoot);
      g.add(wrapper);
      wrapper.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(wrapper);
      const size = box.getSize(new THREE.Vector3());
      // 按身高归一化：保留胖瘦/宽窄比例（不给最大维拉平）
      const s = member.scale / (size.y || 1) * (member.visualScale || 1);
      wrapper.scale.set(s, s, s);
      const box2 = new THREE.Box3().setFromObject(wrapper);
      wrapper.position.y = -box2.min.y;
      wrapper.userData.__origMats = new Map();
      wrapper.traverse((c) => { if (c.isMesh) wrapper.userData.__origMats.set(c, c.material); });
      // 动画层用 anim-root（修：原用 wrapper 会被每帧 position.set(0,0,0) 覆盖贴地偏移）
      member.anim.inner = animRoot;
      member.anim.baseScale = animRoot.scale.clone();
      // 主题色饰带（圣经 A1 可读性）：玩家按 SQUAD member.color
      attachThemeBand(g, { color: member.color });
      // 展示层重染（roster-audit-20261110 差距#1）：奶猫/奶鱼/奶粉传 tintColor（member.tintColor
      // 为 null 时 applyNpr 走无 tint 路径，其余 13 只零行为变化）
      if (mode === "NPR") applyNpr(wrapper, { ...NPR_PRESET, steps, ...FACTION_RIM.ally }, { width: 0.016, tintColor: member.tintColor });   // 圣经 v2 §2 描边 0.022→0.016
    }, undefined, () => {
      // 加载失败：保留占位球（不再另建一个）
    });
  }
}

// 显示活跃角色
function syncActiveVisibility() {
  squad.members.forEach((m, i) => { m.group.visible = i === squad.activeIndex; });
}

// ---------- 对手 ----------
const opponentGroup = new THREE.Group();
opponentGroup.name = "opponent";
scene.add(opponentGroup);

// 假阴影（角色脚下接触阴影，解决 NPR 阴影不明显）
const playerShadow = makeShadowBlob(1.0);
const opponentShadow = makeShadowBlob(1.2);
scene.add(playerShadow);
scene.add(opponentShadow);
const opponentMove = new Movement({ group: opponentGroup, camera });
// 对手沿 -X 站位，与玩家拉开纵深
opponentMove.pos.set(-2.4, 0, 0);
opponentGroup.position.copy(opponentMove.pos);
const opponentAnim = new ProceduralAnim({ modelRoot: opponentGroup, movement: opponentMove });

// 掩体 → 实体碰撞盒：玩家与对手都不能穿过掩体（此前掩体仅参与 AI isBlocked 判定，玩家可直穿）
const coverSolids = props.coverSolids();
for (const m of squad.members) m.move.solidBoxes = coverSolids;
opponentMove.solidBoxes = coverSolids;

let opponent = { hp: 200, maxHp: 200 };

/** 当前对手对应的花名册条目（三连战里每回合换一只） */
let opponentMember = SQUAD[3];   // 默认奶蛋
/** 对手 GLB 的加载缓存：同一个 URL 只加载一次，换回合时直接复用已加载的场景 */
const opponentModelCache = new Map();

/**
 * 加载并换上指定对手的模型（三连战：每回合换一只不同招式族的对手）。
 * 已加载过的模型走缓存，不重复下载 / 不重复上传 GPU。
 */
function loadOpponentModel(memberIndex) {
  const m = SQUAD[memberIndex];
  if (!m) return;
  opponentMember = m;

  const apply = (gltfScene) => {
    // 清掉旧模型（含旧的主题饰带）
    while (opponentGroup.children.length) opponentGroup.remove(opponentGroup.children[0]);
    opponentGroup.add(gltfScene);
    const wrapper = new THREE.Group();
    wrapper.name = "model-wrapper";
    const animRoot = new THREE.Group();
    animRoot.name = "anim-root";
    const existing = [...opponentGroup.children];
    for (const c of existing) animRoot.add(c);
    wrapper.add(animRoot);
    opponentGroup.add(wrapper);
    wrapper.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(wrapper);
    const size = box.getSize(new THREE.Vector3());
    // 对手同样按身高归一化
    const s = 1.3 / (size.y || 1);
    wrapper.scale.set(s, s, s);
    const box2 = new THREE.Box3().setFromObject(wrapper);
    wrapper.position.y = -box2.min.y;
    wrapper.userData.__origMats = new Map();
    wrapper.traverse((c) => { if (c.isMesh) wrapper.userData.__origMats.set(c, c.material); });
    opponentAnim.inner = animRoot;
    opponentAnim.baseScale = animRoot.scale.clone();
    // 敌我分离（圣经 v2 §6）：对手冷白银 rim/描边/饰带，洋红只活在 UI 层（血条/失衡格/预警/受击闪）
    attachThemeBand(opponentGroup, { color: 0xd8e6f4 });
    if (mode === "NPR") applyNpr(wrapper, { ...NPR_PRESET, steps, ...FACTION_RIM.foe }, { width: 0.016, color: FACTION_RIM.foe.outlineColor });   // 圣经 v2 §2 描边 0.022→0.016
  };

  const cached = opponentModelCache.get(m.glb);
  if (cached) { apply(cached); return; }

  loader.load(m.glb, (gltf) => {
    opponentModelCache.set(m.glb, gltf.scene);
    apply(gltf.scene);
  }, undefined, () => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), new THREE.MeshStandardMaterial({ color: 0x8a3a3a }));
    ball.castShadow = true;
    opponentGroup.add(ball);
    const wrapper = new THREE.Group();
    wrapper.name = "model-wrapper";
    wrapper.add(ball);
    opponentGroup.add(wrapper);
    opponentAnim.inner = wrapper;
    opponentAnim.baseScale = wrapper.scale.clone();
  });
}

/** 预取后续回合的对手模型（后台下载，切回合时零等待） */
function prefetchOpponentModel(memberIndex) {
  const m = SQUAD[memberIndex];
  if (!m || opponentModelCache.has(m.glb)) return;
  loader.load(m.glb, (gltf) => {
    opponentModelCache.set(m.glb, gltf.scene);
  }, undefined, () => { /* 预取失败不影响流程 */ });
}

// ---------- 战斗系统 ----------
const combo = new ComboSystem();
const counter = new CounterSystem();
// 失衡系统（阶段 A·绝区零对标）：黄条 → 眩晕 → 易伤爆发，循环心脏
const stagger = new StaggerSystem();
const cinematic = new Cinematic(camera, TUNING);
// 相机装备（行业标准 camera-controls：碰撞 + 平滑，解决穿墙/镜头不稳）
const camRig = new CameraRig(camera, canvas);

// 相机碰撞体（店铺墙面，防止穿墙）
const colliderMeshes = [];
stage.group.traverse((c) => {
  if (c.isMesh && c.userData.__partType === "wall") colliderMeshes.push(c);
});
camRig.setColliders(colliderMeshes);
// 相机边界（街道范围，防止飞出）
camRig.setBoundary(new THREE.Box3(
  new THREE.Vector3(-10, 0, -6),
  new THREE.Vector3(10, 8, 6)
));

const battle = {
  // 原 timer: TUNING.roundTotalS 已删除——TUNING 里**没有** roundTotalS 这个键（悬空引用，
  //   赋值结果恒为 undefined），且 battle.timer 全仓无任何读取点；战斗本就是**不限时**模式
  //   （src/game/tuning.mjs:6「以击败对手为唯一胜利条件」），HUD 显示的是 ELAPSED 正计时。
  // 三连战（2026-11-11 新增）：一局 = 3 个不同招式族的对手接力，打完 3 个才结算
  round: 0,                 // 当前回合（0 基）
  totalRounds: 3,           // 总回合数
  opponentIds: [],          // 本局 3 个对手的花名册下标
  roundResults: [],         // 每回合结果 [{ name, won, hpLeft }]
  grids: 0,
  comboCount: 0,
  freezeT: 0,
  oppTimer: 0,
  oppAttackWindup: 0,   // 对手攻击前摇（弹反窗口）
  oppAttackCd: 3.0,
  hitCount: 0,          // GAME-6：连段命中数（段间递增、连段结束清零；与 comboCount 连携次数分立）
  finisherPending: null, // GAME-7：终结技定时命中 { t, dmg, range, width, member }
  phase: "idle",        // UI-1：初始非战斗（原 "playing" 使标题/选人界面防线全放行；startBattle 才置 playing）
};

// 打击特效（冲击波 + 火花 + 弧光斩击，圣经 v2 §7；奶滴/奶花已删）
const impactFx = new ImpactFX(scene);
// 命中反馈（白闪 + 拟声词）
const hitFeedback = new HitFeedback();

function spawnParticles(pos, tier) {
  impactFx.hit(new THREE.Vector3(pos.x, 0, pos.z), tier === "ultimate" ? "ultimate" : tier === "heavy" ? "heavy" : tier === "medium" ? "medium" : "light");
}

/**
 * 结算一次命中。
 * @param {number} dmg 伤害
 * @param {string} tier light|medium|heavy|ultimate
 * @param {number} dazeGain 失衡积累（阶段 A：行为基础值×克制乘区已由调用方乘好；0 = 不积累）
 * @param {string|null} relationLabel 招式克制提示词（克制！/抵抗），为空则不显示
 */
/**
 * 命中伤害结算（**唯一计算入口**）：基础伤害 × 角色伤害系数 × 招式冲击强度 × 招式克制倍率。
 * 命中路径与调试探针（window.__npr.damagePreview）共用本函数，保证「测的就是打的」。
 * @returns {{dmg:number, rel:"counter"|"neutral"|"resisted"}}
 */
function computeHitDamage(base, member, mv, defenderStyle) {
  const rel = styleRelation(mv.style, defenderStyle);
  return {
    // 失衡易伤（阶段 A）：眩晕期受伤 ×1.5——与「测的就是打的」口径一致，
    // damagePreview 走同一函数，未眩晕时 ×1 不影响既有 E2E 断言
    dmg: Math.round(base * member.damageMul * mv.impact.strength * STYLE_MULTIPLIER[rel]
      * (stagger.isStaggered ? STAGGER_TUNING.vulnMul : 1)),
    rel,
  };
}

function applyDamage(dmg, tier, dazeGain = 0, relationLabel = null) {
  opponent.hp = Math.max(0, opponent.hp - dmg);
  cinematic.onHit(tier);
  // 顿帧：读 TUNING.hitstopF（修：原代码写死固定值，忽略调参）
  const hitstopF = tier === "ultimate" ? TUNING.hitstopFFinisher
    : tier === "heavy" ? TUNING.hitstopFHeavy
    : tier === "medium" ? TUNING.hitstopFMedium
    : TUNING.hitstopF;
  battle.freezeT = Math.max(battle.freezeT, hitstopF / TUNING.logicFps);
  opponentAnim.play(ACTION.HIT, 0.22);
  spawnParticles(opponentGroup.position, tier);
  // 白闪 + 拟声词（绝区零式打击反馈）；有克制关系时用自定义词顶替拟声词
  hitFeedback.trigger(
    new THREE.Vector3(opponentGroup.position.x, 1.2, opponentGroup.position.z),
    tier === "finisher" ? "ultimate" : tier,
    camera,
    relationLabel
  );
  // 音效 + 统计
  if (tier === "ultimate") audio.playFinisher();
  else audio.playHit(tier);
  if (inBattle) {
    battleStats.hits++;
    battleStats.damageDealt += dmg;
    battleStats.maxCombo = Math.max(battleStats.maxCombo, battle.hitCount);   // GAME-6：最大连击取连段命中数（原读 comboCount 会被命中分支覆盖逻辑抹回 1）
  }
  // 失衡积累（阶段 A）：伤害事件携带失衡值；克制/弱点乘区已由调用方乘好，这里只乘成员失衡系数
  const wasStaggered = stagger.isStaggered;
  if (dazeGain > 0) stagger.gain(dazeGain * (squad.active?.gridMul ?? 1));
  if (!wasStaggered && stagger.isStaggered) {
    // 失衡瞬间（绝区零式）：打断对手当前行动（前摇/弹反窗取消）+ 慢镜 + 横幅
    battle.oppAttackWindup = 0;
    counter.expire();
    cinematic.onChain();
    cinematic.setFocus(opponentGroup.position);   // 焦点对准对手（同 RENDER-2 口径）
    screens.toast("失衡！");
    audio.playChain();
  }
}

/**
 * 攻击键按下。
 * 交互改为「轻点 = 连段，长按 = 蓄力终结」：
 *   - 任何时候按下都**开始计时蓄力**（松手时结算）
 *   - 不在连段中：按下**不立即出招**，等松手才打第一段（或发蓄力终结）
 *   - 在连段中：沿用原有逻辑立即推进下一段（终结段走带前摇的定时命中），
 *     同时蓄力继续计时——按住不放即可在连段后追加一记蓄力终结
 */
function onAttackInput() {
  if (battle.phase !== "playing") return;
  charging = true;
  chargeT = 0;
  chargeStartMs = performance.now();
  charged = false;
  attackFiredOnPress = false;
  if (!combo.isInCombo) return;   // 不在连段中 → 等松手结算

  const active = squad.active;
  const mv = getMove(active.id);   // 「换壳即换招」：取本只角色的招式参数
  attackFiredOnPress = true;

  // 终结技（GAME-7：原为任意距离瞬发，绕过普通段 inRange/inWidth 判定与 hitAt 进度门；
  // 改为带前摇的定时命中——前摇到点后按本角色判定框做距离/宽度判定再结算）
  if (combo.isInCombo && combo.stageIndex === combo.stageCount - 1) {
    active.anim.play(ACTION.FINISHER, mv.anim.windup + mv.anim.strike + mv.anim.recover);
    cinematic.onFinisher();
    cinematic.setFocus(opponentGroup.position);
    battle.freezeT = Math.max(battle.freezeT, 0.5 * mv.impact.strength);
    battle.finisherPending = {
      t: mv.anim.windup,   // 前摇（tick 内按 scaled dt 推进，慢镜期间与动画同步）
      dmg: Math.round(30 * active.damageMul * mv.impact.strength),
      range: mv.hitbox.range,
      width: mv.hitbox.width,
      member: active,
      relation: null,
      charged: false,   // 三段终结（非蓄力）：失衡积累取 heavy 档
    };
    combo.cancel();   // 终结技替换第三段判定（防过 hitAt 后 24+30 双重结算）
    return;
  }
  // 修：在 onAttack 之前设招式（原代码在之后赋值，导致第一段走默认节奏）
  combo.setMove(mv);
  const res = combo.onAttack();
  if (res.started) {
    // 用本角色的连段节奏（第一段时长）+ 招式风格（「换壳即换招」）
    const dur = mv.comboTiming[0];
    active.anim.play(ACTION.ATTACK_1, dur, mv);
    // 前冲距离 = 判定框偏移 × 招式风格系数
    const dir = new THREE.Vector3().subVectors(opponentGroup.position, active.group.position).normalize();
    active.move.lunge(dir, mv.anim.strike * 0.8);
  }
}

/** 攻击键松手：结算蓄力（蓄满 → 蓄力终结；未蓄满 → 普通连段起手） */
function onAttackRelease() {
  if (battle.phase !== "playing") return;
  if (!charging) return;
  charging = false;
  const wasCharged = charged;
  const firedOnPress = attackFiredOnPress;
  chargeT = 0;
  charged = false;
  attackFiredOnPress = false;
  hud.set({ charge: 0, charging: false });
  if (wasCharged) { ultimateAttack(); return; }
  if (firedOnPress) return;   // 已在按下时推进了连段，松手不再补刀
  // 普通出招（连段第一段）
  const active = squad.active;
  const mv = getMove(active.id);
  combo.setMove(mv);
  const res = combo.onAttack();
  if (res.started) {
    active.anim.play(ACTION.ATTACK_1, mv.comboTiming[0], mv);
    const dir = new THREE.Vector3().subVectors(opponentGroup.position, active.group.position).normalize();
    active.move.lunge(dir, mv.anim.strike * 0.8);
  }
}

/** 蓄力终结：伤害显著高于普通终结，但前摇更长（可被对手读招弹反） */
function ultimateAttack() {
  const active = squad.active;
  const mv = getMove(active.id);
  const rel = styleRelation(mv.style, getMove(opponentMember.id).style);
  battle.finisherPending = {
    t: mv.anim.windup * 1.6,
    dmg: Math.round(46 * active.damageMul * mv.impact.strength * STYLE_MULTIPLIER[rel]),
    range: mv.hitbox.range + 0.8,
    width: mv.hitbox.width + 0.6,
    member: active,
    relation: rel,
    charged: true,   // 蓄力终结：失衡积累取 charged 档
  };
  active.anim.play(ACTION.FINISHER, mv.anim.windup * 1.6 + mv.anim.strike + mv.anim.recover);
  cinematic.onFinisher();
  cinematic.setFocus(opponentGroup.position);
  battle.freezeT = Math.max(battle.freezeT, 0.6 * mv.impact.strength);
  combo.cancel();
  screens.toast("蓄力终结！");
}

let dodgeRequested = false;

// 蓄力必杀技（2026-11-11）：轻点空格 = 连段；按住空格 ≥ CHARGE_TIME 后松手 = 蓄力终结
const CHARGE_TIME = 0.55;
let charging = false;    // 空格按下后正在等待松手
let chargeT = 0;         // 已按住时长（秒，墙钟）
let chargeStartMs = 0;   // 按下时刻（performance.now）
let charged = false;     // 是否已蓄满
let attackFiredOnPress = false;   // 本次按下是否已经出招（连段分支）

function onDodgeInput() {
  if (battle.phase !== "playing") return;
  // 弹反优先
  if (counter.isWarning) {
    const r = counter.tryCounter();
    if (r) {
      // 修：弹反成功不做位移（原代码先置 dodgeRequested 再弹反，导致成功后仍后撤）
      // 阶段 A：弹反惩罚击也吃招式克制乘区（失衡积累与伤害同一口径）
      const relC = styleRelation(getMove(squad.active.id).style, getMove(opponentMember.id).style);
      applyDamage(r.damage, "heavy", STAGGER_TUNING.gains.counter * (relC === "counter" ? 1.25 : 1));
      cinematic.onHit("heavy");
      cinematic.setFocus(opponentGroup.position);
      audio.playCounter();
      if (inBattle) battleStats.counters++;
      return;
    }
  }
  // 普通闪避
  dodgeRequested = true;
  combo.cancel();
  squad.active.anim.play(ACTION.DODGE, 0.28);
}

function onSwapInput(index) {
  if (battle.phase !== "playing") return;
  const viaChain = squad.canChain;
  const res = squad.swapTo(index, viaChain);
  if (!res) return;
  syncActiveVisibility();
  // 换人攻击
  res.to.anim.play(ACTION.ATTACK_1, 0.26);
  const dir = new THREE.Vector3().subVectors(opponentGroup.position, res.to.group.position).normalize();
  res.to.move.lunge(dir, 0.2);
  if (viaChain) {
    cinematic.onChain();
    cinematic.setFocus(opponentGroup.position);
    // GAME-7：连携换人奖励攻击补距离/宽度判定（GAME-1 修复后此路径激活；复用新出场角色判定框）
    const mvTo = getMove(res.to.id);
    const inRangeSwap = opponentGroup.position.distanceTo(res.to.group.position) <= mvTo.hitbox.range;
    const inWidthSwap = Math.abs(res.to.group.position.z - opponentGroup.position.z) <= mvTo.hitbox.width / 2;
    if (inRangeSwap && inWidthSwap) {
      applyDamage(Math.round(12 * res.to.damageMul), "medium", STAGGER_TUNING.gains.swap);
    }
  }
}

// ---------- 输入（InputManager 集中管理）----------
const input = new InputManager({
  onAction: (action, payload) => {
    switch (action) {
      case "attack": onAttackInput(); break;
      case "dodge": onDodgeInput(); break;
      case "swap": onSwapInput(payload); break;
      case "swap-next": onSwapInput(squad.nextAlive()); break;
      case "swap-prev": onSwapInput(squad.prevAlive()); break;
      case "mode": mode = mode === "PBR" ? "NPR" : "PBR"; restyleAll(); break;
      // 数字键直选角色统一由下方旁路监听处理（见 input.mjs 注释），此处不再有 "steps" 分支
    }
  },
  // 松手回调（蓄力必杀技在松手时结算）
  onRelease: (key) => {
    if (key === " ") onAttackRelease();
  },
});
input.attach();
input.setEnabled(false);   // UI-1：初始在标题/选人等非战斗界面，禁用战斗输入（startBattle 恢复）

// 扩展：1-9 直选 + 0（第 10 只）
window.addEventListener("keydown", (e) => {
  if (!inBattle) return;   // UI-1：非战斗界面不响应（此旁路监听绕过 input.enabled，须单独门控）
  if (e.repeat) return;
  const k = e.key;
  if (k === "[") { steps = Math.max(2, steps - 1); restyleAll(); }   // 圣经 v2 §2：档数键限 2–3
  else if (k === "]") { steps = Math.min(3, steps + 1); restyleAll(); }
  else if (k.length === 1 && k >= "0" && k <= "9") {
    onSwapInput(k === "0" ? 9 : Number(k) - 1);
  }
});

function updateMoveInput() {
  return input.updateMove();
}

function restyleAll() {
  for (const m of squad.members) {
    const w = m.group.getObjectByName("model-wrapper");
    if (!w) continue;
    const outlines = [];
    w.traverse((c) => { if (c.userData.__isOutline) outlines.push(c); });
    outlines.forEach((o) => o.parent?.remove(o));
    if (w.userData.__origMats) w.userData.__origMats.forEach((mat, mesh) => {
      // 修：dispose 旧 NPR 材质，避免 GPU 程序膨胀
      if (mesh.material && mesh.material !== mat) mesh.material.dispose?.();
      mesh.material = mat;
    });
    w.traverse((c) => { if (c.isMesh) { c.userData.__npr = false; c.userData.__isOutline = false; } });
    if (mode === "NPR") applyNpr(w, { ...NPR_PRESET, steps, ...FACTION_RIM.ally }, { width: 0.016, tintColor: m.tintColor });   // 圣经 v2 §2 描边 0.022→0.016（含 restyle 换壳路径重染）
  }
  const ow = opponentGroup.getObjectByName("model-wrapper");
  if (ow) {
    const outlines = [];
    ow.traverse((c) => { if (c.userData.__isOutline) outlines.push(c); });
    outlines.forEach((o) => o.parent?.remove(o));
    if (ow.userData.__origMats) ow.userData.__origMats.forEach((mat, mesh) => {
      if (mesh.material && mesh.material !== mat) mesh.material.dispose?.();
      mesh.material = mat;
    });
    ow.traverse((c) => { if (c.isMesh) { c.userData.__npr = false; c.userData.__isOutline = false; } });
    if (mode === "NPR") applyNpr(ow, { ...NPR_PRESET, steps, ...FACTION_RIM.foe }, { width: 0.016, color: FACTION_RIM.foe.outlineColor });   // 圣经 v2 §2 描边 0.022→0.016
  }
  // 模式/档数不再写入 HUD：#hud-mode / #hud-steps 元素已随美术圣经重做移除，
  //   数值仍可经 window.__npr.getMode()/getSteps() 读取（见 §4.1 色调分离档数）
}

// ---------- 相机拖动 ----------
// camAngleRaw 一直累加（拖回原 x 即归零），camAngle 是限幅后的输出角：
// 拖到尽头后视觉停住，但回拖立即响应，不会从 +MAX 瞬跳到 -MAX
let dragging = false, lastX = 0, camAngleRaw = 0, camAngle = 0;
const CAM_ANGLE_MAX = 1.2; // 偏航限幅 ±1.2 rad（≈69°），避免一直拖导致相机绕飞
// UI-5：mouse → pointer events（同一监听覆盖鼠标/触摸/触控笔，移动端可拖动旋转；
// isPrimary 屏蔽多指第二触点干扰 lastX；pointercancel 复位被系统手势打断的触摸拖拽态）
if (canvas.style) canvas.style.touchAction = "none";   // 防触摸拖拽被浏览器滚动手势劫持
window.addEventListener("pointerdown", (e) => {
  if (!e.isPrimary) return;
  dragging = true; lastX = e.clientX;
});
window.addEventListener("pointerup", () => { dragging = false; });
window.addEventListener("pointercancel", () => { dragging = false; });
window.addEventListener("pointermove", (e) => {
  if (!dragging || !e.isPrimary) return;
  camAngleRaw += (e.clientX - lastX) * 0.006;
  camAngle = Math.max(-CAM_ANGLE_MAX, Math.min(CAM_ANGLE_MAX, camAngleRaw));
  lastX = e.clientX;
});

// ---------- 主循环 ----------
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  battle.freezeT = Math.max(0, battle.freezeT - rawDt);
  const frozen = battle.freezeT > 0;
  // 顿帧期间锁 timeScale=1（修：原慢镜会折扣顿帧的感知时长）
  const timeScale = frozen ? 1.0 : cinematic.timeScale;
  const dt = rawDt * timeScale;

  const active = squad.active;
  // UI-1/GAME-3：战斗逻辑统一门控——标题/选人/结算界面与 settle 阶段全部停车
  //（原 !frozen 块无 inBattle/phase 守卫：非战斗界面按键驱动不可见角色移动/闪避，
  //  settle 后对手 AI 追击/开弹反窗/windup 到期伤害/连段推进/箱子 hitTest 仍照常运行）
  const battleRunning = inBattle && battle.phase === "playing";

  if (battleRunning && !frozen) {
    // 活跃角色移动
    active.move.step({ move: updateMoveInput(), jump: false, dodge: dodgeRequested }, dt);
    dodgeRequested = false;
    // 速度特性
    active.move.walkSpeed = TUNING.playerSpeed * active.speedMul;

    // 对手 AI（阶段 A：失衡期间定身——不追击、不攻击；dist 仍需计算供命中判定）
    const toPlayer = new THREE.Vector3().subVectors(active.group.position, opponentGroup.position);
    const dist = toPlayer.length();
    if (stagger.isStaggered) {
      battle.oppAttackWindup = 0;
    } else if (dist > 2.4) {
      // 对手只沿 X 方向追击（保持街道轴线，不乱跑 Z）
      const dirX = Math.sign(toPlayer.x) || 0;
      opponentMove.step({ move: new THREE.Vector2(dirX, 0), jump: false, dodge: false }, dt);
      // Z 位置缓慢归位到 0
      opponentMove.pos.z += (0 - opponentMove.pos.z) * Math.min(1, dt * 2);
      opponentMove.pos.y = 0;
    } else {
      opponentMove.step({ move: new THREE.Vector2(0, 0), jump: false, dodge: false }, dt);
      // 对手攻击前摇 → 弹反窗口
      battle.oppAttackCd -= dt;
      if (battle.oppAttackCd <= 0 && !counter.isWarning && !counter.isPunishing) {
        battle.oppAttackCd = 4.0 + Math.random() * 2;
        counter.openWindow();
        battle.oppAttackWindup = 0.25;
        // 对手攻击预警：模型红闪 + 音效
        _flashOpponentRed();
        audio.playCounter?.();
      }
    }

    // 弹反窗口：先判定受击，再推进 counter（修：原顺序会让 expire 吞掉攻击）
    if (counter.isWarning && battle.oppAttackWindup > 0) {
      battle.oppAttackWindup -= dt;
      if (battle.oppAttackWindup <= 0 && !active.move.hasIframe) {
        // 未弹反 → 受击。伤害随对手招式强度浮动，并受招式克制影响
        //   （对手的风格克当前角色的风格 → 伤害更高；被克 → 更低）
        const oppMv = getMove(opponentMember.id);
        const rel = styleRelation(oppMv.style, getMove(active.id).style);
        const dmgToPlayer = Math.round(10 * (0.7 + 0.3 * oppMv.impact.strength) * STYLE_MULTIPLIER[rel]);
        squad.damageActive(dmgToPlayer);
        active.anim.play(ACTION.HIT, 0.22);
        cinematic.onHit("medium");
        counter.expire();   // 显式结束窗口
      }
    }
    counter.step(dt);
    // 阶段 A：失衡计时（与 counter 同一帧域：仅战斗运行、按 scaled dt 推进）
    stagger.step(dt);

    // 连段推进
    const hit = combo.step(dt);
    if (hit) {
      // 「换壳即换招」：用本角色的判定框（范围/宽度/偏移）
      const mv = combo.currentMove ?? getMove(active.id);
      const hitRange = mv.hitbox.range;
      const hitWidth = mv.hitbox.width;
      // 判定：距离在范围内 + 宽度方向近似（简化：用距离 + 宽度衰减）
      const distToOpp = dist;
      const inRange = distToOpp <= hitRange;
      const inWidth = Math.abs(active.group.position.z - opponentGroup.position.z) <= hitWidth / 2;

      if (inRange && inWidth) {
        // 招式克制（2026-11-11）：本角色的动作风格 vs 当前对手的动作风格
        const oppMove = getMove(opponentMember.id);
        const { dmg, rel } = computeHitDamage(hit.damage, active, mv, oppMove.style);
        battle.hitCount++;   // GAME-6：连段命中数段间递增（先自增再结算，供 applyDamage 内 maxCombo 采样）
        // 阶段 A：失衡积累按段位取表（轻6/中9/重16），克制命中积累 ×1.25（与伤害倍率同系数）
        const dazeBase = hit.stage === 0 ? STAGGER_TUNING.gains.light
          : hit.stage === 1 ? STAGGER_TUNING.gains.medium
          : STAGGER_TUNING.gains.heavy;
        applyDamage(dmg, hit.finisher ? "ultimate" : hit.shake, dazeBase * (rel === "counter" ? 1.25 : 1), STYLE_LABEL[rel] || null);
        // GAME-6：原此处 battle.comboCount = combo.comboCount 无条件覆盖已删（同帧抹回连携计数）
        // RENDER-3：原此处重复 impactFx.hit 已删（applyDamage→spawnParticles 已按同位置同档生成一次）
      }

      // 场景交互：攻击打到箱子（修：用攻击者位置，而非对手位置）
      const crates = props.hitTest(active.group.position, hitRange + 0.5);
      for (const c of crates) {
        props.destroy(c);
        spawnParticles(c.position, "light");
      }
    }

    // GAME-6：连段自然结束/被取消（含闪避取消）→ 清零连段命中数
    if (!combo.isInCombo) battle.hitCount = 0;

    // GAME-7：终结技定时命中结算（顿帧期间不推进；慢镜按 scaled dt，与终结技动画同步）
    if (battle.finisherPending) {
      const fp = battle.finisherPending;
      fp.t -= dt;
      if (fp.t <= 0) {
        battle.finisherPending = null;
        const fInRange = opponentGroup.position.distanceTo(fp.member.group.position) <= fp.range;
        const fInWidth = Math.abs(fp.member.group.position.z - opponentGroup.position.z) <= fp.width / 2;
        if (fInRange && fInWidth) {
          // 阶段 A：蓄力终结/三段终结分档积累失衡（charged 标记见 onAttackInput/ultimateAttack）
          applyDamage(fp.dmg, "ultimate", fp.charged ? STAGGER_TUNING.gains.charged : STAGGER_TUNING.gains.heavy, fp.relation ? (STYLE_LABEL[fp.relation] || null) : null);
        }
      }
    }

    // 面向对手
    // 3/4 侧身朝向（面向对手但偏向相机，避免背对）
    active.move.faceToward(opponentGroup.position, camera.position);
    opponentMove.faceToward(active.group.position, camera.position);
  }

  // 战斗结束判定（不限时，对手 HP 或玩家 HP 归零）
  if (inBattle && battle.phase === "playing" && !frozen) {
    if (opponent.hp <= 0) {
      // 三连战：还有回合就换对手继续打，打完 3 个才结算
      if (battle.round < battle.totalRounds - 1) advanceRound();
      else endBattle();
    }
    // 修：玩家 HP 归零也要结束（原只判对手，会导致卡死）
    else if (active.hp <= 0) {
      // 尝试换人（如果还有存活角色）
      const nextIdx = squad.nextAlive();
      if (nextIdx >= 0) {
        onSwapInput(nextIdx);
      } else {
        endBattle();
      }
    }
  }

  // 动画（RENDER-1：动画时钟与逻辑 timeScale/顿帧对齐——慢镜按 scaled dt、顿帧定格 0；
  // 修复 hitAt=0.45 判定要实时 1.5×dur 才触发而挥击动画 1×dur 已播完的滑步/打击先至，
  // 以及 hitstop 期间动画照播导致「全场定格」语义失效）
  const animDt = frozen ? 0 : dt;
  active.anim.step(animDt);
  opponentAnim.step(animDt);
  // 阶段 A：失衡姿态接管——受击动画播完后保持瘫软摇摆（仅战斗中；受击 HIT 动画优先播完）
  if (inBattle && stagger.isStaggered && opponentAnim.action !== ACTION.STAGGER && !opponentAnim.isAttacking) {
    opponentAnim.play(ACTION.STAGGER, Math.max(0.5, stagger.timer));
  }

  // 假阴影跟随
  updateShadowBlob(playerShadow, active.group.position, active.scale ?? 1);
  updateShadowBlob(opponentShadow, opponentGroup.position, 1.2);

  // 队伍/交互推进
  squad.step(dt);
  props.step(dt);

  // 相机：camRig 管位置+碰撞（行业标准），cinematic 管运镜偏移
  cinematic.userAngle = camAngle;
  // 先算运镜偏移（连携/终结的推近/环绕）
  const camOffset = cinematic.getOffset(rawDt);
  // camRig 跟随玩家（带偏移）
  camRig.setTarget(active.group.position, {
    distance: TUNING.camera.distance + camOffset.zoom,
    height: TUNING.camera.height,
    // 修：sideOffset 应叠加「基础侧偏」+「运镜环绕偏移」
    sideOffset: (TUNING.camera.sideOffset ?? 0) + camOffset.side,
    lookAtHeight: TUNING.camera.lookAtHeight,
  });
  camRig.update(rawDt);
  // 震屏/抖动（叠加在 camRig 之上）
  cinematic.applyShake(camera);

  // 打击特效（冲击波/火花/弧光）
  impactFx.update(rawDt);
  // 命中反馈（白闪衰减）
  hitFeedback.update(rawDt);

  // 蓄力（长按空格）：蓄满后松手发射「蓄力终结」
  //   蓄力时长用**墙钟时间**（performance.now）而非逐帧累加的 rawDt——
  //   rawDt 被钳在 0.05s，低帧率机器上「按住 0.55 秒」会被拉长成好几秒。
  if (charging) {
    if (!input.keysDown.has(" ")) {
      // 松手事件漏掉（失焦 / setEnabled 清键）时兜底结算，避免蓄力卡死
      onAttackRelease();
    } else {
      chargeT = (performance.now() - chargeStartMs) / 1000;
      if (!charged && chargeT >= CHARGE_TIME) {
        charged = true;
        audio.playConfirm?.();   // 蓄满提示音
      }
      hud.set({ charge: Math.min(1, chargeT / CHARGE_TIME), charging: true });
    }
  }

  // HUD（仅战斗时更新；不限时，只显示已用时间）
  if (inBattle) {
    battleStats.elapsed = (battleStats.elapsed ?? 0) + rawDt;
    hud.set({
      elapsed: battleStats.elapsed,
      hp: active.hp,
      maxHp: active.maxHp,
      oppHp: (opponent.hp / opponent.maxHp) * 100,
      oppHpRaw: opponent.hp,   // UI-2：对手数字显绝对血量值（hud.mjs 优先读它；血条仍用 oppHp 百分比口径）
      grids: battle.grids,
      daze: stagger.pct * 100,        // 阶段 A：失衡黄条（0~100）
      staggered: stagger.isStaggered, // 满条闪烁态
      combo: battle.comboCount,
      canAttack: !frozen,
      canDodge: !frozen,
      // 接力键是否真的可换：需有下一只存活角色，且（非连携换人有 2s 冷却，除非连携窗口已开）
      //   修：canSwap 此前全仓库无写入方 → 恒为 true → 接力键常亮（假引导）
      canSwap: squad.nextAlive() !== null && (squad.swapCooldown <= 0 || squad.canChain),
      chainReady: squad.canChain,
      counterWarning: counter.isWarning,
      shellName: active.name,
      shellIndex: squad.activeIndex,
      shellTotal: squad.members.length,
      round: battle.round + 1,
      totalRounds: battle.totalRounds,
    });
  }

  // 主场景渲染频率（2026-11-11 性能治理）
  //   原实现是**无条件** postfx.render(rawDt) —— 标题页被视频背景完全盖住、选人页由
  //   live3d 实时 3D 覆盖，却仍在全速渲染整条 3D 街道场景（344 draw call / 126,602 三角面）。
  //   现按界面降频；切屏时立即补一帧，避免首帧空白。
  const screenNow = screens?.current ?? "title";
  let renderEvery = 1;
  if (!inBattle) {
    if (screenNow === "title") renderEvery = 6;                 // 视频背景全遮挡
    else if (screenNow === "select" || screenNow === "settings") renderEvery = 3;  // live3d / 面板覆盖
    else renderEvery = 2;                                      // 结算页：玻璃面板后仍透出场景
  }
  if (screenNow !== lastRenderScreen) {
    lastRenderScreen = screenNow;
    renderPhase = 0;   // 切屏：下一帧就渲染
  }
  renderPhase++;
  if (renderPhase % renderEvery === 0) postfx.render(rawDt);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

// ---------- 流程控制 ----------
let inBattle = false;
let battleStats = { maxCombo: 0, hits: 0, counters: 0, damageDealt: 0, elapsed: 0 };
// 渲染降频控制（见 tick 末尾）
let lastRenderScreen = "";
let renderPhase = 0;

function startBattle(memberIndex) {
  inBattle = true;
  input.setEnabled(true);   // UI-1：进战斗恢复输入
  // 兜底：正常路径已在「进入选人页」时触发加载；这里再调一次（幂等）防止直接开战时模型未到
  ensureSquadModels();
  // GAME-2：重置全队 hp/alive（Squad 为模块级单例跨局持久，不重置则选中阵亡角色 0 血开局、全灭判负无法解除）
  for (const m of squad.members) { m.hp = m.maxHp; m.alive = true; }
  // GAME-2：传入索引做范围校验（重置后全员存活；非法/越界回退 0，校验口径参照 squad.swapTo）
  if (!Number.isInteger(memberIndex) || memberIndex < 0 || memberIndex >= squad.members.length) memberIndex = 0;
  // UI-1：重置换人冷却/连携窗口与全员出场位（跨局残留清理；出场位与成员初始化站位同源 2.4,0,0）
  squad.swapCooldown = 0;
  squad.chainWindow = 0;
  squad.chainCount = 0;
  for (const m of squad.members) {
    if (m.move) m.move.pos.set(2.4, 0, 0);
    if (m.group) m.group.position.set(2.4, 0, 0);
  }
  // 切换角色
  squad.activeIndex = memberIndex;
  syncActiveVisibility();
  // 强制恢复对手可见（避免被界面切换时的隐藏逻辑覆盖）
  const og = scene.getObjectByName("opponent");
  if (og) og.visible = true;
  // 重置战斗状态
  battle.grids = 0;
  battle.comboCount = 0;
  battle.hitCount = 0;   // GAME-6：清连段命中数
  battle.finisherPending = null;   // GAME-7：清残留终结技定时命中
  battle.phase = "playing";
  battle.freezeT = 0;
  battle.oppTimer = 0;
  combo.cancel();
  counter.state = "idle";
  stagger.reset();   // 阶段 A：开战清失衡
  opponent.hp = opponent.maxHp;
  battleStats = { maxCombo: 0, hits: 0, counters: 0, damageDealt: 0, elapsed: 0 };
  // 界面切换
  screens.show("battle");
  audio.playBgm("battle");
  audio.playConfirm();
  // 三连战：挑 3 个不同招式族的对手（排除玩家自己那一只），第 1 个上场，后两个后台预取
  battle.round = 0;
  battle.roundResults = [];
  battle.opponentIds = pickOpponentRounds(memberIndex);
  loadOpponentModel(battle.opponentIds[0]);
  prefetchOpponentModel(battle.opponentIds[1]);
  prefetchOpponentModel(battle.opponentIds[2]);
  opponent.hp = opponent.maxHp;
  hud.set({
    shellName: SQUAD[memberIndex].name,
    shellIndex: memberIndex,
    shellTotal: SQUAD.length,
    round: 1,
    totalRounds: battle.totalRounds,
    charge: 0,
  });
  screens.toast(`${SQUAD[memberIndex].name} 出战！`);
}

/**
 * 三连战的对手抽签：从 16 只里排除玩家所选那只，随机取 3 个互不相同的下标。
 * （互不相同即可，不要求招式族互异——招式族差异由「换壳即换招」的招式表本身保证）
 */
function pickOpponentRounds(playerIndex) {
  const pool = SQUAD.map((_, i) => i).filter((i) => i !== playerIndex);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, battle.totalRounds);
}

/**
 * 推进到下一回合（三连战）。
 * 玩家本回合胜利（对手血量归零）时调用；不是最后一回合就换对手继续打。
 */
function advanceRound() {
  battle.roundResults.push({ name: opponentMember.name, won: true, move: getMove(opponentMember.id).moveName });
  battle.round++;
  const nextId = battle.opponentIds[battle.round];
  // 换对手：模型（走缓存，基本瞬时）+ 血量 + 站位 + 弹反/连段状态清零
  loadOpponentModel(nextId);
  opponent.hp = opponent.maxHp;
  opponentMove.pos.set(-2.4, 0, 0);
  opponentGroup.position.copy(opponentMove.pos);
  battle.grids = 0;
  battle.comboCount = 0;
  battle.hitCount = 0;
  battle.finisherPending = null;
  battle.oppAttackCd = 3.0;
  combo.cancel();
  counter.state = "idle";
  stagger.reset();   // 阶段 A：换回合清失衡（阈值抗性成长随之归零）
  chargeT = 0;
  charged = false;
  charging = false;
  hud.set({ charge: 0, charging: false, round: battle.round + 1, totalRounds: battle.totalRounds });
  const om = getMove(opponentMember.id);
  screens.toast(`第 ${battle.round + 1} 回合 · ${opponentMember.name}（${om.moveName}）`);
}

function endBattle() {
  if (!inBattle) return;
  inBattle = false;
  battle.phase = "settle";
  input.setEnabled(false);   // UI-1：结算界面禁用战斗输入
  charging = false;
  chargeT = 0;
  charged = false;
  hud.set({ charge: 0, charging: false });
  // 胜利 = 击败对手（不限时）
  const win = opponent.hp <= 0;
  // 三连战：把最后一回合也记进结果（若走的是正常推进路径则已记录过，这里只补最后一回合）
  if (win && battle.roundResults.length === battle.round) {
    battle.roundResults.push({ name: opponentMember.name, won: true, move: getMove(opponentMember.id).moveName });
  } else if (!win && battle.roundResults.length === battle.round) {
    battle.roundResults.push({ name: opponentMember.name, won: false, move: getMove(opponentMember.id).moveName });
  }
  const wonRounds = battle.roundResults.filter((r) => r.won).length;
  const score = battleStats.damageDealt + battleStats.maxCombo * 20 + battleStats.counters * 30 + wonRounds * 60;
  const grade = !win ? "D" : score > 400 ? "S" : score > 250 ? "A" : score > 120 ? "B" : "C";
  const rewards = win
    ? ["经验 ×120", "奶币 ×80", "材料 ×3"]
    : ["经验 ×40", "奶币 ×20"];
  screens.showResult({
    win,
    grade,
    stats: {
      "造成伤害": battleStats.damageDealt,
      "最大连击": battleStats.maxCombo,
      "成功弹反": battleStats.counters,
      "剩余血量": Math.round(squad.active.hp),
    },
    rewards,
    rounds: battle.roundResults.map((r) => ({ name: r.name, move: r.move, won: r.won })),
    roundsSummary: `三连战 ${wonRounds}/${battle.totalRounds}`,
  });
  audio.playBgm("title");
}

/** 对手攻击预警：模型红闪（0.15s） */
function _flashOpponentRed() {
  const mats = [];
  opponentGroup.traverse?.((c) => {
    if (c.isMesh && !c.userData.__isOutline && c.material?.emissive) mats.push(c.material);
  });
  for (const m of mats) {
    // 美术圣经 §6：对手红闪洋红同源 0xff3d8b，禁第三方色
    m.emissive.setHex(0xff3d8b);
    m.emissiveIntensity = 0.9;
  }
  setTimeout(() => {
    for (const m of mats) {
      m.emissive.setHex(0x000000);
      m.emissiveIntensity = 0;
    }
  }, 150);
}

// 启动
syncActiveVisibility();
initTitleFX(); // 主界面立绘 + 粒子（异步）
kickModelPrefetch(); // 首页视频就绪后后台预取 16 只队员 GLB（不阻塞首屏）
hud.set({ shellName: SQUAD[0].name, shellIndex: 0, shellTotal: SQUAD.length });

window.__npr = {
  setMode: (m) => { mode = m; restyleAll(); },
  setSteps: (s) => { steps = s; restyleAll(); },
  getMode: () => mode,
  getSteps: () => steps,
  battle, combo, counter, squad, opponent, opponentAnim, scene, camera, renderer, stage, postfx,
  stagger,
  // 阶段 A 调试口：失衡状态读取与测试注入（E2E 用）
  staggerState: () => ({
    value: +stagger.value.toFixed(1), threshold: stagger.threshold,
    state: stagger.state, timer: +stagger.timer.toFixed(2), staggered: stagger.isStaggered,
  }),
  addDaze: (n) => { stagger.gain(n); },
  startBattle, endBattle, audio,
  // 界面管理器异步装配：实例身份可变，读取时必须拿当前绑定（见上方惰性装配 IIFE）
  get screens() { return screens; },
  // 立绘生成器惰性加载：保持「调用即得 Promise」的对外语义（scripts/render-portraits.mjs 依赖 await）
  makePortrait: (...args) => import("./ui/portrait.mjs").then((m) => m.makePortrait(...args)),
  // 16 只队员模型的延迟加载入口（幂等）：E2E 用例可直接触发，不必先进选人页
  loadModels: () => { ensureSquadModels(); },
  // 蓄力状态（调试/测试用）
  chargeState: () => ({
    charging, chargeT: +chargeT.toFixed(3), charged,
    keys: [...input.keysDown],
    comboInCombo: combo.isInCombo,
    phase: battle.phase,
    round: battle.round,
    inBattle,
  }),
  // 双方位置（供测试核对攻击距离）
  positions: () => ({
    player: { x: +squad.active.group.position.x.toFixed(3), z: +squad.active.group.position.z.toFixed(3) },
    opponent: { x: +opponentGroup.position.x.toFixed(3), z: +opponentGroup.position.z.toFixed(3) },
    dist: +opponentGroup.position.distanceTo(squad.active.group.position).toFixed(3),
  }),
  // 调试用：把玩家直接放到指定位置（测试构造「贴身」场景用；宿主 rAF 被节流时无法靠按键走位）
  teleportPlayer: (x, z = 0) => {
    const p = squad.active.group.position;
    p.set(x, p.y, z);
    squad.active.move.pos.set(x, 0, z);
    squad.active.move.vel?.set?.(0, 0, 0);
  },
  // 招式克制：当前攻防双方的风格与关系（供测试与调试核对）
  styleInfo: () => {
    const a = squad.active;
    const mv = getMove(a.id);
    const om = getMove(opponentMember.id);
    const rel = styleRelation(mv.style, om.style);
    return {
      playerStyle: mv.style, oppStyle: om.style, rel,
      mult: STYLE_MULTIPLIER[rel],
      damageMul: a.damageMul, impactStrength: mv.impact.strength,
      moveName: mv.moveName, oppMoveName: om.moveName,
    };
  },
  // 伤害预览：与命中路径**同一个**计算函数（computeHitDamage），可验证克制倍率确实生效
  damagePreview: (base, defenderStyle) => {
    const a = squad.active;
    const mv = getMove(a.id);
    const ds = defenderStyle ?? getMove(opponentMember.id).style;
    return computeHitDamage(base, a, mv, ds);
  },
  // 克制表本身（6 风格两两相克）
  styleTable: () => ({ counter: { ...STYLE_COUNTER }, mult: { ...STYLE_MULTIPLIER } }),
  // 任意两风格的关系查询（供测试核对克制表的反对称性）
  styleRel: (a, b) => styleRelation(a, b),
  modelsRequested: () => squadModelsRequested,
  getBattleStats: () => battleStats,   // 供测试/结算读取
};

tick();
