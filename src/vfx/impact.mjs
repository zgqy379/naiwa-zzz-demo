/**
 * 打击特效 —— 冲击波 + 火花粒子 + 弧光斩击拖尾（美术圣经 v2 §7「火花 + 弧光」）。
 *
 * ref-06 准据：细小橙色火花（打铁火花）+ 弧形渐变斩击拖尾。
 *  - Shockwave：命中点扩散的圆环（保留，色随档位 0xffb04a→0xff5a8a、opacity 0.6）
 *  - SparkParticles：canvas 软圆点 + 下向尾迹（拖尾），带重力、明暗闪烁
 *  - SlashArc：扇环几何 + 径向渐变贴图（内白→中橙→外粉→透明），
 *    前 30% 淡入放大、后 70% 淡出，终结技加第二道反向弧
 *
 * v1「奶滴/奶花」贴图与短棍速度线已整类删除（圣经 v2 §7 作废条款）。
 * 全部程序化，零外部资产；粒子贴图 canvas 绘制（做法同 src/world/textures.mjs，只读参考）。
 */
import * as THREE from "three";

/** hex → rgba() 字符串 */
function _hexRgba(hex, a) {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** 贴图缓存（按 key 共享，页面生命周期内不释放） */
const _sparkTex = new Map();
let _arcTex = null;

/**
 * 火花 sprite 贴图：白热亮芯 + 向下尾迹（拖尾观感）。
 * 重力朝下，尾迹画在贴图下方（屏幕向下 ≈ 世界向下，相机接近水平）。
 * 色：0xffb04a ↔ 0xff7a30（圣经 v2 §0 火花族）。
 */
function sparkTexture(colorHex) {
  const key = `spark_${colorHex}`;
  if (_sparkTex.has(key)) return _sparkTex.get(key);
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const cx = S / 2;
  // ① 尾迹：亮芯向下的线性渐变条（拖尾）
  const tail = g.createLinearGradient(cx, 16, cx, S - 4);
  tail.addColorStop(0, _hexRgba(colorHex, 0.5));
  tail.addColorStop(1, _hexRgba(colorHex, 0));
  g.fillStyle = tail;
  g.fillRect(cx - 2.5, 16, 5, S - 20);
  // ② 亮芯：白热芯 → 火花色 → 透明（径向渐变）
  const glow = g.createRadialGradient(cx, 20, 1, cx, 20, 16);
  glow.addColorStop(0, "rgba(255,246,232,0.95)");
  glow.addColorStop(0.45, _hexRgba(colorHex, 0.85));
  glow.addColorStop(1, _hexRgba(colorHex, 0));
  g.fillStyle = glow;
  g.beginPath();
  g.arc(cx, 20, 16, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _sparkTex.set(key, tex);
  return tex;
}

/**
 * 弧光斩击贴图：径向渐变 内白 0xfff6e8 → 中橙 0xff9a3a → 外粉 0xff5a8a → 透明。
 * 渐变 stop 按半径比例排布：RingGeometry 的 UV 为平面映射
 * （uv = vertex/outerRadius，three 0.187 RingGeometry:93-94），
 * 故 stop f 对应世界半径 f × 外半径；内孔（0.35m）处 f ≤ 0.29 < 0.35，
 * 各档位内缘均落在白色平台内 → 内缘白、外缘粉的色带随档位等比缩放。
 */
function arcTexture() {
  if (_arcTex) return _arcTex;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0.0, "rgba(255,246,232,0.95)");   // 圆心（几何内孔遮挡，不参与采样）
  grad.addColorStop(0.35, "rgba(255,246,232,0.95)");  // 内缘白 #fff6e8
  grad.addColorStop(0.62, "rgba(255,154,58,0.85)");   // 中橙 #ff9a3a
  grad.addColorStop(0.88, "rgba(255,90,138,0.75)");   // 外粉 #ff5a8a
  grad.addColorStop(1.0, "rgba(255,90,138,0)");       // 外缘透明
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _arcTex = tex;
  return tex;
}

/** 冲击波（扩散圆环，随档位色；圣经 v2 §7 opacity 0.9→0.6） */
export class Shockwave {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
  }

  /** 触发一次冲击波 */
  spawn(pos, { color = 0xffb04a, maxRadius = 2, duration = 0.35, width = 0.25 } = {}) {
    const geo = new THREE.RingGeometry(0.1, 0.1 + width, 32);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pos);
    mesh.position.y = 0.05;
    mesh.userData = { t: 0, duration, maxRadius, baseScale: 1 };
    this.scene.add(mesh);
    this.pool.push(mesh);
  }

  update(dt) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const m = this.pool[i];
      m.userData.t += dt;
      const p = m.userData.t / m.userData.duration;
      if (p >= 1) {
        this.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
        this.pool.splice(i, 1);
        continue;
      }
      // 扩散 + 淡出
      const r = 0.2 + p * m.userData.maxRadius;
      m.scale.set(r, r, 1);
      m.material.opacity = 0.6 * (1 - p);
    }
  }
}

