/**
 * 属性异常系统（阶段 E）—— 绝区零式「积蓄 → 异常触发 → 紊乱引爆」。
 *
 * 机制依据 docs/绝区零研究/01-战斗系统机制.md §六（多源交叉验证）：
 *  - 5 属性独立积蓄：各 0-100，2/s 衰减，重复施加阈值 +25 抗性成长（封顶 200）
 *  - 满条触发对应异常状态（强击/灼烧/碎冰/感电/侵蚀）
 *  - 已带异常时施加异类异常 → 紊乱：引爆原异常剩余伤害 + 紊乱段
 *
 * 数值集中在本文件（唯一调参入口）。
 */

/** 五属性元数据（名称 / 异常状态名 / UI 用色） */
export const ATTR = {
  physical: { name: "物理", status: "强击", css: "#e8ecf2" },
  fire: { name: "火", status: "灼烧", css: "#ff8a5a" },
  ice: { name: "冰", status: "碎冰", css: "#8ad4f0" },
  electric: { name: "电", status: "感电", css: "#b98af0" },
  ether: { name: "以太", status: "侵蚀", css: "#f0a8d8" },
};

/** 异常参数 */
export const ANOMALY_TUNING = {
  threshold: 100,     // 积蓄阈值
  decay: 2,           // 每秒衰减
  resistGrowth: 25,   // 触发后阈值成长（抗性）
  resistMax: 200,     // 阈值上限
  buildupPerHit: 10,  // 每次命中积累（×弱点 1.5 由调用方乘）
  statusS: 10,        // 状态持续 10s（ZZZ 各异常均 10s [高]）
  burnTickS: 1,       // 灼烧每 1s 一跳
  burnDmg: 5,         // 灼烧单跳（×施加者 damageMul）
  shockDmg: 4,        // 感电受击追伤（×施加者.dmgMul）
  shockMax: 10,       // 感电最多触发 10 次
  etherVuln: 0.15,    // 侵蚀易伤 +15%
  freezeS: 1.5,       // 碎冰冻结 1.5s
  shatterDmg: 25,     // 碎冰爆发
  shatterDaze: 10,    // 碎冰失衡积累
  assaultDmg: 30,     // 强击瞬发伤害（×施加者 damageMul）
  assaultDaze: 15,    // 强击失衡积累
  assaultStun: 0.8,   // 强击硬直 0.8s
  disorderDmg: 20,    // 紊乱段（×施加者 damageMul）
  weakDmgMul: 1.3,    // 弱点属性命中伤害 ×1.3
  weakDazeMul: 1.5,   // 弱点属性命中失衡积累 ×1.5
};

/**
 * 异常状态系统（hooks 模式：状态机在此，伤害/演出副作用由 main 注入回调）。
 * hooks: {
 *   damage(dmg, label)        直接结算伤害（不走 applyDamage，避免 DoT 触发顿帧/喧响刷屏）
 *   daze(n)                   失衡积累（碎冰/强击附带）
 *   freeze(seconds)           冻结对手（碎冰）
 *   stun(seconds)             硬直对手（强击，语义=冻结但演出不同）
 *   onStatus(attr, name)      状态挂上（UI/横幅）
 *   onDisorder(detonate, bonus) 紊乱引爆
 *   word(text)                屏幕弹出词
 * }
 */
export class AnomalySystem {
  constructor(hooks) {
    this.h = hooks;
    this.reset();
  }

  reset() {
    this.buildup = { physical: 0, fire: 0, ice: 0, electric: 0, ether: 0 };
    this.thresholds = { physical: 100, fire: 100, ice: 100, electric: 100, ether: 100 };
    this.status = null;      // { attr, t, dmgMul, ticksLeft, tickTimer, shockHits }
    this.frozenT = 0;        // 冻结/硬直剩余（碎冰冻结、强击硬直共用此计时）
    this.dmgMul = 1;         // 施加者 damageMul 快照（状态期伤害用）
    this._frozenWasShatter = false;
  }

  /** 每逻辑帧推进：衰减 / DoT / 冻结计时 / 状态到期 */
  step(dt) {
    if (this.frozenT > 0) {
      this.frozenT = Math.max(0, this.frozenT - dt);
      if (this.frozenT === 0 && this._frozenWasShatter) {
        this._frozenWasShatter = false;
        const d = Math.round(ANOMALY_TUNING.shatterDmg * this.dmgMul);
        this.h.damage(d, "碎冰！");
        this.h.daze(ANOMALY_TUNING.shatterDaze);
        this.h.word("碎冰！");
      }
    }
    for (const k of Object.keys(this.buildup)) {
      if (this.buildup[k] > 0) this.buildup[k] = Math.max(0, this.buildup[k] - ANOMALY_TUNING.decay * dt);
    }
    if (this.status) {
      this.status.t -= dt;
      const s = this.status;
      if (s.attr === "fire" && s.ticksLeft > 0) {
        s.tickTimer -= dt;
        if (s.tickTimer <= 0) {
          s.tickTimer = ANOMALY_TUNING.burnTickS;
          s.ticksLeft--;
          this.h.damage(Math.round(ANOMALY_TUNING.burnDmg * this.dmgMul), "灼烧");
        }
      }
      if (s.t <= 0) this.status = null;
    }
  }

