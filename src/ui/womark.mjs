/**
 * 鸣徽三选一（阶段 G）—— 回合间轻肉鸽（绝区零「鸣徽」三选一结构的网页化）。
 * 依据 docs/绝区零研究/02-玩法结构与模式.md：回合间 <10s 卡片三选一，局外快节奏。
 * 全 DOM/CSS 实现，零外部素材。
 */

/** 鸣徽池（9 条；n = 可叠层） */
export const WOMARK_POOL = [
  { id: "attack",   name: "强攻鸣徽", desc: "伤害 +15%" },
  { id: "stagger",  name: "击破鸣徽", desc: "失衡积累 +20%" },
  { id: "anomaly",  name: "异常鸣徽", desc: "异常积蓄 +30%" },
  { id: "decibel",  name: "喧响鸣徽", desc: "喧响获取 +20%" },
  { id: "dodge",    name: "灵闪鸣徽", desc: "闪避无敌 +0.1s" },
  { id: "counter",  name: "招架鸣徽", desc: "弹反窗口 +0.05s" },
  { id: "heal",     name: "回春鸣徽", desc: "立即回复 30% 生命" },
  { id: "chain",    name: "连携鸣徽", desc: "连携伤害 +25%" },
  { id: "assist",   name: "支援鸣徽", desc: "支援点回满" },
];

export class WomarkOverlay {
  /**
   * @param {(id: string) => void} onPick 选中回调（参数 = WOMARK_POOL 的 id）
   */
  constructor(onPick) {
    this.onPick = onPick;
    this.el = document.createElement("div");
    this.el.id = "womark-overlay";
    this.el.innerHTML = [
      '<div class="womark-title">鸣 徽 三 选 一</div>',
      '<div class="womark-cards"></div>',
      '<div class="womark-hint">按 1 / 2 / 3 选择 · 10 秒后自动随机</div>',
    ].join("");
    document.body.appendChild(this.el);
    this.cardsEl = this.el.querySelector(".womark-cards");
    this._timer = 0;
  }

  /** 显示 3 张候选卡（offers = WOMARK_POOL 条目数组） */
  show(offers) {
    const self = this;
    this.cardsEl.innerHTML = offers.map(function (o, i) {
      return '<div class="womark-card" data-id="' + o.id + '">'
        + '<div class="wc-no">' + (i + 1) + '</div>'
        + '<div class="wc-name">' + o.name + '</div>'
        + '<div class="wc-desc">' + o.desc + '</div></div>';
    }).join("");
    this.cardsEl.querySelectorAll(".womark-card").forEach(function (el) {
      el.addEventListener("click", function () {
        self.onPick(el.dataset.id);
      });
    });
    this.el.classList.add("show");
    clearTimeout(this._timer);
    this._timer = setTimeout(function () {
      const first = offers[0];
      if (first && self.el.classList.contains("show")) self.onPick(first.id);
    }, 10000);
  }

  hide() {
    clearTimeout(this._timer);
    this.el.classList.remove("show");
  }
}
