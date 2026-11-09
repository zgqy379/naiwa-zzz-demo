/**
 * 运镜演出 —— 绝区零式镜头语言。
 *
 * 三层镜头行为：
 *  1. 常规跟随：相机跟随玩家，保持距离/高度
 *  2. 攻击特写：命中瞬间拉近（zoom punch）+ 轻微震屏
 *  3. 连携/终结：慢镜 + 环绕运镜 + 大特写
 *
 * 数值集中在本文件（演出参数）。
 */
import * as THREE from "three";

export class Cinematic {
  constructor(camera, tuning) {
    this.camera = camera;
    this.t = tuning;

    // 基础机位（沿 X 轴看街道：相机在 +X 侧，看向 -X）
    const axis = tuning.camera.axis ?? "z";
    if (axis === "x") {
      this.basePos = new THREE.Vector3(tuning.camera.distance, tuning.camera.height, 0);
      this.baseLook = new THREE.Vector3(0, tuning.camera.lookAtHeight, 0);
    } else {
      this.basePos = new THREE.Vector3(0, tuning.camera.height, tuning.camera.distance);
      this.baseLook = new THREE.Vector3(0, tuning.camera.lookAtHeight, 0);
    }
    this.baseFov = tuning.camera.fovVertical;
    this.axis = axis;

    // 当前状态
    this.zoomT = 0;         // 攻击拉近剩余
    this.zoomDur = 0;
    this.slowmoT = 0;
    this.orbitT = 0;        // 环绕运镜
    this.orbitDur = 0;
    this.orbitAngle = 0;
    this.focusTarget = new THREE.Vector3();
    this.focusWeight = 0;   // 0=跟随玩家, 1=锁定焦点

    // 抖动
    this.shakeOffset = new THREE.Vector3();
    this.shakeT = 0;
  }

  /** 攻击命中：拉近 + 抖动 */
  onHit(tier) {
    const strength = { light: 1, medium: 1.5, heavy: 2.2, ultimate: 3.5 }[tier] ?? 1;
    this.zoomT = 0.16 * strength;
    this.zoomDur = 0.16 * strength;
    this.shakeT = 0.18 * strength;
  }

  /** 连携：慢镜 + 环绕 */
  onChain() {
    this.slowmoT = 0.5;
    this.orbitT = 0.9;
    this.orbitDur = 0.9;
    this.focusWeight = 1;
  }

  /** 终结技：长慢镜 + 大环绕 + 大特写 */
  onFinisher() {
    this.slowmoT = 1.4;
    this.orbitT = 2.0;
    this.orbitDur = 2.0;
    this.focusWeight = 1;
  }

  /** 设置焦点（连携/终结时锁定对手） */
  setFocus(pos) {
    this.focusTarget.copy(pos);
  }

  /** 每渲染帧推进 */
  step(dt, playerPos) {
    // ---- 慢镜 ----
    this.slowmoT = Math.max(0, this.slowmoT - dt);

    // ---- 环绕运镜 ----
    if (this.orbitT > 0) {
      this.orbitT -= dt;
      const p = 1 - this.orbitT / this.orbitDur;
      this.orbitAngle = p * Math.PI * 0.6; // 环绕 108°
    } else {
      this.orbitAngle *= 0.9;
      this.focusWeight = Math.max(0, this.focusWeight - dt * 0.5);
    }

    // ---- 攻击拉近恢复（zoomK 归零后相机自然回基础位）----

    // ---- 拉近 ----
    let zoomK = 0;
    if (this.zoomT > 0) {
      this.zoomT -= dt;
      zoomK = Math.sin((1 - this.zoomT / this.zoomDur) * Math.PI); // 0→1→0
    }

    // ---- 抖动 ----
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeT * 0.08;
      this.shakeOffset.set(
        (Math.random() - 0.5) * a,
        (Math.random() - 0.5) * a,
        (Math.random() - 0.5) * a * 0.5
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }

    // ---- 计算机位 ----
    // 跟随目标（玩家 vs 焦点 混合）
    const followPos = new THREE.Vector3().lerpVectors(playerPos, this.focusTarget, this.focusWeight);

    // 基础机位 + 玩家偏移（始终跟随玩家，运镜在跟随基础上叠加）
    const dist = this.basePos.distanceTo(this.baseLook);
    const targetPos = new THREE.Vector3(
      this.basePos.x + followPos.x,
      this.basePos.y,
      this.basePos.z + followPos.z
    );
    // 沿 X 轴模式：玩家 Z 偏移也跟随（否则会脱离画面）
    if (this.axis === "x") {
      targetPos.z += followPos.z;
    }

    // 环绕偏移
    if (Math.abs(this.orbitAngle) > 0.001) {
      const r = dist * 0.55;
      targetPos.x += Math.sin(this.orbitAngle) * r;
      targetPos.z -= (1 - Math.cos(this.orbitAngle)) * r * 0.4;
    }

    // 拉近（向目标推）
    if (zoomK > 0) {
      const dir = new THREE.Vector3().subVectors(followPos, targetPos).normalize();
      targetPos.addScaledVector(dir, zoomK * 1.2);
    }

    // 平滑跟随
    this.camera.position.lerp(targetPos, 0.14);
    this.camera.position.add(this.shakeOffset);

    // 注视点
    const lookTarget = new THREE.Vector3().lerpVectors(this.baseLook, followPos, 0.5 + this.focusWeight * 0.5);
    this.camera.lookAt(lookTarget);

    // FOV：拉近时收窄
    const fov = this.baseFov - zoomK * 8;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  get timeScale() {
    return this.slowmoT > 0 ? 0.3 : 1.0;
  }
}
