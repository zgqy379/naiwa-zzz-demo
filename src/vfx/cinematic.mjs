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

// 终结技五拍：拍4 定格的注视点抬升量（m）与拍5 回场 tween 时长（s）——演出参数，集中本文件
const FINISHER_HOLD_LOOK = 0.3;
const FINISHER_RETURN_S = 0.3;

export class Cinematic {
  constructor(camera, tuning) {
    this.camera = camera;
    this.t = tuning;

    // 基础机位（沿 X 轴看街道：相机在 +X 侧，看向 -X）
    // 侧后方机位：+X 后方 + Z 侧偏，使角色 Z 向形体差异（猫耳/鱼尾/宽肩）投影可见
    const axis = tuning.camera.axis ?? "z";
    const sideOffset = tuning.camera.sideOffset ?? 0;
    if (axis === "x") {
      this.basePos = new THREE.Vector3(tuning.camera.distance, tuning.camera.height, sideOffset);
      this.baseLook = new THREE.Vector3(0, tuning.camera.lookAtHeight, 0);
    } else {
      this.basePos = new THREE.Vector3(0, tuning.camera.height, tuning.camera.distance);
      this.baseLook = new THREE.Vector3(0, tuning.camera.lookAtHeight, 0);
    }
    this.baseFov = tuning.camera.fovVertical;
    this.lookAtHeight = tuning.camera.lookAtHeight;
    this.axis = axis;

    // 当前状态
    this.zoomT = 0;         // 攻击拉近剩余
    this.zoomDur = 0;
    this.slowmoT = 0;
    this.orbitT = 0;        // 环绕运镜
    this.orbitDur = 0;
    this.orbitAngle = 0;
    // 用户鼠标拖拽环绕：main.mjs 每帧写目标角，这里做阻尼平滑
    this.userAngle = 0;     // 目标偏航角（rad，main 侧已限幅 ±1.2）
    this.userOrbit = 0;     // 阻尼后的实际偏航角
    this.focusTarget = new THREE.Vector3();
    this.focusWeight = 0;   // 0=跟随玩家, 1=锁定焦点

    // 抖动
    this.shakeOffset = new THREE.Vector3();
    this.shakeT = 0;

    // ---- 终结技五拍（2026-11-14 路线图③④·仪式感，01-运镜与演出.md §3.5）----
    // 拍4 定格：命中结算瞬间 timescale 0.05 hold ~0.4s；拍5 回场：0.3s 匀速 tween 回基线
    this.holdT = 0;          // 定格剩余（真实秒；顿帧期间不衰减，见 frozenNow）
    this.returnT = 0;        // 回场 tween 剩余（真实秒）
    this.holdLookBoost = 0;  // 拍4 注视点抬升量（经 getOffset().look 交 camRig 消化，机位 y 不动）
    this.frozenNow = false;  // main.mjs 每帧写：当前是否处于顿帧（hold 在顿帧期间暂停衰减）
  }

  /** 攻击命中：拉近 + 抖动 */
  onHit(tier) {
    const strength = { light: 1, medium: 1.5, heavy: 2.2, ultimate: 3.5 }[tier] ?? 1;
    this.zoomT = 0.2 * strength;
    this.zoomDur = 0.24 * strength;
    this.shakeT = 0.22 * strength;
  }

  /** 连携：慢镜 + 环绕 */
  onChain() {
    this.slowmoT = 0.5;
    this.orbitT = 0.9;
    this.orbitDur = 0.9;
    this.focusWeight = 1;
  }

  /** 终结技：长慢镜 + 大环绕 + 大特写（拍3 本体） */
  onFinisher() {
    this.slowmoT = 1.4;
    this.orbitT = 2.0;
    this.orbitDur = 2.0;
    this.focusWeight = 1;
  }

