/**
 * 主界面特效 —— 视频背景 / 声音解锁 / WebGL 玻璃 / 3D 光标 / 动态粒子。
 *
 * 实现：
 *  - 视频背景：muted 起播 + 首次交互补声，离开标题页暂停
 *  - 液态玻璃与 3D 光标：动态 import 独立 chunk，失败自动降级
 *  - 粒子：DOM 元素 + CSS 动画（轻量，不影响性能）
 */

/**
 * 主界面视频背景 + 声音解锁。
 *
 * 浏览器禁止「无用户手势的有声自动播放」，所以分三层兜底：
 *  ① HTML 用 muted autoplay 保证画面一定动起来；
 *  ② 这里先尝试解除静音，允许时即为「默认有声」；被拦则退回静音继续播；
 *  ③ 首次任意点击/按键自动补上声音（点「开始作战」也会顺带解锁）。
 * 右下角按钮可随时手动开关；离开标题页暂停，避免和战斗 BGM 叠音。
 */
function initTitleVideo() {
  const v = document.getElementById("title-video");
  const btn = document.getElementById("title-sound");
  const screen = document.getElementById("screen-title");
  if (!v || !screen) return;

  const syncBtn = () => {
    if (!btn) return;
    const on = !v.muted;
    btn.textContent = on ? "🔊 声音已开" : "🔇 开启声音";
    btn.setAttribute("aria-label", on ? "关闭声音" : "开启声音");
    btn.classList.toggle("on", on);
  };

  /** 尽力恢复声音；被浏览器策略拦下就静音续播 */
  const trySound = () => {
    v.muted = false;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        v.muted = true;
        v.play().catch(() => {});
        syncBtn();
      });
    }
    syncBtn();
  };

  v.play().catch(() => {});   // 先把画面跑起来
  trySound();

  // 首次交互兜底
  const unlock = () => {
    if (v.muted) trySound();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  // 手动开关（stopPropagation 避免被首次交互解锁逻辑重复处理）
  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    v.muted = !v.muted;
    if (!v.muted) v.play().catch(() => { v.muted = true; syncBtn(); });
    syncBtn();
  });

  // 切屏联动：标题页隐藏即暂停，回来恢复
  const syncVisibility = () => {
    if (screen.classList.contains("hidden")) v.pause();
    else v.play().catch(() => {});
  };
  new MutationObserver(syncVisibility).observe(screen, {
    attributes: true,
    attributeFilter: ["class"],
  });
  syncVisibility();
  syncBtn();
}

/**
 * 液态玻璃镜面高光：把指针位置写进每个玻璃元素的 CSS 变量，
 * 让 background-image 里的 radial-gradient 焦点跟着移动。
 * rAF 节流；系统开启「减少动效」时直接不启用。
 */
function initLiquidGlassSheen() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const sel = [
    "#screen-title .menu-btn", "#screen-title .title-sound", "#screen-title .title-footer",
    "#screen-select .menu-btn", "#screen-result .menu-btn", "#screen-settings .menu-btn",
    ".select-inner", ".result-inner", ".settings-inner", ".archive", ".atab", ".opt", ".char-card", "#toast",
    ".brand-mark", ".hud-round", ".chain-chip", ".shell-chip", ".key", ".hud-mode", ".hud-help",
    ".hud-timer", ".bar-label",
  ].join(", ");
  let raf = 0;
  const onMove = (e) => {
    // 坐标在事件回调里立即取值，避免 rAF 里读事件对象被引擎复用
    const px = e.clientX;
    const py = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      document.querySelectorAll(sel).forEach((el) => {
        if (!el.getClientRects().length || el.closest(".hidden")) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const x = Math.max(-25, Math.min(125, ((px - r.left) / r.width) * 100));
        const y = Math.max(-25, Math.min(125, ((py - r.top) / r.height) * 100));
        el.style.setProperty("--lg-px", `${x}%`);
        el.style.setProperty("--lg-py", `${y}%`);
      });
    });
  };
  window.addEventListener("pointermove", onMove, { passive: true });
}

/** 初始化主界面特效 */
export async function initTitleFX() {
  initTitleVideo();
  initLiquidGlassSheen();

  // WebGL 液态玻璃透镜层（独立 chunk，不进首屏入口；失败则降级纯 CSS 玻璃）
  try {
    const { initWebGLGlass } = await import("./liquidglass.mjs");
    if (!initWebGLGlass()) document.body.dataset.glassFallback = "css";
  } catch (e) {
    console.warn("[glass] 透镜层初始化失败，降级 CSS", e?.message);
    document.body.dataset.glassFallback = "css";
  }

  // 实时 3D 光标（独立 chunk；失败则保留 PNG 手型光标）
  import("./cursor3d.mjs")
    .then((m) => m.initCursor3D())
    .catch((e) => console.warn("[cursor3d] 初始化失败，保留 PNG 光标", e?.message));

  // 标题字：默认站酷快乐体；?logo=qingke 可切回站酷庆科黄油体对比
  if (new URLSearchParams(location.search).get("logo") === "qingke") {
    document.body.dataset.logoFont = "qingke";
  }
  // 首页 3D 立绘已撤（视频背景自带主体，.title-char 早已 display:none）。
  // 原链路仍会惰性加载 portrait.mjs 并离屏渲染一张 768px 图，纯属浪费，已删除。

  // 2) 粒子：DOM 粒子（20 个）
  const pEl = document.getElementById("title-particles");
  if (pEl) {
    const colors = ["#f5c542", "#ff3d8b", "#7df3c1", "#2fe6ff", "#ffb03a"];
    for (let i = 0; i < 20; i++) {
      const p = document.createElement("div");
      p.className = "title-particle";
      const size = 2 + Math.random() * 4;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const delay = Math.random() * 8;
      const dur = 6 + Math.random() * 8;
      p.style.cssText = `
        position:absolute;
        width:${size}px; height:${size}px;
        left:${left}%; bottom:-10px;
        background:${color};
        border-radius:50%;
        opacity:0;
        animation: particleFloat ${dur}s linear ${delay}s infinite;
      `;
      pEl.appendChild(p);
    }
  }
}
