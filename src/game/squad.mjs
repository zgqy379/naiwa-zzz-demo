/**
 * 队伍系统 —— 绝区零式多角色轮换。
 *
 * 设计：
 *  - 3 人队伍，每人有独立 HP/能量/特性
 *  - Tab 或 1/2/3 换人（换人触发「换人攻击」）
 *  - 连携：A 角色失衡满 → B 角色连携入场 → C 角色再连携（链式）
 *  - 换人有冷却，连携换人无冷却（奖励）
 *  - 角色特性：主攻/速度/力量（影响伤害/速度/失衡）
 *
 * 数值集中在本文件。
 */

/** 队伍成员定义（对应 3 只 GLB 资产） */
export const SQUAD = [
  {
    id: "laugh",
    name: "奶蛙",
    glb: "/asset/naiwa_laugh_g1_runtime.glb",
    role: "主攻",
    maxHp: 100,
    damageMul: 1.2,
    speedMul: 1.0,
    gridMul: 1.0,
    color: 0xf5c542,
    scale: 1.05,
  },
  {
    id: "naidou",
    name: "奶豆",
    glb: "/asset/naiwa_naidou_runtime.glb",
    role: "速度",
    maxHp: 80,
    damageMul: 0.8,
    speedMul: 1.35,
    gridMul: 1.2,
    color: 0x3a2f4a,
    scale: 0.95,
  },
  {
    id: "dounai",
    name: "豆奶",
    glb: "/asset/naiwa_dounai_runtime.glb",
    role: "力量",
    maxHp: 120,
    damageMul: 1.5,
    speedMul: 0.85,
    gridMul: 1.5,
    color: 0xf3b26a,
    scale: 1.15,
  },
];

export class Squad {
  constructor() {
    this.members = SQUAD.map((def, i) => ({
      ...def,
      index: i,
      hp: def.maxHp,
      alive: true,
      // 运行时对象（由外部注入）
      group: null,
      move: null,
      anim: null,
    }));
    this.activeIndex = 0;
    this.swapCooldown = 0;
    this.chainCount = 0;      // 连携链数
    this.chainWindow = 0;     // 连携窗口剩余
  }

  get active() { return this.members[this.activeIndex]; }

  /** 每帧推进 */
  step(dt) {
    this.swapCooldown = Math.max(0, this.swapCooldown - dt);
    if (this.chainWindow > 0) {
      this.chainWindow -= dt;
      if (this.chainWindow <= 0) this.chainCount = 0;
    }
  }

  /**
   * 换人。
   * @param {number} index 目标角色 index
   * @param {boolean} viaChain 是否连携换人（连携换人无冷却、有奖励）
   * @returns {object|null} { from, to, viaChain }
   */
  swapTo(index, viaChain = false) {
    if (index === this.activeIndex) return null;
    if (!this.members[index]?.alive) return null;
    if (!viaChain && this.swapCooldown > 0) return null;

    const from = this.active;
    this.activeIndex = index;
    const to = this.active;

    if (viaChain) {
      this.chainCount++;
      this.chainWindow = 4.0;
    } else {
      this.swapCooldown = 2.0;
      this.chainCount = 0;
    }
    return { from, to, viaChain };
  }

  /** 下一个存活角色 */
  nextAlive(fromIndex = this.activeIndex) {
    for (let i = 1; i <= this.members.length; i++) {
      const idx = (fromIndex + i) % this.members.length;
      if (this.members[idx].alive) return idx;
    }
    return -1;
  }

  /** 对活跃角色造成伤害 */
  damageActive(amount) {
    const m = this.active;
    m.hp = Math.max(0, m.hp - amount);
    if (m.hp <= 0) m.alive = false;
  }

  /** 对指定角色造成伤害 */
  damageMember(index, amount) {
    const m = this.members[index];
    if (!m) return;
    m.hp = Math.max(0, m.hp - amount);
    if (m.hp <= 0) m.alive = false;
  }

  /** 当前是否处于连携窗口 */
  get canChain() { return this.chainWindow > 0; }
}
