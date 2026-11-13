/**
 * 官方动作片段驱动 —— 用 Lux3D「自动绑骨 + 动画重定向」产出的**真实骨骼动画**驱动角色。
 *
 * 背景（本轮重做的根因）：此前 16 只角色 GLB 全部 `skins=0 / animations=0`，
 * 所谓「6 种状态动画」是 src/game/animation.mjs 里对根节点做位移/旋转/挤压拉伸的**程序化伪造**，
 * 肢体完全不动 —— 画面上就是「两个静态模型碰到一起」。
 *
 * 现在：官方工具给模型自动绑骨（52 关节）并把官方动作库（85 个片段）重定向到该骨架，
 * 产出带 skin + 多段 animation 的 GLB；本模块用 AnimationMixer 播这些片段。
 * 片段按**动作名**查找（Idle_Loop / Sword_Regular_A / Roll …），查不到就回退程序化层，
 * 因此老资产（无骨骼）仍可正常显示。
 *
 * 播放速率对齐：把片段时长**缩放到游戏既有的动作窗口**（main.mjs 传入的 dur），
 * 保证「动作观感」升级的同时**战斗数值与命中帧完全不变**（本轮不动平衡）。
 */
import * as THREE from "three";
import { ACTION } from "./animation.mjs";

/** 内部动作 → 官方片段候选（按优先级取第一个存在的） */
export const ACTION_CLIP = {
  [ACTION.IDLE]: ["Idle_Loop", "Idle_No_Loop"],
  [ACTION.MOVE]: ["Walk_Loop", "Jog_Fwd_Loop"],
  [ACTION.ATTACK_1]: ["Sword_Regular_A", "Punch_Jab", "Melee_Hook"],
  [ACTION.ATTACK_2]: ["Sword_Regular_B", "Punch_Cross", "Shield_OneShot"],
  [ACTION.ATTACK_3]: ["Sword_Regular_C", "Sword_Regular_Combo"],
  [ACTION.FINISHER]: ["Sword_Heavy_Combo", "Spell_Simple_Shoot", "Sword_Regular_Combo"],
  [ACTION.HIT]: ["Hit_Chest", "Hit_Knockback"],
  [ACTION.DODGE]: ["Roll", "Slide_Loop"],
  [ACTION.STAGGER]: ["Hit_Knockback", "Hit_Chest"],
};

/**
 * 受击方向候选表（2026-11-14 受击方向化，路线图①）：
 * 打击方向 = 攻击者→受击者的水平向量在**相机右向量**上的屏幕分量（main.mjs _hitScreenX 计算），
 * |x| ≥ HIT_VARIANT_SCREEN_T → 左 / 右侧向（大踉跄档），否则正面（挺胸后仰档）。
 * 候选按优先级取第一个**实际存在**的片段；方向候选全缺时回退 ACTION_CLIP 原候选链。
 * 注意：实测 16 只 runtime GLB 与共享库的动画清单均只有 Hit_Chest（Hit_Knockback 未随
 * 官方 10 段库重定向），因此当前三向都落到 Hit_Chest，方向差异由 main.mjs 的侧向反应
 * 偏航呈现；本表数据驱动，日后库里补了方向片段即自动生效，无需改代码。
 */
export const HIT_VARIANT_SCREEN_T = 0.66;
export const HIT_DIRECTION_CLIP = {
  front: ["Hit_Chest", "Hit_Knockback"],
  left: ["Hit_Knockback", "Hit_Chest"],
  right: ["Hit_Knockback", "Hit_Chest"],
};

/** 打击方向屏幕分量（-1..1）→ 受击片段方向档名（left / right / front） */
export function hitVariantForScreenX(x) {
  if (x >= HIT_VARIANT_SCREEN_T) return "right";
  if (x <= -HIT_VARIANT_SCREEN_T) return "left";
  return "front";
}

/** 登场 / 收势等演出片段（不参与战斗状态机，由界面层按需播放） */
export const SHOWCASE_CLIP = {
  entrance: ["Sword_Heavy_Combo", "Sword_Regular_Combo", "LayToIdle"],
  recover: ["Sword_Regular_A_Rec", "Sword_Regular_B_Rec", "Melee_Hook_Rec"],
  transition: ["Sitting_Exit", "LayToIdle", "Sitting_Enter"],
};

export class ClipDriver {
  /**
   * @param {object} o
   *  - root: THREE.Object3D（骨骼所在根，mixer 按节点名绑定轨道）
   *  - clips: THREE.AnimationClip[]
   */
  constructor({ root, clips }) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.byName = new Map();
    for (const c of clips || []) {
      // 官方 combined 产出的片段名是 animation_1..N；定版脚本已改名成可读动作名
      this.byName.set(c.name, c);
      const short = c.name.replace(/_Loop$/, "");
      if (!this.byName.has(short)) this.byName.set(short, c);
    }
    this.current = null;
    this.currentAction = null;
    // 交叉融合状态：淡出中的旧动作 + 剩余融合时间，避免 stopAllAction 的硬切
    // （可能是数组：移动混合模式退出时主/次两档一起在融合结束后停掉）
    this._fading = null;
    this._fadeLeft = 0;

