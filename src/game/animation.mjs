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
    // 修：动画层用内层 anim-root（不直接操作 wrapper，避免覆盖贴地偏移）
    this.inner = o.modelRoot.getObjectByName("anim-root")
      || o.modelRoot.getObjectByName("model-wrapper")
      || o.modelRoot;

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

  /**
   * 触发一个动作
   * @param {string} action 动作名
   * @param {number} dur 时长
   * @param {object} move 招式参数（可选，含 style/lean/squash）——「换壳即换招」
   */
  play(action, dur, move = null) {
    this.action = action;
    this.actionT = 0;
    this.actionDur = dur ?? ACTION_DUR[action] ?? 0.3;
    if (action === ACTION.HIT) this.hitShake = 1;
    // 记录本只角色的招式风格（供 _attack 使用）
    if (move) {
      this.moveStyle = move.style ?? "slash";
      this.moveLean = move.anim?.lean ?? 0.5;
      this.moveSquash = move.anim?.squash ?? 0.8;
    }
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
    // 三段攻击，按 ATTACK_STYLE 分 6 种动作语言（「换壳即换招」的视觉核心）
    const t = this.actionT / this.actionDur;
    const power = stage / 3;
    const style = this.moveStyle ?? "slash";
    const lean = this.moveLean ?? 0.5;
    const squash = this.moveSquash ?? 0.8;

    switch (style) {
      case "thrust": {
        // 突刺：直线前冲 + 强烈前后拉伸（差异强化：位移更大、拉伸更强）
        if (t < 0.22) {
          const k = t / 0.22;
          this.inner.rotation.x = -0.1 * k;
          this.inner.scale.set(
            this.baseScale.x * (1 - 0.18 * k),   // 明显变细
            this.baseScale.y * (1 - 0.08 * k),
            this.baseScale.z * (1 + 0.3 * k)     // 明显拉长
          );
        } else if (t < 0.5) {
          const k = (t - 0.22) / 0.28;
          this.inner.rotation.x = -0.1 + 0.45 * k;
          this.inner.position.z = Math.sin(k * Math.PI) * 0.45 * power;  // 位移加大
          this.inner.scale.set(
            this.baseScale.x * (1 + 0.2 * k),
            this.baseScale.y * (1 + 0.1 * k),
            this.baseScale.z * (1 + 0.2)
          );
        } else {
          const k = (t - 0.5) / 0.5;
          this.inner.position.z *= (1 - k);
          this.inner.rotation.x = 0.35 * (1 - k);
          this.inner.scale.lerp(this.baseScale, k);
        }
        break;
      }

      case "slam": {
        // 砸地：跳起 + 下砸 + 挤压（纵向为主）
        if (t < 0.35) {
          const k = t / 0.35;
          this.inner.position.y = Math.sin(k * Math.PI) * 0.3 * power;
          this.inner.rotation.x = -0.4 * k;
          this.inner.scale.set(
            this.baseScale.x * (1 - 0.08 * k),
            this.baseScale.y * (1 + 0.2 * k),
            this.baseScale.z
          );
        } else if (t < 0.55) {
          const k = (t - 0.35) / 0.2;
          this.inner.position.y = 0.3 * power * (1 - k);
          this.inner.rotation.x = -0.4 + 0.9 * k;
          this.inner.scale.set(
            this.baseScale.x * (1 + 0.2 * k),
            this.baseScale.y * (1 - 0.15 * k),
            this.baseScale.z
          );
        } else {
          const k = (t - 0.55) / 0.45;
          this.inner.rotation.x = 0.5 * (1 - k);
          this.inner.scale.lerp(this.baseScale, k);
        }
        break;
      }

      case "spin": {
        // 旋转：绕 Y 轴大幅旋转 + 水平展开（差异强化：转两圈）
        const spinT = t * Math.PI * 4 * (1 + power * 0.25);  // 两圈
        this.inner.rotation.y = spinT;   // 连续旋转（不是摇摆）
        this.inner.rotation.x = 0.15;
        this.inner.scale.set(
          this.baseScale.x * (1 + Math.abs(Math.sin(spinT)) * 0.22),  // 展开更大
          this.baseScale.y * (1 + Math.abs(Math.sin(spinT * 2)) * 0.12),
          this.baseScale.z * (1 + Math.abs(Math.sin(spinT)) * 0.22)
        );
        break;
      }

      case "peck": {
        // 啄击：快速点刺（差异强化：5 次高频 + 明显点头）
        const peckT = t * 5;  // 5 次
        const peck = Math.sin(peckT * Math.PI);
        this.inner.rotation.x = -0.3 + peck * 0.8;   // 点头幅度大
        this.inner.position.y = Math.abs(peck) * 0.08;
        this.inner.scale.set(
          this.baseScale.x * (1 + peck * 0.12),
          this.baseScale.y * (1 - peck * 0.1),
          this.baseScale.z
        );
        break;
      }

      case "lash": {
        // 鞭击：长弧横扫（大幅左右摆）
        if (t < 0.3) {
          const k = t / 0.3;
          this.inner.rotation.z = -0.5 * k * power;
          this.inner.rotation.x = -0.2 * k;
        } else if (t < 0.6) {
          const k = (t - 0.3) / 0.3;
          this.inner.rotation.z = -0.5 * power + 1.0 * k * power;
          this.inner.rotation.x = -0.2 + 0.4 * k;
          this.inner.scale.set(
            this.baseScale.x * (1 + 0.1 * k),
            this.baseScale.y * (1 + 0.05 * k),
            this.baseScale.z
          );
        } else {
          const k = (t - 0.6) / 0.4;
          this.inner.rotation.z = 0.5 * power * (1 - k);
          this.inner.rotation.x = 0.2 * (1 - k);
          this.inner.scale.lerp(this.baseScale, k);
        }
        break;
      }

      default: {
        // 挥击（slash）：经典三段（原逻辑 + 参数化）
        if (t < 0.3) {
          const k = t / 0.3;
          this.inner.rotation.x = -0.25 * k * power * lean;
          this.inner.scale.set(
            this.baseScale.x * (1 + 0.1 * k * power * squash),
            this.baseScale.y * (1 - 0.08 * k * power * squash),
            this.baseScale.z
          );
        } else if (t < 0.6) {
          const k = (t - 0.3) / 0.3;
          this.inner.rotation.x = -0.25 * power * lean + 0.6 * k * power * lean;
          this.inner.position.y = Math.sin(k * Math.PI) * 0.08 * power;
          this.inner.scale.set(
            this.baseScale.x * (1 + 0.05 * power * squash),
            this.baseScale.y * (1 + 0.12 * k * power * squash),
            this.baseScale.z
          );
        } else {
          const k = (t - 0.6) / 0.4;
          this.inner.rotation.x = (0.35 * power * lean) * (1 - k);
          this.inner.scale.lerp(this.baseScale, k);
        }
        break;
      }
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
