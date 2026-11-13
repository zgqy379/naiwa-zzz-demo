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

    // 切镜黑场层（终结技拍2：命中前 1 帧黑场，仅喧响终结技用；内联样式，不依赖新 CSS）
    // z-index 89：压在白闪(.hit-flash, 90) 与拟声词(.sfx-container, 91) 之下，
    // 黑场先亮 → 命中白闪/招式名叠上，形成「切镜 → 本体」的顺序感
    this.cutEl = document.createElement("div");
    Object.assign(this.cutEl.style, {
      position: "fixed",
      inset: "0",
      background: "#000",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "89",
    });
    document.body.appendChild(this.cutEl);
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

  /**
   * 白闪公开口（非命中路径复用白闪层）：
   * 换人登场六步第 1 步「金/白闪 0.1s」（2026-11-14 路线图④）。
   * @param {number} strength 0-1 初始不透明度
   * @param {number} duration 秒
   */
  screenFlash(strength = 0.45, duration = 0.1) {
    this._flash(strength, duration);
  }

  /**
   * 终结技拍2 切镜：招式名大字（2026-11-14 路线图③）。
   * 复用拟声词 DOM 层与 sfxPop 动画（研究档案 §4.8：拍 2 招式名大字复用同一 DOM 层），
   * 内联覆盖为居中、字号 ≈2×ultimate、切入角 -10°、黑描边金字的招式名变体。
   * @param {string} text 招式名（main.mjs 从 getMove(active.id).moveName 取）
   */
  showMoveName(text) {
    if (!text) return;
    const el = document.createElement("div");
    el.className = "sfx-word ultimate";
    el.textContent = text;
    Object.assign(el.style, {
      left: "50%",
      top: "38%",
      fontSize: "96px",
      color: "#ffe9b0",
      letterSpacing: "6px",
      // sfxPop 默认 0.4s 就淡到 0（forwards），招式名需要更长可读停留 → 内联拉长到 0.9s
      animationDuration: "0.9s",
      transform: "translate(-50%, -50%) rotate(-10deg) scale(.5)",
      textShadow:
        "0 0 26px rgba(0,0,0,.95), 0 4px 0 rgba(0,0,0,.85), 0 0 14px rgba(255,233,176,.5)",
    });
    this.sfxContainer.appendChild(el);
    this.sfxPool.push(el);
    // 招式名大字停留略长于拟声词（切镜拍是全演出唯一的「字」焦点）
    setTimeout(() => {
      el.classList.add("sfx-out");
      setTimeout(() => {
        el.remove();
        const i = this.sfxPool.indexOf(el);
        if (i >= 0) this.sfxPool.splice(i, 1);
      }, 300);
    }, 900);
  }

  /**
   * 终结技拍2 切镜：黑场 80ms（2026-11-14 路线图③；普通终结复用结构但**不加**黑场）。
   * 每次终结至多 1 帧、单次 ≤80ms → 全屏闪频率 ≪ WCAG 2.3.1 上限（≤3 次/s）。
   * @param {number} dur 黑场保持秒数（默认 0.08）
   */
  cutFlash(dur = 0.08) {
    const el = this.cutEl;
    el.style.transition = "none";
    el.style.opacity = "1";
    // 下一帧再开淡出过渡：保证黑场先全亮，保持 dur 后淡出
    requestAnimationFrame(() => {
      el.style.transition = "opacity .06s";
      setTimeout(() => { el.style.opacity = "0"; }, dur * 1000);
    });
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
