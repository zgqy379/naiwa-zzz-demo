/**
 * 武器挥动轨迹拖尾 —— 动作游戏的速度感。
 *
 * 为什么需要：既有 SlashArc 是「命中瞬间」在体干位置生成的一道静态弧光，
 * 挥动过程本身没有留下任何痕迹，角色看起来像瞬移而不是把武器甩出去。
 * 这里记录武器尖端最近 14 帧的世界坐标，生成一条始终面向相机的渐变 ribbon：
 * 越靠近当前帧越宽越亮，旧点按年龄淡出。
 *
 * 实现约束：
 *  - 不依赖角色蒙皮 / 骨骼，只吃一个 Vector3，接入成本 3 行；
 *  - 固定 14 段 × 2 顶点，每帧只更新两个 BufferAttribute，无对象分配；
 *  - 只在连段 / 终结演出期间激活，收招立即清空，不留残影；
 *  - AdditiveBlending + 顶点色亮度表达 alpha（不用 vertexAlphas，兼容性更好）。
 */
import * as THREE from "three";

const SEGMENTS = 14;
const HALF_WIDTH = 0.15;    // 拖尾半宽（米）
const LIFE = 0.32;          // 采样点寿命（秒）

export class WeaponTrail {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.points = [];        // { p: Vector3, age: number }
    this.active = false;

    const verts = new Float32Array(SEGMENTS * 2 * 3);
    const colors = new Float32Array(SEGMENTS * 2 * 3);
    const idx = [];
    for (let i = 0; i < SEGMENTS - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(idx);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);

    this._right = new THREE.Vector3();
    this._tan = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /** 只在挥击期间开启；关闭时立即清空历史点 */
  setActive(v) {
    if (this.active === v) return;
    this.active = v;
    if (!v) {
      this.points.length = 0;
      this.mesh.visible = false;
    }
  }

  /** 每帧喂武器尖端世界坐标 */
  push(pos) {
    if (!this.active || !pos) return;
    const last = this.points[this.points.length - 1];
    // 阈值放宽到约 4.5mm：慢速挥动也会留下轨迹，完全静止才不增点
    if (last && last.p.distanceToSquared(pos) < 0.00002) return;
    this.points.push({ p: pos.clone(), age: 0 });
    if (this.points.length > SEGMENTS) this.points.shift();
  }

  update(dt) {
    for (const q of this.points) q.age += dt;
    while (this.points.length && this.points[0].age > LIFE) this.points.shift();
    const n = this.points.length;
    if (!this.active || n < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    // ribbon 宽度方向必须「垂直于挥动轨迹且面向相机」。
    // 早期实现直接用相机右向量：俯视机位下轨迹也在水平面，两者平行 → 带子退化成一条线，
    // 实机截图几乎看不见。改为逐点用局部切线与视线叉乘求侧向量。
    this.camera.getWorldDirection(this._fwd);
    this._right.crossVectors(this._fwd, this._up).normalize();

    const pos = this.mesh.geometry.attributes.position.array;
    const col = this.mesh.geometry.attributes.color.array;
    for (let i = 0; i < SEGMENTS; i++) {
      const idx = Math.min(i, n - 1);
      const q = this.points[idx];
      const pPrev = this.points[Math.max(0, idx - 1)].p;
      const pNext = this.points[Math.min(n - 1, idx + 1)].p;
      this._tan.subVectors(pNext, pPrev);
      if (this._tan.lengthSq() > 1e-8) {
        this._side.crossVectors(this._tan.normalize(), this._fwd).normalize();
        if (this._side.lengthSq() < 1e-6) this._side.copy(this._right);
      } else {
        this._side.copy(this._right);
      }
      const t = i / (SEGMENTS - 1);                 // 0 = 最旧，1 = 当前帧
      const life = Math.max(0, 1 - q.age / LIFE);
      const w = HALF_WIDTH * (0.25 + 0.75 * t) * life;
      const o = i * 6;
      pos[o]     = q.p.x + this._side.x * w;
      pos[o + 1] = q.p.y + this._side.y * w;
      pos[o + 2] = q.p.z + this._side.z * w;
      pos[o + 3] = q.p.x - this._side.x * w;
      pos[o + 4] = q.p.y - this._side.y * w;
      pos[o + 5] = q.p.z - this._side.z * w;

      // 暖白 → 橙，旧点整体变暗；加色混合下亮度即等效 alpha
      const glow = (0.3 + 0.85 * t) * life;
      const r = glow;
      const g = glow * (0.70 + 0.20 * t);
      const b = glow * (0.32 + 0.38 * t);
      col[o] = r;     col[o + 1] = g; col[o + 2] = b;
      col[o + 3] = r; col[o + 4] = g; col[o + 5] = b;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
