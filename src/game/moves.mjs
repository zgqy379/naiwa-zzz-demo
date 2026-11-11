/**
 * 招式系统 —— 「换壳即换招」的核心实现。
 *
 * 比赛要求（计划书 §178）：
 *   Lux3D 生成的外壳决定「连携招式、判定框、冲击帧内容」——是玩法变量，不是皮肤。
 *
 * 每只角色有独立的：
 *  1. **动作风格**（attackStyle）：挥击轨迹/节奏/挤压拉伸方式
 *  2. **判定框**（hitbox）：范围/形状/偏移
 *  3. **冲击帧**（impact）：命中特效的颜色/形状/强度
 *  4. **连携演出**（chain）：慢镜时长/镜头推近/粒子数量
 *
 * 数值全部集中在本文件（唯一调参入口）。
 */

/** 动作风格枚举 */
export const ATTACK_STYLE = {
  SLASH: "slash",      // 挥击（横扫）
  THRUST: "thrust",    // 突刺（直冲）
  SLAM: "slam",        // 砸地（下压）
  SPIN: "spin",        // 旋转（环绕）
  PECK: "peck",        // 啄击（点刺）
  LASH: "lash",        // 鞭击（长弧）
};

/** 16 只角色的招式定义（与 FAMILY 表逐条对齐） */
export const MOVES = {
  // 奶蛙 · 笑波：挥击型（平衡）
  shell_naiwa: {
    style: ATTACK_STYLE.SLASH,
    moveName: "笑波",
    hitbox: { range: 2.6, width: 1.6, offset: 0.4 },
    impact: { color: 0xf5c542, shape: "ring", strength: 1.0 },
    chain: { slowmo: 0.45, zoom: 1.0, particles: 12 },
    // 动作参数（传给 ProceduralAnim）
    anim: { windup: 0.25, strike: 0.35, recover: 0.4, lean: 0.5, squash: 0.8 },
    // 连段节奏（三段时长）
    comboTiming: [0.26, 0.30, 0.36],
  },

  // 奶豆 · 滚撞：突刺型（直线冲撞）
  shell_naidou: {
    style: ATTACK_STYLE.THRUST,
    moveName: "滚撞",
    hitbox: { range: 3.0, width: 0.9, offset: 0.8 },
    impact: { color: 0xe0b84f, shape: "line", strength: 1.2 },
    chain: { slowmo: 0.4, zoom: 1.1, particles: 14 },
    anim: { windup: 0.2, strike: 0.3, recover: 0.5, lean: 0.7, squash: 1.0 },
    comboTiming: [0.24, 0.28, 0.34],
  },

  // 小奶蛙 · 分身包围：旋转型（多段）
  shell_xiaonaiwa: {
    style: ATTACK_STYLE.SPIN,
    moveName: "分身包围",
    hitbox: { range: 2.2, width: 2.4, offset: 0.2 },
    impact: { color: 0xf8d96b, shape: "multi", strength: 0.7 },
    chain: { slowmo: 0.35, zoom: 0.9, particles: 20 },
    anim: { windup: 0.15, strike: 0.4, recover: 0.3, lean: 0.2, squash: 0.6 },
    comboTiming: [0.22, 0.24, 0.28],
  },

  // 奶蛋 · 蛋滚冲击：旋转型（高伤）
  shell_naidan: {
    style: ATTACK_STYLE.SPIN,
    moveName: "蛋滚冲击",
    hitbox: { range: 2.8, width: 1.2, offset: 0.6 },
    impact: { color: 0xfff0c2, shape: "ring", strength: 1.4 },
    chain: { slowmo: 0.5, zoom: 1.2, particles: 16 },
    anim: { windup: 0.3, strike: 0.35, recover: 0.45, lean: 0.3, squash: 1.1 },
    comboTiming: [0.3, 0.34, 0.4],
  },

  // 奶鼠 · 钻地突袭：突刺型（快速）
  shell_nashu: {
    style: ATTACK_STYLE.THRUST,
    moveName: "钻地突袭",
    hitbox: { range: 2.4, width: 0.7, offset: 1.0 },
    impact: { color: 0xcfa878, shape: "line", strength: 0.9 },
    chain: { slowmo: 0.3, zoom: 1.0, particles: 10 },
    anim: { windup: 0.15, strike: 0.25, recover: 0.3, lean: 0.8, squash: 0.9 },
    comboTiming: [0.2, 0.24, 0.3],
  },

  // 奶狗 · 忠犬飞扑：砸地型（跳跃下扑）
  shell_naigou: {
    style: ATTACK_STYLE.SLAM,
    moveName: "忠犬飞扑",
    hitbox: { range: 2.6, width: 1.8, offset: 0.5 },
    impact: { color: 0xc98d5a, shape: "ring", strength: 1.3 },
    chain: { slowmo: 0.45, zoom: 1.1, particles: 18 },
    anim: { windup: 0.3, strike: 0.3, recover: 0.5, lean: 0.6, squash: 1.2 },
    comboTiming: [0.28, 0.32, 0.38],
  },

  // 奶粉 · 撒粉迷障：旋转型（范围大）
  shell_naifen: {
    style: ATTACK_STYLE.SPIN,
    moveName: "撒粉迷障",
    hitbox: { range: 3.2, width: 3.0, offset: 0.3 },
    impact: { color: 0xf2d8de, shape: "cloud", strength: 0.6 },
    chain: { slowmo: 0.35, zoom: 0.9, particles: 24 },
    anim: { windup: 0.2, strike: 0.45, recover: 0.35, lean: 0.1, squash: 0.5 },
    comboTiming: [0.24, 0.28, 0.32],
  },

  // 奶鸡 · 啄击三连：啄击型（快速多段）
  shell_naiji: {
    style: ATTACK_STYLE.PECK,
    moveName: "啄击三连",
    hitbox: { range: 2.2, width: 0.5, offset: 0.5 },
    impact: { color: 0xf0e0a8, shape: "point", strength: 0.8 },
    chain: { slowmo: 0.25, zoom: 0.95, particles: 8 },
    anim: { windup: 0.1, strike: 0.2, recover: 0.15, lean: 0.9, squash: 0.7 },
    comboTiming: [0.18, 0.2, 0.24],
  },

  // 奶猫 · 猫爪挠击：挥击型（多段快）
  shell_naimao: {
    style: ATTACK_STYLE.SLASH,
    moveName: "猫爪挠击",
    hitbox: { range: 2.4, width: 1.4, offset: 0.3 },
    impact: { color: 0xbfc4cc, shape: "claw", strength: 0.9 },
    chain: { slowmo: 0.3, zoom: 1.0, particles: 12 },
    anim: { windup: 0.12, strike: 0.28, recover: 0.25, lean: 0.4, squash: 0.8 },
    comboTiming: [0.2, 0.24, 0.28],
  },

  // 奶屎 · 螺旋重压：砸地型（高伤慢）
  shell_naishi: {
    style: ATTACK_STYLE.SLAM,
    moveName: "螺旋重压",
    hitbox: { range: 2.8, width: 2.0, offset: 0.4 },
    impact: { color: 0xb08e5e, shape: "ring", strength: 1.6 },
    chain: { slowmo: 0.55, zoom: 1.25, particles: 20 },
    anim: { windup: 0.4, strike: 0.3, recover: 0.6, lean: 0.7, squash: 1.3 },
    comboTiming: [0.34, 0.38, 0.44],
  },

  // 豆奶 · 豆浆喷溅：突刺型（中速）
  shell_dounai: {
    style: ATTACK_STYLE.THRUST,
    moveName: "豆浆喷溅",
    hitbox: { range: 2.8, width: 1.0, offset: 0.6 },
    impact: { color: 0xefe8d8, shape: "line", strength: 1.1 },
    chain: { slowmo: 0.4, zoom: 1.05, particles: 14 },
    anim: { windup: 0.22, strike: 0.3, recover: 0.4, lean: 0.6, squash: 1.0 },
    comboTiming: [0.26, 0.3, 0.36],
  },

  // 奶兔 · 长耳鞭击：鞭击型（长弧）
  shell_naitu: {
    style: ATTACK_STYLE.LASH,
    moveName: "长耳鞭击",
    hitbox: { range: 3.4, width: 1.2, offset: 0.5 },
    impact: { color: 0xf7f1e3, shape: "arc", strength: 1.0 },
    chain: { slowmo: 0.4, zoom: 1.1, particles: 16 },
    anim: { windup: 0.28, strike: 0.32, recover: 0.4, lean: 0.3, squash: 0.9 },
    comboTiming: [0.28, 0.32, 0.38],
  },

  // 奶鱼 · 尾鳍横扫：挥击型（宽）
  shell_naiyu: {
    style: ATTACK_STYLE.SLASH,
    moveName: "尾鳍横扫",
    hitbox: { range: 2.8, width: 2.2, offset: 0.4 },
    impact: { color: 0xa8d8ea, shape: "ring", strength: 1.0 },
    chain: { slowmo: 0.4, zoom: 1.05, particles: 14 },
    anim: { windup: 0.25, strike: 0.35, recover: 0.4, lean: 0.5, squash: 0.9 },
    comboTiming: [0.26, 0.3, 0.36],
  },

  // 奶茶 · 热茶泼洒：砸地型（中）
  shell_naicha: {
    style: ATTACK_STYLE.SLAM,
    moveName: "热茶泼洒",
    hitbox: { range: 2.6, width: 1.6, offset: 0.5 },
    impact: { color: 0xc68a4e, shape: "ring", strength: 1.1 },
    chain: { slowmo: 0.4, zoom: 1.05, particles: 14 },
    anim: { windup: 0.26, strike: 0.32, recover: 0.42, lean: 0.55, squash: 1.05 },
    comboTiming: [0.26, 0.3, 0.36],
  },

  // 奶瓶 · 摇瓶气泡：旋转型（多段）
  shell_naiping: {
    style: ATTACK_STYLE.SPIN,
    moveName: "摇瓶气泡",
    hitbox: { range: 2.4, width: 2.0, offset: 0.3 },
    impact: { color: 0xfdf3e0, shape: "multi", strength: 0.7 },
    chain: { slowmo: 0.3, zoom: 0.95, particles: 18 },
    anim: { windup: 0.18, strike: 0.38, recover: 0.3, lean: 0.15, squash: 0.7 },
    comboTiming: [0.22, 0.26, 0.3],
  },

  // 西格玛奶蛙 · 硬汉铁拳：砸地型（最高伤）
  shell_xigema: {
    style: ATTACK_STYLE.SLAM,
    moveName: "硬汉铁拳",
    hitbox: { range: 2.8, width: 1.8, offset: 0.6 },
    impact: { color: 0x9c7a3c, shape: "ring", strength: 1.8 },
    chain: { slowmo: 0.6, zoom: 1.3, particles: 24 },
    anim: { windup: 0.45, strike: 0.35, recover: 0.55, lean: 0.8, squash: 1.4 },
    comboTiming: [0.36, 0.4, 0.48],
  },
};

