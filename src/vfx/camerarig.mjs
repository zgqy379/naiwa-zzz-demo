/**
 * 相机装备 —— 基于 camera-controls（行业标准方案）
 *
 * 用它的：
 *  - colliderMeshes：相机碰撞（解决穿墙）
 *  - smoothTime / draggingSmoothTime：平滑阻尼（解决镜头不稳）
 *  - boundaryEnclosesCamera：边界限制
 *  - restThreshold：静止检测（用于演出判断）
 *
 * 不用它的：
 *  - 用户输入（动作游戏是固定视角 + 自动跟随）
 *
 * 用法：
 *   const rig = new CameraRig(camera, domElement, scene);
 *   rig.setColliders([wallMesh, ...]);
 *   rig.setTarget(pos, dt);   // 每帧调用
 *   rig.update(dt);
 */
import * as THREE from "three";
import CameraControls from "camera-controls";

CameraControls.install({ THREE });

export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement
   */
  constructor(camera, domElement) {
    this.controls = new CameraControls(camera, domElement);

    // ---- 平滑参数（解决镜头不稳）----
    this.controls.smoothTime = 0.18;          // 正常跟随的平滑时间
    this.controls.draggingSmoothTime = 0.12;  // 拖拽时的平滑时间
    this.controls.restThreshold = 0.01;       // 静止阈值

    // ---- 禁用用户输入（动作游戏固定视角）----
    this.controls.enabled = false;

    // ---- 碰撞（解决穿墙）----
    this.controls.colliderMeshes = [];
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 12;

    // ---- 边界 ----
    this.controls.boundaryEnclosesCamera = true;

    this._targetPos = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._camera = camera;
    this._domElement = domElement;
  }

  /** 设置碰撞体（墙面/障碍物） */
  setColliders(meshes) {
    this.controls.colliderMeshes = meshes || [];
  }

  /** 设置边界盒 */
  setBoundary(box3) {
    this.controls.boundary = box3;
  }

  /**
   * 每帧设置目标位置（相机跟随目标）
   * @param {THREE.Vector3} targetPos 目标位置（角色位置）
   * @param {object} opts { distance, height, sideOffset, lookAtHeight }
   */
  setTarget(targetPos, opts = {}) {
    const { distance = 4.6, height = 1.8, sideOffset = 0, lookAtHeight = 0.85 } = opts;

    // 相机位置：角色后方 + 侧偏
    this._targetPos.set(
      targetPos.x + distance,
      height,
      targetPos.z + sideOffset
    );
    this._lookAt.set(targetPos.x, lookAtHeight, targetPos.z);

    // 用 setLookAt 设置（带过渡）
    this.controls.setLookAt(
      this._targetPos.x, this._targetPos.y, this._targetPos.z,
      this._lookAt.x, this._lookAt.y, this._lookAt.z,
      true   // enableTransition
    );
  }

  /** 每帧更新 */
  update(dt) {
    this.controls.update(dt);
  }

  /** 立即跳转（无过渡） */
  jumpTo(pos, lookAt) {
    this.controls.setLookAt(
      pos.x, pos.y, pos.z,
      lookAt.x, lookAt.y, lookAt.z,
      false
    );
  }

  /** 是否静止 */
  get isRest() {
    return this.controls.active === false;
  }

  /** 释放 */
  dispose() {
    this.controls.dispose();
  }
}
