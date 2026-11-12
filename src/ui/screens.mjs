/**
 * 外观主题：跟随系统 / 浅色 / 深色。
 * 只写 <html data-theme>，不触碰 main.mjs；CSS 变量与覆盖段负责换色。
 * ?theme=dark|light|system 可直接预览（优先级高于 localStorage）。
 */
const THEME_KEY = "naiwa-theme";
const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

function currentThemePref() {
  const q = new URLSearchParams(location.search).get("theme");
  if (q === "dark" || q === "light" || q === "system") return q;
  try { return localStorage.getItem(THEME_KEY) || "system"; } catch { return "system"; }
}
function applyTheme(pref) {
  const dark = pref === "dark" || (pref === "system" && !!darkQuery?.matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}
function setTheme(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* 隐私模式下忽略 */ }
  // ?theme= 只用于预览；用户一旦在设置里手动选择就移除它，避免 URL 压住选择
  const u = new URL(location.href);
  if (u.searchParams.has("theme")) {
    u.searchParams.delete("theme");
    history.replaceState(null, "", u.pathname + u.search + u.hash);
  }
  applyTheme(pref);
}
darkQuery?.addEventListener?.("change", () => {
  if (currentThemePref() === "system") applyTheme("system");
});
applyTheme(currentThemePref());

/**
 * 界面管理器 —— 主界面 / 选人 / 战斗 / 结算 / 设置 的流程串联。
 *
 * 流程：
 *   主界面 → 选人 → 战斗 → 结算 → 主界面
 *
 * 授权：全部自绘，不复制任何具体游戏 UI。
 */
