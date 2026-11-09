/**
 * 界面管理器 —— 主界面 / 选人 / 战斗 / 结算 / 设置 的流程串联。
 *
 * 流程：
 *   主界面 → 选人 → 战斗 → 结算 → 主界面
 *
 * 授权：全部自绘，不复制任何具体游戏 UI。
 */
import { SQUAD } from "../game/squad.mjs";
import { makePortrait, makeAllPortraits } from "./portrait.mjs";

export class ScreenManager {
  /**
   * @param {object} o
   *  - onStart: (memberIndex) => void  开始战斗
   *  - onRestart: () => void           再来一局
   *  - onBack: () => void              返回主界面
   *  - hud: Hud
   */
  constructor(o) {
    this.o = o;
    this.current = "title";
    this.selectedIndex = 0;
    this.screens = {
      title: document.getElementById("screen-title"),
      select: document.getElementById("screen-select"),
      result: document.getElementById("screen-result"),
      settings: document.getElementById("screen-settings"),
    };
    this.hudRoot = document.getElementById("ui");

    this._bindButtons();
    this._buildSelectList(); // async，内部自处理
    this.show("title");
  }

  _bindButtons() {
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        this._handleAction(action);
      });
    });

    // 设置项
    document.querySelectorAll(".setting-opts").forEach((group) => {
      group.addEventListener("click", (e) => {
        const opt = e.target.closest(".opt");
        if (!opt) return;
        group.querySelectorAll(".opt").forEach((o) => o.classList.remove("active"));
        opt.classList.add("active");
        this._handleSetting(opt.parentElement, opt.getAttribute("data-opt"));
      });
    });

    // 音量
    const vol = document.getElementById("vol-slider");
    if (vol) vol.addEventListener("input", () => this._setVolume(vol.value));
  }

  _handleAction(action) {
    switch (action) {
      case "start":
        this.show("select");
        break;
      case "characters":
        this.show("select");
        break;
      case "settings":
        this.show("settings");
        break;
      case "back-title":
        this.show("title");
        break;
      case "confirm":
        this.o.onStart?.(this.selectedIndex);
        break;
      case "restart":
        this.o.onRestart?.();
        break;
    }
  }

  _handleSetting(group, value) {
    // 找到这一行的 label
    const row = group.closest(".setting-row");
    const label = row?.querySelector("span")?.textContent ?? "";
    if (label.includes("渲染风格")) this.o.onSetMode?.(value.toUpperCase());
    else if (label.includes("色调分离")) this.o.onSetSteps?.(parseInt(value));
    else if (label.includes("画质")) this.o.onSetQuality?.(value);
  }

  _setVolume(v) {
    this.o.onSetVolume?.(v / 100);
  }

  async _buildSelectList() {
    const list = document.getElementById("select-list");
    if (!list) return;
    list.innerHTML = "";

    // 修：先查缓存，已生成过则直接显示（避免首屏色块）
    const hasCache = this.__portraitCache && this.__portraitCache.size >= SQUAD.length;

    // 先建卡片（占位色块 + 编号；有缓存则直接用图）
    SQUAD.forEach((m, i) => {
      const card = document.createElement("div");
      card.className = "char-card" + (i === this.selectedIndex ? " active" : "");
      const cached = this.__portraitCache?.get(m.id);
      card.innerHTML = `
        <span class="cc-no">${String(i + 1).padStart(2, "0")}</span>
        <div class="cc-img" ${cached ? "" : `style="background:linear-gradient(135deg,#${m.color.toString(16).padStart(6, "0")},#${shade(m.color)})"`}>
          ${cached ? `<img src="${cached}" alt="" />` : '<div class="cc-loading"></div>'}
        </div>
        <div class="cc-name">${m.name}</div>
        <div class="cc-role">${m.role}</div>
      `;
      card.addEventListener("click", () => {
        this.selectedIndex = i;
        list.querySelectorAll(".char-card").forEach((c, j) => c.classList.toggle("active", j === i));
        this._updateShowcase(m);
      });
      list.appendChild(card);
    });
    this._updateShowcase(SQUAD[this.selectedIndex]);

    // 渐进生成缩略图（每生成一张立刻更新卡片，不阻塞；带缓存）
    if (hasCache) return;
    window.__portraitStage = "start";
    (async () => {
      this.__portraitCache = this.__portraitCache || new Map();
      let done = 0;
      for (const m of SQUAD) {
        try {
          const url = await makePortrait(m, { size: 256 });
          this.__portraitCache.set(m.id, url);
          done++;
          window.__portraitStage = `${done}/16`;
          // 立刻更新对应卡片
          const idx = SQUAD.indexOf(m);
          const card = list.children[idx];
          const imgEl = card?.querySelector(".cc-img");
          if (imgEl) {
            imgEl.style.background = "none";
            imgEl.innerHTML = `<img src="${url}" alt="${m.name}" />`;
          }
          // 如果是当前选中角色，同步档案卡大图与头像
          if (idx === this.selectedIndex) {
            document.getElementById("showcase-img").innerHTML = `<img src="${url}" alt="${m.name}" />`;
            const av = document.getElementById("archive-avatar");
            if (av) av.innerHTML = `<img src="${url}" alt="${m.name}" />`;
          }
        } catch (e) {
          console.warn(`[screens] 缺缩略图: ${m.id}`, e?.message);
        }
      }
      window.__portraitStage = "done:" + done;
    })();
  }

  _updateShowcase(m, portraits) {
    const nameEl = document.getElementById("showcase-name");
    const roleEl = document.getElementById("showcase-role");
    const statsEl = document.getElementById("showcase-stats");
    if (nameEl) nameEl.textContent = m.name;
    if (roleEl) roleEl.textContent = m.role;
    // 展示台大图
    const imgEl = document.getElementById("showcase-img");
    const avatarEl = document.getElementById("archive-avatar");
    if (imgEl && portraits) {
      const url = portraits.get(m.id);
      if (url) imgEl.innerHTML = `<img src="${url}" alt="${m.name}" />`;
    } else if (imgEl) {
      // 异步生成单张
      makePortrait(m, { size: 512 }).then((url) => {
        imgEl.innerHTML = `<img src="${url}" alt="${m.name}" />`;
        if (avatarEl) avatarEl.innerHTML = `<img src="${url}" alt="${m.name}" />`;
      }).catch(() => {});
    }
    if (statsEl) {
      const stats = [
        { label: "生命", value: m.maxHp, max: 150 },
        { label: "伤害", value: m.damageMul, max: 2 },
        { label: "速度", value: m.speedMul, max: 2 },
        { label: "失衡", value: m.gridMul, max: 2 },
      ];
      statsEl.innerHTML = stats.map((s) => {
        const pct = Math.min(100, (s.value / s.max) * 100);
        return `
          <div class="stat-row">
            <div class="stat-label"><span>${s.label}</span><span>${s.value}</span></div>
            <div class="stat-bar"><div class="stat-fill" style="width:${pct}%"></div></div>
          </div>
        `;
      }).join("");
    }
  }

  /** 显示某个界面 */
  show(name) {
    this.current = name;
    // 修：显式控制每个界面（避免 toggle 逻辑漏洞导致的叠加）
    for (const [key, el] of Object.entries(this.screens)) {
      if (!el) continue;
      if (key === name) {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    }
    // 战斗时隐藏所有界面层，显示 HUD
    if (name === "battle") {
      for (const el of Object.values(this.screens)) el?.classList.add("hidden");
    }
    // HUD 只在战斗时显示
    if (this.hudRoot) {
      this.hudRoot.style.display = name === "battle" ? "block" : "none";
    }
    // 非战斗界面：隐藏 3D 角色
    if (this.o.setCharactersVisible) {
      this.o.setCharactersVisible(name === "battle");
    }
  }

  /** 显示结算（含动态数字滚动 + 奖励卡片弹出） */
  showResult({ win, grade, stats, rewards }) {
    const title = document.getElementById("result-title");
    const gradeEl = document.getElementById("result-grade");
    const statsEl = document.getElementById("result-stats");
    const rewardsEl = document.getElementById("result-rewards");

    if (title) {
      title.textContent = win ? "作战完成" : "作战失败";
      title.className = "result-title " + (win ? "win" : "lose");
    }
    if (gradeEl) {
      gradeEl.textContent = grade;
      gradeEl.classList.remove("grade-pop");
      // 强制重排触发动画
      void gradeEl.offsetWidth;
      gradeEl.classList.add("grade-pop");
    }
    if (statsEl) {
      // 先渲染 0，再滚动到目标值
      statsEl.innerHTML = Object.entries(stats).map(([k, v], i) => `
        <div class="result-stat" style="opacity:0; transform:translateY(10px); transition: all .3s ${i * 0.1}s">
          <div class="rs-label">${k}</div>
          <div class="rs-value" data-target="${v}">0</div>
        </div>
      `).join("");
    }
    if (rewardsEl) {
      rewardsEl.innerHTML = rewards.map((r, i) => `
        <div class="reward-chip" style="opacity:0; transform:scale(.8); transition: all .3s ${0.3 + i * 0.15}s">${r}</div>
      `).join("");
    }
    this.show("result");

    // 触发动画
    requestAnimationFrame(() => {
      // 统计项淡入
      statsEl?.querySelectorAll(".result-stat").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      });
      // 数字滚动
      statsEl?.querySelectorAll(".rs-value").forEach((el) => {
        const target = parseFloat(el.dataset.target ?? "0");
        this._animateNumber(el, target, 600);
      });
      // 奖励弹出
      rewardsEl?.querySelectorAll(".reward-chip").forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "scale(1)";
      });
    });
  }

  /** 数字滚动动画 */
  _animateNumber(el, target, duration = 600) {
    const start = performance.now();
    const from = 0;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (target - from) * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }
}

function shade(hex) {
  const c = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * 0.6)));
  return ((f(c) << 16) | (f(g) << 8) | f(b)).toString(16).padStart(6, "0");
}
