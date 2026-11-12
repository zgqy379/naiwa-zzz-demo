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
    this._fading = null;
    this._fadeLeft = 0;
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

  /**
   * 播放某动作。
   * @param {string} action 内部动作名
   * @param {number} dur 游戏侧动作窗口（秒）——片段按此缩放播放，保证与命中帧对齐
   * @param {object} opts { loop, fade, speed }
   * @returns {boolean} 是否真的用片段播放（false = 调用方回退程序化）
   */
  play(action, dur = null, opts = {}) {
    const clip = this.find(action);
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
      this._fading.stop();
      this._fading = null;
      this._fadeLeft = 0;
    }

    if (prev === a) {
      // 同一片段重播（连段同段再次触发）：直接从头播，不做自融合
      setup();
    } else {
      setup();
      if (prev && prev.isRunning()) {
        prev.crossFadeTo(a, fade, false);
        this._fading = prev;
        this._fadeLeft = fade;
      } else {
        // 旧动作已停（含 clampWhenFinished 停在末帧）：先停干净再淡入
        if (prev) prev.stop();
        a.setEffectiveWeight(0);
        a.fadeIn(fade);
      }
    }
    this.current = a;
    this.currentAction = action;
    return true;
  }

  /** 每帧推进 */
  update(dt) {
    if (this.mixer) this.mixer.update(dt);
    // 融合结束后彻底停掉旧动作，避免 0 权重的动作常驻占用 mixer
    if (this._fading) {
      this._fadeLeft -= dt;
      if (this._fadeLeft <= 0) {
        this._fading.stop();
        this._fading = null;
      }
    }
  }

  /** 当前动作是否已播完（非循环） */
  get finished() {
    return !!(this.current && !this.current.isRunning() && !this.current.isScheduled());
  }
}
