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
import { Squad, SQUAD } from "./game/squad.mjs";
import { getMove } from "./game/moves.mjs";
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

  loader.load(member.glb, (gltf) => {
    const m = gltf.scene;
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
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 24), new THREE.MeshStandardMaterial({ color: member.color }));
    ball.castShadow = true;
    g.add(ball);
    const wrapper = new THREE.Group();
    wrapper.name = "model-wrapper";
    wrapper.add(ball);
    g.add(wrapper);
    member.anim.inner = wrapper;
    member.anim.baseScale = wrapper.scale.clone();
  });
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

loader.load("./asset/naiwa_naidan_runtime.glb", (gltf) => {
  const m = gltf.scene;
  opponentGroup.add(m);
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

// ---------- 战斗系统 ----------
const combo = new ComboSystem();
const counter = new CounterSystem();
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
  timer: TUNING.roundTotalS,
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

function applyDamage(dmg, tier, gridGain = 1) {
  opponent.hp = Math.max(0, opponent.hp - dmg);
  battle.grids = Math.min(TUNING.balanceGrids, battle.grids + gridGain);
  cinematic.onHit(tier);
  // 顿帧：读 TUNING.hitstopF（修：原代码写死固定值，忽略调参）
  const hitstopF = tier === "ultimate" ? TUNING.hitstopFFinisher
    : tier === "heavy" ? TUNING.hitstopFHeavy
    : tier === "medium" ? TUNING.hitstopFMedium
    : TUNING.hitstopF;
  battle.freezeT = Math.max(battle.freezeT, hitstopF / TUNING.logicFps);
  opponentAnim.play(ACTION.HIT, 0.22);
  spawnParticles(opponentGroup.position, tier);
  // 白闪 + 拟声词（绝区零式打击反馈）
  hitFeedback.trigger(
    new THREE.Vector3(opponentGroup.position.x, 1.2, opponentGroup.position.z),
    tier === "finisher" ? "ultimate" : tier,
    camera
  );
  // 音效 + 统计
  if (tier === "ultimate") audio.playFinisher();
  else audio.playHit(tier);
  if (inBattle) {
    battleStats.hits++;
    battleStats.damageDealt += dmg;
    battleStats.maxCombo = Math.max(battleStats.maxCombo, battle.hitCount);   // GAME-6：最大连击取连段命中数（原读 comboCount 会被命中分支覆盖逻辑抹回 1）
  }
  if (battle.grids >= TUNING.balanceGrids) {
    // 「换壳即换招」：连携演出用本角色的慢镜/推近/粒子参数
    const mv = combo.currentMove ?? getMove(squad.active.id);
    cinematic.onChain();
    cinematic.setFocus(opponentGroup.position);   // RENDER-2：连携慢镜焦点对准对手（原漏设，focusWeight=1 时相机看向停留旧值/原点的焦点）
    cinematic.slowmoT = mv.chain.slowmo;
    cinematic.orbitDur = mv.chain.slowmo;
    cinematic.orbitT = mv.chain.slowmo;
    battle.comboCount++;   // GAME-6：连携次数 +1（不再被命中分支覆盖）
    squad.openChainWindow();   // GAME-1：失衡满 → 开启连携窗口（squad.mjs openChainWindow；修复 chainWindow 无写正值入口的连携链循环依赖死锁）
    battle.grids = 0;
    audio.playChain();
  }
}

function onAttackInput() {
  if (battle.phase !== "playing") return;
  const active = squad.active;
  const mv = getMove(active.id);   // 「换壳即换招」：取本只角色的招式参数

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

let dodgeRequested = false;

function onDodgeInput() {
  if (battle.phase !== "playing") return;
  // 弹反优先
  if (counter.isWarning) {
    const r = counter.tryCounter();
    if (r) {
      // 修：弹反成功不做位移（原代码先置 dodgeRequested 再弹反，导致成功后仍后撤）
      applyDamage(r.damage, "heavy", r.gridGain);
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
      applyDamage(Math.round(12 * res.to.damageMul), "medium", 1);
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
      case "steps": {
        // 1-9 = 直选角色；0 = 第 10 只；档数用 [ / ]
        if (typeof payload === "number" && payload >= 1 && payload <= 9) {
          onSwapInput(payload - 1);
        }
        break;
      }
    }
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
  hud.set({ mode, steps });
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

    // 对手 AI
    const toPlayer = new THREE.Vector3().subVectors(active.group.position, opponentGroup.position);
    const dist = toPlayer.length();
    if (dist > 2.4) {
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
        // 未弹反 → 受击
        squad.damageActive(10);
        active.anim.play(ACTION.HIT, 0.22);
        cinematic.onHit("medium");
        counter.expire();   // 显式结束窗口
      }
    }
    counter.step(dt);

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
        const dmg = Math.round(hit.damage * active.damageMul * mv.impact.strength);
        battle.hitCount++;   // GAME-6：连段命中数段间递增（先自增再结算，供 applyDamage 内 maxCombo 采样）
        applyDamage(dmg, hit.finisher ? "ultimate" : hit.shake, hit.gridGain);
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
        if (fInRange && fInWidth) applyDamage(fp.dmg, "ultimate", 3);
      }
    }

    // 面向对手
    // 3/4 侧身朝向（面向对手但偏向相机，避免背对）
    active.move.faceToward(opponentGroup.position, camera.position);
    opponentMove.faceToward(active.group.position, camera.position);
  }

  // 战斗结束判定（不限时，对手 HP 或玩家 HP 归零）
  if (inBattle && battle.phase === "playing" && !frozen) {
    if (opponent.hp <= 0) endBattle();
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
      combo: battle.comboCount,
      canAttack: !frozen,
      canDodge: !frozen,
      chainReady: squad.canChain,
      counterWarning: counter.isWarning,
      shellName: active.name,
      shellIndex: squad.activeIndex,
      shellTotal: squad.members.length,
    });
  }

  postfx.render(rawDt);
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

