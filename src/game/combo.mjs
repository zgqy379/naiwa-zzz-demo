/**
 * 连段系统 —— 绝区零式动作核心。
 *
 * 设计：
 *  - 三段连段：轻击 → 重击 → 终结（每段有独立的动作/判定/伤害）
 *  - 输入缓冲：攻击键按下时若处于连段窗口，自动接续下一段
 *  - 连段窗口：上一段动作的后半段开放输入
 *  - 取消：闪避可取消任意段（绝区零式博弈）
 *
 * 数值集中在本文件（演出参数），不散落。
 */
import { ACTION } from "./animation.mjs";

/** 连段段定义 */
const STAGES = [
  {
    action: ACTION.ATTACK_1,
    name: "轻击",
    hitAt: 0.45,        // 命中时机（动作进度 0~1）
    range: 2.2,
    damage: 6,
    hitstopF: 2,
    shake: "light",
    lunge: 0.6,
    gridGain: 1,
  },
  {
    action: ACTION.ATTACK_2,
    name: "重击",
    hitAt: 0.5,
    range: 2.4,
    damage: 12,
    hitstopF: 3,
    shake: "medium",
    lunge: 0.9,
    gridGain: 1,
  },
  {
    action: ACTION.ATTACK_3,
    name: "终结",
    hitAt: 0.55,
    range: 2.8,
    damage: 24,
    hitstopF: 4,
    shake: "heavy",
    lunge: 1.4,
    gridGain: 3,
  },
];

export class ComboSystem {
  constructor() {
    this.stageIndex = -1;      // 当前段（-1 = 未在连段）
    this.stageT = 0;           // 当前段进度（秒）
    this.stageDur = 0;         // 当前段时长
    this.hasHit = false;       // 当前段是否已命中
    this.bufferAttack = false; // 输入缓冲
    this.bufferT = 0;          // 缓冲剩余
    this.comboCount = 0;       // 连段数（展示用）
  }

  /** 每帧推进 */
  step(dt) {
    this.bufferT = Math.max(0, this.bufferT - dt);
    if (this.bufferT <= 0) this.bufferAttack = false;

    if (this.stageIndex < 0) return null;

    this.stageT += dt;
    const stage = STAGES[this.stageIndex];
    const progress = this.stageT / this.stageDur;

    // 命中判定
    let hitEvent = null;
    if (!this.hasHit && progress >= stage.hitAt) {
      this.hasHit = true;
      hitEvent = {
        stage: this.stageIndex,
        name: stage.name,
        damage: stage.damage,
        hitstopF: stage.hitstopF,
        shake: stage.shake,
        range: stage.range,
        gridGain: stage.gridGain,
        finisher: this.stageIndex === STAGES.length - 1,
      };
    }

    // 段结束
    if (progress >= 1) {
      // 有缓冲 → 接续下一段
      if (this.bufferAttack && this.stageIndex < STAGES.length - 1) {
        this._startStage(this.stageIndex + 1);
      } else {
        this.stageIndex = -1;
      }
    }

    return hitEvent;
  }

  /** 玩家按下攻击键 */
  onAttack() {
    // 修：缓冲窗口改为「当前段时长 × 0.6」（原 0.35s 比段时长还长，可按住无脑连段）
    const curDur = this.stageIndex >= 0 ? this.stageDur : 0.3;
    this.bufferAttack = true;
    this.bufferT = curDur * 0.6;

    // 未在连段 → 起手
    if (this.stageIndex < 0) {
      this._startStage(0);
      this.comboCount = 1;
      return { started: true, stage: 0 };
    }
    // 在连段中 → 标记缓冲（由 step 接续）
    return { started: false, buffered: true };
  }

  _startStage(index) {
    this.stageIndex = index;
    this.stageT = 0;
    const stage = STAGES[index];
    // 「换壳即换招」：段时长由角色专属连段节奏决定
    const timing = this.currentMove?.comboTiming ?? [0.26, 0.30, 0.36];
    this.stageDur = timing[index] ?? 0.3;
    this.hasHit = false;
  }

  /** 设置当前角色的招式（供连段节奏/判定使用） */
  setMove(move) {
    this.currentMove = move;
  }

  /** 闪避取消 */
  cancel() {
    this.stageIndex = -1;
    this.comboCount = 0;
    this.currentMove = null;   // 修：清 currentMove，避免换壳后用错角色参数
  }

  get isInCombo() { return this.stageIndex >= 0; }
  get currentStage() { return this.stageIndex >= 0 ? STAGES[this.stageIndex] : null; }
  get stageProgress() {
    return this.stageIndex >= 0 ? this.stageT / this.stageDur : 0;
  }
  get stageCount() { return STAGES.length; }
}

export { STAGES };
