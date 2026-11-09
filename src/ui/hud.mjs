/**
 * HUD —— 绝区零式引导 UI。
 *
 * 核心设计（依据项目计划书 §3.2 可借语汇 + 公开交互设计）：
 *  - **按键引导发光**：技能可触发时对应键位亮起/呼吸，引导玩家「跟着光按」
 *  - **连携/失衡状态条**：可视化战斗节奏
 *  - **非对称圆角控件** + 深色底 + 高饱和点缀（公共设计语汇）
 *  - 正文对比度 ≥ 4.5:1（可访问性）
 *
 * 授权边界：不复制任何具体游戏的 UI 版式/配色/图标，全部自绘。
 */

/** 键位状态（可触发 = 发光） */
export class Hud {
  constructor(root) {
    this.root = root;
    this.state = {
      mode: "PBR",
      steps: 3,
      // 战斗状态（demo 用，真实战斗由 battle 写入）
      elapsed: 0,
      shellIndex: 0,
      shellTotal: 16,
      grids: 0, // 失衡格
      combo: 0,
      hp: 100,
      oppHp: 100,
      // 按键可用性
      canAttack: true,
      canCharge: false,
      canDodge: true,
      canSwap: true,
      chainReady: false,
      counterWarning: false,
      // 当前壳（16 只家族；换壳时由 main.js 写入）
      shellName: "奶蛙",
      shellIndex: 0,
      shellTotal: 16,
    };
    this.el = {};
    this._build();
  }

  _build() {
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-brand">
          <span class="brand-mark">奶蛙零</span>
          <span class="brand-sub">VOL.0</span>
        </div>
        <div class="hud-timer">
          <div class="timer-num" id="hud-elapsed">00:00</div>
          <div class="timer-label">ELAPSED</div>
        </div>
        <div class="hud-round">
          <span id="hud-shell">1/16</span>
        </div>
      </div>

      <div class="hud-left">
        <div class="bar-label">我方 <span class="bar-num" id="hud-hp-num">100</span></div>
        <div class="bar hp-bar"><div class="bar-fill" id="hud-hp" style="width:100%"></div></div>
        <div class="shell-chip">
          <b id="hud-shell-name">奶蛙</b>
          <span class="shell-sep">·</span>
          <span id="hud-shell-idx">1/16</span>
        </div>
      </div>

      <div class="hud-right">
        <div class="bar-label">对手 <span class="bar-num" id="hud-opp-num">200</span></div>
        <div class="bar opp-bar"><div class="bar-fill" id="hud-opp" style="width:100%"></div></div>
        <div class="grids" id="hud-grids">
          <div class="grid"></div><div class="grid"></div><div class="grid"></div>
        </div>
        <div class="chain-chip" id="hud-chain">连携 0/3</div>
      </div>

      <div class="hud-counter" id="hud-counter">⚠ 弹反!</div>

      <div class="hud-keys">
        <div class="key" id="key-attack"><kbd>A/D</kbd><span>移动</span></div>
        <div class="key glow" id="key-charge"><kbd>空格</kbd><span>攻击(连按连段)</span></div>
        <div class="key" id="key-dodge"><kbd>Shift</kbd><span>躲/弹反</span></div>
        <div class="key" id="key-swap"><kbd>Tab</kbd><span>接力</span></div>
      </div>

      <div class="hud-mode">
        <span>模式：<b id="hud-mode">PBR</b></span>
        <span>色调分离：<b id="hud-steps">3</b> 档</span>
      </div>

      <div class="hud-help">
        N 切换 PBR/NPR · [ ] 档数 · Tab/Q/E 或 1–9/0 换壳 · 拖动旋转
      </div>
    `;

    // 缓存元素引用
    const ids = ["elapsed", "shell", "hp", "opp", "hp-num", "opp-num", "grids", "chain", "counter", "mode", "steps",
                 "shell-name", "shell-idx",
                 "key-attack", "key-charge", "key-dodge", "key-swap"];
    for (const id of ids) {
      this.el[id] = this.root.querySelector(`#hud-${id}`);
    }
    this.el.gridCells = Array.from(this.root.querySelectorAll("#hud-grids .grid"));

    this._apply();
  }

  /** 写入状态并重绘 */
  set(patch) {
    Object.assign(this.state, patch);
    this._apply();
  }

  _apply() {
    const s = this.state;
    // 已用时间（mm:ss）
    if (this.el.elapsed) {
      const t = Math.max(0, Math.floor(s.elapsed ?? 0));
      const mm = String(Math.floor(t / 60)).padStart(2, "0");
      const ss = String(t % 60).padStart(2, "0");
      this.el.elapsed.textContent = `${mm}:${ss}`;
    }
    if (this.el.shell) this.el.shell.textContent = `${(s.shellIndex ?? 0) + 1}/${s.shellTotal ?? 16}`;
    if (this.el.hp) {
      const hpPct = Math.max(0, s.hp);
      this.el.hp.style.width = `${hpPct}%`;
      // 低血警告（<30% 变红）
      this.el.hp.classList.toggle("low", hpPct < 30);
    }
    if (this.el.opp) this.el.opp.style.width = `${Math.max(0, s.oppHp)}%`;
    if (this.el["hp-num"]) this.el["hp-num"].textContent = Math.round(s.hp);
    if (this.el["opp-num"]) this.el["opp-num"].textContent = Math.round(s.oppHp);
    if (this.el.chain) this.el.chain.textContent = `连携 ${s.combo}/3`;
    if (this.el.mode) this.el.mode.textContent = s.mode;
    if (this.el.steps) this.el.steps.textContent = s.steps;

    // 当前壳：<name> · <i+1>/16（换壳即换人；i 为 0 基索引）
    if (this.el["shell-name"]) this.el["shell-name"].textContent = s.shellName;
    if (this.el["shell-idx"]) {
      const total = s.shellTotal || 0;
      const cur = total > 0 ? Math.min(Math.max(0, s.shellIndex) + 1, total) : 0;
      this.el["shell-idx"].textContent = `${cur}/${total}`;
    }

    // 失衡格
    if (this.el.gridCells) {
      this.el.gridCells.forEach((cell, i) => {
        cell.classList.toggle("on", i < s.grids);
      });
    }

    // 按键发光（绝区零式引导）
    const keyMap = {
      "key-attack": s.canAttack,
      "key-charge": s.canCharge,
      "key-dodge": s.canDodge,
      "key-swap": s.canSwap,
    };
    for (const [id, active] of Object.entries(keyMap)) {
      const el = this.el[id];
      if (el) el.classList.toggle("glow", !!active);
    }
    // 连携就绪时接力键强烈闪烁
    if (this.el["key-swap"]) {
      this.el["key-swap"].classList.toggle("urgent", !!s.chainReady);
    }
    // 弹反提示（对手攻击预警时显示）
    if (this.el.counter) {
      this.el.counter.classList.toggle("show", !!s.counterWarning);
    }
  }
}