function startBattle(memberIndex) {
  inBattle = true;
  input.setEnabled(true);   // UI-1：进战斗恢复输入
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
  battle.timer = TUNING.roundTotalS;
  battle.grids = 0;
  battle.comboCount = 0;
  battle.hitCount = 0;   // GAME-6：清连段命中数
  battle.finisherPending = null;   // GAME-7：清残留终结技定时命中
  battle.phase = "playing";
  battle.freezeT = 0;
  battle.oppTimer = 0;
  combo.cancel();
  counter.state = "idle";
  opponent.hp = opponent.maxHp;
  battleStats = { maxCombo: 0, hits: 0, counters: 0, damageDealt: 0, elapsed: 0 };
  // 界面切换
  screens.show("battle");
  audio.playBgm("battle");
  audio.playConfirm();
  hud.set({ mode, steps, shellName: SQUAD[memberIndex].name, shellIndex: memberIndex, shellTotal: SQUAD.length });
  screens.toast(`${SQUAD[memberIndex].name} 出战！`);
}

function endBattle() {
  if (!inBattle) return;
  inBattle = false;
  battle.phase = "settle";
  input.setEnabled(false);   // UI-1：结算界面禁用战斗输入
  // 胜利 = 击败对手（不限时）
  const win = opponent.hp <= 0;
  const score = battleStats.damageDealt + battleStats.maxCombo * 20 + battleStats.counters * 30;
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

// 初始化
syncActiveVisibility();
initTitleFX(); // 主界面立绘 + 粒子（异步）
hud.set({ mode, steps, shellName: SQUAD[0].name, shellIndex: 0, shellTotal: SQUAD.length });

window.__npr = {
  setMode: (m) => { mode = m; restyleAll(); },
  setSteps: (s) => { steps = s; restyleAll(); },
  getMode: () => mode,
  getSteps: () => steps,
  battle, combo, counter, squad, opponent, opponentAnim, scene, camera, renderer, stage, postfx,
  startBattle, endBattle, audio,
  // 界面管理器异步装配：实例身份可变，读取时必须拿当前绑定（见上方惰性装配 IIFE）
  get screens() { return screens; },
  // 立绘生成器惰性加载：保持「调用即得 Promise」的对外语义（scripts/render-portraits.mjs 依赖 await）
  makePortrait: (...args) => import("./ui/portrait.mjs").then((m) => m.makePortrait(...args)),
  getBattleStats: () => battleStats,   // 供测试/结算读取
};

tick();
