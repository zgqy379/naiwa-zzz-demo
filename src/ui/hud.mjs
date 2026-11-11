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
      steps: 2, // 修（UI-3）：对齐 main.mjs:132 现行默认 2 档（#hud-steps 元素已移除，本值仅初始台账）
      // 战斗状态（demo 用，真实战斗由 battle 写入）
      elapsed: 0,
      shellIndex: 0,
      shellTotal: 16,
      grids: 0, // 失衡格（阶段 A 起由 daze/staggered 取代，字段保留兼容旧探针）
      daze: 0,        // 失衡条 0~100（绝区零式黄条）
      staggered: false, // 是否处于失衡状态（满条闪烁 + 对手定身）
      combo: 0,
      hp: 100,
      oppHp: 100, // 对手血条百分比口径（0–100，main.mjs 每帧按 (hp/maxHp)*100 写入）
      oppHpRaw: null, // 对手绝对血量值（main.mjs 传入后 opp-num 显示它；未传回退显示 oppHp）
      // 按键可用性
      canAttack: true,
      canCharge: false,
      canDodge: true,
      canSwap: true,
      chainReady: false,
      counterWarning: false,
      // 三连战：当前回合 / 总回合
      round: 1,
      totalRounds: 3,
      // 蓄力必杀技：charge 0~1，charging = 是否正在蓄力
      charge: 0,
      charging: false,
      // 当前壳（16 只家族；换壳时由 main.js 写入）
      shellName: "奶蛙",
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
          <span class="round-label" id="hud-round">回合 1/3</span>
        </div>
      </div>

      <div class="hud-charge" id="hud-charge">
        <div class="charge-fill" id="hud-charge-fill"></div>
        <span class="charge-text" id="hud-charge-text">蓄力</span>
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
        <div class="bar-label">对手 <span class="bar-num" id="hud-opp-num">100</span></div>
        <div class="bar opp-bar"><div class="bar-fill" id="hud-opp" style="width:100%"></div></div>
        <div class="daze-wrap" id="hud-daze-wrap">
          <span class="daze-label" id="hud-daze-label">失衡</span>
          <div class="daze-bar"><div class="daze-fill" id="hud-daze-fill"></div></div>
        </div>
        <div class="chain-chip" id="hud-chain">连携 0/3</div>
      </div>

      <div class="hud-counter" id="hud-counter">⚠ 弹反!</div>

      <div class="hud-keys">
        <div class="key" id="hud-key-attack"><kbd>WASD</kbd><span>移动</span></div>
        <div class="key glow" id="hud-key-charge"><kbd>空格</kbd><span>攻击(轻点连段·长按蓄力)</span></div>
        <div class="key" id="hud-key-dodge"><kbd>Shift</kbd><span>躲/弹反</span></div>
        <div class="key" id="hud-key-swap"><kbd>Tab</kbd><span>接力</span></div>
      </div>

      <!-- 美术圣经重做线：调参信息（模式/色调分离档数）移出玩家视野；
           [ ] 档数键功能保留，数值可经 window.__npr.getMode()/getSteps() 读取 -->

      <div class="hud-help">
        N 切换 PBR/NPR · [ ] 档数 · Tab/Q/E 或 1–9/0 换壳 · 拖动旋转
      </div>
    `;

    // 缓存元素引用
    // 注意：#hud-mode / #hud-steps 两个元素在美术圣经重做时已被移除（调参信息移出玩家视野），
    //   原先仍留在 ids 列表里 → this.el.mode / this.el.steps 恒为 null，_apply 里对应分支
    //   是永不执行的死代码。现已从列表移除，mode/steps 仍可经 window.__npr.getMode()/getSteps() 读取。
    const ids = ["elapsed", "shell", "hp", "opp", "hp-num", "opp-num", "daze-fill", "daze-label", "daze-wrap", "chain", "counter",
                 "shell-name", "shell-idx", "round", "charge", "charge-fill", "charge-text",
                 "key-attack", "key-charge", "key-dodge", "key-swap"];
    for (const id of ids) {
      this.el[id] = this.root.querySelector(`#hud-${id}`);
    }

    // 脏值缓存：HUD 每帧被 set() 调用一次，_apply 原本无差别写 ~18 个 DOM 节点
    //   （textContent / style.width / classList.toggle），即使值没变也会触发样式重算。
    //   这里按「值是否真的变了」决定是否写 DOM。
    this._last = {};

    this._apply();
  }

  /** 写入状态并重绘 */
  set(patch) {
    Object.assign(this.state, patch);
    this._apply();
  }

  /** 仅当值变化时才写 DOM（返回 true = 确实改了） */
  _put(key, value, apply) {
    if (this._last[key] === value) return false;
    this._last[key] = value;
    apply();
    return true;
  }

  _apply() {
    const s = this.state;
    // 已用时间（mm:ss）
    if (this.el.elapsed) {
      const t = Math.max(0, Math.floor(s.elapsed ?? 0));
      const mm = String(Math.floor(t / 60)).padStart(2, "0");
      const ss = String(t % 60).padStart(2, "0");
      this._put("elapsed", `${mm}:${ss}`, () => { this.el.elapsed.textContent = `${mm}:${ss}`; });
    }
    if (this.el.shell) {
      const v = `${(s.shellIndex ?? 0) + 1}/${s.shellTotal ?? 16}`;
      this._put("shell", v, () => { this.el.shell.textContent = v; });
    }
    if (this.el.hp) {
      // 修：按 maxHp 归一化（原直接用 hp 值，力量档 maxHp=120 会溢出 120%）
      const maxHp = s.maxHp ?? 100;
      const hpPct = Math.max(0, Math.min(100, (s.hp / maxHp) * 100));
      this._put("hp", hpPct, () => {
        this.el.hp.style.width = `${hpPct}%`;
        // 低血警告（<30% 变红）
        this.el.hp.classList.toggle("low", hpPct < 30);
      });
    }
    if (this.el.opp) {
      const v = Math.max(0, s.oppHp);
      this._put("opp", v, () => { this.el.opp.style.width = `${v}%`; });
    }
    if (this.el["hp-num"]) {
      const v = Math.round(s.hp);
      this._put("hp-num", v, () => { this.el["hp-num"].textContent = v; });
    }
    // opp-num 显示绝对血量值（main.mjs 传 oppHpRaw）；未传时回退旧的百分比口径，行为不变
    if (this.el["opp-num"]) {
      const v = Math.round(s.oppHpRaw ?? s.oppHp);
      this._put("opp-num", v, () => { this.el["opp-num"].textContent = v; });
    }
    if (this.el.chain) {
      const v = `连携 ${s.combo}/3`;
      this._put("chain", v, () => { this.el.chain.textContent = v; });
    }

    // 当前壳：<name> · <i+1>/16（换壳即换人；i 为 0 基索引）
    if (this.el["shell-name"]) {
      const v = s.shellName;
      this._put("shell-name", v, () => { this.el["shell-name"].textContent = v; });
    }
    if (this.el["shell-idx"]) {
      const total = s.shellTotal || 0;
      const cur = total > 0 ? Math.min(Math.max(0, s.shellIndex) + 1, total) : 0;
      const v = `${cur}/${total}`;
      this._put("shell-idx", v, () => { this.el["shell-idx"].textContent = v; });
    }

    // 失衡条（绝区零式黄条：积累期白→黄，失衡态变彩闪烁）
    if (this.el["daze-fill"]) {
      const pct = Math.round(Math.max(0, Math.min(100, s.daze ?? 0)));
      this._put("daze", pct, () => {
        this.el["daze-fill"].style.width = `${pct}%`;
      });
    }
    if (this.el["daze-wrap"]) {
      this._put("staggered", !!s.staggered, () => {
        this.el["daze-wrap"].classList.toggle("staggered", !!s.staggered);
      });
    }

    // 按键发光（绝区零式引导）
    // 移动键(hud-key-attack)不发光：原误绑 canAttack（每帧 !frozen 几乎恒真，会常亮）；
    // 攻击键(hud-key-charge)改绑攻击可用状态 canAttack：原绑的 canCharge 全仓库无人写入，永不发光
    const keyMap = {
      "key-charge": s.canAttack,
      "key-dodge": s.canDodge,
      "key-swap": s.canSwap,
    };
    for (const [id, active] of Object.entries(keyMap)) {
      const el = this.el[id];
      if (!el) continue;
      this._put(id, !!active, () => el.classList.toggle("glow", !!active));
    }
    // 连携就绪时接力键强烈闪烁
    if (this.el["key-swap"]) {
      this._put("key-swap-urgent", !!s.chainReady, () => {
        this.el["key-swap"].classList.toggle("urgent", !!s.chainReady);
      });
    }
    // 弹反提示（对手攻击预警时显示）
    if (this.el.counter) {
      this._put("counter", !!s.counterWarning, () => {
        this.el.counter.classList.toggle("show", !!s.counterWarning);
      });
    }

    // 三连战回合数（第 N 回合 / 共 M 回合）
    if (this.el.round) {
      const v = `回合 ${s.round ?? 1}/${s.totalRounds ?? 3}`;
      this._put("round", v, () => { this.el.round.textContent = v; });
    }

    // 蓄力条：按住空格时填充，蓄满转「蓄力终结」高亮
    if (this.el.charge) {
      const pct = Math.round(Math.max(0, Math.min(1, s.charge ?? 0)) * 100);
      const on = !!s.charging;
      // 「显示」与「蓄满」是两个独立的视觉状态，必须各自判脏
      //   （原先把 full 绑在 show 的脏值判断里 → 蓄满瞬间不会置位）
      this._put("charge-on", on, () => {
        this.el.charge.classList.toggle("show", on);
      });
      this._put("charge-full", pct >= 100, () => {
        this.el.charge.classList.toggle("full", pct >= 100);
      });
      this._put("charge-pct", pct, () => {
        if (this.el["charge-fill"]) this.el["charge-fill"].style.width = `${pct}%`;
        if (this.el["charge-text"]) this.el["charge-text"].textContent = pct >= 100 ? "松手释放" : "蓄力";
      });
    }
  }
}