    // 移动混合树 lite（2026-11-14，路线图②）：Walk/Jog 双片段齐全时按移动速度
    // setEffectiveWeight 连续插值（研究档案 02 §5 建议第 2 条）；任缺其一时保持
    // 旧的单片段路径（ACTION_CLIP[ACTION.MOVE] 第一候选），零行为差异。
    const _walk = this.byName.get("Walk_Loop");
    const _jog = this.byName.get("Jog_Fwd_Loop");
    this._movePair = _walk && _jog ? [_walk, _jog] : null;
    this._moveOn = false;   // 是否处于移动混合模式
    this._moveA = null;     // 主档 action（Walk_Loop）
    this._moveB = null;     // 次档 action（Jog_Fwd_Loop）
    this._moveW = 0;        // 主权重斜坡 0→1（入场融合期间与旧动作 fadeOut 互补，总权重 ≈1）
    this._moveT = 0;        // 请求混合值 0=Walk 1=Jog（外部每帧 setMoveBlend 按速度写入）
    this._moveFade = 0.12;  // 入场融合时长
  }

  /** 该动作是否有可用片段 */
  has(action) {
    const names = ACTION_CLIP[action];
    if (!names) return false;
    return names.some((n) => this.byName.has(n));
  }

  /** 片段时长（秒） */
  durationOf(action) {
    const clip = this.find(action);
    return clip ? clip.duration : 0;
  }

  find(action) {
    const names = ACTION_CLIP[action];
    if (!names) return null;
    for (const n of names) {
      const c = this.byName.get(n);
      if (c) return c;
    }
    return null;
  }

  /** 候选名列表里第一个实际存在的片段（无则 null）——方向候选表用 */
  _firstExisting(names) {
    for (const n of names) {
      const c = this.byName.get(n);
      if (c) return c;
    }
    return null;
  }

  /**
   * 播放某动作。
   * @param {string} action 内部动作名
   * @param {number} dur 游戏侧动作窗口（秒）——片段按此缩放播放，保证与命中帧对齐
   * @param {object} opts { loop, fade, speed, variant }  variant: 受击方向档
   *   （left/right/front，2026-11-14 受击方向化）——优先从 HIT_DIRECTION_CLIP 选片段，
   *   方向候选全缺时回退 ACTION_CLIP 原候选链；其余动作忽略 variant。
   * @returns {boolean} 是否真的用片段播放（false = 调用方回退程序化）
   */
  play(action, dur = null, opts = {}) {
    // 移动混合树 lite：MOVE 且 Walk/Jog 双片段齐全 → 走按速度连续混合的专用路径
    if (action === ACTION.MOVE && this._movePair) return this._playMoveBlend(opts);
    // 从移动混合模式退出（改播攻击/受击/待机等）：次档（Jog）不能以残余权重常驻
    const leavingMove = this._moveOn;
    if (leavingMove) this._moveOn = false;
    const variantNames = opts.variant && HIT_DIRECTION_CLIP[opts.variant];
    const clip = (variantNames && this._firstExisting(variantNames)) || this.find(action);
    if (!clip) return false;
    const loop = opts.loop ?? (action === ACTION.IDLE || action === ACTION.MOVE);
    // 片段比动作窗口长就放慢、比短就加快 → 视觉与数值对齐
    let ts = 1;
    if (dur && dur > 0.01 && clip.duration > 0.01) ts = clip.duration / dur;
    if (opts.speed) ts *= opts.speed;
    // 交叉融合（2026-11-12）：原来 stopAllAction() + 60ms 淡入是硬切，
    // 攻击→受击→待机之间会看到瞬移般的姿态跳变。改为旧动作淡出、新动作淡入，
    // 融合结束后再停旧动作；片段时长缩放与命中帧不变。
    const fade = Math.max(0.02, opts.fade ?? 0.1);
    const a = this.mixer.clipAction(clip);
    const prev = this.current;

    const setup = () => {
      a.reset();
      a.enabled = true;
      a.setEffectiveTimeScale(ts);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      a.clampWhenFinished = !loop;
      a.setEffectiveWeight(1);
      a.play();
    };

    // 上一轮还在淡出的动作先收干净，避免多层权重叠加
    if (this._fading) {
      const stale = Array.isArray(this._fading) ? this._fading : [this._fading];
      for (const f of stale) f.stop();
      this._fading = null;
      this._fadeLeft = 0;
    }

    // 从移动混合退出：主档（prev）走常规交叉融合，次档（Jog）随融合淡出或立即停
    let moveExitB = null;
    if (leavingMove) {
      moveExitB = this._moveB;
      this._moveA = null;
      this._moveB = null;
    }

    if (prev === a) {
      // 同一片段重播（连段同段再次触发）：直接从头播，不做自融合
      setup();
      if (moveExitB) moveExitB.stop();
    } else {
      setup();
      if (prev && prev.isRunning()) {
        prev.crossFadeTo(a, fade, false);
        if (moveExitB) moveExitB.fadeOut(fade);
        this._fading = moveExitB ? [prev, moveExitB] : prev;
        this._fadeLeft = fade;
      } else {
        // 旧动作已停（含 clampWhenFinished 停在末帧）：先停干净再淡入
        if (prev) prev.stop();
        if (moveExitB) moveExitB.stop();
        a.setEffectiveWeight(0);
        a.fadeIn(fade);
      }
    }
    this.current = a;
    this.currentAction = action;
    return true;
  }

  /**
   * 移动混合模式（2026-11-14 路线图②）：Walk/Jog 两片段同播，
   * 权重由 setMoveBlend 按移动速度连续插值（0=纯 Walk，1=纯 Jog）。
   * 入场用主权重斜坡（_moveW 0→1）替代 crossFadeTo，与旧动作的 fadeOut 互补，
   * 融合期间两档总权重 + 旧动作权重 ≈ 1，不出现姿态叠加过冲。
   */
  _playMoveBlend(opts) {
    if (this._moveOn) return true;   // 已在混合模式：权重由 update/setMoveBlend 每帧管理
    const [cA, cB] = this._movePair;
    const fade = Math.max(0.02, opts.fade ?? 0.12);
    const aA = this.mixer.clipAction(cA);
    const aB = this.mixer.clipAction(cB);
    const prev = this.current;
    const setup = (a) => {
      a.reset();
      a.enabled = true;
      a.setEffectiveTimeScale(1);   // 循环步态片段不缩放到动作窗口（与旧 MOVE 路径 dur=null 一致）
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = false;
      a.setEffectiveWeight(0);
      a.play();
    };
    // 上一轮还在淡出的动作先收干净（含移动混合退出时的两档数组）
    if (this._fading) {
      const stale = Array.isArray(this._fading) ? this._fading : [this._fading];
      for (const f of stale) f.stop();
      this._fading = null;
      this._fadeLeft = 0;
    }
    setup(aA);
    setup(aB);
    this._moveOn = true;
    this._moveA = aA;
    this._moveB = aB;
    this._moveW = 0;
    this._moveFade = fade;
    if (prev && prev !== aA && prev !== aB && prev.isRunning()) {
      prev.fadeOut(fade);
      this._fading = prev;
      this._fadeLeft = fade;
    } else if (prev && prev !== aA && prev !== aB) {
      prev.stop();
    }
    this.current = aA;
    this.currentAction = ACTION.MOVE;
    return true;
  }

  /**
   * 设置移动混合值（2026-11-14 路线图②）：0=纯 Walk，1=纯 Jog。
   * 调用方按水平移动速度归一化（animation.mjs step：vel 长度 / walkSpeed）每帧写入；
   * 不在移动混合模式（攻击/受击/闪避等接管中）时返回 false 忽略。
   */
  setMoveBlend(t) {
    if (!this._movePair || !this._moveOn) return false;
    this._moveT = THREE.MathUtils.clamp(t, 0, 1);
    return true;
  }

  /** 每帧推进 */
  update(dt) {
    if (this.mixer) this.mixer.update(dt);
    // 移动混合：主权重斜坡上升 + 按速度混合值插值两档权重
    // （顿帧 animDt=0 时斜坡自然暂停，与全场定格语义一致）
    if (this._moveOn && this._moveA && this._moveB) {
      this._moveW = Math.min(1, this._moveW + dt / Math.max(0.016, this._moveFade));
      this._moveA.setEffectiveWeight(this._moveW * (1 - this._moveT));
      this._moveB.setEffectiveWeight(this._moveW * this._moveT);
    }
    // 融合结束后彻底停掉旧动作，避免 0 权重的动作常驻占用 mixer
    // （可能是数组：移动混合退出时主/次两档一起收）
    if (this._fading) {
      const list = Array.isArray(this._fading) ? this._fading : [this._fading];
      this._fadeLeft -= dt;
      if (this._fadeLeft <= 0) {
        for (const f of list) f.stop();
        this._fading = null;
        this._fadeLeft = 0;
      }
    }
  }

  /** 当前动作是否已播完（非循环） */
  get finished() {
    return !!(this.current && !this.current.isRunning() && !this.current.isScheduled());
  }
}
