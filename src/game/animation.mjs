/**
 * 程序化动画层 —— 用代码驱动模型动作（代替手 K 动画）。
 *
 * 绝区零式动作特征（程序化近似）：
 *  - idle：呼吸起伏 + 轻微摇摆
 *  - 移动：身体前倾 + 上下颠簸 + 挤压拉伸
 *  - 攻击：三段（起手→挥击→收招），带挤压拉伸 + 前倾
 *  - 受击：后仰 + 抖动
 *  - 闪避：快速侧移 + 拉伸
 *  - 终结技：大幅动作 + 慢镜配合
 *
 * 实现方式：读 movement 状态 + 动作状态机，写模型的 position/rotation/scale。
 * 所有数值为「演出参数」，集中在本文件，便于调。
 */
import * as THREE from "three";

/** 动作状态 */
export const ACTION = {
  IDLE: "idle",
  MOVE: "move",
  ATTACK_1: "attack1",
  ATTACK_2: "attack2",
  ATTACK_3: "attack3",
  HIT: "hit",
  DODGE: "dodge",
  FINISHER: "finisher",
};

/** 动作时长（秒）—— 调校：更干脆，不拖节奏 */
const ACTION_DUR = {
  attack1: 0.26,
  attack2: 0.30,
  attack3: 0.36,
  finisher: 1.0,
  hit: 0.18,
};

export class ProceduralAnim {
  /**
   * @param {object} o
   *  - modelRoot: THREE.Group（内层 wrapper，缩放由它承担）
   *  - movement: Movement 实例
   */
  constructor(o) {
    this.modelRoot = o.modelRoot;
    this.movement = o.movement;
    this.inner = o.modelRoot.getObjectByName("model-wrapper") || o.modelRoot;

    // 动作状态
    this.action = ACTION.IDLE;
    this.actionT = 0;
    this.actionDur = 0;

    // 动画相位
    this.idlePhase = Math.random() * Math.PI * 2;
    this.movePhase = 0;

    // 受击抖动
    this.hitShake = 0;

    // 基础缩放（记录，供挤压拉伸用）
    this.baseScale = this.inner.scale.clone();
  }

  /** 触发一个动作 */
  play(action, dur) {
    this.action = action;
    this.actionT = 0;
    this.actionDur = dur ?? ACTION_DUR[action] ?? 0.3;
    if (action === ACTION.HIT) this.hitShake = 1;
  }

  /** 每帧推进（渲染帧 dt） */
  step(dt) {
    this.actionT += dt;
    this.idlePhase += dt * 2.2;
    this.movePhase += dt * (this.movement.isMoving ? 9 : 0);

    // 动作结束 → 回 idle
    if (this.action !== ACTION.IDLE && this.action !== ACTION.MOVE) {
      if (this.actionT >= this.actionDur) {
        this.action = this.movement.isMoving ? ACTION.MOVE : ACTION.IDLE;
        this.actionT = 0;
      }
    } else {
      this.action = this.movement.isMoving ? ACTION.MOVE : ACTION.IDLE;
    }

    // 先重置
    this.inner.position.set(0, 0, 0);
    this.inner.rotation.set(0, 0, 0);
    this.inner.scale.copy(this.baseScale);

    // 按动作叠加
    switch (this.action) {
      case ACTION.IDLE: this._idle(dt); break;
      case ACTION.MOVE: this._move(dt); break;
      case ACTION.ATTACK_1: this._attack(dt, 1); break;
      case ACTION.ATTACK_2: this._attack(dt, 2); break;
      case ACTION.ATTACK_3: this._attack(dt, 3); break;
      case ACTION.FINISHER: this._finisher(dt); break;
      case ACTION.HIT: this._hit(dt); break;
      case ACTION.DODGE: this._dodge(dt); break;
    }
  }

  _idle(dt) {
    // 呼吸：轻微上下 + 摇摆
    const b = Math.sin(this.idlePhase) * 0.02;
    this.inner.position.y = b;
    this.inner.rotation.z = Math.sin(this.idlePhase * 0.7) * 0.03;
    const s = 1 + Math.sin(this.idlePhase) * 0.015;
    this.inner.scale.set(this.baseScale.x, this.baseScale.y * s, this.baseScale.z);
  }

