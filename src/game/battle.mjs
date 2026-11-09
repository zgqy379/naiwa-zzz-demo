/**
 * 战斗编排 —— 绝区零式节奏：
 *   失衡累积 → 满格瘫痪 → 连携窗口 → 换人连锁 → 终结技演出
 *
 * 反馈层（复用奶蛙零已验证机制）：
 *   hitstop 顿帧 / 震屏四档 / 连携慢镜 / 白闪 / 粒子
 *
 * 设计口径：
 *   - 90 秒 3 轮，失衡 3 格，连携窗口 2 秒
 *   - 玩家：A/D 移动、空格蓄力攻击、Shift 闪避、Tab 接力
 *   - 对手：AI 反扑，可被失衡
 */
import * as THREE from "three";
import { TUNING, hitProfile } from "./tuning.mjs";
import { Shake } from "../vfx/shake.mjs";

export class Battle {
  /**
   * @param {object} o
   *  - player: { group, meshes, x, hp, state }
   *  - opponent: { group, meshes, x, hp, state }
   *  - camera, scene, hud
   */
  constructor(o) {
    this.player = o.player;
    this.opponent = o.opponent;
    this.camera = o.camera;
    this.scene = o.scene;
    this.hud = o.hud;
    this.shake = new Shake();

    this.phase = "playing"; // playing | settle
    this.timer = TUNING.roundTotalS;
    this.round = 1;
    this.roundT = TUNING.roundS;
    this.grids = 0;          // 失衡格
    this.combo = 0;
    this.windowT = -1;       // 连携窗口剩余（<0 关闭）
    this.chainReady = false;

    this.playerHp = 100;
    this.oppHp = 100;

    // hitstop
    this.freezeT = 0;        // 剩余冻结秒
    // 慢镜
    this.slowmoT = 0;

    // 攻击冷却
    this.attackCd = 0;
    this.chargeT = 0;
    this.charging = false;

    // 对手 AI
    this.oppTimer = 0;
    this.oppInterval = 5.5;

    // 特效容器
    this.fxGroup = new THREE.Group();
    this.scene.add(this.fxGroup);
    this.particles = [];

    this._syncHud();
  }

  _syncHud() {
    if (!this.hud) return;
    this.hud.set({
      timer: Math.max(0, this.timer),
      round: this.round,
      rounds: TUNING.rounds,
      grids: this.grids,
      combo: this.combo,
      hp: this.playerHp,
      oppHp: this.oppHp,
      canAttack: this.attackCd <= 0,
      canCharge: true,
      canDodge: true,
      canSwap: this.combo > 0,
      chainReady: this.chainReady,
    });
  }

  // ---------- 输入 ----------
  onKeyDown(key) {
    if (this.phase !== "playing") return;
    if (key === " " && this.attackCd <= 0) {
      this.charging = true;
      this.chargeT = 0;
    } else if (key === "Shift") {
      this._dodge();
    } else if (key === "Tab" && this.combo > 0) {
      this._swap();
    }
  }

  onKeyUp(key) {
    if (key === " " && this.charging) {
      this.charging = false;
      this._attack();
    }
  }

  moveAxis(axis) {
    // axis ∈ [-1,1]
    this.player.x = THREE.MathUtils.clamp(
      this.player.x + axis * TUNING.playerSpeed * 0.016,
      TUNING.stageXMin,
      TUNING.stageXMax
    );
  }

  // ---------- 行为 ----------
  _attack() {
    if (this.attackCd > 0 || this.phase !== "playing") return;
    // 蓄力时长决定档位
    const t = this.chargeT;
    let tier = "light";
    if (t > 1.2) tier = "finisher";
    else if (t > 0.6) tier = "heavy";
    else if (t > 0.25) tier = "medium";

    const prof = hitProfile(tier);
    this.attackCd = tier === "finisher" ? 1.2 : tier === "heavy" ? 0.6 : 0.3;

    // 攻击前冲（绝区零式：攻击自带位移）
    const dir = Math.sign(this.opponent.x - this.player.x) || 1;
    this.player.x = THREE.MathUtils.clamp(
      this.player.x + dir * 0.5,
      TUNING.stageXMin,
      TUNING.stageXMax
    );

    // 命中判定（简化：距离内即命中）
    const dist = Math.abs(this.player.x - this.opponent.x);
    if (dist < 2.6) {
      this._applyHit(tier, prof);
    }
    this._syncHud();
  }

