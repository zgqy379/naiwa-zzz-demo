/**
 * 缩放工具 —— 解决「官方绑骨模型把网格缩到骨骼空间」带来的单位换算问题。
 *
 * 背景（Aholo Lux3D 自动绑骨的实测行为）：
 *   产出的 GLB 里，**网格顶点写在「绑定空间」**，而**骨架的绑定矩阵带缩放**
 *   （实测：奶蛙网格包围盒高 1.936，而蒙皮后的实际高度只有 0.314 —— 差 6.17 倍）。
 *   也就是说：**模型局部单位 ≠ 世界单位**，且每只角色的缩放系数还不一样
 *   （奶蛙 3.35×、奶狗 1.73×、奶猫 0.48× …）。
 *
 *   由此产生两个必须换算的地方：
 *   ① **描边宽度**：写在模型局部单位里的「0.016」换算到世界后是 3~6 cm（角色被黑块吞掉）；
 *   ② **挂在手骨上的武器**：会继承手骨的世界缩放 → 一把 0.62 m 的锅铲变成 2 m 巨铲。
 *
 * 本模块提供**不依赖 matrixWorld** 的累计缩放计算（加载时机不同 matrixWorld 可能陈旧）。
 */
import * as THREE from "three";

/** 祖先链上的累计缩放（逐级相乘，含自身） */
export function accumulatedScale(obj) {
  const v = new THREE.Vector3(1, 1, 1);
  let p = obj;
  while (p) {
    v.multiply(p.scale);
    p = p.parent;
  }
  return v;
}

/** 累计缩放的平均分量（把「世界单位」换算成「局部单位」用；非均匀缩放取均值） */
export function avgScale(v) {
  return (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z)) / 3 || 1;
}

/** 世界长度 → 该对象的局部长度 */
export function worldToLocal(worldLen, obj) {
  return worldLen / avgScale(accumulatedScale(obj));
}
