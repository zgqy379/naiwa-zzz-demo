/**
 * 弹反/招架系统 —— 绝区零式博弈核心。
 *
 * 设计：
 *  - 对手攻击前有一瞬间「闪光预警」（可弹反窗口）
 *  - 玩家在窗口内按 Shift（闪避键）→ 触发弹反
 *  - 弹反成功：对手失衡 + 大硬直 + 玩家无伤 + 奖励能量
 *  - 弹反失败/未按：正常受击
 *  - 连续弹反有加成（鼓励博弈）
 *
 * 数值集中在本文件。
 */
import { ACTION } from "./animation.mjs";

/** 弹反参数 */
export const COUNTER_TUNING = {
  windowS: 0.25,        // 弹反窗口（秒）
  punishS: 1.2,         // 弹反成功后对手硬直
  punishDamage: 15,     // 弹反惩罚伤害
  gridGain: 2,          // 弹反失衡增益
  perfectWindowS: 0.1,  // 完美弹反窗口（更早按）
  perfectMul: 1.5,      // 完美弹反伤害倍率
  comboBonus: 0.3,      // 连续弹反加成（每次 +30%）
};

export class CounterSystem {
  constructor() {
    this.state = "idle";     // idle | warning | success | fail
    this.windowT = 0;        // 剩余窗口
    this.perfectT = 0;       // 完美窗口剩余
    this.punishT = 0;        // 惩罚硬直剩余
    this.consecutive = 0;    // 连续弹反数
    this.totalCounters = 0;  // 总弹反数
    this.lastResult = null;  // 最近结果（供 UI/运镜）
    this.parryable = true;   // 阶段 F：当前预警是否可弹反（false=红光攻击，只能闪避）
  }

  /**
   * 对手即将攻击：开启弹反窗口。
   * @param {boolean} parryable 是否可弹反（阶段 F：false=红光不可弹反攻击）
   * @returns {boolean} 是否成功开启
   */
  openWindow(parryable = true) {
    if (this.state === "warning") return false;
    this.state = "warning";
    this.parryable = parryable;
    this.windowT = COUNTER_TUNING.windowS;
    this.perfectT = COUNTER_TUNING.perfectWindowS;
    return true;
  }

  /**
   * 玩家尝试弹反。
   * @returns {object|null} { perfect, damage, gridGain }
   */
  tryCounter() {
    if (this.state !== "warning") return null;
    const perfect = this.perfectT > 0;
    const mul = perfect ? COUNTER_TUNING.perfectMul : 1;
    const comboMul = 1 + this.consecutive * COUNTER_TUNING.comboBonus;

    this.consecutive++;
    this.totalCounters++;
    this.state = "success";
    this.punishT = COUNTER_TUNING.punishS * (perfect ? 1.3 : 1);
    this.windowT = 0;

    const result = {
      perfect,
      damage: Math.round(COUNTER_TUNING.punishDamage * mul * comboMul),
      gridGain: COUNTER_TUNING.gridGain,
      punishS: this.punishT,
      consecutive: this.consecutive,
    };
    this.lastResult = result;
    return result;
  }

  /** 窗口超时未弹反 → 失败 */
  expire() {
    if (this.state !== "warning") return null;
    this.state = "fail";
    this.consecutive = 0;
    this.windowT = 0;
    const r = { failed: true };
    this.lastResult = r;
    return r;
  }

  /** 每帧推进 */
  step(dt) {
    if (this.state === "warning") {
      this.windowT -= dt;
      this.perfectT = Math.max(0, this.perfectT - dt);
      if (this.windowT <= 0) this.expire();
    } else if (this.state === "success") {
      this.punishT = Math.max(0, this.punishT - dt);
      if (this.punishT <= 0) this.state = "idle";
    } else {
      this.state = "idle";
    }
  }

  get isWarning() { return this.state === "warning"; }
  get isPunishing() { return this.state === "success" && this.punishT > 0; }
  get windowProgress() {
    return this.state === "warning" ? this.windowT / COUNTER_TUNING.windowS : 0;
  }
}
