/**
 * 队伍系统 —— 绝区零式多角色轮换（16 只奶蛙家族）。
 *
 * 设计：
 *  - 16 人队伍（主仓 SHELLS 16 条逐条对齐），每人有独立 HP/能量/特性
 *  - Tab / Q / E 循环换人，1–9 / 0 直选（换人触发「换人攻击」）
 *  - 连携：A 角色失衡满 → B 角色连携入场 → C 角色再连携（链式）
 *  - 换人有冷却，连携换人无冷却（奖励）
 *  - 角色特性：主攻/速度/力量（影响伤害/速度/失衡）
 *
 * 「换壳即换招」：16 条各是族谱独立角色（GLB 造型本体不同，非换色），
 * 形状差异来自各自 GLB，定位/数值按下方 PROFILE 三档映射。
 *
 * 数值集中在本文件（唯一调参入口 = PROFILE 与 FAMILY 两张表）。
 */

/**
 * 16 只家族底本 —— 与主仓 E:\naiwaling\src\game\constants.mjs 的 SHELLS 逐条对齐。
 * id / name / move / moveTier / color / glb 文件名一律照抄主仓，**不要在本表臆造**；
 * 主仓改口径时先改主仓，再同步本表（本 Demo 只读引用，不回写主仓）。
 */
const FAMILY = [
  { id: "shell_naiwa", name: "奶蛙", move: "笑波", moveTier: "procedural", color: 0xf5c542, glb: "naiwa_laugh_g1_runtime.glb" },
  { id: "shell_naidou", name: "奶豆", move: "滚撞", moveTier: "procedural", color: 0xe0b84f, glb: "naiwa_naidou_runtime.glb" },
  { id: "shell_xiaonaiwa", name: "小奶蛙", move: "分身包围", moveTier: "procedural", color: 0xf8d96b, glb: "naiwa_xiaonaiwa_runtime.glb" },
  { id: "shell_naidan", name: "奶蛋", move: "蛋滚冲击", moveTier: "procedural", color: 0xfff0c2, glb: "naiwa_naidan_runtime.glb" },
  { id: "shell_nashu", name: "奶鼠", move: "钻地突袭", moveTier: "clip", color: 0xcfa878, glb: "naiwa_nashu_runtime.glb" },
  { id: "shell_naigou", name: "奶狗", move: "忠犬飞扑", moveTier: "procedural", color: 0xc98d5a, glb: "naiwa_naigou_runtime.glb" },
  { id: "shell_naifen", name: "奶粉", move: "撒粉迷障", moveTier: "prop", color: 0xf2d8de, glb: "naiwa_naifen_runtime.glb" },
  { id: "shell_naiji", name: "奶鸡", move: "啄击三连", moveTier: "procedural", color: 0xf0e0a8, glb: "naiwa_naiji_runtime.glb" },
  { id: "shell_naimao", name: "奶猫", move: "猫爪挠击", moveTier: "procedural", color: 0xbfc4cc, glb: "naiwa_naimao_runtime.glb" },
  { id: "shell_naishi", name: "奶屎", move: "螺旋重压", moveTier: "prop", color: 0xb08e5e, glb: "naiwa_naishi_runtime.glb" },
  { id: "shell_dounai", name: "豆奶", move: "豆浆喷溅", moveTier: "procedural", color: 0xefe8d8, glb: "naiwa_dounai_runtime.glb" },
  { id: "shell_naitu", name: "奶兔", move: "长耳鞭击", moveTier: "clip", color: 0xf7f1e3, glb: "naiwa_naitu_runtime.glb" },
  { id: "shell_naiyu", name: "奶鱼", move: "尾鳍横扫", moveTier: "clip", color: 0xa8d8ea, glb: "naiwa_naiyu_runtime.glb" },
  { id: "shell_naicha", name: "奶茶", move: "热茶泼洒", moveTier: "prop", color: 0xc68a4e, glb: "naiwa_naicha_runtime.glb" },
  { id: "shell_naiping", name: "奶瓶", move: "摇瓶气泡", moveTier: "prop", color: 0xfdf3e0, glb: "naiwa_naiping_runtime.glb" },
  { id: "shell_xigema", name: "西格玛奶蛙", move: "硬汉铁拳", moveTier: "procedural", color: 0x9c7a3c, glb: "naiwa_xigema_runtime.glb" },
];

/**
 * 定位档位映射（唯一数值调参入口，改这里即改全队手感）。
 *
 * 判定顺序（自上而下，命中即止）：
 *  1) moveTier === "clip"  → 速度：有绑骨行走/游泳 clip 的轻捷角色
 *  2) move === "滚撞"      → 力量：最圆体格的滚球冲撞
 *  3) 其余                 → 主攻：默认平衡档
 * scale 沿用原三档（主攻 1.05 / 速度 0.95 / 力量 1.15），仅影响模型视觉大小。
 */
const PROFILE = {
  speed: { role: "速度", maxHp: 80, damageMul: 0.8, speedMul: 1.35, gridMul: 1.2, scale: 0.95 },
  power: { role: "力量", maxHp: 120, damageMul: 1.5, speedMul: 0.85, gridMul: 1.5, scale: 1.15 },
  main: { role: "主攻", maxHp: 100, damageMul: 1.2, speedMul: 1.0, gridMul: 1.0, scale: 1.05 },
};

