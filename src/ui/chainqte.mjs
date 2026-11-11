/**
 * 连携技 QTE 覆盖层（阶段 C）—— 绝区零式「选人连打」爆发窗口。
 *
 * 呈现（依据 docs/绝区零研究/03-UI与演出语言.md：斜切面板/黄黑撞色/头像框+倒计时）：
 *  - 底部「CHAIN ATTACK」斜切横幅 + 3 个队员 chip（名字 + 键位提示）
 *  - 倒计时条（3s 实时窗口）
 *  - chip 可点击 / 数字键 1-3 选择；已用成员置灰
 *  - 全 DOM/CSS 实现，零外部素材
 */
import { SQUAD } from "../game/squad.mjs";

/** QTE 窗口总长（秒，实时）——ZZZ ≈3 秒子弹时间 [中] */
export const CHAIN_QTE_WINDOW_S = 3.0;

export class ChainQteOverlay {
  /**
   * @param {(chipIndex: number) => void} onPick chip 点击回调（参数为 chip下标 0-2）
   */
  constructor(onPick) {
    this.onPick = onPick;
    this.el = document.createElement("div");
    this.el.id = "chain-qte";
    this.el.innerHTML = [
      '<div class="chain-banner">CHAIN ATTACK</div>',
      '<div class="chain-chips"></div>',
      '<div class="chain-countdown"><div class="chain-countdown-fill"></div></div>',
    ].join("");
    document.body.appendChild(this.el);
    this.bannerEl = this.el.querySelector(".chain-banner");
    this.chipsEl = this.chipsElInit();
    this.fillEl = this.el.querySelector(".chain-countdown-fill");
  }

  /** 构建 chips 容器并绑定点击 */
  chipsElInit() {
    const el = this.el.querySelector(".chain-chips");
    return el;
  }

  /**
   * 显示 QTE。
   * @param {number[]} options 候选成员下标（chip 顺序 = 键位 1/2/3）
   */
  show(options) {
    const chips = options.map((mi, i) => {
      const m = SQUAD[mi] ?? {};
      const name = m.name ?? "?";
      const key = i + 1;
      return '<div class="chain-chip-el" data-i="' + i + '">'
        + '<div class="chain-chip-name">' + name + '</div>'
        + '<div class="chain-chip-key">按 ' + key + '</div></div>';
    }).join("");
    this.chipsEl.innerHTML = chips;
    const self = this;
    this.chipsEl.querySelectorAll(".chain-chip-el").forEach(function (el) {
      el.addEventListener("click", function () {
        self.onPick(Number(el.dataset.i));
      });
    });
    this.bannerEl.textContent = "CHAIN ATTACK";
    this.el.classList.add("show");
  }

  /** 最后一环时切换横幅 */
  setBanner(text) {
    this.bannerEl.textContent = text;
  }

  /** chip 置灰 */
  markUsed(chipIndex) {
    const chip = this.chipsEl.children[chipIndex];
    if (chip) chip.classList.add("used");
  }

  /** 倒计时条 */
  update(t, total) {
    if (!this.fillEl) return;
    const pct = Math.max(0, Math.min(1, t / total));
    this.fillEl.style.width = String(pct * 100) + "%";
  }

  /** 隐藏 */
  hide() {
    this.el.classList.remove("show");
  }
}
