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
import { AssistSystem, ASSIST_TUNING } from "./game/assist.mjs";
import { AnomalySystem, ANOMALY_TUNING, ATTR } from "./game/anomaly.mjs";
import { ChainQteOverlay, CHAIN_QTE_WINDOW_S } from "./ui/chainqte.mjs";
import { WomarkOverlay, WOMARK_POOL } from "./ui/womark.mjs";
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
// 支援系统（阶段 B）：3 格支援点（弹反花 1 / 连携·终结技回）+ 闪避反击资格窗
const assist = new AssistSystem();
// 属性异常系统（阶段 E）：积蓄 → 异常状态 → 紊乱引爆（副作用经 hooks 回注 main）
const anomaly = new AnomalySystem({
  damage: (dmg, label) => {
    opponent.hp = Math.max(0, opponent.hp - dmg);
    if (inBattle) battleStats.damageDealt += dmg;
    hitFeedback.trigger(
      new THREE.Vector3(opponentGroup.position.x, 1.2, opponentGroup.position.z),
      "medium", camera, label ?? null
    );
  },
  daze: (n) => stagger.gain(n),
  onStatus: (attr, name) => {
    if (inBattle) battleStats.anomalies++;   // 阶段 F：异常触发计入结算
    screens.toast(`${ATTR[attr].name}异常 · ${name}！`);
    audio.playHit("medium");
  },
  onDisorder: (dmg) => {
    opponent.hp = Math.max(0, opponent.hp - dmg);
    if (inBattle) battleStats.damageDealt += dmg;
    screens.toast("紊乱！");
    hitFeedback.trigger(
      new THREE.Vector3(opponentGroup.position.x, 1.4, opponentGroup.position.z),
      "ultimate", camera, "紊乱！"
    );
    gainDecibel(200);
    cinematic.slowmoT = Math.max(cinematic.slowmoT, 0.6);
  },
  word: (text) => {
    hitFeedback.trigger(
      new THREE.Vector3(opponentGroup.position.x, 1.4, opponentGroup.position.z),
      "heavy", camera, text
    );
  },
});
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
  chainCounts: 0,         // 阶段 C：本段失衡期剩余连携环数（回合1/2/3 → 1/2/3 环，精英/首领档）
  chainQte: { active: false, counts: 0, t: 0, used: [], options: [] }, // 连携 QTE 状态
  decibel: 0,             // 阶段 D：喧响值 0-3000（只增不减；[极]=3000 解锁终结技）
  invulnT: 0,             // 阶段 D：喧响终结技释放期间无敌（realDt 计时，覆盖前摇+演出）
  weaknessAttr: null,     // 阶段 E：本回合对手弱点属性（physical|fire|ice|electric|ether）
   enraged: false,         // 阶段 F：首领狂暴（回合3 且血量 <50%）
  attackCount: 0,         // 阶段 F：狂暴期攻击计数（每 3 击一次红光不可弹反）
  womarkOpen: false,      // 阶段 G：鸣徽三选一开启中（战斗暂停旗标，不新增 phase）
  buffs: {},              // 阶段 G：持有鸣徽 { id: 层数 }
  phase: "idle",        // UI-1：初始非战斗（原 "playing" 使标题/选人界面防线全放行；startBattle 才置 playing）
};

// 打击特效（冲击波 + 火花 + 弧光斩击，圣经 v2 §7；奶滴/奶花已删）
const impactFx = new ImpactFX(scene);
// 命中反馈（白闪 + 拟声词）
const hitFeedback = new HitFeedback();
// 连携 QTE 覆盖层（阶段 C）：chip 点击 → pickChain（函数声明提升，运行期才被调用）
const chainOverlay = new ChainQteOverlay((chipIndex) => pickChain(chipIndex));
// 鸣徽三选一覆盖层（阶段 G）
const womarkOverlay = new WomarkOverlay((id) => pickWomark(id));

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
    // 失衡易伤（阶段 A）+ 侵蚀易伤（阶段 E）+ 弱点属性 ×1.3（阶段 E）
    // ——与「测的就是打的」口径一致，damagePreview 走同一函数，未眩晕/无状态时乘区为 1
    dmg: Math.round(base * member.damageMul * mv.impact.strength * STYLE_MULTIPLIER[rel]
      * (stagger.isStaggered ? STAGGER_TUNING.vulnMul : 1)
      * anomaly.etherVulnMul
      * (member.attr && member.attr === battle.weaknessAttr ? ANOMALY_TUNING.weakDmgMul : 1)
      * (1 + 0.15 * (battle.buffs.attack ?? 0))),   // 阶段 G：强攻鸣徽 +15%/层
    rel,
  };
}

