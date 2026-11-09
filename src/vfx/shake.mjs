/**
 * 震屏（trauma-based，四档振幅）。
 * 参数唯一来源 = tuning.mjs 的 TUNING.shake。
 *
 * 应用面：只加相机旋转偏移（俯仰+滚转），不改位置。
 * 定帧中继续衰减（真实 dt），不停震。
 */
import { TUNING } from "../game/tuning.mjs";

const DEG2RAD = Math.PI / 180;

export class Shake {
  constructor() {
    this.t = TUNING.shake;
    this.trauma = 0;
    this.ampDeg = 0;       // 平滑后的当前幅值（度）
    this.phase = 0;
    this._maxDeg = 0;
    this._baseX = null;
    this._baseZ = null;
    this._writtenX = 0;
    this._writtenZ = 0;
  }

  /** 命中踢震：tier = light|medium|heavy|ultimate */
  kick(tier) {
    const s = this.t[tier] ?? this.t.light;
    this._maxDeg = s.max;
    this.trauma = Math.min(1, this.trauma + (s.max / this.t.ultimate.max));
  }

  /** 每渲染帧推进；dt = 真实秒（定帧中照走） */
  step(dt, camera) {
    // 衰减
    this.trauma = Math.max(0, this.trauma - this.t.decayPerS * dt);
    // 目标幅值 = T² × max
    const target = this.trauma * this.trauma * this._maxDeg;
    // 一阶滞后平滑（半衰期）
    const k = 1 - Math.pow(0.5, dt / this.t.halfLife);
    this.ampDeg += (target - this.ampDeg) * k;
    // 22Hz 抖动
    this.phase += dt * this.t.frequencyHz * Math.PI * 2;

    // 记录相机基线（首次）
    if (this._baseX === null) {
      this._baseX = camera.rotation.x;
      this._baseZ = camera.rotation.z;
    }

    // 计算偏移
    const a = this.ampDeg * DEG2RAD;
    const dx = a * Math.sin(this.phase * 1.0);
    const dz = a * Math.cos(this.phase * 0.9);

    // 回写基线 + 偏移
    camera.rotation.x = this._baseX + dx;
    camera.rotation.z = this._baseZ + dz;
    this._writtenX = dx;
    this._writtenZ = dz;

    // 衰减到接近 0 时归零，避免残留
    if (this.trauma <= 0.001) {
      camera.rotation.x = this._baseX;
      camera.rotation.z = this._baseZ;
      this._writtenX = 0;
      this._writtenZ = 0;
    }
  }

  /** 每帧渲染前重置基线（由主循环调用） */
  resetBase(camera) {
    this._baseX = camera.rotation.x - this._writtenX;
    this._baseZ = camera.rotation.z - this._writtenZ;
  }
}
