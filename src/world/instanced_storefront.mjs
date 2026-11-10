/**
 * 店铺实例化器 —— 把整条街的店铺构件合并成少量 InstancedMesh。
 *
 * 性能优化：18 家店铺 × 18 个构件 = 324 个 mesh
 *          → 按类型合并成 6-8 个 InstancedMesh（draw call 降 95%）
 *
 * 实现：遍历所有店铺，收集每类构件的变换，最后统一建 InstancedMesh。
 */
import * as THREE from "three";

/** 构件分类 */
const PART_TYPES = ["wall", "door", "window", "hSign", "vSign", "ac", "shutter"];

/**
 * 把一组店铺 group 实例化合并。
 * @param {THREE.Group[]} storefronts 店铺 group 数组
 * @returns {THREE.Group} 合并后的 group
 */
export function instanceStorefronts(storefronts) {
  const buckets = {};
  for (const t of PART_TYPES) buckets[t] = [];

  // 遍历收集（先更新一次矩阵，避免逐 mesh 更新）
  for (const sf of storefronts) sf.updateMatrixWorld(true);

  // 批量遍历（不做 clone，直接存引用）
  for (const sf of storefronts) {
    sf.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const type = child.userData.__partType;
      if (!type || !buckets[type]) return;
      buckets[type].push({ mesh: child });
    });
  }

  // 按材质分组合并（同类型不同材质要分开）
  const out = new THREE.Group();
  out.name = "instanced-storefronts";

  for (const [type, list] of Object.entries(buckets)) {
    if (!list.length) continue;

    // 按材质分组
    const byMat = new Map();
    for (const item of list) {
      const key = item.mesh.material.uuid;
      if (!byMat.has(key)) byMat.set(key, []);
      byMat.get(key).push(item.mesh);
    }

    for (const [matUuid, meshes] of byMat) {
      const src = meshes[0];
      const geo = src.geometry;
      const mat = src.material;
      const inst = new THREE.InstancedMesh(geo, mat, meshes.length);
      inst.name = `inst-${type}`;
      for (let i = 0; i < meshes.length; i++) {
        inst.setMatrixAt(i, meshes[i].matrixWorld);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      out.add(inst);
    }
  }

  return out;
}

/** 给店铺构件打类型标记（在 makeStorefront 里调用） */
export function tagPart(mesh, type) {
  mesh.userData.__partType = type;
  return mesh;
}
