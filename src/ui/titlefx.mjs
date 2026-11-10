/**
 * 主界面特效 —— 角色立绘 + 动态粒子。
 *
 * 实现：
 *  - 立绘：用缩略图（portrait）放大显示在右侧
 *  - 粒子：DOM 元素 + CSS 动画（轻量，不影响性能）
 */
import { SQUAD } from "../game/squad.mjs";

/** 初始化主界面特效 */
export async function initTitleFX() {
  // 1) 立绘：用奶蛙（主角）的缩略图
  const charEl = document.getElementById("title-char");
  if (charEl) {
    try {
      // 立绘生成器惰性加载（不进入首屏入口 chunk）：与主界面渲染顺序无关
      const { makePortrait } = await import("./portrait.mjs");
      // transparent：主界面大图用透明底版本，避免立绘自带条纹底撞上背景警戒条
      const url = await makePortrait(SQUAD[0], { size: 768, bgColor: "dark", transparent: true });
      charEl.innerHTML = `<img src="${url}" alt="" />`;
    } catch (e) {
      // 降级：生成色块（不用 alt，避免出现文字）
      console.warn("主界面立绘生成失败，使用色块降级", e?.message);
      charEl.innerHTML = `<div class="title-char-fallback" style="background:linear-gradient(135deg,#f5c542,#c8902a)"></div>`;
    }
  }

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