  /**
   * 终结技拍4 定格：命中结算瞬间调用 —— timescale 压到 0.05 hold 约 0.4s，
   * 注视点抬升 lookAtHeight +0.3（官方幕后「收招定格对称构图·拉高镜头」），
   * hold 结束后由 getOffset 进入拍5 的 0.3s 匀速回落 tween。
   * 注意：只抬「注视点」，机位高度（camera.position.y）不变——
   * E2E 有「相机 y > 0.5」回归判据，本方法不写相机位置。
   * @param {number} holdS 定格时长（真实秒）
   */
  onFinisherHold(holdS = 0.4) {
    this.holdT = holdS;
    this.returnT = 0;
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

    // ---- 用户拖拽环绕（阻尼过渡，避免瞬跳）----
    // 帧率无关指数阻尼：60fps 时每帧向目标收敛 15%（低帧率下按 dt 补偿，手感一致）
    const orbitK = 1 - Math.pow(1 - 0.15, Math.max(0, dt) * 60);
    this.userOrbit += (this.userAngle - this.userOrbit) * orbitK;

    // ---- 环绕运镜 ----
    if (this.orbitT > 0) {
      this.orbitT -= dt;
      const raw = Math.max(0, 1 - this.orbitT / this.orbitDur);
      // easeInOutCubic：起手缓、中段快、收势稳，比线性环绕更像分镜调度
      const p = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
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
      // 快起慢落：0.18 内拉满、余下缓退，冲击感比对称 sin 更接近动作游戏
      const pz = 1 - this.zoomT / this.zoomDur;
      zoomK = pz < 0.18 ? pz / 0.18 : Math.pow(1 - (pz - 0.18) / 0.82, 1.6);
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

    // 修：相机跟随「死区 + 阻尼」
    //   - 死区：玩家移动 < 0.4 时不更新相机目标（避免微小抖动）
    //   - 阻尼：相机目标用慢速 lerp（比玩家慢，形成自然滞后）
    if (!this._camAnchor) this._camAnchor = followPos.clone();
    const anchorDelta = followPos.clone().sub(this._camAnchor);
    anchorDelta.y = 0;
    if (anchorDelta.length() > 0.4) {
      // 玩家移动超过死区 → 相机目标跟随（但只跟一部分，保留预判空间）
      this._camAnchor.add(anchorDelta.multiplyScalar(0.6));
    }

    // 基础机位 + 跟随偏移（用 anchor 而非 followPos，避免每帧抖动）
    const targetPos = new THREE.Vector3(
      this.basePos.x + this._camAnchor.x,
      this.basePos.y,
      this.basePos.z + this._camAnchor.z
    );

    // 环绕半径（基础机位到注视点的距离）
    const dist = this.basePos.distanceTo(this.baseLook);

    // 环绕偏移（演出用：保持既有语义与原式，展示层已按其验收机位）
    if (Math.abs(this.orbitAngle) > 0.001) {
      const r = dist * 0.55;
      targetPos.x += Math.sin(this.orbitAngle) * r;
      targetPos.z -= (1 - Math.cos(this.orbitAngle)) * r * 0.4;
    }

    // 用户拖拽环绕：绕角色（followPos）Y 轴旋转当前机位水平偏移
    // 半径守恒（水平位移长度不变），与演出环绕叠加；不做偏心
    if (Math.abs(this.userOrbit) > 0.0005) {
      const dx = targetPos.x - followPos.x;
      const dz = targetPos.z - followPos.z;
      const c = Math.cos(this.userOrbit), s = Math.sin(this.userOrbit);
      targetPos.x = followPos.x + dx * c + dz * s;
      targetPos.z = followPos.z - dx * s + dz * c;
    }

    // 拉近（向目标推）：只在水平面收距离，不压低机位。
    // 基础机位仅 1.6m，若按完整三维方向推，命中特写会把相机压到角色脚边，
    // 既难看又会撞「相机高度 > 0.5」的回归判据。
    if (zoomK > 0) {
      const dir = new THREE.Vector3().subVectors(followPos, targetPos);
      dir.y = 0;
      if (dir.lengthSq() > 1e-8) targetPos.addScaledVector(dir.normalize(), zoomK * 1.2);
    }

    // 平滑跟随（修：阻尼系数从 0.14 降到 0.08，更稳）
    this.camera.position.lerp(targetPos, 0.08);
    this.camera.position.add(this.shakeOffset);

    // 注视点：用 anchor（与相机目标一致，避免视线抖动）
    const lookTarget = this.axis === "x"
      ? new THREE.Vector3(this._camAnchor.x, this.lookAtHeight, this._camAnchor.z)
      : new THREE.Vector3().lerpVectors(this.baseLook, this._camAnchor, 0.5 + this.focusWeight * 0.5);
    this.camera.lookAt(lookTarget);

    // FOV：拉近时收窄
    const fov = this.baseFov - zoomK * 8;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  get timeScale() {
    if (this.holdT > 0) return 0.05;   // 终结技拍4 定格（极慢余韵，顿帧结束后接管）
    return this.slowmoT > 0 ? 0.3 : 1.0;
  }

  /**
   * 修：只返回运镜偏移（不再直接控制相机，改由 CameraRig 控制）
   *
   * 修 2（2026-11-14 五拍化接线时发现的存量缺陷）：19bd0f2 相机重构把 step() 从主循环
   * 摘除后，slowmoT/orbitT 的衰减与 orbitAngle 的推进只存在于 step() 里，而 step()
   * 已无调用方（死代码）——活路径上 slowmoT 只增不减（首次慢镜/弹反/连携后 timeScale
   * 永久 0.3×）、orbitAngle 永不推进（getOffset().side 恒 0，环绕运镜失联）。
   * 此处恢复与 step() **完全相同**的推进语义（数值一律不动），保持 getOffset
   * 作为活路径唯一入口。
   *
   * @returns {{ zoom: number, side: number, look: number }} look = 拍4/拍5 注视点抬升
   */
  getOffset(dt) {
    // ---- 慢镜衰减（自 step() 恢复：按真实秒）----
    this.slowmoT = Math.max(0, this.slowmoT - dt);

    // ---- 环绕推进（自 step() 恢复：easeInOutCubic，108° 语义不变）----
    if (this.orbitT > 0) {
      this.orbitT -= dt;
      const raw = Math.max(0, 1 - this.orbitT / this.orbitDur);
      const p = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      this.orbitAngle = p * Math.PI * 0.6; // 环绕 108°
    } else {
      this.orbitAngle *= 0.9;
      this.focusWeight = Math.max(0, this.focusWeight - dt * 0.5);
    }

    // 拉近
    let zoomK = 0;
    if (this.zoomT > 0) {
      this.zoomT -= dt;
      const pz = 1 - this.zoomT / this.zoomDur;
      zoomK = pz < 0.18 ? pz / 0.18 : Math.pow(1 - (pz - 0.18) / 0.82, 1.6);
    }

    // ---- 终结技拍4 定格 / 拍5 回场 ----
    // hold 在顿帧（hitstop 完全停帧）期间暂停衰减：顿帧本身已是 0× 定格，
    // 顿帧结束后剩余 hold 以 0.05× 继续放完，两段合成「定格 → 极慢余韵」
    if (this.holdT > 0) {
      if (!this.frozenNow) this.holdT -= dt;
      this.holdLookBoost = FINISHER_HOLD_LOOK;
      if (this.holdT <= 0) this.returnT = FINISHER_RETURN_S;   // 进入拍5
    } else if (this.returnT > 0) {
      this.returnT -= dt;
      // 拍5 回场：0.3s 匀速（线性）tween 回基线偏移
      this.holdLookBoost = FINISHER_HOLD_LOOK * Math.max(0, this.returnT / FINISHER_RETURN_S);
      if (this.returnT <= 0) this.holdLookBoost = 0;
    }

    // 环绕偏移（连携/终结）
    let side = 0;
    if (this.orbitT > 0) {
      side = Math.sin(this.orbitAngle) * 0.8;
    }
    return { zoom: zoomK * 1.2, side, look: this.holdLookBoost };
  }

  /**
   * 修：只应用震屏抖动（叠加在 CameraRig 之上）
   */
  applyShake(camera) {
    if (this.shakeT > 0) {
      this.shakeT -= 1 / 60;
      const a = this.shakeT * 0.08;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
    }
  }
}