/**
 * 火花粒子（圣经 v2 §7，替代奶滴/奶花）：
 * 小尺寸软圆点 sprite，色 0xffb04a↔0xff7a30 随机，AdditiveBlending，
 * size 0.03–0.06m；初速水平 ±2.2 m/s、垂直 1.5–4 m/s；重力 -9.8 m/s²；
 * 寿命 0.35–0.6s；透明度衰减上叠 sin(t*40+seed)*0.25 明暗闪烁（拖尾抖动）。
 */
export class SparkParticles {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
  }

  spawn(pos, { count = 12 } = {}) {
    for (let i = 0; i < count; i++) {
      const color = Math.random() < 0.5 ? 0xffb04a : 0xff7a30;
      const size = 0.03 + Math.random() * 0.03;   // 0.03–0.06m
      const mat = new THREE.SpriteMaterial({
        map: sparkTexture(color),
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const p = new THREE.Sprite(mat);
      p.position.copy(pos);
      p.position.y += 0.5 + Math.random() * 0.9;  // 命中体干高度散布（入参为地面点）
      p.userData = {
        t: 0,
        duration: 0.35 + Math.random() * 0.25,    // 0.35–0.6s
        seed: i * 1.7 + Math.random(),            // 闪烁相位
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4.4,            // 水平 ±2.2 m/s
          1.5 + Math.random() * 2.5,              // 垂直 1.5–4 m/s
          (Math.random() - 0.5) * 4.4
        ),
        baseOpacity: 0.9,
        baseScale: size * 3,                      // 贴图含尾迹留白，×3 补回可视尺寸
      };
      p.scale.setScalar(p.userData.baseScale);
      this.scene.add(p);
      this.pool.push(p);
    }
  }

  update(dt) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      const u = p.userData;
      u.t += dt;
      const life = u.t / u.duration;
      if (life >= 1) {
        this.scene.remove(p);
        p.material.dispose();   // 贴图入 _sparkTex 共享缓存，不在此 dispose
        this.pool.splice(i, 1);
        continue;
      }
      p.position.addScaledVector(u.vel, dt);
      u.vel.y -= 9.8 * dt;      // 圣经 v2 §7：重力 -9.8 m/s²（打铁火花抛物线，替换旧 -6）
      // 淡出 × 明暗闪烁：衰减上叠 sin(t*40+seed)*0.25 抖动
      const flick = Math.sin(u.t * 40 + u.seed) * 0.25;
      p.material.opacity = Math.max(0, u.baseOpacity * (1 - life) * (1 + flick));
      p.scale.setScalar(u.baseScale * (1 - life * 0.4));
    }
  }
}