import { SQUAD } from "../game/squad.mjs";

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

    // 实时 3D 卡片层（独立 chunk，加载失败时卡片保持透明空位，不再退回黑底静态图）
    this.live3d = null;
    import("./live3d.mjs")
      .then((m) => m.initLive3DCards((loaded, total) => this._setLive3dLoading(loaded, total)))
      .then((api) => { this.live3d = api; api?.setSelected?.(this.selectedIndex); })
      .catch((e) => console.warn("[screens] 实时 3D 卡片不可用", e?.message));
  }

  /** 角色模型加载进度提示（慢网络下卡片会是空位，需要给出可见反馈） */
  _setLive3dLoading(loaded, total) {
    const el = document.getElementById("select-loading");
    if (!el) return;
    if (loaded >= total) {
      el.textContent = "";
      el.style.display = "none";
      return;
    }
    el.textContent = `载入中 ${loaded}/${total}`;
    el.style.display = "";
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

  /** 修（UI-3）：设置屏打开时按当前运行状态回填各 .setting-opts 的 active（行匹配规则与 _handleSetting 一致；运行时值无对应选项时整行清高亮如实显示） */
  _syncSettings() {
    const st = this.o.getState?.() || {};
    document.querySelectorAll(".setting-row").forEach((row) => {
      const label = row.querySelector("span")?.textContent ?? "";
      // 外观由本模块自己管，不依赖 getState
      if (label.includes("外观")) {
        const v = currentThemePref();
        row.querySelectorAll(".opt").forEach((opt) => {
          opt.classList.toggle("active", opt.getAttribute("data-opt") === v);
        });
        return;
      }
      let value = null;
      if (label.includes("渲染风格")) value = st.mode ? String(st.mode).toLowerCase() : null;
      else if (label.includes("色调分离")) value = st.steps == null ? null : String(st.steps);
      else if (label.includes("画质")) value = st.quality == null ? null : String(st.quality);
      if (value == null) return;
      row.querySelectorAll(".opt").forEach((opt) => {
        opt.classList.toggle("active", opt.getAttribute("data-opt") === value);
      });
    });
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
        // 修（UI-3）：调 onBack（main.mjs 传入，含 BGM 切回标题副作用，原先从未执行）；未传时回退原地切屏
        if (this.o.onBack) this.o.onBack();
        else this.show("title");
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
    else if (label.includes("外观")) setTheme(value);
  }

  _setVolume(v) {
    this.o.onSetVolume?.(v / 100);
  }

  async _buildSelectList() {
    const list = document.getElementById("select-list");
    if (!list) return;
    list.innerHTML = "";

    // 卡片只留编号/名称/透明占位，3D 模型由 live3d.mjs 画在下层 canvas
    SQUAD.forEach((m, i) => {
      const card = document.createElement("div");
      card.className = "char-card" + (i === this.selectedIndex ? " active" : "");
      card.innerHTML = `
        <span class="cc-no">${String(i + 1).padStart(2, "0")}</span>
        <div class="cc-img"><div class="cc-3d-slot"></div></div>
        <div class="cc-name">${m.name}</div>
        <div class="cc-role">${m.role}</div>
      `;
      card.addEventListener("click", () => {
        this.selectedIndex = i;
        list.querySelectorAll(".char-card").forEach((c, j) => c.classList.toggle("active", j === i));
        // 3D 层失败不能连带 UI 不更新（2026-11-12：蒙皮模型的展示台克隆在部分宿主里
        // 会在建驱动时抛错，曾导致展示台名字停在上一只角色）
        try { this.live3d?.setSelected?.(i); }
        catch (e) { window.__live3dErr = String(e && e.message ? e.message : e); console.warn("[screens] live3d.setSelected 失败", e); }
        this._updateShowcase(m);
      });
      list.appendChild(card);
    });
    this._updateShowcase(SQUAD[this.selectedIndex]);
  }

  _updateShowcase(m, portraits) {
    const nameEl = document.getElementById("showcase-name");
    const roleEl = document.getElementById("showcase-role");
    const statsEl = document.getElementById("showcase-stats");
    if (nameEl) nameEl.textContent = m.name;
    if (roleEl) roleEl.textContent = m.role;
    // 展示台大图与头像由 live3d.mjs 的 3D 模型承担，这里只清空旧静态图
    const imgEl = document.getElementById("showcase-img");
    const avatarEl = document.getElementById("archive-avatar");
    if (imgEl) imgEl.innerHTML = "";
    if (avatarEl) avatarEl.innerHTML = "";
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
    // 界面切换回调（main.mjs 用它触发「首次进入选人页 → 加载 16 只队员 GLB」）
    this.o.onShow?.(name);
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
    // 修（UI-3）：打开设置屏时按当前运行状态回填高亮（N/[] 等键位改动后再打开也显示真实值）
    if (name === "settings") this._syncSettings();
    // 首次进入选人页才真正建 live3d 的 renderer 并加载 16 只 GLB
    //   （惰性化：标题页用不到这批模型，此前在 boot 就下载 ≈4.98MB，白占首屏带宽）
    if (name === "select") {
      this._setLive3dLoading(0, 16);
      this.live3d?.ensure?.();
    }
    // 非战斗界面：隐藏 3D 角色
    if (this.o.setCharactersVisible) {
      this.o.setCharactersVisible(name === "battle");
    }
  }

  /** 显示结算（含动态数字滚动 + 奖励卡片弹出 + 多维评价条） */
  showResult({ win, grade, stats, rewards, rounds = [], roundsSummary = "", dims = [], timeMult = null }) {
    const title = document.getElementById("result-title");
    const gradeEl = document.getElementById("result-grade");
    const statsEl = document.getElementById("result-stats");
    const rewardsEl = document.getElementById("result-rewards");
    const roundsEl = document.getElementById("result-rounds");
    const dimsEl = document.getElementById("result-dims");

    if (title) {
      title.textContent = win ? "作战完成" : "作战失败";
      title.className = "result-title " + (win ? "win" : "lose");
    }
    // 三连战：逐回合战果（放在标题与统计之间，不占用 .result-stat 的 4 项结构）
    if (roundsEl) {
      roundsEl.innerHTML = rounds.length
        ? `<div class="result-rounds-head">${roundsSummary || "三连战"}</div>` + rounds.map((r) => `
             <div class="result-round ${r.won ? "won" : "lost"}">${r.name}（${r.move}）${r.won ? "胜" : "负"}</div>
           `).join("")
        : "";
      roundsEl.style.display = rounds.length ? "flex" : "none";
    }
    // 多维评价条（阶段 F：输出/连击/支援/用时 + 时间乘数）
    if (dimsEl) {
      dimsEl.innerHTML = (dims.length
        ? `<div class="result-dims-head">评价${timeMult ? ` · 时间乘数 ×${timeMult.toFixed(1)}` : ""}</div>`
          + dims.map((d) => `
             <div class="result-dim">
               <span class="rd-label">${d.label}</span>
               <div class="rd-bar"><div class="rd-fill" style="width:${Math.max(0, Math.min(100, d.value))}%"></div></div>
             </div>
           `).join("")
        : "");
      dimsEl.style.display = dims.length ? "flex" : "none";
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


