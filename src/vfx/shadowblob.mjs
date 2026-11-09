/**
 * 假阴影 —— 角色脚下的接触阴影（解决 NPR 材质阴影不明显的问题）。
 *
 * 实现：一个深色半透明圆片，跟随角色，缩放随高度变化。
 * 比真实阴影更可控，且在风格化渲染下更稳定。
 */
import * as THREE from "three";

let _geo = null;
let _mat = null;

function getGeo() {
  if (!_geo) _geo = new THREE.CircleGeometry(0.5, 24);
  return _geo;
}
function getMat() {
  if (!_mat) {
    _mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
  }
  return _mat;
}

/** 创建一个假阴影 */
export function makeShadowBlob(scale = 1) {
  const mesh = new THREE.Mesh(getGeo(), getMat().clone());
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.scale.set(scale, scale, 1);
  mesh.renderOrder = 1; // 确保在地面之上
  return mesh;
}

/**
 * 更新假阴影（跟随角色，随高度缩放/淡出）
 * @param {THREE.Mesh} blob
 * @param {THREE.Vector3} charPos
 * @param {number} charScale
 */
export function updateShadowBlob(blob, charPos, charScale = 1) {
  blob.position.x = charPos.x;
  blob.position.z = charPos.z;
  blob.position.y = 0.02;

  const h = Math.max(0, charPos.y);
  // 越高越小越淡
  const k = Math.max(0.3, 1 - h * 0.4);
  blob.scale.set(charScale * k, charScale * k, 1);
  blob.material.opacity = 0.35 * k;
}
