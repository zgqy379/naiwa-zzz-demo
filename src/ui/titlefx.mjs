/**
 * 主界面特效 —— 角色立绘 + 动态粒子。
 *
 * 实现：
 *  - 立绘：用缩略图（portrait）放大显示在右侧
 *  - 粒子：DOM 元素 + CSS 动画（轻量，不影响性能）
 */
import { makePortrait } from "./portrait.mjs";
import { SQUAD } from "../game/squad.mjs";

/** 初始化主界面特效 */
export async function initTitleFX() {
  // 1) 立绘：用奶蛙（主角）的缩略图
  const charEl = document.getElementById("title-char");
  if (charEl) {
    try {
      const url = await makePortrait(SQUAD[0], { size: 768, bgColor: "dark" });
      charEl.innerHTML = `<img src="${url}" alt="奶蛙" />`;
    } catch (e) {
      console.warn("主界面立绘生成失败", e);
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
