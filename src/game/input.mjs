/**
 * 输入管理器 —— 集中处理键盘输入，避免 main.mjs 膨胀。
 *
 * 职责：
 *  - 监听 keydown/keyup，维护按键集合
 *  - 把输入翻译成「移动轴 + 动作请求」
 *  - 动作请求通过回调派发（不直接操作游戏对象）
 *
 * 用法：
 *   const input = new InputManager({
 *     onAction: (action, key) => { ... },
 *   });
 *   // 每帧：
 *   input.update();  // 返回 { move: Vector2, actions: [...] }
 */
import * as THREE from "three";

export class InputManager {
  /**
   * @param {object} o
   *  - onAction: (action, key) => void  动作回调
   *    action ∈ attack | dodge | swap | swap-next | swap-prev | mode | steps | help
   *  - swapIndex: (idx) => void          换人回调（可选）
   */
  constructor(o = {}) {
    this.o = o;
    this.keysDown = new Set();
    this.moveInput = new THREE.Vector2(0, 0);
    this._dodgeRequested = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this.enabled = true;
  }

  attach() {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  detach() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.keysDown.clear();
  }

  _onKeyDown(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    this.keysDown.add(k);

    if (!this.enabled) return;

    // 动作映射
    if (k === " ") {
      e.preventDefault();
      this.o.onAction?.("attack", " ");
    } else if (k === "shift") {
      this._dodgeRequested = true;
      this.o.onAction?.("dodge", "Shift");
    } else if (k === "tab") {
      e.preventDefault();
      this.o.onAction?.("swap-next", "Tab");
    } else if (k === "q") {
      // Q/E 循环换壳（与 main.mjs 头注、squad.mjs 头注、hud 帮助文案口径一致），
      // 激活 main.mjs onAction 的 swap-prev 分支与 squad.mjs prevAlive 反向循环
      this.o.onAction?.("swap-prev", "Q");
    } else if (k === "e") {
      this.o.onAction?.("swap-next", "E");
    } else if (k === "r") {
      this.o.onAction?.("swap", 2); // R 直选固定 3 号位（index 2），语义见 main.mjs 头注
    } else if (k === "n") {
      this.o.onAction?.("mode", "N");
    } else if (k >= "1" && k <= "9") {
      this.o.onAction?.("steps", parseInt(k));
    } else if (k === "0") {
      this.o.onAction?.("steps", 10);
    }
  }

  _onKeyUp(e) {
    this.keysDown.delete(e.key.toLowerCase());
  }

  /** 每帧更新移动输入 */
  updateMove() {
    let x = 0, y = 0;
    if (this.keysDown.has("a")) x -= 1;
    if (this.keysDown.has("d")) x += 1;
    if (this.keysDown.has("w")) y += 1;
    if (this.keysDown.has("s")) y -= 1;
    this.moveInput.set(x, y);
    return this.moveInput;
  }

  /** 消费闪避请求（一次性） */
  consumeDodge() {
    const v = this._dodgeRequested;
    this._dodgeRequested = false;
    return v;
  }

  clearDodge() { this._dodgeRequested = false; }
}
