/**
 * 打击特效 —— 冲击波 + 速度线 + 光效粒子。
 *
 * 绝区零式打击反馈（程序化近似）：
 *  - 冲击波：命中点扩散的圆环（ shader 动画）
 *  - 速度线：从命中点放射的细线（短暂）
 *  - 光效粒子：带加色混合的发光粒子（不再是纯色方块）
 *
 * 全部程序化，零外部资产。
 */
import * as THREE from "three";

/** 冲击波（扩散圆环） */
export class Shockwave {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
  }

  /** 触发一次冲击波 */
  spawn(pos, { color = 0xffc880, maxRadius = 2, duration = 0.35, width = 0.25 } = {}) {
    const geo = new THREE.RingGeometry(0.1, 0.1 + width, 32);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
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
      m.material.opacity = 0.9 * (1 - p);
    }
  }
}

/** 速度线（从命中点放射） */
export class SpeedLines {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
  }

  spawn(pos, { color = 0xffffff, count = 8, duration = 0.2 } = {}) {
    for (let i = 0; i < count; i++) {
      const len = 0.5 + Math.random() * 0.8;
      const geo = new THREE.BoxGeometry(0.02, 0.02, len);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      line.position.copy(pos);
      line.position.y += 0.2 + Math.random() * 0.6;
      line.rotation.y = angle;
      line.rotation.x = (Math.random() - 0.5) * 0.6;
      line.userData = {
        t: 0,
        duration,
        dir: new THREE.Vector3(Math.cos(angle), 0.2 + Math.random() * 0.4, Math.sin(angle)),
        speed: 3 + Math.random() * 4,
      };
      this.scene.add(line);
      this.pool.push(line);
    }
  }

  update(dt) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const l = this.pool[i];
      l.userData.t += dt;
      const p = l.userData.t / l.userData.duration;
      if (p >= 1) {
        this.scene.remove(l);
        l.geometry.dispose();
        l.material.dispose();
        this.pool.splice(i, 1);
        continue;
      }
      l.position.addScaledVector(l.userData.dir, l.userData.speed * dt);
      l.material.opacity = 0.8 * (1 - p);
    }
  }
}

/** 光效粒子（加色混合的发光点） */
export class GlowParticles {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
  }

  spawn(pos, { color = 0xffc880, count = 12, duration = 0.5, size = 0.08 } = {}) {
    for (let i = 0; i < count; i++) {
      const s = size * (0.5 + Math.random());
      const geo = new THREE.SphereGeometry(s, 6, 4);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      p.position.y += Math.random() * 0.6;
      p.userData = {
        t: 0,
        duration: duration * (0.6 + Math.random() * 0.6),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          1 + Math.random() * 3,
          (Math.random() - 0.5) * 4
        ),
        baseOpacity: 0.9,
      };
      this.scene.add(p);
      this.pool.push(p);
    }
  }

  update(dt) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.userData.t += dt;
      const life = p.userData.t / p.userData.duration;
      if (life >= 1) {
        this.scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        this.pool.splice(i, 1);
        continue;
      }
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.y -= 6 * dt;
      // 加色混合下用透明度衰减即可
      p.material.opacity = p.userData.baseOpacity * (1 - life);
      // 缩小
      const s = 1 - life * 0.6;
      p.scale.set(s, s, s);
    }
  }
}

/** 组合特效触发器 */
export class ImpactFX {
  constructor(scene) {
    this.shockwave = new Shockwave(scene);
    this.speedLines = new SpeedLines(scene);
    this.glow = new GlowParticles(scene);
  }

  /**
   * 命中触发
   * @param {THREE.Vector3} pos
   * @param {string} tier light|medium|heavy|ultimate
   */
  hit(pos, tier = "light") {
    const cfg = {
      light:    { color: 0xffc880, radius: 1.2, lines: 6,  particles: 8,  size: 0.06 },
      medium:   { color: 0xffb03a, radius: 1.8, lines: 8,  particles: 12, size: 0.08 },
      heavy:    { color: 0xff8a3a, radius: 2.4, lines: 12, particles: 18, size: 0.1 },
      ultimate: { color: 0xff3d8b, radius: 3.5, lines: 16, particles: 28, size: 0.14 },
    }[tier] ?? { color: 0xffc880, radius: 1.2, lines: 6, particles: 8, size: 0.06 };

    this.shockwave.spawn(pos, { color: cfg.color, maxRadius: cfg.radius, duration: 0.3 });
    this.speedLines.spawn(pos, { color: cfg.color, count: cfg.lines, duration: 0.18 });
    this.glow.spawn(pos, { color: cfg.color, count: cfg.particles, duration: 0.45, size: cfg.size });
  }

  update(dt) {
    this.shockwave.update(dt);
    this.speedLines.update(dt);
    this.glow.update(dt);
  }
}
