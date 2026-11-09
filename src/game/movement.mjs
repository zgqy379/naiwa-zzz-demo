/**
 * 3D 移动系统 —— 动作游戏基础。
 *
 * 绝区零式移动特征：
 *  - 全向移动（WASD）+ 相机朝向解耦（摇杆方向即移动方向）
 *  - 加速度 + 摩擦（不是瞬移，有惯性）
 *  - 跳跃 + 重力
 *  - 闪避位移（带无敌帧）
 *  - 攻击前冲（攻击自带位移）
 *
 * 本文件只管物理/位移，不管动画（动画由 animation.mjs 读状态）。
 */
import * as THREE from "three";

export class Movement {
  /**
   * @param {object} o
   *  - group: THREE.Group（渲染对象，位置由本模块写）
   *  - camera: 用于把输入方向转成世界方向
   */
  constructor(o) {
    this.group = o.group;
    this.camera = o.camera;

    // 逻辑位置（x/z 平面 + y 垂直）
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3(0, 0, 0);

    // 朝向（绕 Y 轴，弧度）
    this.facing = 0;

    // 参数
    this.walkSpeed = 5.0;
    this.accel = 30.0;
    this.friction = 12.0;
    this.jumpVel = 7.5;
    this.gravity = 22.0;
    this.groundY = 0;

    // 状态
    this.grounded = true;
    this.dodgeT = 0;        // 闪避剩余时间
    this.dodgeDir = new THREE.Vector3();
    this.dodgeIframeT = 0;  // 无敌帧
    this.dodgeCooldown = 0;
    this.attackLungeT = 0;  // 攻击前冲
    this.attackLungeDir = new THREE.Vector3();

    // 边界
    this.bounds = { x: 8, z: 6 };
  }

  /**
   * 每逻辑帧推进。
   * @param {object} input { move: Vector2 (x=右,z=前), jump: bool, dodge: bool }
   * @param {number} dt 逻辑秒
   */
  step(input, dt) {
    // ---- 闪避 ----
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    if (input.dodge && this.dodgeCooldown <= 0 && this.dodgeT <= 0) {
      this.dodgeT = 0.28;
      this.dodgeIframeT = 0.32;
      this.dodgeCooldown = 0.6;
      // 闪避方向 = 当前输入方向（无输入则向后）
      const dir = this._inputDir(input.move);
      this.dodgeDir.copy(dir.lengthSq() > 0.001 ? dir.normalize() : new THREE.Vector3(0, 0, -1));
    }

    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      // 闪避位移：快速冲出 + 衰减
      const speed = 12.0;
      this.vel.x = this.dodgeDir.x * speed;
      this.vel.z = this.dodgeDir.z * speed;
    } else if (this.attackLungeT > 0) {
      // 攻击前冲
      this.attackLungeT -= dt;
      const speed = 8.0 * Math.max(0, this.attackLungeT / 0.15);
      this.vel.x = this.attackLungeDir.x * speed;
      this.vel.z = this.attackLungeDir.z * speed;
    } else {
      // ---- 常规移动 ----
      const dir = this._inputDir(input.move);
      if (dir.lengthSq() > 0.001) {
        this.vel.x += dir.x * this.accel * dt;
        this.vel.z += dir.z * this.accel * dt;
        // 限速
        const max = this.walkSpeed;
        const h = Math.hypot(this.vel.x, this.vel.z);
        if (h > max) {
          this.vel.x = (this.vel.x / h) * max;
          this.vel.z = (this.vel.z / h) * max;
        }
        // 朝向移动方向（平滑）
        const targetFacing = Math.atan2(dir.x, dir.z);
        this.facing = lerpAngle(this.facing, targetFacing, 1 - Math.pow(0.0001, dt));
      } else {
        // 摩擦
        const f = Math.max(0, 1 - this.friction * dt);
        this.vel.x *= f;
        this.vel.z *= f;
      }
    }

    // ---- 跳跃 / 重力 ----
    if (input.jump && this.grounded) {
      this.vel.y = this.jumpVel;
      this.grounded = false;
    }
    this.vel.y -= this.gravity * dt;

    // ---- 积分 ----
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // 地面碰撞
    if (this.pos.y <= this.groundY) {
      this.pos.y = this.groundY;
      this.vel.y = 0;
      this.grounded = true;
    }

    // 边界
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -this.bounds.x, this.bounds.x);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -this.bounds.z, this.bounds.z);

    // ---- 写入渲染对象 ----
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;

    this.dodgeIframeT = Math.max(0, this.dodgeIframeT - dt);
  }

  /** 攻击前冲 */
  lunge(dirWorld, duration = 0.15) {
    this.attackLungeDir.copy(dirWorld).normalize();
    this.attackLungeT = duration;
  }

  /** 把输入的屏幕方向转成世界方向（相对相机） */
  _inputDir(move) {
    if (!move || move.lengthSq() < 0.001) return new THREE.Vector3();
    // 相机朝向（只取 Y 旋转）
    const camYaw = Math.atan2(
      this.camera.getWorldDirection(new THREE.Vector3()).x,
      this.camera.getWorldDirection(new THREE.Vector3()).z
    );
    const cos = Math.cos(camYaw);
    const sin = Math.sin(camYaw);
    // 屏幕 (x=右, y=前) → 世界
    const wx = move.x * cos + move.y * sin;
    const wz = -move.x * sin + move.y * cos;
    return new THREE.Vector3(wx, 0, wz);
  }

  /** 面向目标 */
  faceToward(targetPos) {
    const dx = targetPos.x - this.pos.x;
    const dz = targetPos.z - this.pos.z;
    if (Math.hypot(dx, dz) > 0.01) {
      this.facing = Math.atan2(dx, dz);
    }
  }

  get isDodging() { return this.dodgeT > 0; }
  get hasIframe() { return this.dodgeIframeT > 0; }
  get isMoving() { return Math.hypot(this.vel.x, this.vel.z) > 0.5; }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