  _move(dt) {
    // 前倾 + 上下颠簸 + 轻微左右摆
    const bob = Math.abs(Math.sin(this.movePhase)) * 0.06;
    this.inner.position.y = bob;
    this.inner.rotation.x = 0.12; // 前倾
    this.inner.rotation.z = Math.sin(this.movePhase) * 0.06;
    // 挤压拉伸：颠簸时拉长
    const stretch = 1 + Math.abs(Math.sin(this.movePhase)) * 0.04;
    this.inner.scale.set(this.baseScale.x, this.baseScale.y * stretch, this.baseScale.z);
  }

  _attack(dt, stage) {
    // 三段攻击：起手(0~0.3) → 挥击(0.3~0.6) → 收招(0.6~1.0)
    const t = this.actionT / this.actionDur;
    const power = stage / 3; // 1/3, 2/3, 1
    if (t < 0.3) {
      // 起手：后仰蓄力
      const k = t / 0.3;
      this.inner.rotation.x = -0.25 * k * power;
      this.inner.scale.set(
        this.baseScale.x * (1 + 0.1 * k * power),
        this.baseScale.y * (1 - 0.08 * k * power),
        this.baseScale.z
      );
    } else if (t < 0.6) {
      // 挥击：前倾猛冲
      const k = (t - 0.3) / 0.3;
      this.inner.rotation.x = -0.25 * power + 0.6 * k * power;
      this.inner.position.y = Math.sin(k * Math.PI) * 0.08 * power;
      this.inner.scale.set(
        this.baseScale.x * (1 + 0.05 * power),
        this.baseScale.y * (1 + 0.12 * k * power),
        this.baseScale.z
      );
    } else {
      // 收招：回正
      const k = (t - 0.6) / 0.4;
      this.inner.rotation.x = (0.35 * power) * (1 - k);
      this.inner.scale.lerp(this.baseScale, k);
    }
  }

  _finisher(dt) {
    // 终结技：大幅旋转 + 拉伸 + 下砸
    const t = this.actionT / this.actionDur;
    if (t < 0.4) {
      // 蓄力上举
      const k = t / 0.4;
      this.inner.rotation.x = -0.5 * k;
      this.inner.position.y = 0.2 * k;
      this.inner.scale.set(
        this.baseScale.x * (1 - 0.12 * k),
        this.baseScale.y * (1 + 0.25 * k),
        this.baseScale.z
      );
    } else if (t < 0.6) {
      // 下砸
      const k = (t - 0.4) / 0.2;
      this.inner.rotation.x = -0.5 + 1.2 * k;
      this.inner.position.y = 0.2 * (1 - k);
      this.inner.scale.set(
        this.baseScale.x * (1 + 0.2 * k),
        this.baseScale.y * (1 - 0.15 * k),
        this.baseScale.z
      );
    } else {
      // 收势
      const k = (t - 0.6) / 0.4;
      this.inner.rotation.x = 0.7 * (1 - k);
      this.inner.scale.lerp(this.baseScale, k);
    }
  }

  _hit(dt) {
    // 受击：后仰 + 抖动
    const t = this.actionT / this.actionDur;
    this.hitShake = Math.max(0, 1 - t);
    const shake = this.hitShake * 0.08;
    this.inner.rotation.x = -0.4 * (1 - t);
    this.inner.position.x = (Math.random() - 0.5) * shake;
    this.inner.position.y = (Math.random() - 0.5) * shake;
    this.inner.scale.set(
      this.baseScale.x * (1 + 0.1 * (1 - t)),
      this.baseScale.y * (1 - 0.1 * (1 - t)),
      this.baseScale.z
    );
  }

  _dodge(dt) {
    // 闪避：侧倾 + 拉伸
    const t = this.actionT / this.actionDur;
    this.inner.rotation.z = Math.sin(t * Math.PI) * 0.5;
    this.inner.scale.set(
      this.baseScale.x * (1 + 0.15 * Math.sin(t * Math.PI)),
      this.baseScale.y * (1 - 0.1 * Math.sin(t * Math.PI)),
      this.baseScale.z
    );
  }

  /** 当前是否在攻击动作中 */
  get isAttacking() {
    return [ACTION.ATTACK_1, ACTION.ATTACK_2, ACTION.ATTACK_3, ACTION.FINISHER].includes(this.action);
  }
}