  _applyHit(tier, prof) {
    // 顿帧
    this.freezeT = Math.max(this.freezeT, prof.hitstopF / TUNING.logicFps);
    // 震屏
    this.shake.kick(tier);
    // 白闪 + 粒子
    this._spawnImpact(tier);
    // 失衡累积
    this.grids = Math.min(TUNING.balanceGrids, this.grids + (tier === "finisher" ? 3 : 1));
    // 伤害
    const dmg = tier === "finisher" ? 30 : tier === "heavy" ? 18 : tier === "medium" ? 10 : 5;
    this.oppHp = Math.max(0, this.oppHp - dmg);

    // 失衡满 → 连携窗口
    if (this.grids >= TUNING.balanceGrids) {
      this.windowT = TUNING.comboWindowS;
      this.chainReady = true;
    }

    // 连携计数
    if (this.windowT > 0) {
      this.combo++;
      // 慢镜
      this.slowmoT = TUNING.chain.slowmoS;
    }

    // 对手受击闪变
    this._flashOpponent();
  }

  _swap() {
    if (this.combo <= 0) return;
    // 换人 = 换壳（demo 里换模型）
    this.combo = 0;
    this.grids = 0;
    this.windowT = -1;
    this.chainReady = false;
    // 终结技：3 连携后
    if (this.combo >= 3) {
      this._finisher();
    }
    this._syncHud();
  }

  _finisher() {
    this.freezeT = Math.max(this.freezeT, 0.8);
    this.shake.kick("ultimate");
    this._spawnImpact("finisher");
  }

  _dodge() {
    // 闪避：短位移 + 无敌
    this.player.x = THREE.MathUtils.clamp(
      this.player.x + (Math.random() > 0.5 ? 1 : -1) * TUNING.dodgeDistance,
      TUNING.stageXMin,
      TUNING.stageXMax
    );
    this.player.dodgeT = TUNING.dodgeIframeS;
  }

  _flashOpponent() {
    const mats = [];
    this.opponent.group.traverse((c) => { if (c.isMesh && !c.userData.__isOutline) mats.push(c.material); });
    for (const m of mats) {
      if (m.emissive) {
        m.emissive.setHex(0xffffff);
        m.emissiveIntensity = 0.8;
      }
    }
    setTimeout(() => {
      for (const m of mats) {
        if (m.emissive) { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
      }
    }, 90);
  }

  _spawnImpact(tier) {
    const count = tier === "finisher" ? 40 : tier === "heavy" ? 24 : 12;
    const color = tier === "finisher" ? 0xff3d8b : tier === "heavy" ? 0xffb03a : 0xf5c542;
    for (let i = 0; i < count; i++) {
      const size = 0.04 + Math.random() * 0.08;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      m.position.set(
        this.opponent.x + (Math.random() - 0.5) * 0.6,
        0.8 + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.4
      );
      m.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 2
      );
      m.userData.life = 0.5 + Math.random() * 0.3;
      this.fxGroup.add(m);
      this.particles.push(m);
    }
  }

  // ---------- 主循环 ----------
  /**
   * @param {number} dt 真实秒
   * @param {boolean} frozen 是否处于 hitstop（冻结逻辑）
   */
  step(dt, frozen) {
    // 震屏始终走真实 dt
    this.shake.step(dt, this.camera);

    if (frozen) return;

    // 慢镜：角色动作 dt 缩放
    const scale = this.slowmoT > 0 ? TUNING.chain.slowmoScale : 1;
    const mdt = dt * scale;
    this.slowmoT = Math.max(0, this.slowmoT - dt);

    // 计时
    this.timer -= dt;
    this.roundT -= dt;
    if (this.roundT <= 0 && this.round < TUNING.rounds) {
      this.round++;
      this.roundT = TUNING.roundS;
      this.oppInterval = [5.5, 4.5, 3.5][this.round - 1] ?? 3.5;
    }
    if (this.timer <= 0) this.phase = "settle";

    // 冷却
    this.attackCd = Math.max(0, this.attackCd - dt);
    if (this.charging) this.chargeT += dt;

    // 连携窗口
    if (this.windowT > 0) {
      this.windowT -= dt;
      if (this.windowT <= 0) {
        this.windowT = -1;
        this.chainReady = false;
        this.combo = 0;
        this.grids = 0;
      }
    }

    // 对手 AI
    this.oppTimer += mdt;
    if (this.oppTimer >= this.oppInterval) {
      this.oppTimer = 0;
      // 反扑：距离够则命中玩家
      if (Math.abs(this.player.x - this.opponent.x) < 2.4 && this.player.dodgeT <= 0) {
        this.playerHp = Math.max(0, this.playerHp - 8);
        this.shake.kick("medium");
      }
      // 对手小跳
      this.opponent.group.position.y = 0.15;
      setTimeout(() => { this.opponent.group.position.y = 0; }, 180);
    }

    // 玩家闪避计时
    if (this.player.dodgeT > 0) this.player.dodgeT -= dt;

    // 粒子推进
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.userData.life -= dt;
      if (p.userData.life <= 0) {
        this.fxGroup.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.y -= 9.8 * dt;
      p.material.opacity = Math.min(1, p.userData.life * 2);
      p.rotation.x += dt * 4;
      p.rotation.y += dt * 3;
    }

    // 位置同步
    this.player.group.position.x = this.player.x;
    this.opponent.group.position.x = this.opponent.x;

    this._syncHud();
  }
}