/** 按主仓 moveTier / move 选档（顺序敏感：clip 优先于招式名） */
function profileKeyOf(moveTier, move) {
  if (moveTier === "clip") return "speed";
  if (move === "滚撞") return "power";
  return "main";
}

/**
 * 视觉补偿系数（只影响渲染体量，不影响任何数值/判定）。
 *
 * 二轮诊断（docs/evidence/v3-show2-metrics.json）：奶鱼本体屏占比 24.96%，
 * 显著低于其余 5 只（33.12–39.12%）。根因二选一已排除：
 *  - 不是 clip 姿态压低：runtime GLB `skins=0 / animations=0`，全仓库无 AnimationMixer，
 *    `moveTier:"clip"` 只是玩法档位标签；
 *  - 不是 bbox 测量时点错：载入期反推 size.y=0.2083，运行时顶点级世界高 0.94–0.98 一致。
 * 实际原因是「模型本身小」：speed 档 `scale=0.95`（主攻档 1.05，差 ~10%）
 * 叠加薄扁鱼体型（世界 Z 深 0.55，其他 0.87–1.02），在 30° 侧后方机位下投影体量最小。
 *
 * 1.2 的取法：24.96% × 1.2 ≈ 29.95%，落在「28–30%」目标带，
 * 同时仍小于其他角色（33–39%），不会为了凑数把它放大到比队友更大。
 */
const VISUAL_SCALE_OVERRIDE = { shell_naiyu: 1.2 };

// 2026-11-10 族谱像素采样（五路交叉，docs/evidence/tint2-ref-sample-20261110.json）证实：
// 族谱奶猫 #CCB97F / 奶鱼 #C1AE6E / 奶粉 #D7A58C 均为黄系，GLB 贴图 vs 族谱色相差仅 5°/4.7°/10.8°，
// 贴图忠实于设计。此前的"辨识色缺失"系把 config color（饰带色语义）误用为本体判据所致。
// 本机制默认不启用（tintColor 全 null）；如未来需美术调色，目标色必须取族谱采样值。
const COLOR_OVERRIDE = {};

/** 队伍成员定义（16 只奶蛙家族，GLB 位于 public/asset/） */
export const SQUAD = FAMILY.map((shell) => {
  const p = PROFILE[profileKeyOf(shell.moveTier, shell.move)];
  return {
    id: shell.id,
    name: shell.name,
    glb: `./asset/${shell.glb}`,
    role: p.role,
    maxHp: p.maxHp,
    damageMul: p.damageMul,
    speedMul: p.speedMul,
    gridMul: p.gridMul,
    color: shell.color,
    // 展示层重染目标色（默认全 null = 机制不激活；如需启用在 COLOR_OVERRIDE 填
    // 族谱采样值，依据见其注释）。经 npr.mjs USE_TINT_NPR 路径作用于角色 albedo。
    tintColor: COLOR_OVERRIDE[shell.id] ?? null,
    scale: p.scale,
    // 渲染体量补偿（默认 1；仅奶鱼需要，见 VISUAL_SCALE_OVERRIDE 说明）
    visualScale: VISUAL_SCALE_OVERRIDE[shell.id] ?? 1,
    // 换壳即换招：招式名与移动档位随壳走（HUD/演出可按需读取）
    move: shell.move,
    moveTier: shell.moveTier,
  };
});

/** 连携窗口时长（秒）：失衡满时由 openChainWindow() 开启，连携换人后刷新 */
const CHAIN_WINDOW_S = 4.0;

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
    if (!Number.isInteger(index) || index < 0 || index >= this.members.length) return null;
    if (index === this.activeIndex) return null;
    if (!this.members[index]?.alive) return null;
    if (!viaChain && this.swapCooldown > 0) return null;

    const from = this.active;
    this.activeIndex = index;
    const to = this.active;

    if (viaChain) {
      this.chainCount++;
      this.chainWindow = CHAIN_WINDOW_S;
    } else {
      this.swapCooldown = 2.0;
      this.chainCount = 0;
    }
    return { from, to, viaChain };
  }

  /**
   * 打开连携窗口（外部唯一入口）。
   * 修复 GAME-1 死锁：此前 chainWindow 全仓唯一写正值处在 swapTo 的 if(viaChain)
   * 分支内，而 viaChain 唯一来源是 canChain（=chainWindow>0），循环依赖无外部入口，
   * 连携链在正常游玩中不可达。现由 main.mjs applyDamage 失衡满分支调用。
   * 只置窗口；chainCount 仍由 swapTo(viaChain=true) 递增（此处不重复计数），
   * 窗口过期清零沿用 step() 既有逻辑。
   */
  openChainWindow() {
    this.chainWindow = CHAIN_WINDOW_S;
  }

  /** 下一个存活角色（跳过 alive=false；无人存活返回 -1） */
  nextAlive(fromIndex = this.activeIndex) {
    for (let i = 1; i <= this.members.length; i++) {
      const idx = (fromIndex + i) % this.members.length;
      if (this.members[idx].alive) return idx;
    }
    return -1;
  }

  /** 上一个存活角色（Q 键反向循环，语义同 nextAlive） */
  prevAlive(fromIndex = this.activeIndex) {
    const n = this.members.length;
    for (let i = 1; i <= n; i++) {
      const idx = ((fromIndex - i) % n + n) % n;
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