  /** 冻结/硬直中（对手 AI 定身） */
  get isFrozen() { return this.frozenT > 0; }

  /** 当前状态属性（UI/积分用） */
  get statusAttr() { return this.status ? this.status.attr : null; }

  /**
   * 命中积累。满条 → 触发异常；异类互挂 → 紊乱。
   * @param {string} attr 属性 key（physical|fire|ice|electric|ether）
   * @param {number} amount 积累量（弱点 ×1.5 已由调用方乘好）
   * @param {number} applierDmgMul 施加者 damageMul（状态期伤害快照）
   * @returns {{triggered?:string, disorder?:boolean}|null}
   */
  gain(attr, amount, applierDmgMul = 1) {
    if (!Object.prototype.hasOwnProperty.call(this.buildup, attr)) return null;
    this.dmgMul = applierDmgMul;
    this.buildup[attr] = (this.buildup[attr] || 0) + amount;
    if (this.buildup[attr] < this.thresholds[attr]) return null;
    this.buildup[attr] = 0;
    this.thresholds[attr] = Math.min(ANOMALY_TUNING.resistMax, this.thresholds[attr] + ANOMALY_TUNING.resistGrowth);
    const prev = this.status;
    const meta = ATTR[attr];

    // 紊乱分支：已带异类异常 → 引爆原异常剩余伤害 + 紊乱段（ZZZ 定性结构）
    if (prev && prev.attr !== attr) {
      let detonate = 0;
      if (prev.attr === "fire") detonate = prev.ticksLeft * ANOMALY_TUNING.burnDmg * prev.dmgMul;
      else if (prev.attr === "electric") {
        detonate = (ANOMALY_TUNING.shockMax - prev.shockHits) * ANOMALY_TUNING.shockDmg * prev.dmgMul;
      }
      detonate = Math.round(detonate) + Math.round(ANOMALY_TUNING.disorderDmg * this.dmgMul);
      this.status = null;
      this._startStatus(attr);
      this.h.onDisorder(detonate, ATTR[attr].status);
      return { triggered: attr, disorder: true };
    }

    this._startStatus(attr);
    this.h.onStatus(attr, meta.status);
    return { triggered: attr, disorder: false };
  }

  /** 挂状态：电/以太=持续窗口，火=DoT，物理=瞬发硬直，冰=冻结→碎冰 */
  _startStatus(attr) {
    const T = ANOMALY_TUNING;
    this.status = {
      attr,
      t: T.statusS,
      dmgMul: this.dmgMul,
      ticksLeft: attr === "fire" ? T.statusS / T.burnTickS : 0,
      tickTimer: 0,
      shockHits: 0,
    };
    if (attr === "physical") {
      this.h.damage(Math.round(T.assaultDmg * this.dmgMul), "强击");
      this.h.daze(T.assaultDaze);
      this.frozenT = Math.max(this.frozenT, T.assaultStun);   // 硬直（内部计时，main 读 isFrozen 定身 AI）
      this.h.word("强击！");
    } else if (attr === "ice") {
      this.frozenT = Math.max(this.frozenT, T.freezeS);        // 冻结（内部计时）
      this._frozenWasShatter = true;
      this.h.word("冻结！");
    } else if (attr === "fire") {
      this.h.word("灼烧！");
    } else if (attr === "electric") {
      this.h.word("感电！");
    } else {
      this.h.word("侵蚀！");
    }
  }

  /** 玩家命中时调用（感电追伤结算点）。返回追伤数值（无感电时 0） */
  onPlayerHit() {
    if (!this.status || this.status.attr !== "electric") return 0;
    const s = this.status;
    if (s.shockHits >= ANOMALY_TUNING.shockMax) return 0;
    s.shockHits++;
    return Math.round(ANOMALY_TUNING.shockDmg * s.dmgMul);
  }

  /** 侵蚀易伤乘区（computeHitDamage 消费）：侵蚀状态下受伤 +15% */
  get etherVulnMul() {
    return this.status && this.status.attr === "ether" && this.status.t > 0
      ? 1 + ANOMALY_TUNING.etherVuln
      : 1;
  }
}
