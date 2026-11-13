/**
 * 更新武器规格：角色换成「奶蛙 IP 形体」（蛋形身体 + 深橄榄褐连指手套短手），
 * 手掌小、手臂短 → 武器统一缩到 0.22–0.45 m，且全部选「食物系小物件」，
 * 与该 IP 的气质一致（奶蛙是「捧腹」系萌物，不是挥剑的战士）。
 */
import { readFileSync, writeFileSync } from "node:fs";

const F = "src/game/weapon.mjs";
let t = readFileSync(F, "utf8");

const OLD = ` *  - tip:  打击端在**归一化单位**里的位置（乘以缩放系数后作为局部偏移）
 */
export const WEAPON_SPECS = {
  shell_naiwa:   { file: WEAPON_FILES.spatula,    size: 0.62, grip: [0, 0, 0], tip: [0, 0, 0.55] },
  shell_naidou:  { file: WEAPON_FILES.rollingpin, size: 0.58, grip: [0, 0, 0], tip: [0, 0, 0.5] },
  shell_xiaonaiwa: { file: WEAPON_FILES.ladle,   size: 0.5,  grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_naidan:  { file: WEAPON_FILES.drumstick,  size: 0.42, grip: [0, 0, 0], tip: [0, 0, 0.45] },
  shell_nashu:   { file: WEAPON_FILES.spatula,    size: 0.5,  grip: [0, 0, 0], tip: [0, 0, 0.55] },
  shell_naigou:  { file: WEAPON_FILES.drumstick,  size: 0.5,  grip: [0, 0, 0], tip: [0, 0, 0.45] },
  shell_naifen:  { file: WEAPON_FILES.bottle,     size: 0.42, grip: [0, 0, 0], tip: [0, 0.3, 0.3] },
  shell_naiji:   { file: WEAPON_FILES.ladle,      size: 0.55, grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_naimao:  { file: WEAPON_FILES.spatula,    size: 0.48, grip: [0, 0, 0], tip: [0, 0, 0.55] },
  shell_naishi:  { file: WEAPON_FILES.mug,        size: 0.42, grip: [0, 0, 0], tip: [0, 0.2, 0.3] },
  shell_dounai:  { file: WEAPON_FILES.teacup,     size: 0.5,  grip: [0, 0, 0], tip: [0, 0.35, 0.25] },
  shell_naitu:   { file: WEAPON_FILES.teapot,     size: 0.44, grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_naiyu:   { file: WEAPON_FILES.ladle,      size: 0.5,  grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_naicha:  { file: WEAPON_FILES.teapot,     size: 0.5,  grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_naiping: { file: WEAPON_FILES.bottle,     size: 0.4,  grip: [0, 0, 0], tip: [0, 0.3, 0.3] },
  shell_xigema:  { file: WEAPON_FILES.rollingpin, size: 0.66, grip: [0, 0, 0], tip: [0, 0, 0.5] },
};`;

const NEW = ` *  - tip:  打击端在**归一化单位**里的位置（乘以缩放系数后作为局部偏移）
 *
 * 2026-11-13 调整：角色换成**奶蛙 IP 形体**（蛋形身体 + 深橄榄褐**连指手套**短手），
 *   手掌小、手臂短 → 武器统一缩到 **0.22–0.45 m**，且全部选「食物系小物件」
 *   （奶茶杯 / 炸鸡腿 / 汤勺 / 奶瓶 / 马克杯 / 茶壶 / 小号煎饼铲 / 擀面杖），
 *   与该 IP 的气质一致（奶蛙是「捧腹」系萌物，不是挥剑的战士）。
 *   西格玛奶蛙是家族里的硬汉，例外拿最长的擀面杖。
 */
export const WEAPON_SPECS = {
  shell_naiwa:   { file: WEAPON_FILES.spatula,    size: 0.34, grip: [0, 0, 0], tip: [0, 0, 0.55] },
  shell_naidou:  { file: WEAPON_FILES.ladle,      size: 0.30, grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_xiaonaiwa: { file: WEAPON_FILES.teacup,  size: 0.22, grip: [0, 0, 0], tip: [0, 0.2, 0.25] },
  shell_naidan:  { file: WEAPON_FILES.drumstick,  size: 0.24, grip: [0, 0, 0], tip: [0, 0, 0.45] },
  shell_nashu:   { file: WEAPON_FILES.spatula,    size: 0.30, grip: [0, 0, 0], tip: [0, 0, 0.55] },
  shell_naigou:  { file: WEAPON_FILES.drumstick,  size: 0.26, grip: [0, 0, 0], tip: [0, 0, 0.45] },
  shell_naifen:  { file: WEAPON_FILES.bottle,     size: 0.28, grip: [0, 0, 0], tip: [0, 0.25, 0.3] },
  shell_naiji:   { file: WEAPON_FILES.ladle,      size: 0.28, grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_naimao:  { file: WEAPON_FILES.spatula,    size: 0.28, grip: [0, 0, 0], tip: [0, 0, 0.55] },
  shell_naishi:  { file: WEAPON_FILES.mug,        size: 0.22, grip: [0, 0, 0], tip: [0, 0.2, 0.3] },
  shell_dounai:  { file: WEAPON_FILES.teacup,     size: 0.24, grip: [0, 0, 0], tip: [0, 0.2, 0.25] },
  shell_naitu:   { file: WEAPON_FILES.teapot,     size: 0.28, grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_naiyu:   { file: WEAPON_FILES.ladle,      size: 0.28, grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_naicha:  { file: WEAPON_FILES.teapot,     size: 0.26, grip: [0, 0, 0], tip: [0, 0.1, 0.45] },
  shell_naiping: { file: WEAPON_FILES.bottle,     size: 0.28, grip: [0, 0, 0], tip: [0, 0.25, 0.3] },
  shell_xigema:  { file: WEAPON_FILES.rollingpin, size: 0.45, grip: [0, 0, 0], tip: [0, 0, 0.5] },
};`;

if (!t.includes(OLD)) { console.log("✗ 未匹配旧武器规格"); process.exit(1); }
t = t.replace(OLD, NEW);
writeFileSync(F, t, "utf8");
console.log("✓ 武器规格已更新（0.22–0.45 m 食物系小物件）");
