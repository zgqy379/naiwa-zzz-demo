/**
 * 支援系统 —— 绝区零式「防御花资源、进攻回收资源」的经济闸门。
 *
 * 机制依据 docs/绝区零研究/01-战斗系统机制.md §二（Game8 全文，置信度[高]）：
 *  - 支援点上限 3、开战默认满 3
 *  - 招架支援（弹反）成功消耗 1 点；无点时强行闪避 → 自动降级为普通极限闪避
 *  - 回复：连携技 +1（阶段 C 接入）、喧响终结技回满（阶段 D 接入）
 *
 * 数值集中在本文件（唯一调参入口）。
 */

/** 支援参数 */
export const ASSIST_TUNING = {
  max: 3,            // 支援点上限（ZZZ 3 格）
  start: 3,          // 开战默认满
  dodgeCounterS: 1.5, // 极限闪避 → 闪避反击资格窗（秒）
};

export class AssistSystem {
  constructor() {
    this.points = ASSIST_TUNING.start;
    this.dodgeCounterT = 0;  // 闪避反击资格剩余（>0 期间攻击输入升级为闪避反击）
  }

  /** 开战重置（满 3） */
  reset() {
    this.points = ASSIST_TUNING.start;
    this.dodgeCounterT = 0;
  }

  /** 消耗 n 点（不足则失败，调用方回退路径） */
  spend(n = 1) {
    if (this.points < n) return false;
    this.points -= n;
    return true;
  }

  /** 回复 n 点（不超上限） */
  refill(n = 1) {
    this.points = Math.min(ASSIST_TUNING.max, this.points + n);
  }

  /** 回满 */
  full() {
    this.points = ASSIST_TUNING.max;
  }

  /** 每逻辑帧推进（闪避反击资格窗） */
  step(dt) {
    this.dodgeCounterT = Math.max(0, this.dodgeCounterT - dt);
  }

  /** 是否可弹反（有支援点） */
  get canParry() { return this.points > 0; }

  /** 闪避反击资格期内 */
  get canDodgeCounter() { return this.dodgeCounterT > 0; }
}
