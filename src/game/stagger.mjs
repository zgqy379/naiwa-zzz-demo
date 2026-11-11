/**
 * 失衡系统 —— 绝区零式「攻击 → 黄条 → 眩晕 → 易伤爆发」循环的心脏。
 *
 * 机制依据 docs/绝区零研究/01-战斗系统机制.md §三（Game8 / Prydwen / NGA / 17173 多源交叉验证）：
 *  - 失衡值（Daze）按攻击行为积累，满 100 进入失衡状态（眩晕）：
 *    无法行动、受伤 ×1.5（失衡易伤，ZZZ 常见档 50%）、可触发连携技（阶段 C 接入）
 *  - 失衡结束后阈值成长（ZZZ 失衡恢复/积蓄抗性近似），防止同回合无限眩晕
 *
 * 数值集中在本文件（唯一调参入口）。
 */

/** 失衡参数 */
export const STAGGER_TUNING = {
  max: 100,           // 失衡条上限
  durationS: 6.0,     // 失衡状态持续（ZZZ 精英档 ≈10s，网页三连战节奏压缩）
  vulnMul: 1.5,       // 失衡易伤倍率（ZZZ 档位 25/50/100%，取常见 50% 档）
  resistGrowth: 1.25, // 每次失衡结束后阈值成长（抗性）
  resistMax: 2.0,     // 阈值成长上限（最多 ×2，防后期永远打不满）
  // 失衡积累表（按行为；ZZZ：带重击判定的招式积累更快、招架积累「大量」）
  gains: {
    light: 6,        // 连段轻击（段0）
    medium: 9,       // 连段中击（段1）
    heavy: 16,       // 三段终结（段2）
    charged: 22,     // 蓄力终结
    counter: 18,     // 弹反成功（ZZZ：招架支援积累大量失衡值）
    dodgeCounter: 12, // 闪避反击（阶段 B 接入）
    swap: 9,         // 连携换人入场击
  },
};

export class StaggerSystem {
  constructor() {
    this.value = 0;         // 当前失衡值
    this.threshold = 100;   // 触发阈值（随失衡次数成长）
    this.state = "normal";  // normal | staggered
    this.timer = 0;         // 失衡剩余时间
  }

  /** 回合/开战重置 */
  reset() {
    this.value = 0;
    this.threshold = 100;
    this.state = "normal";
    this.timer = 0;
  }

  /**
   * 积累失衡值（外部不感知状态切换，用 poll isStaggered 的新边沿做演出）。
   * @param {number} amount 行为基础积累（克制/弱点等乘区由调用方先乘好）
   */
  gain(amount) {
    if (amount <= 0 || this.state === "staggered") return;
    this.value += amount;
    if (this.value >= this.threshold) {
      this.value = this.threshold;
      this.state = "staggered";
      this.timer = STAGGER_TUNING.durationS;
    }
  }

  /** 每逻辑帧推进（调用方保证只在战斗运行时调用） */
  step(dt) {
    if (this.state !== "staggered") return;
    this.timer = Math.max(0, this.timer - dt);
    if (this.timer <= 0) {
      this.state = "normal";
      this.value = 0;
      this.threshold = Math.min(
        100 * STAGGER_TUNING.resistMax,
        this.threshold * STAGGER_TUNING.resistGrowth
      );
    }
  }

  /** 是否处于失衡状态 */
  get isStaggered() { return this.state === "staggered"; }

  /** 失衡条进度 0~1（HUD 黄条口径） */
  get pct() { return this.state === "staggered" ? 1 : this.value / this.threshold; }
}