/**
 * 招式克制轴（2026-11-11 新增）——把「换壳即换招」从参数差异推进到**策略差异**。
 *
 * 6 种动作风格组成**一个 6 环**（每种风格恰好克一种、也恰好被一种克，保证反对称）：
 *   旋转(spin)   克 突刺(thrust) —— 范围广吃直线突进
 *   突刺(thrust) 克 砸地(slam)   —— 突进抢在砸地前摇里
 *   砸地(slam)   克 挥击(slash)  —— 砸地吃大挥击
 *   挥击(slash)  克 啄击(peck)   —— 挥击吃点刺
 *   啄击(peck)   克 鞭击(lash)   —— 点刺抢在长弧前面
 *   鞭击(lash)   克 旋转(spin)   —— 长弧缠住大范围旋转
 *
 * ⚠ 不设「互克」对（如 peck↔lash 同时互克）——互克会让 styleRelation 的反对称性失效，
 *   伤害倍率在两个方向同时变成 ×1.25，策略含义消失。
 */
export const STYLE_COUNTER = {
  spin: "thrust",
  thrust: "slam",
  slam: "slash",
  slash: "peck",
  peck: "lash",
  lash: "spin",
};

/** 克制关系的伤害倍率 */
export const STYLE_MULTIPLIER = {
  counter: 1.25,   // 克制
  neutral: 1.0,    // 平手
  resisted: 0.85,  // 被克
};