/**
 * 弧光斩击拖尾（圣经 v2 §7，ref-06 准据）：
 * 扇环几何（thetaLength 100–140°、内半径 0.35m、外半径随档位），
 * 径向渐变贴图 内白→中橙→外粉→透明；对齐挥击平面（竖直，默认面向 +Z 相机侧，
 * 见 tuning.camera.sideOffset 侧后机位），寿命 0.16–0.22s
 * （前 30% 淡入放大、后 70% 淡出），AdditiveBlending、depthWrite false。
 */
export class SlashArc {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
  }

  /** 触发一道弧光；flip=true 时扇面转到对侧（终结技第二道反向弧） */
  spawn(pos, { outerR = 1.6, flip = false } = {}) {
    const inner = 0.35;                                              // 内半径 0.35m
    const thetaLength = (100 + Math.random() * 40) * Math.PI / 180;  // 100–140°
    let thetaStart = -thetaLength / 2 + (Math.random() - 0.5) * Math.PI * 0.6;
    if (flip) thetaStart += Math.PI;                                 // 反向弧
    const geo = new THREE.RingGeometry(inner, outerR, 40, 1, thetaStart, thetaLength);
    const mat = new THREE.MeshBasicMaterial({
      map: arcTexture(),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.position.y = Math.max(pos.y, 0) + 1.0 + Math.random() * 0.3;  // 体干高度
    // 竖直挥击平面（XY 面）+ 小幅随机偏航/翻滚，避免每刀方向雷同
    mesh.rotation.set((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5);
    mesh.userData = { t: 0, duration: 0.16 + Math.random() * 0.06, maxOpacity: 0.85 };
    mesh.scale.setScalar(0.7);
    this.scene.add(mesh);
    this.pool.push(mesh);
  }

  update(dt) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const m = this.pool[i];
      const u = m.userData;
      u.t += dt;
      const p = u.t / u.duration;
      if (p >= 1) {
        this.scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();   // 贴图共享缓存，不在此 dispose
        this.pool.splice(i, 1);
        continue;
      }
      if (p < 0.3) {
        // 前 30%：淡入 + 放大
        const k = p / 0.3;
        m.material.opacity = u.maxOpacity * k;
        m.scale.setScalar(0.7 + 0.3 * k);
      } else {
        // 后 70%：淡出
        m.material.opacity = u.maxOpacity * (1 - (p - 0.3) / 0.7);
      }
    }
  }
}

/** 组合特效触发器（对外签名不变：new ImpactFX(scene) / hit(pos, tier) / update(dt)） */
export class ImpactFX {
  constructor(scene) {
    this.shockwave = new Shockwave(scene);
    this.sparks = new SparkParticles(scene);
    this.slash = new SlashArc(scene);
  }

  /**
   * 命中触发
   * @param {THREE.Vector3} pos 地面点（y=0）
   * @param {string} tier light|medium|heavy|ultimate
   */
  hit(pos, tier = "light") {
    // 档位表（圣经 v2 §7，替换旧 impact.mjs:203-214）：弧外半径 + 火花数；
    // 色随档位 0xffb04a→0xff5a8a（火花/弧光族）
    const cfg = {
      light:    { color: 0xffb04a, arcR: 1.2, sparks: 10 },
      medium:   { color: 0xff9a3a, arcR: 1.6, sparks: 14 },
      heavy:    { color: 0xff7a30, arcR: 2.0, sparks: 20 },
      ultimate: { color: 0xff5a8a, arcR: 2.4, sparks: 26 },
    }[tier] ?? { color: 0xffb04a, arcR: 1.2, sparks: 10 };

    this.shockwave.spawn(pos, { color: cfg.color, maxRadius: cfg.arcR, duration: 0.3 });
    this.sparks.spawn(pos, { count: cfg.sparks });
    this.slash.spawn(pos, { outerR: cfg.arcR });
    if (tier === "ultimate") this.slash.spawn(pos, { outerR: cfg.arcR, flip: true });  // 第二道反向弧
  }

  update(dt) {
    this.shockwave.update(dt);
    this.sparks.update(dt);
    this.slash.update(dt);
  }
}
