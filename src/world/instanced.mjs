/**
 * 实例化渲染工具 —— 把大量同类 mesh 合并成 InstancedMesh，控制 draw call。
 *
 * 高密度场景的关键：店铺构件（墙体/招牌/窗户/空调）数量多，
 * 逐个 mesh 会爆 draw call。用 InstancedMesh 按「材质+几何」分组。
 */
import * as THREE from "three";

/**
 * 把一组相同几何+材质的 mesh 合并成 InstancedMesh。
 * @param {THREE.Mesh[]} meshes 源 mesh（读取它们的世界变换）
 * @param {string} name
 * @returns {THREE.InstancedMesh}
 */
export function mergeToInstanced(meshes, name = "instanced") {
  if (!meshes.length) return null;
  const src = meshes[0];
  const geo = src.geometry;
  const mat = src.material;
  const inst = new THREE.InstancedMesh(geo, mat, meshes.length);
  inst.name = name;

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const euler = new THREE.Euler();

  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    mesh.updateMatrix();
    m.copy(mesh.matrix);
    m.decompose(pos, quat, scl);
    inst.setMatrixAt(i, new THREE.Matrix4().compose(pos, quat, scl));
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false; // 场景大，跳过逐实例剔除
  return inst;
}

/**
 * 按「几何 UUID + 材质颜色」给 mesh 分组，每组合并成一个 InstancedMesh。
 * @param {THREE.Object3D} root
 * @returns {{ group: THREE.Group, stats: { before: number, after: number } }}
 */
export function optimizeScene(root) {
  const before = countMeshes(root);
  const groups = new Map();

  // 收集（不立即删除，避免遍历中修改）
  root.updateMatrixWorld(true);
  const all = [];
  root.traverse((c) => { if (c.isMesh && !c.isInstancedMesh) all.push(c); });

  for (const mesh of all) {
    const key = `${mesh.geometry.uuid}|${mesh.material?.color?.getHexString?.() ?? "x"}|${mesh.material?.type ?? "y"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  }

  // 只合并数量 ≥ 3 的组（少量不划算）
  const merged = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const inst = mergeToInstanced(list, `inst-${key.slice(0, 8)}`);
    if (inst) merged.push({ inst, list });
  }

  // 替换：把源 mesh 从父级移除，把 inst 加到根
  for (const { inst, list } of merged) {
    for (const mesh of list) {
      mesh.removeFromParent();
    }
    root.add(inst);
  }

  const after = countMeshes(root);
  return { group: root, stats: { before, after, merged: merged.length } };
}

function countMeshes(root) {
  let n = 0;
  root.traverse((c) => { if (c.isMesh) n++; });
  return n;
}
