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
  hitstopF: 3,        // 轻击顿帧
  hitstopFMedium: 3,
  hitstopFHeavy: 4,
  hitstopFFinisher: 5,

  // 震屏四档（度）—— 调校：起振更快、衰减更利落
  shake: {
    light: { min: 0.25, max: 0.45 },
    medium: { min: 0.5, max: 0.85 },
    heavy: { min: 0.9, max: 1.5 },
    ultimate: { min: 1.6, max: 2.6 },
    decayPerS: 2.0,
    frequencyHz: 24,
    halfLife: 0.06,
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
