/**
 * 命中反馈层 —— 白闪 + 拟声词 + 画面震动（绝区零标志性打击反馈）。
 *
 * 三层：
 *  1. **白闪**：全屏白色闪光（命中瞬间，2–3 帧）
 *  2. **拟声词**：命中点弹出「咚！」「啪！」「轰！」等漫画拟声词
 *  3. **画面震动**：相机冲击（由 cinematic 处理，这里触发）
 *
 * 全部 DOM/CSS 实现，零外部素材。
 */
import * as THREE from "three";

export class HitFeedback {
  constructor() {
    // 白闪层
    this.flashEl = document.createElement("div");
    this.flashEl.className = "hit-flash";
    document.body.appendChild(this.flashEl);
    this.flashT = 0;
    this.flashDur = 0;

    // 拟声词容器
    this.sfxContainer = document.createElement("div");
    this.sfxContainer.className = "sfx-container";
    document.body.appendChild(this.sfxContainer);
    this.sfxPool = [];

    // 拟声词文案（按档位）
    this.words = {
      light: ["啪", "咚", "砰", "唰"],
      medium: ["咚！", "轰！", "哐！", "啪！"],
      heavy: ["轰！", "哐当！", "砰！！", "咚——"],
      ultimate: ["轰！！！", "绝杀！", "终结！", "碎！"],
    };
  }

  /**
   * 触发命中反馈
   * @param {THREE.Vector3} worldPos 命中点世界坐标
   * @param {string} tier light|medium|heavy|ultimate
   * @param {THREE.Camera} camera 用于把世界坐标转屏幕坐标
   * @param {string|null} label 自定义词（如「克制！」「抵抗」）；为空则随机取拟声词
   * @param {boolean} gold 金色大字（阶段 F：失衡期命中）
   */
  trigger(worldPos, tier = "light", camera = null, label = null, gold = false) {
    // 1) 白闪
    const flashStrength = { light: 0.15, medium: 0.3, heavy: 0.45, ultimate: 0.7 }[tier] ?? 0.2;
    this._flash(flashStrength, tier === "ultimate" ? 0.12 : 0.06);

    // 2) 拟声词（屏幕坐标）
    if (camera) {
      const screenPos = this._worldToScreen(worldPos, camera);
      if (screenPos) {
        this._showWord(screenPos.x, screenPos.y, tier, label, gold);
      }
    }
  }

  /** 白闪 */
  _flash(strength, duration) {
    this.flashEl.style.opacity = String(strength);
    this.flashT = duration;
    this.flashDur = duration;
  }

  /** 拟声词（label 非空时显示自定义词，如克制关系提示；gold=失衡期金色大字） */
  _showWord(x, y, tier, label = null, gold = false) {
    const list = this.words[tier] ?? this.words.light;
    const text = label || list[Math.floor(Math.random() * list.length)];

    const el = document.createElement("div");
    el.className = "sfx-word " + tier + (label ? " sfx-relation" : "") + (gold ? " gold" : "");
    el.textContent = text;
    // 随机偏移（避免重叠）
    const ox = (Math.random() - 0.5) * 60;
    const oy = (Math.random() - 0.5) * 30;
    el.style.left = `${x + ox}px`;
    el.style.top = `${y + oy}px`;
    this.sfxContainer.appendChild(el);
    this.sfxPool.push(el);

    // 动画结束后移除
    setTimeout(() => {
      el.classList.add("sfx-out");
      setTimeout(() => {
        el.remove();
        const i = this.sfxPool.indexOf(el);
        if (i >= 0) this.sfxPool.splice(i, 1);
      }, 300);
    }, tier === "ultimate" ? 800 : 500);
  }

  /** 世界坐标 → 屏幕坐标 */
  _worldToScreen(pos, camera) {
    const v = pos.clone().project(camera);
    if (v.z > 1) return null; // 在相机后方
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /** 每帧更新 */
  update(dt) {
    // 白闪衰减
    if (this.flashT > 0) {
      this.flashT -= dt;
      const p = Math.max(0, this.flashT / this.flashDur);
      this.flashEl.style.opacity = String(parseFloat(this.flashEl.style.opacity) * p);
      if (this.flashT <= 0) this.flashEl.style.opacity = "0";
    }
  }
}