/** 阶段 D：喧响值积累（只增不减，上限 3000 = [极]；阶段 G 喧响鸣徽 +20%/层） */
function gainDecibel(n) {
  battle.decibel = Math.min(3000, battle.decibel + n * (1 + 0.2 * (battle.buffs.decibel ?? 0)));
}

/** 阶段 E：异常条 HUD 摘要（显示积蓄最高的属性 + 状态 + 弱点） */
function anomalyHud() {
  let maxK = null, maxPct = 0;
  for (const k of Object.keys(anomaly.buildup)) {
    const pct = anomaly.buildup[k] / anomaly.thresholds[k];
    if (pct > maxPct) { maxPct = pct; maxK = k; }
  }
  return {
    pct: Math.min(100, maxPct * 100),
    css: maxK ? ATTR[maxK].css : "",
    status: anomaly.status ? ATTR[anomaly.status.attr].status : "",
    weak: battle.weaknessAttr ? `弱点·${ATTR[battle.weaknessAttr].name}` : "",
  };
}

function applyDamage(dmg, tier, dazeGain = 0, relationLabel = null) {
  opponent.hp = Math.max(0, opponent.hp - dmg);
  cinematic.onHit(tier);
  // 阶段 D：命中按档积累喧响（高质量行为在各自路径额外加）
  gainDecibel({ light: 40, medium: 60, heavy: 90, ultimate: 150 }[tier] ?? 40);
  // 顿帧：读 TUNING.hitstopF（修：原代码写死固定值，忽略调参）
  const hitstopF = tier === "ultimate" ? TUNING.hitstopFFinisher
    : tier === "heavy" ? TUNING.hitstopFHeavy
    : tier === "medium" ? TUNING.hitstopFMedium
    : TUNING.hitstopF;
  battle.freezeT = Math.max(battle.freezeT, hitstopF / TUNING.logicFps);
  opponentAnim.play(ACTION.HIT, 0.22);
  spawnParticles(opponentGroup.position, tier);
  // 白闪 + 拟声词（绝区零式打击反馈）；有克制关系时用自定义词顶替拟声词
  //   阶段 F：失衡期命中 → 金色大字（易伤窗口的视觉强化）
  hitFeedback.trigger(
    new THREE.Vector3(opponentGroup.position.x, 1.2, opponentGroup.position.z),
    tier === "finisher" ? "ultimate" : tier,
    camera,
    relationLabel,
    stagger.isStaggered
  );
  // 音效 + 统计
  if (tier === "ultimate") audio.playFinisher();
  else audio.playHit(tier);
  if (inBattle) {
    battleStats.hits++;
    battleStats.damageDealt += dmg;
    battleStats.maxCombo = Math.max(battleStats.maxCombo, battle.hitCount);   // GAME-6：最大连击取连段命中数（原读 comboCount 会被命中分支覆盖逻辑抹回 1）
  }
  // 失衡积累（阶段 A）：伤害事件携带失衡值；克制乘区已由调用方乘好，这里乘成员失衡系数与弱点系数
  const wasStaggered = stagger.isStaggered;
  if (dazeGain > 0) {
    stagger.gain(dazeGain * (squad.active?.gridMul ?? 1)
      * (1 + 0.2 * (battle.buffs.stagger ?? 0))   // 阶段 G：击破鸣徽
      * (squad.active?.attr && squad.active.attr === battle.weaknessAttr ? ANOMALY_TUNING.weakDazeMul : 1));
  }
  // 阶段 E：异常积蓄（每次玩家命中积累当前角色属性；弱点 ×1.5；DoT 不积累——不走本函数）
  const aAttr = squad.active?.attr;
  if (aAttr) {
    anomaly.gain(aAttr, ANOMALY_TUNING.buildupPerHit
      * (aAttr === battle.weaknessAttr ? ANOMALY_TUNING.weakDazeMul : 1)
      * (1 + 0.3 * (battle.buffs.anomaly ?? 0)), squad.active.damageMul ?? 1);   // 阶段 G：异常鸣徽
  }
  // 阶段 E：感电追伤（本命中触发；最多 10 次由 anomaly 内部计数）
  const shockBonus = anomaly.onPlayerHit();
  if (shockBonus > 0) {
    opponent.hp = Math.max(0, opponent.hp - shockBonus);
    if (inBattle) battleStats.damageDealt += shockBonus;
  }
  if (!wasStaggered && stagger.isStaggered) {
    // 失衡瞬间（绝区零式）：打断对手当前行动（前摇/弹反窗取消）+ 慢镜 + 横幅
    battle.chainCounts = Math.min(3, battle.round + 1);   // 阶段 C：本段失衡期连携环数 = 回合数档位
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
// 阶段 B：闪避反击（绝区零式）——极限闪避后 1.5s 内攻击输入 = 瞬发重击
function doDodgeCounter() {
  assist.dodgeCounterT = 0;
  const active = squad.active;
  const mv = getMove(active.id);
  const oppStyle = getMove(opponentMember.id).style;
  const rel = styleRelation(mv.style, oppStyle);
  const inRange = opponentGroup.position.distanceTo(active.group.position) <= mv.hitbox.range + 0.6;
  if (inRange) {
    const { dmg } = computeHitDamage(18 * active.damageMul * mv.impact.strength, active, mv, oppStyle);
    battle.hitCount++;
    applyDamage(dmg, "heavy", STAGGER_TUNING.gains.dodgeCounter * (rel === "counter" ? 1.25 : 1), rel === "counter" ? STYLE_LABEL.counter : null);
    gainDecibel(120);   // 阶段 D：闪避反击 +120 喧响
    // 阶段 C：闪避反击也是重击级命中 → 可触发连携 QTE
    tryOpenChainQte();
  }
  active.anim.play(ACTION.ATTACK_3, mv.comboTiming[2]);
  cinematic.onHit("heavy");
  cinematic.setFocus(opponentGroup.position);
  audio.playHit("heavy");
}

function onAttackInput() {
  if (battle.phase !== "playing") return;
  // 阶段 G：鸣徽选择期间输入吸收
  if (battle.womarkOpen) return;
  // 阶段 C：QTE 期间攻击输入被 QTE 吸收（选环走数字键/点击）
  if (battle.chainQte.active) return;
  // 阶段 B：闪避反击资格期内攻击输入 = 闪避反击（瞬发重击，不进连段）
  if (assist.canDodgeCounter) {
    doDodgeCounter();
    return;
  }
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
  // 阶段 C：QTE 期间松手不结算（蓄力态已在 QTE 开启时清除）
  if (battle.chainQte.active) { charging = false; return; }
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

/**
 * 蓄力终结 / 喧响终结技（阶段 D）：喧响满 [极]（3000）时升级为终结技——
 *   伤害 ×2（92 基数）+ 全程无敌 + 慢镜 1.4s + 消耗全部喧响 + 回满 3 支援点；
 * 未满 [极] 行为与冻结版完全一致（蓄力终结）。
 */
function ultimateAttack() {
  const active = squad.active;
  const mv = getMove(active.id);
  const rel = styleRelation(mv.style, getMove(opponentMember.id).style);
  const isUlt = battle.decibel >= 3000;
  if (isUlt) {
    battle.decibel = 0;      // 消耗全部喧响（ZZZ：释放后清零重新积攒）
    assist.full();           // 回满 3 支援点（ZZZ：终结技 +3 支援点）
    battle.invulnT = 2.2;    // 释放期间无敌（realDt 计时，覆盖慢镜下的前摇+演出）
    cinematic.slowmoT = Math.max(cinematic.slowmoT, 1.4);
  }
  battle.finisherPending = {
    t: mv.anim.windup * (isUlt ? 2.0 : 1.6),
    dmg: Math.round((isUlt ? 92 : 46) * active.damageMul * mv.impact.strength * STYLE_MULTIPLIER[rel]),
    range: mv.hitbox.range + 0.8,
    width: mv.hitbox.width + 0.6,
    member: active,
    relation: rel,
    charged: true,   // 蓄力/喧响终结：失衡积累取 charged 档
    isUlt,
  };
  active.anim.play(ACTION.FINISHER, mv.anim.windup * (isUlt ? 2.0 : 1.6) + mv.anim.strike + mv.anim.recover);
  cinematic.onFinisher();
  cinematic.setFocus(opponentGroup.position);
  battle.freezeT = Math.max(battle.freezeT, (isUlt ? 0.8 : 0.6) * mv.impact.strength);
  combo.cancel();
  screens.toast(isUlt ? "喧响终结技！" : "蓄力终结！");
}

// ---------- 阶段 C：连携技 QTE（绝区零式爆发窗口） ----------
/**
 * 尝试开启连携 QTE：对手失衡中 + 本段失衡期还有剩余环数。
 * 由重击级命中路径调用（三段终结/蓄力终结/闪避反击）。
 */
function tryOpenChainQte() {
  if (!stagger.isStaggered || battle.chainQte.active || battle.chainCounts <= 0) return;
  battle.chainQte = {
    active: true,
    t: CHAIN_QTE_WINDOW_S,
    counts: battle.chainCounts,
    used: [],
    options: [],
  };
  // 候选 = 轮换顺序下三位存活队员（ZZZ：后台队友头像 + 倒计时）
  const opts = [];
  let cur = squad.activeIndex;
  for (let i = 0; i < 3; i++) {
    const nxt = squad.nextAlive(cur);
    if (nxt < 0 || opts.includes(nxt)) break;
    opts.push(nxt);
    cur = nxt;
  }
  battle.chainQte.options = opts;
  cinematic.slowmoT = Math.max(cinematic.slowmoT, CHAIN_QTE_WINDOW_S);
  chainOverlay.show(opts);
  screens.toast("连携技！");
  audio.playChain();
  // 清蓄力态：QTE 期间攻击输入被吸收，蓄力条不复存在
  charging = false;
  chargeT = 0;
  charged = false;
  hud.set({ charge: 0, charging: false });
}

/** 关闭 QTE（环数耗尽 / 3s 到时 / Shift 取消） */
function closeChainQte() {
  if (!battle.chainQte.active) return;
  battle.chainQte.active = false;
  battle.chainQte.options = [];
  chainOverlay.hide();
  syncActiveVisibility();
}

/** 数字键/点击选择一环（chipIndex 0-2） */
function pickChain(chipIndex) {
  const q = battle.chainQte;
  if (!q.active) return;
  const mi = q.options[chipIndex];
  if (mi == null || q.used.includes(mi) || q.counts <= 0) return;
  executeChainStrike(mi, chipIndex);
}

/**
 * 执行一环连携：链式换人上场 → 终结一击 → +1 支援点。
 * @param {number} memberIdx 成员下标
 * @param {number} chipIndex chip 下标（用于 chip 置灰）
 */
function executeChainStrike(memberIdx, chipIndex) {
  const q = battle.chainQte;
  const m = squad.members[memberIdx];
  if (!m) return;
  q.used.push(memberIdx);
  q.counts--;
  const isFinisher = q.counts <= 0;
  // 链式换人上场（连携链）
  squad.activeIndex = memberIdx;
  syncActiveVisibility();
  // 阶段 C 修正：链式入场贴位——新成员从原站位传送到对手侧翼判定距离内
  //   （队员初始站位 (2.4,0,0) 距对手 4.8，超出判定框会让第一环必然落空）
  const mv = getMove(m.id);
  const toOpp = new THREE.Vector3().subVectors(opponentGroup.position, m.group.position).normalize();
  const standDist = Math.max(1.2, mv.hitbox.range * 0.6);
  m.move.pos.copy(opponentGroup.position).addScaledVector(toOpp, -standDist);
  m.move.pos.y = 0;
  m.group.position.copy(m.move.pos);
  const oppStyle = getMove(opponentMember.id).style;
  m.anim.play(ACTION.FINISHER, mv.anim.windup + mv.anim.strike + mv.anim.recover);
  cinematic.setFocus(opponentGroup.position);
  cinematic.onHit("ultimate");
  battle.freezeT = Math.max(battle.freezeT, isFinisher ? 0.3 : 0.15);
  // 连携命中不做玩家走位判定（QTE 演出契约），但做宽松距离校验防极端位置
  if (opponentGroup.position.distanceTo(m.group.position) <= mv.hitbox.range + 1.6) {
    const base = (isFinisher ? 36 : 24) * m.damageMul * mv.impact.strength
      * (1 + 0.25 * (battle.buffs.chain ?? 0));   // 阶段 G：连携鸣徽 +25%/层
    const { dmg } = computeHitDamage(base, m, mv, oppStyle);
    battle.hitCount++;
    applyDamage(dmg, "ultimate", 0, null);
  }
  assist.refill(1);   // 连携 +1 支援点（ZZZ 循环咬合点：防御花资源、进攻回收资源）
  gainDecibel(300);   // 阶段 D：连携环 +300 喧响（高质量行为积累更快）
  if (inBattle) battleStats.chains++;   // 阶段 F：连携计入结算
  audio.playChain();
  if (isFinisher) {
    hitFeedback.trigger(
      new THREE.Vector3(opponentGroup.position.x, 1.4, opponentGroup.position.z),
      "ultimate", camera, "连携终结！"
    );
    cinematic.slowmoT = Math.max(cinematic.slowmoT, 1.2);
  }
  chainOverlay.markUsed(chipIndex);
  if (isFinisher) closeChainQte();
}

// ---------- 阶段 G：鸣徽三选一（回合间轻肉鸽） ----------
let womarkOffers = [];   // 当前候选（数字键按位选择用）

/** 开启鸣徽三选一（advanceRound 调用；战斗经 womarkOpen 旗标暂停） */
function openWomark() {
  battle.womarkOpen = true;
  const pool = [...WOMARK_POOL];
  const offers = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    offers.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  womarkOffers = offers;
  womarkOverlay.show(offers);
  audio.playConfirm?.();
}

/** 按下标选中（0-2） */
function pickWomarkByIndex(i) {
  const def = womarkOffers[i];
  if (def) pickWomark(def.id);
}

/** 选中鸣徽：叠层计数 + 即时效果 + 回战斗 */
function pickWomark(id) {
  if (!battle.womarkOpen) return;
  const def = WOMARK_POOL.find((o) => o.id === id);
  if (!def) return;
  battle.buffs[id] = (battle.buffs[id] ?? 0) + 1;
  // 即时效果
  if (id === "heal") {
    for (const m of squad.members) {
      if (m.alive) m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.3));
    }
  }
  if (id === "assist") assist.full();
  if (id === "dodge") {
    for (const m of squad.members) m.move.dodgeIframeBonus = (m.move.dodgeIframeBonus ?? 0) + 0.1;
  }
  if (id === "counter") counter.windowSBonus = (counter.windowSBonus ?? 0) + 0.05;
  womarkOverlay.hide();
  battle.womarkOpen = false;
  screens.toast(`${def.name} ×${battle.buffs[id]}`);
  audio.playConfirm();
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
  // 阶段 G：鸣徽选择期间输入吸收
  if (battle.womarkOpen) return;
  // 阶段 C：QTE 期间 Shift = 取消连携（ZZZ 1.1 手动取消）
  if (battle.chainQte.active) {
    closeChainQte();
    return;
  }
    // 弹反优先（阶段 B：消耗 1 支援点；无点时自动落为普通闪避 → 掐准时刻即极限闪避）
    // 阶段 F：红光不可弹反攻击（counter.parryable=false）只能闪避
    if (counter.isWarning && counter.parryable && assist.canParry) {
      const r = counter.tryCounter();
      if (r) {
        assist.spend(1);   // 阶段 B：弹反消耗 1 支援点
      // 修：弹反成功不做位移（原代码先置 dodgeRequested 再弹反，导致成功后仍后撤）
      // 阶段 A：弹反惩罚击也吃招式克制乘区（失衡积累与伤害同一口径）
      const relC = styleRelation(getMove(squad.active.id).style, getMove(opponentMember.id).style);
      applyDamage(r.damage, "heavy", STAGGER_TUNING.gains.counter * (relC === "counter" ? 1.25 : 1));
      gainDecibel(200);   // 阶段 D：弹反成功 +200 喧响
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
  // 阶段 G：鸣徽选择期间普通换人吸收
  if (battle.womarkOpen) return;
  // 阶段 C：QTE 期间普通换人被吸收（链式换人由 executeChainStrike 接管）
  if (battle.chainQte.active) return;
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
    // 阶段 C：连携 QTE 期间数字键 = 选连携成员（chip 1/2/3）
    if (battle.chainQte.active) {
      pickChain(k === "0" ? 9 : Number(k) - 1);
    } else if (battle.womarkOpen) {
      // 阶段 G：鸣徽三选一期间数字键 = 选卡（1/2/3）
      pickWomarkByIndex(Number(k) - 1);
    } else {
      onSwapInput(k === "0" ? 9 : Number(k) - 1);
    }
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
  battle.invulnT = Math.max(0, battle.invulnT - rawDt);   // 阶段 D：ULt 无敌帧计时（realDt）
  const frozen = battle.freezeT > 0;
  // 顿帧期间锁 timeScale=1（修：原慢镜会折扣顿帧的感知时长）
  const timeScale = frozen ? 1.0 : cinematic.timeScale;
  const dt = rawDt * timeScale;

  const active = squad.active;
  // UI-1/GAME-3：战斗逻辑统一门控——标题/选人/结算界面与 settle 阶段全部停车
  //（原 !frozen 块无 inBattle/phase 守卫：非战斗界面按键驱动不可见角色移动/闪避，
  //  settle 后对手 AI 追击/开弹反窗/windup 到期伤害/连段推进/箱子 hitTest 仍照常运行）
  // 阶段 G：鸣徽三选一开启时同停车（womarkOpen 旗标，不新增 phase 以保 E2E 相位断言）
  const battleRunning = inBattle && battle.phase === "playing" && !battle.womarkOpen;

  if (battleRunning && !frozen) {
    // 阶段 F：首领狂暴（回合 3 且血量 <50% → 攻击 CD ×0.6 + 每 3 击一次红光不可弹反）
    if (battle.round === battle.totalRounds - 1 && !battle.enraged && opponent.hp < opponent.maxHp * 0.5) {
      battle.enraged = true;
      screens.toast("对手狂暴！");
      audio.playChain?.();
    }
    // 活跃角色移动
    active.move.step({ move: updateMoveInput(), jump: false, dodge: dodgeRequested }, dt);
    dodgeRequested = false;
    // 速度特性
    active.move.walkSpeed = TUNING.playerSpeed * active.speedMul;

    // 对手 AI（阶段 A：失衡期间定身；阶段 E：冻结/硬直同样定身）
    const toPlayer = new THREE.Vector3().subVectors(active.group.position, opponentGroup.position);
    const dist = toPlayer.length();
    if (stagger.isStaggered || anomaly.isFrozen) {
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
      // 对手攻击前摇 → 弹反窗口（阶段 F：首领狂暴期每 3 击一次红光不可弹反攻击）
      battle.oppAttackCd -= dt;
      if (battle.oppAttackCd <= 0 && !counter.isWarning && !counter.isPunishing) {
        battle.attackCount = (battle.attackCount ?? 0) + 1;
        const unparryable = battle.enraged && battle.attackCount % 3 === 0;
        battle.oppAttackCd = battle.enraged ? (4.0 + Math.random() * 2) * 0.6 : 4.0 + Math.random() * 2;
        counter.openWindow(!unparryable);
        battle.oppAttackWindup = 0.25;
        // 对手攻击预警：模型闪色（阶段 F：金光=可弹反 / 红光=不可弹反——ZZZ 分级预警）
        _flashOpponent(unparryable ? 0xff3232 : 0xffc93d);
        audio.playCounter?.();
      }
    }

    // 弹反窗口：先判定受击，再推进 counter（修：原顺序会让 expire 吞掉攻击）
    if (counter.isWarning && battle.oppAttackWindup > 0) {
      battle.oppAttackWindup -= dt;
      if (battle.oppAttackWindup <= 0) {
        if (active.move.hasIframe) {
          // 阶段 B：极限闪避（绝区零式）——攻击落地瞬间玩家闪避无敌帧仍生效
          //   三重收益：慢镜 ×0.3 0.5s +「极限闪避！」弹出 + 闪避反击资格 1.5s
          assist.dodgeCounterT = ASSIST_TUNING.dodgeCounterS;
          cinematic.slowmoT = Math.max(cinematic.slowmoT, 0.5);
          hitFeedback.trigger(
            new THREE.Vector3(active.group.position.x, 1.2, active.group.position.z),
            "heavy", camera, "极限闪避！"
          );
          gainDecibel(150);   // 阶段 D：极限闪避 +150 喧响
          audio.playCounter();
          counter.expire();   // 攻击已落空，结束弹反窗
        } else if (battle.invulnT > 0) {
          // 阶段 D：喧响终结技无敌帧中——攻击直接落空
          counter.expire();
        } else {
          // 未弹反未闪避 → 受击。伤害随对手招式强度浮动，并受招式克制影响
          //   （对手的风格克当前角色的风格 → 伤害更高；被克 → 更低）
          const oppMv = getMove(opponentMember.id);
          const rel = styleRelation(oppMv.style, getMove(active.id).style);
          const dmgToPlayer = Math.round(10 * (0.7 + 0.3 * oppMv.impact.strength) * STYLE_MULTIPLIER[rel]);
          squad.damageActive(dmgToPlayer);
          battleStats.damageTaken += dmgToPlayer;   // 阶段 F：受击计入结算
          active.anim.play(ACTION.HIT, 0.22);
          cinematic.onHit("medium");
          counter.expire();   // 显式结束窗口
        }
      }
    }
    counter.step(dt);
    // 阶段 A：失衡计时（与 counter 同一帧域：仅战斗运行、按 scaled dt 推进）
    stagger.step(dt);
    // 阶段 B：闪避反击资格窗计时
    assist.step(dt);
    // 阶段 E：异常衰减 / DoT / 冻结计时
    anomaly.step(dt);

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
        gainDecibel(20);   // 阶段 D：破坏可破坏物 +20 喧响（ZZZ：攻击可破坏物积累）
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
          // 阶段 C：失衡中重击命中 → 连携 QTE（ZZZ：眩晕期重击触发连携）
          tryOpenChainQte();
        }
      }
    }

    // 面向对手
    // 3/4 侧身朝向（面向对手但偏向相机，避免背对）
    active.move.faceToward(opponentGroup.position, camera.position);
    opponentMove.faceToward(active.group.position, camera.position);
  }

  // 阶段 C：连携 QTE 倒计时（实时推进——不受慢镜/顿帧影响，ZZZ ~3s 真实窗口）
  if (battle.chainQte.active) {
    battle.chainQte.t -= rawDt;
    chainOverlay.update(battle.chainQte.t, CHAIN_QTE_WINDOW_S);
    if (battle.chainQte.t <= 0) closeChainQte();
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
    const ah = anomalyHud();   // 阶段 E：异常条摘要（每帧一次）
    hud.set({
      elapsed: battleStats.elapsed,
      hp: active.hp,
      maxHp: active.maxHp,
      oppHp: (opponent.hp / opponent.maxHp) * 100,
      oppHpRaw: opponent.hp,   // UI-2：对手数字显绝对血量值（hud.mjs 优先读它；血条仍用 oppHp 百分比口径）
      grids: battle.grids,
      daze: stagger.pct * 100,        // 阶段 A：失衡黄条（0~100）
      staggered: stagger.isStaggered, // 满条闪烁态
      assist: assist.points,          // 阶段 B：支援点 3 格
      decibel: battle.decibel,        // 阶段 D：喧响值
      anomalyPct: ah.pct,             // 阶段 E：异常积蓄条（最高属性）
      anomalyCss: ah.css,
      anomalyStatus: ah.status,
      anomalyWeak: ah.weak,
      combo: battle.chainCounts > 0 ? battle.chainCounts : battle.comboCount,   // 阶段 C：有连携环时 chip 显示剩余环数
      canAttack: !frozen,
      canDodge: !frozen,
      // 接力键是否真的可换：需有下一只存活角色，且（非连携换人有 2s 冷却，除非连携窗口已开）
      //   修：canSwap 此前全仓库无写入方 → 恒为 true → 接力键常亮（假引导）
      canSwap: squad.nextAlive() !== null && (squad.swapCooldown <= 0 || squad.canChain),
      chainReady: squad.canChain,
      counterWarning: counter.isWarning,
      counterParryable: counter.parryable,   // 阶段 F：金光=可弹反 / 红光=只能闪避
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
let battleStats = { maxCombo: 0, hits: 0, counters: 0, damageDealt: 0, elapsed: 0, chains: 0, anomalies: 0, damageTaken: 0 };
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
  assist.reset();    // 阶段 B：支援点回满 3
  battle.enraged = false;   // 阶段 F：清狂暴
  battle.attackCount = 0;
  battle.chainCounts = 0;   // 阶段 C：清连携环数与 QTE
  battle.chainQte = { active: false, counts: 0, t: 0, used: [], options: [] };
  battle.decibel = 0;       // 阶段 D：开战清喧响
  battle.invulnT = 0;
  battle.womarkOpen = false;   // 阶段 G：清鸣徽选择态
  battle.buffs = {};           // 阶段 G：清鸣徽（肉鸽 buff 只在本局内累积）
  anomaly.reset();          // 阶段 E：清异常积蓄与状态
  battle.weaknessAttr = Object.keys(ATTR)[Math.floor(Math.random() * 5)];   // 阶段 E：本局对手弱点属性
  opponent.hp = opponent.maxHp;
  battleStats = { maxCombo: 0, hits: 0, counters: 0, damageDealt: 0, elapsed: 0, chains: 0, anomalies: 0, damageTaken: 0 };
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
  battle.chainCounts = 0;   // 阶段 C：清连携环数与 QTE
  battle.chainQte = { active: false, counts: 0, t: 0, used: [], options: [] };
  anomaly.reset();          // 阶段 E：换回合清异常积蓄与状态
  battle.weaknessAttr = Object.keys(ATTR)[Math.floor(Math.random() * 5)];   // 阶段 E：新对手重掷弱点
  battle.enraged = false;   // 阶段 F：清狂暴（新对手重新计时）
  battle.attackCount = 0;
  chargeT = 0;
  charged = false;
  charging = false;
  hud.set({ charge: 0, charging: false, round: battle.round + 1, totalRounds: battle.totalRounds });
  const om = getMove(opponentMember.id);
  screens.toast(`第 ${battle.round + 1} 回合 · ${opponentMember.name}（${om.moveName}）`);
  openWomark();   // 阶段 G：回合间鸣徽三选一（战斗暂停至选卡完成）
}

function endBattle() {
  if (!inBattle) return;
  inBattle = false;
  battle.phase = "settle";
  closeChainQte();   // 阶段 C：结算前关 QTE（防软锁）
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
  // 阶段 F：时间乘数（ZZZ ×5 起 15s 衰减的网页化：elapsed 0s → ×5，90s → ×2，≥120s → ×1）
  const timeMult = Math.max(1, Math.min(5, 5 - battleStats.elapsed / 30));
  const base = battleStats.damageDealt + battleStats.maxCombo * 20 + battleStats.counters * 30
    + battleStats.chains * 40 + battleStats.anomalies * 30;
  const score = Math.round(base * timeMult);
  const grade = !win ? "D" : score > 3000 ? "S" : score > 1800 ? "A" : score > 800 ? "B" : "C";
  const rewards = win
    ? ["经验 ×120", "奶币 ×80", "材料 ×3",
       ...Object.entries(battle.buffs).map(([id, n]) => {
         const def = WOMARK_POOL.find((o) => o.id === id);
         return def ? `${def.name} ×${n}` : null;
       }).filter(Boolean)]
    : ["经验 ×40", "奶币 ×20"];
  screens.showResult({
    win,
    grade,
    stats: {
      "造成伤害": battleStats.damageDealt,
      "最大连击": battleStats.maxCombo,
      "连携·支援": battleStats.chains + battleStats.counters,
      "受到伤害": battleStats.damageTaken,
    },
    dims: [
      { label: "输出", value: Math.min(100, Math.round(battleStats.damageDealt / 6)) },
      { label: "连击", value: Math.min(100, battleStats.maxCombo * 8) },
      { label: "支援", value: Math.min(100, battleStats.chains * 15 + battleStats.counters * 20) },
      { label: "用时", value: Math.round(Math.max(0, Math.min(100, ((5 - timeMult) / 4) * 100))) },
    ],
    timeMult,
    rewards,
    rounds: battle.roundResults.map((r) => ({ name: r.name, move: r.move, won: r.won })),
    roundsSummary: `三连战 ${wonRounds}/${battle.totalRounds}`,
  });
  audio.playBgm("title");
}

/** 对手攻击预警：模型闪色（阶段 F：金光 0xffc93d=可弹反 / 红光 0xff3232=不可弹反，ZZZ 分级预警） */
function _flashOpponent(color) {
  const mats = [];
  opponentGroup.traverse?.((c) => {
    if (c.isMesh && !c.userData.__isOutline && c.material?.emissive) mats.push(c.material);
  });
  for (const m of mats) {
    m.emissive.setHex(color);
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
  // 阶段 B 调试口：支援点读取/注入（E2E 用）
  assistState: () => ({ points: assist.points, dodgeCounterT: +assist.dodgeCounterT.toFixed(2) }),
  setAssist: (n) => { assist.points = Math.max(0, Math.min(3, n | 0)); },
  // 阶段 C 调试口：连携 QTE 状态读取与测试注入
  chainQteState: () => ({
    active: battle.chainQte.active, counts: battle.chainQte.counts,
    t: +battle.chainQte.t.toFixed(2), options: [...battle.chainQte.options], used: [...battle.chainQte.used],
    chainCounts: battle.chainCounts,
  }),
  debugOpenChain: () => { battle.chainCounts = Math.max(1, battle.chainCounts); tryOpenChainQte(); },
  // 阶段 D 调试口：喧响值注入（E2E 用）
  setDecibel: (n) => { battle.decibel = Math.max(0, Math.min(3000, n | 0)); },
  decibelState: () => ({ decibel: battle.decibel, invulnT: +battle.invulnT.toFixed(2) }),
  // 阶段 E 调试口：异常状态读取与注入（E2E 用）
  anomalyState: () => ({
    buildup: { ...anomaly.buildup }, thresholds: { ...anomaly.thresholds },
    status: anomaly.status ? { attr: anomaly.status.attr, t: +anomaly.status.t.toFixed(1) } : null,
    frozenT: +anomaly.frozenT.toFixed(2), weakness: battle.weaknessAttr,
  }),
  addAnomaly: (attr, n) => anomaly.gain(attr, n, squad.active?.damageMul ?? 1),
  // 阶段 G 调试口：鸣徽状态读取与注入（E2E 用）
  womarkState: () => ({ open: battle.womarkOpen, buffs: { ...battle.buffs } }),
  debugOpenWomark: () => openWomark(),
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
