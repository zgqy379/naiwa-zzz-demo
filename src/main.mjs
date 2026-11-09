/**
 * 奶蛙零 · 绝区零风格化动作 Demo 入口（v3 — 完整系统）
 *
 * 整合：NPR 渲染 + 3D 移动 + 程序化动画 + 连段 + 运镜
 *      + 多角色队伍 + 弹反博弈 + 场景交互
 *
 * 操作：
 *   WASD 移动 · 空格 攻击（连按出连段）· Shift 闪避/弹反
 *   Tab 循环换壳 · Q/E 上一个/下一个 · 1–9 直选前 9 只 / 0 直选第 10 只
 *   N 切换 PBR/NPR · [ / ] 调色调分离档数 · 鼠标拖动旋转
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { applyNpr, NPR_PRESET } from "./render/npr.mjs";
import { PostFX } from "./render/postfx.mjs";
import { buildStage } from "./world/stage.mjs";
import { InteractiveProps } from "./world/interactive.mjs";
import { Hud } from "./ui/hud.mjs";
import { ScreenManager } from "./ui/screens.mjs";
import { initTitleFX } from "./ui/titlefx.mjs";
import { makePortrait } from "./ui/portrait.mjs";
import { AudioSystem } from "./audio/audio.mjs";
import { Movement } from "./game/movement.mjs";
import { ProceduralAnim, ACTION } from "./game/animation.mjs";
import { ComboSystem } from "./game/combo.mjs";
import { CounterSystem } from "./game/counter.mjs";
import { Squad, SQUAD } from "./game/squad.mjs";
import { getMove } from "./game/moves.mjs";
import { Cinematic } from "./vfx/cinematic.mjs";
import { ImpactFX } from "./vfx/impact.mjs";
import { makeShadowBlob, updateShadowBlob } from "./vfx/shadowblob.mjs";
import { HitFeedback } from "./vfx/hitflash.mjs";
import { TUNING } from "./game/tuning.mjs";

// ---------- 渲染器 ----------
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;   // 1.0→0.85：压曝光，避免高光糊掉剪影
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r187 已移除 PCFSoftShadowMap

// ---------- 场景 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const key = new THREE.DirectionalLight(0xfff2d0, 2.2);
key.position.set(4, 8, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const rim = new THREE.DirectionalLight(0xf5c542, 0.9);
rim.position.set(-6, 4, -4);
scene.add(rim);
scene.add(new THREE.AmbientLight(0x404050, 1.4));

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
  bloomStrength: liteMode ? 0.0 : 0.40,
  bloomRadius: 0.50,
  bloomThreshold: 0.68,
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
const screens = new ScreenManager({
  onStart: (idx) => startBattle(idx),
  onRestart: () => startBattle(screens.selectedIndex),
  onBack: () => { screens.show("title"); audio.playBgm("title"); },
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
    if (q === "low") { postfx.setBloom(false); postfx.setLowQuality(); }
    else { postfx.setBloom(true); } // 强度不传，沿用构造期 L79 bloomStrength，消除双入口漂移
  },
  onSetVolume: (v) => audio.setVolume(v),
});

// ---------- 模式 ----------
let mode = "NPR";
let steps = 3;

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
    // 包 wrapper
    const wrapper = new THREE.Group();
    wrapper.name = "model-wrapper";
    const existing = [...g.children];
    for (const c of existing) wrapper.add(c);
    g.add(wrapper);
    wrapper.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(wrapper);
    const size = box.getSize(new THREE.Vector3());
    // 按身高归一化：保留胖瘦/宽窄比例（不给最大维拉平）
    // visualScale：体型补偿（默认 1，仅奶鱼 1.2，见 squad.mjs 的 VISUAL_SCALE_OVERRIDE 说明）
    const s = member.scale / (size.y || 1) * (member.visualScale || 1);
    wrapper.scale.set(s, s, s);
    const box2 = new THREE.Box3().setFromObject(wrapper);
    wrapper.position.y = -box2.min.y;
    wrapper.userData.__origMats = new Map();
    wrapper.traverse((c) => { if (c.isMesh) wrapper.userData.__origMats.set(c, c.material); });
    member.anim.inner = wrapper;
    member.anim.baseScale = wrapper.scale.clone();
    if (mode === "NPR") applyNpr(wrapper, { ...NPR_PRESET, steps }, { width: 0.022 });
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
let opponent = { hp: 200, maxHp: 200 };

loader.load("/asset/naiwa_naidan_runtime.glb", (gltf) => {
  const m = gltf.scene;
  opponentGroup.add(m);
  const wrapper = new THREE.Group();
  wrapper.name = "model-wrapper";
  const existing = [...opponentGroup.children];
  for (const c of existing) wrapper.add(c);
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
  opponentAnim.inner = wrapper;
  opponentAnim.baseScale = wrapper.scale.clone();
  if (mode === "NPR") applyNpr(wrapper, { ...NPR_PRESET, steps }, { width: 0.022 });
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

const battle = {
  timer: TUNING.roundTotalS,
  grids: 0,
  comboCount: 0,
  freezeT: 0,
  oppTimer: 0,
  oppAttackWindup: 0,   // 对手攻击前摇（弹反窗口）
  oppAttackCd: 3.0,
  phase: "playing",
};

// 打击特效（冲击波 + 速度线 + 光效粒子）
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
    battleStats.maxCombo = Math.max(battleStats.maxCombo, battle.comboCount);
  }
  if (battle.grids >= TUNING.balanceGrids) {
    // 「换壳即换招」：连携演出用本角色的慢镜/推近/粒子参数
    const mv = combo.currentMove ?? getMove(squad.active.id);
    cinematic.onChain();
    cinematic.slowmoT = mv.chain.slowmo;
    cinematic.orbitDur = mv.chain.slowmo;
    cinematic.orbitT = mv.chain.slowmo;
    battle.comboCount++;
    battle.grids = 0;
    audio.playChain();
  }
}

function onAttackInput() {
  if (battle.phase !== "playing") return;
  const active = squad.active;
  const mv = getMove(active.id);   // 「换壳即换招」：取本只角色的招式参数

  // 终结技
  if (combo.isInCombo && combo.stageIndex === combo.stageCount - 1) {
    active.anim.play(ACTION.FINISHER, mv.anim.windup + mv.anim.strike + mv.anim.recover);
    cinematic.onFinisher();
    cinematic.setFocus(opponentGroup.position);
    battle.freezeT = Math.max(battle.freezeT, 0.5 * mv.impact.strength);
    applyDamage(Math.round(30 * active.damageMul * mv.impact.strength), "ultimate", 3);
    combo.cancel();
    return;
  }
  const res = combo.onAttack();
  if (res.started) {
    // 用本角色的连段节奏（第一段时长）
    const dur = mv.comboTiming[0];
    active.anim.play(ACTION.ATTACK_1, dur);
    // 前冲距离 = 判定框偏移 × 招式风格系数
    const dir = new THREE.Vector3().subVectors(opponentGroup.position, active.group.position).normalize();
    active.move.lunge(dir, mv.anim.strike * 0.8);
    // 记录本段动作参数（供命中时用）
    combo.currentMove = mv;
  }
}

let dodgeRequested = false;

function onDodgeInput() {
  if (battle.phase !== "playing") return;
  dodgeRequested = true;
  // 弹反优先
  if (counter.isWarning) {
    const r = counter.tryCounter();
    if (r) {
      applyDamage(r.damage, "heavy", r.gridGain);
      cinematic.onHit("heavy");
      cinematic.setFocus(opponentGroup.position);
      audio.playCounter();
      if (inBattle) battleStats.counters++;
      return;
    }
  }
  // 普通闪避
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
    applyDamage(Math.round(12 * res.to.damageMul), "medium", 1);
  }
}

// ---------- 输入 ----------
const keysDown = new Set();
const moveInput = new THREE.Vector2(0, 0);

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keysDown.add(k);

  if (k === "n") { mode = mode === "PBR" ? "NPR" : "PBR"; restyleAll(); }
  // 色调分离档数移到 [ / ]（1–9/0 已让位给换壳直选）
  else if (k === "[") { steps = Math.max(3, steps - 1); restyleAll(); }
  else if (k === "]") { steps = Math.min(5, steps + 1); restyleAll(); }
  else if (k === " ") { e.preventDefault(); onAttackInput(); }
  else if (k === "shift") onDodgeInput();
  else if (k === "tab") { e.preventDefault(); onSwapInput(squad.nextAlive()); }
  else if (k === "q") onSwapInput(squad.prevAlive());
  else if (k === "e") onSwapInput(squad.nextAlive());
  else if (k.length === 1 && k >= "0" && k <= "9") {
    // 1–9 = 直选第 1–9 只；0 = 直选第 10 只（16 只需要 Tab/Q/E 循环继续走到后 6 只）
    onSwapInput(k === "0" ? 9 : Number(k) - 1);
  }
});
window.addEventListener("keyup", (e) => keysDown.delete(e.key.toLowerCase()));

function updateMoveInput() {
  let x = 0, y = 0;
  if (keysDown.has("a")) x -= 1;
  if (keysDown.has("d")) x += 1;
  if (keysDown.has("w")) y += 1;
  if (keysDown.has("s")) y -= 1;
  moveInput.set(x, y);
}

function restyleAll() {
  for (const m of squad.members) {
    const w = m.group.getObjectByName("model-wrapper");
    if (!w) continue;
    const outlines = [];
    w.traverse((c) => { if (c.userData.__isOutline) outlines.push(c); });
    outlines.forEach((o) => o.parent?.remove(o));
    if (w.userData.__origMats) w.userData.__origMats.forEach((mat, mesh) => { mesh.material = mat; });
    w.traverse((c) => { if (c.isMesh) { c.userData.__npr = false; c.userData.__isOutline = false; } });
    if (mode === "NPR") applyNpr(w, { ...NPR_PRESET, steps }, { width: 0.022 });
  }
  const ow = opponentGroup.getObjectByName("model-wrapper");
  if (ow) {
    const outlines = [];
    ow.traverse((c) => { if (c.userData.__isOutline) outlines.push(c); });
    outlines.forEach((o) => o.parent?.remove(o));
    if (ow.userData.__origMats) ow.userData.__origMats.forEach((mat, mesh) => { mesh.material = mat; });
    ow.traverse((c) => { if (c.isMesh) { c.userData.__npr = false; c.userData.__isOutline = false; } });
    if (mode === "NPR") applyNpr(ow, { ...NPR_PRESET, steps }, { width: 0.022 });
  }
  hud.set({ mode, steps });
}

// ---------- 相机拖动 ----------
let dragging = false, lastX = 0, camAngle = 0;
window.addEventListener("mousedown", (e) => { dragging = true; lastX = e.clientX; });
window.addEventListener("mouseup", () => { dragging = false; });
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  camAngle += (e.clientX - lastX) * 0.006;
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

  updateMoveInput();

  const active = squad.active;

  if (!frozen) {
    // 活跃角色移动
    active.move.step({ move: moveInput, jump: keysDown.has(" "), dodge: dodgeRequested }, dt);
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
        applyDamage(dmg, hit.finisher ? "ultimate" : hit.shake, hit.gridGain);
        battle.comboCount = combo.comboCount;
        // 用本角色的冲击帧参数生成特效
        impactFx.hit(
          new THREE.Vector3(opponentGroup.position.x, 0, opponentGroup.position.z),
          hit.finisher ? "ultimate" : hit.shake
        );
      }

      // 场景交互：攻击打到箱子（用本角色判定框）
      const crates = props.hitTest(opponentGroup.position, hitRange + 0.5);
      for (const c of crates) {
        props.destroy(c);
        spawnParticles(c.position, "light");
      }
    }

    // 面向对手
    // 3/4 侧身朝向（面向对手但偏向相机，避免背对）
    active.move.faceToward(opponentGroup.position, camera.position);
    opponentMove.faceToward(active.group.position, camera.position);
  }

  // 战斗结束判定（不限时，只按对手 HP）
  if (inBattle && battle.phase === "playing" && !frozen) {
    if (opponent.hp <= 0) endBattle();
  }

  // 动画
  active.anim.step(rawDt);
  opponentAnim.step(rawDt);

  // 假阴影跟随
  updateShadowBlob(playerShadow, active.group.position, active.scale ?? 1);
  updateShadowBlob(opponentShadow, opponentGroup.position, 1.2);

  // 队伍/交互推进
  squad.step(dt);
  props.step(dt);

  // 相机
  cinematic.step(rawDt, active.group.position);

  // 打击特效（冲击波/速度线/光效粒子）
  impactFx.update(rawDt);
  // 命中反馈（白闪衰减）
  hitFeedback.update(rawDt);

  // HUD（仅战斗时更新；不限时，只显示已用时间）
  if (inBattle) {
    battleStats.elapsed = (battleStats.elapsed ?? 0) + rawDt;
    hud.set({
      elapsed: battleStats.elapsed,
      hp: active.hp,
      oppHp: (opponent.hp / opponent.maxHp) * 100,
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
  startBattle, endBattle, screens, audio, makePortrait,
};

tick();
