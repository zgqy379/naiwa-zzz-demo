/**
 * 武器（道具）系统 —— 把官方生成的道具挂到角色的**手部骨骼**上，
 * 并在命中帧于**武器所在位置**生成「武器相撞」反馈。
 *
 * 为什么要这个：绝区零式动作游戏的观感核心是「挥出去的武器真的打到东西」。
 * 此前本作的命中反馈只有通用冲击波（地面点）+ 通用打击音，看起来像拳头打人而不是刀剑相交。
 * 现在：
 *   - 武器是官方 Lux3D 生成的道具（与奶蛙家族的「食物系」设定同源）；
 *   - 武器挂在 mixamorig:RightHand（官方自动绑骨带完整手骨），随动画真实挥动；
 *   - 命中时取**武器尖端的��世界坐标**生成金属相撞特效 + 播放金属撞击音。
 *
 * 武器本身没有骨骼（静态道具），因此只需文生 3D，不消耗绑骨积分。
 */
import * as THREE from "three";
import { accumulatedScale, avgScale } from "../core/scale.mjs";

/** 官方生成的道具（file → public/asset 下） */
export const WEAPON_FILES = {
  spatula: "naiwa_spatula.glb",
  teacup: "naiwa_teacup.glb",
  bottle: "naiwa_bottle.glb",
  ladle: "naiwa_ladle.glb",
  drumstick: "naiwa_drumstick.glb",
  teapot: "naiwa_teapot.glb",
  rollingpin: "naiwa_rollingpin.glb",
  mug: "naiwa_mug.glb",
};

/**
 * 每只角色的武器与握持方式。
 *  - size: 道具最长边归一化到多少米（官方道具按真实尺度生成，尺度不一 → 统一缩放）
 *  - grip: 相对手骨的局部偏移（米）：把道具「握把」放到掌心里
 *  - tip:  打击端在**归一化单位**里的位置（乘以缩放系数后作为局部偏移）
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
};

/** 右手骨骼名（官方自动绑骨的 Mixamo 命名）。
 *  注意：three.js 的 PropertyBinding.sanitizeNodeName 会把 ':' 等字符去掉，
 *  所以场景里的节点名实际是 "mixamorigRightHand"（无冒号）——两种写法都要试。 */
export const HAND_BONE = "mixamorig:RightHand";
const HAND_BONE_CANDIDATES = [
  "mixamorig:RightHand",
  "mixamorigRightHand",
  "RightHand",
  "mixamorig_LeftHand",   // 少数工具导出左右互换
];

/** 在角色根下找右手骨骼 */
export function findHandBone(sceneRoot) {
  if (!sceneRoot) return null;
  for (const n of HAND_BONE_CANDIDATES) {
    const b = sceneRoot.getObjectByName(n);
    if (b) return b;
  }
  // 兜底：按名字含 RightHand 找
  let found = null;
  sceneRoot.traverse((c) => { if (!found && /RightHand/i.test(c.name)) found = c; });
  return found;
}

/**
 * 把手上的道具挂到手骨。
 *
 * 官方道具按真实尺度生成（大小不一），这里**按包围盒归一化**：最长边缩放到 spec.size 米，
 * 再把包围盒中心移到掌心（grip），打击端按 tip 的归一化坐标挂一个空节点用于相撞定位。
 *
 * 单位换算（2026-11-12 修正，踩坑记录）：
 *   武器是**手骨的子节点** → 它的世界尺寸 = 道具本地尺寸 × 武器自身缩放 × **手骨的世界缩放**。
 *   而官方绑骨模型的手骨世界缩放 = 角色的 wrapper 缩放（实测 0.48~3.35，逐角色不同），
 *   不除掉它的话，一把 0.62 m 的锅铲会变成 2 m 巨铲（实测角色被白色巨块吞掉）。
 *   所以这里的 k 要**再除以手骨的累计世界缩放**。
 *
 * @param {THREE.Object3D} sceneRoot 角色 gltf 根
 * @param {THREE.Object3D} weaponGroup 道具组
 * @param {object} spec WEAPON_SPECS 里的一条
 */
export function attachWeapon(sceneRoot, weaponGroup, spec) {
  const hand = findHandBone(sceneRoot);
  if (!hand) return null;
  const box = new THREE.Box3().setFromObject(weaponGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  // 手骨的世界缩放（手骨是武器的父节点 → 武器会继承它）
  const boneScale = avgScale(accumulatedScale(hand));
  const k = (spec.size ?? 0.55) / maxDim / boneScale;
  weaponGroup.scale.setScalar(k);
  // 归一化后：把中心移到掌心（grip 是米制偏移）
  weaponGroup.position.set(
    -center.x * k + (spec.grip?.[0] ?? 0),
    -center.y * k + (spec.grip?.[1] ?? 0),
    -center.z * k + (spec.grip?.[2] ?? 0)
  );
  weaponGroup.rotation.set(0, 0, 0);
  hand.add(weaponGroup);
  // 命中特效定位点（打击端）。
  // 单位说明：tip 是**归一化比例**（0~1，模型的相对延伸方向），这里乘 maxDim 换算成
  // 「缩放前」的模型局部单位；随后由 weaponGroup.scale(=k) 与手骨世界缩放共同缩放，
  // 最终世界偏移 = tip × maxDim × k × boneScale = tip × spec.size ✓（不能再乘 k，否则会被缩放两次）。
  const tip = new THREE.Object3D();
  tip.position.set(spec.tip[0] * maxDim, spec.tip[1] * maxDim, spec.tip[2] * maxDim);
  weaponGroup.add(tip);
  return { hand, tip, scale: k, boneScale };
}

/** 取武器打击端的世界坐标（没有武器则返回 null） */
export function weaponTipWorld(rig) {
  if (!rig?.tip) return null;
  const v = new THREE.Vector3();
  rig.tip.getWorldPosition(v);
  return v;
}