/** 克制关系的中文标签（UI 提示） */
export const STYLE_LABEL = {
  counter: "克制！",
  neutral: "",
  resisted: "抵抗",
};

/**
 * 判定攻方风格对守方风格的关系。
 * @returns {"counter"|"neutral"|"resisted"}
 */
export function styleRelation(attackerStyle, defenderStyle) {
  if (!attackerStyle || !defenderStyle) return "neutral";
  if (STYLE_COUNTER[attackerStyle] === defenderStyle) return "counter";
  if (STYLE_COUNTER[defenderStyle] === attackerStyle) return "resisted";
  return "neutral";
}

/** 取角色的招式定义（缺省回退到奶蛙） */
export function getMove(shellId) {
  return MOVES[shellId] ?? MOVES.shell_naiwa;
}

/** 招式差异度统计（用于验证「换壳即换招」） */
export function movesSummary() {
  const styles = {};
  for (const m of Object.values(MOVES)) {
    styles[m.style] = (styles[m.style] || 0) + 1;
  }
  const ranges = Object.values(MOVES).map((m) => m.hitbox.range);
  const strengths = Object.values(MOVES).map((m) => m.impact.strength);
  return {
    total: Object.keys(MOVES).length,
    styles,
    rangeMin: Math.min(...ranges),
    rangeMax: Math.max(...ranges),
    strengthMin: Math.min(...strengths),
    strengthMax: Math.max(...strengths),
  };
}
