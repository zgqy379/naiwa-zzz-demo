/**
 * 假阴影 —— 角色脚下的接触阴影（解决 NPR 材质阴影不明显的问题）。
 *
 * 实现：一个深色半透明圆片，跟随角色，缩放随高度变化。
 * 比真实阴影更可控，且在风格化渲染下更稳定。
 */
import * as THREE from "three";

let _geo = null;
let _mat = null;
let _tex = null;

function getGeo() {
  if (!_geo) _geo = new THREE.CircleGeometry(0.5, 24);
  return _geo;
}
/** 2026-11-18 视觉硬伤修复轮：硬边纯黑圆片改径向渐变软阴影（程序化 CanvasTexture，零外部资产）。
 *  中心浓、边缘透明衰减，读作接触阴影而非「贴在地上的黑盘子」。 */
function getShadowTex() {
  if (!_tex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, "rgba(0,0,0,0.85)");
    g.addColorStop(0.55, "rgba(0,0,0,0.38)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    _tex = new THREE.CanvasTexture(c);
  }
  return _tex;
}
function getMat() {
  if (!_mat) {
    _mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: getShadowTex(),
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
