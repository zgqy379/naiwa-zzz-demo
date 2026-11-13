/**
 * 战斗调参（数值唯一入口；来源：奶蛙零已验证的 COMBAT_TUNING 口径）。
 * 绝区零式反馈层：hitstop / 震屏 / 慢镜 / 连携。
 */
export const TUNING = {
  // 不限时（战斗以击败对手为唯一胜利条件）

  // 失衡与连携
  balanceGrids: 3,
  comboWindowS: 2.0,

  // 帧级（逻辑 60fps）
  logicFps: 60,
  // 2026-11-13 战斗手感 v1：顿帧 3/3/4/5 帧（50~83ms）→ **7/10/14/20 帧（117~333ms）**
  // —— 原值太短，命中瞬间几乎没有「打到肉的顿挫感」（实测 hitstop 仅 4 帧 / 0.05s）
  hitstopF: 7,          // 轻击顿帧（117ms）
  hitstopFMedium: 10,  // 中击（167ms）
  hitstopFHeavy: 14,   // 重击（233ms）
  hitstopFFinisher: 20, // 终结（333ms）

  // 震屏四档（度）—— 2026-11-13 整体上调约 2.5 倍、衰减加快（更利落）
  shake: {
    light: { min: 0.7, max: 1.1 },
    medium: { min: 1.2, max: 1.8 },
    heavy: { min: 1.9, max: 2.7 },
    ultimate: { min: 2.8, max: 4.0 },
    decayPerS: 3.2,
    frequencyHz: 26,
    halfLife: 0.06,
  },

  // 2026-11-13 新增：对手 AI（让对手成为对手）
  // 旧实现：进入 2.4m 后站桩不动，攻击间隔 4~6 秒、且没有连段
  // → 实测 8.8 秒战斗里对手 302/332 帧 idle，动作游戏感为零。
  opponent: {
    pressDist: 1.9,           // 压迫距离（对手会主动贴到这个距离）
    attackGapMin: 1.3,       // 攻击间隔下限（秒）
    attackGapMax: 2.1,       // 攻击间隔上限
    firstAttackDelay: 0.8,    // 开局第一击延迟
    windupS: 0.34,           // 前摇（可读招 + 弹反窗）
    strikeS: 0.12,           // 命中判定窗口
    recoverS: 0.45,          // 收招硬直（此时无威胁）
    comboSecondWindupS: 0.24,// 连招第 2 段前摇（红闪不可弹反）
    comboGap: 0.26,          // 第 2 段与第 1 段之间的间隔
    comboChance: 0.65,       // 打出 2 段连招的概率
    lungeDist: 0.55,         // 前摇前冲距离
    retreatDist: 0.9,        // 收招后撤距离
    strafeAmp: 0.45,         // 绕行幅度（Z）——不能太大，否则会走出玩家判定框导致打空
    strafePeriod: 2.2,       // 绕行周期（秒）
    hp: 220,                 // 对手血量（配合伤害梯度 9/16/30 → 约 12 击 / 4 套连段）
    damageBase: 7,            // 对手每次命中的基础伤害（玩家 100 血 → 约 14 次受击）
    knockbackLight: 0.35,    // 被轻击击退
    knockbackHeavy: 0.85,    // 被重击/终结击退
    playerHitstopS: 0.12,    // 玩家受击的顿帧
  },

  // 连携慢镜 —— 调校：更短促，不拖节奏
  chain: {
    slowmoScale: 0.4,
    slowmoS: 0.45,
    fovZoomDeg: 7,
  },

  // 相机（侧后方机位：沿 X 看街道 + 沿 Z 侧偏，避免角色形体沿视线重叠）
  camera: {
    fovVertical: 40,      // 50→42→40：再收窄一档，角色占屏更大
    height: 1.6,          // 2.2→1.6：机位降到接近角色身高
    distance: 3.8,        // 7.0→4.5→3.8：再拉近一档（与 sideOffset 2.2 构成 ~30.1° 侧角）
    lookAtHeight: 0.7,    // 0.8→0.9→0.7：第三轮下压注视点，角色整体上移以脱离底部 HUD 按键条
    sideOffset: 2.2,      // 新增：侧后方机位（沿 Z 偏）
    // 沿 X 轴看街道（店铺在 Z 两侧，不挡路）
    axis: "x",
  },

  // 玩家
  playerSpeed: 4.2,
  dodgeDistance: 1.6,
  dodgeIframeS: 0.3,

  // 舞台
  stageXMin: -6,
  stageXMax: 6,
};

/** 命中档位 → 顿帧/震屏参数 */
export function hitProfile(tier) {
  const map = {
    light:    { hitstopF: TUNING.hitstopF,        shake: TUNING.shake.light },
    medium:   { hitstopF: TUNING.hitstopFMedium,  shake: TUNING.shake.medium },
    heavy:    { hitstopF: TUNING.hitstopFHeavy,   shake: TUNING.shake.heavy },
    finisher: { hitstopF: TUNING.hitstopFFinisher, shake: TUNING.shake.ultimate },
  };
  return map[tier] ?? map.light;
}
