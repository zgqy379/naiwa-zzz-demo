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

    // 边界（修：收窄到店铺内侧，避免相机穿墙。店铺在 z=±4.6，相机 sideOffset 2.2）
    this.bounds = { x: 4.5, z: 2.2 };

    // 实体碰撞盒（XZ 平面 AABB：{minX,maxX,minZ,maxZ}），由外部注入（如掩体）
    this.solidBoxes = [];
    this.radius = 0.4;   // 角色碰撞半径（推出判定时按此膨胀）
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
      // 阶段 G：灵闪鸣徽加成（+0.1s/层）
      this.dodgeIframeT = 0.32 + (this.dodgeIframeBonus ?? 0);
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

    // 实体碰撞（掩体等注入的 AABB）
    this._resolveSolids();

    // ---- 写入渲染对象 ----
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;

    this.dodgeIframeT = Math.max(0, this.dodgeIframeT - dt);
  }

  /**
   * 实体碰撞：把位置推出 solidBoxes（XZ 平面，最浅轴推出，含角色半径）。
   * 闪避/前冲速度（≤12u/s）单帧位移 ~0.2 < 掩体有效厚度，无需连续检测。
   */
  _resolveSolids() {
    if (!this.solidBoxes.length) return;
    const r = this.radius;
    for (const b of this.solidBoxes) {
      const minX = b.minX - r, maxX = b.maxX + r;
      const minZ = b.minZ - r, maxZ = b.maxZ + r;
      if (this.pos.x <= minX || this.pos.x >= maxX || this.pos.z <= minZ || this.pos.z >= maxZ) continue;
      // 圆心在膨胀盒内：向四邻方向取穿透最小者推出
      const dL = this.pos.x - minX, dR = maxX - this.pos.x;
      const dB = this.pos.z - minZ, dF = maxZ - this.pos.z;
      const m = Math.min(dL, dR, dB, dF);
      if (m === dL) this.pos.x = minX;
      else if (m === dR) this.pos.x = maxX;
      else if (m === dB) this.pos.z = minZ;
      else this.pos.z = maxZ;
    }
  }

  /** 攻击前冲 */
  lunge(dirWorld, duration = 0.15) {
    this.attackLungeDir.copy(dirWorld).normalize();
    this.attackLungeT = duration;
  }

  /** 把输入的屏幕方向转成世界方向 */
  _inputDir(move) {
    if (!move || move.lengthSq() < 0.001) return new THREE.Vector3();

    // 本项目相机沿 X 轴看街道（从 +X 看向 -X）
    // 实现映射（与 input.mjs updateMove 的按键增量一一对应）：
    //   A = -X  D = +X（沿街道轴）
    //   W = +Z  S = -Z（横穿街道轴）
    // 注：机位在 +X 侧、含 +Z 侧偏（tuning.mjs distance=3.8/sideOffset=2.2，约 30° 侧角），
    //     屏幕右 ≈ 世界 (0.50, 0, -0.87)：W/S 偏屏幕横向、A/D 兼具纵深分量，
    //     与屏幕坐标轴不对齐；是否按机位重排映射属设计取舍，待世界/展示线定夺
    return new THREE.Vector3(move.x, 0, move.y);
  }

  /** 面向目标（带相机偏好：3/4 侧身，不完全背对相机） */
  faceToward(targetPos, cameraPos = null) {
    const dx = targetPos.x - this.pos.x;
    const dz = targetPos.z - this.pos.z;
    if (Math.hypot(dx, dz) < 0.01) return;

    let targetFacing = Math.atan2(dx, dz);

    // 如果有相机位置，偏向相机 45°（3/4 侧面，既有对峙感又不背对）
    if (cameraPos) {
      const cdx = cameraPos.x - this.pos.x;
      const cdz = cameraPos.z - this.pos.z;
      const camFacing = Math.atan2(cdx, cdz);
      // 在「面向对手」和「面向相机」之间插值 35%
      targetFacing = lerpAngle(targetFacing, camFacing, 0.35);
    }

    this.facing = targetFacing;
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
