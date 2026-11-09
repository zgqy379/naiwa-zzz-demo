/**
 * 场景交互物 —— 可破坏箱 + 掩体。
 *
 * 绝区零式箱庭细节：
 *  - 可破坏箱：攻击命中 → 碎裂成多块 + 掉落粒子
 *  - 掩体：可挡对手攻击（对手 AI 会绕行）
 *  - 破坏后留残骸（短暂停留）
 *
 * 全部程序化生成，零外部资产。
 */
import * as THREE from "three";

export class InteractiveProps {
  constructor(scene) {
    this.scene = scene;
    this.props = [];       // { mesh, type, hp, alive, debris }
    this.debris = [];      // 碎片
  }

  /** 建一批可破坏箱 */
  spawnCrates(count = 6) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.85 });
    for (let i = 0; i < count; i++) {
      const size = 0.5 + Math.random() * 0.4;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat.clone());
      const side = i % 2 === 0 ? -1 : 1;
      mesh.position.set(
        side * (2.5 + Math.random() * 4),
        size / 2,
        -1 - Math.random() * 4
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { type: "crate", hp: 2, alive: true, size };
      this.scene.add(mesh);
      this.props.push(mesh);
    }
  }

  /** 建掩体（高箱，不可破坏但可挡路） */
  spawnCover(count = 3) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.8 });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.5), mat.clone());
      mesh.position.set(
        -4 + i * 4 + (Math.random() - 0.5),
        0.9,
        -3 - Math.random() * 2
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { type: "cover", alive: true };
      this.scene.add(mesh);
      this.props.push(mesh);
    }
  }

  /**
   * 命中检测：攻击位置附近的可破坏物。
   * @param {THREE.Vector3} pos 攻击位置
   * @param {number} range 范围
   * @returns {THREE.Mesh[]} 被打到的 props
   */
  hitTest(pos, range = 1.5) {
    const hit = [];
    for (const p of this.props) {
      if (!p.userData.alive) continue;
      if (p.userData.type !== "crate") continue;
      if (p.position.distanceTo(pos) <= range) hit.push(p);
    }
    return hit;
  }

  /** 破坏一个箱 */
  destroy(crate) {
    if (!crate.userData.alive) return;
    crate.userData.alive = false;
    const size = crate.userData.size;
    // 碎裂成 6 块
    for (let i = 0; i < 6; i++) {
      const s = size * (0.2 + Math.random() * 0.2);
      const d = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.9 })
      );
      d.position.copy(crate.position);
      d.userData = {
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          Math.random() * 3 + 1.5,
          (Math.random() - 0.5) * 4
        ),
        life: 0.7,
        rotVel: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
      };
      d.castShadow = true;
      this.scene.add(d);
      this.debris.push(d);
    }
    this.scene.remove(crate);
  }

  /** 每帧推进 */
  step(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.userData.life -= dt;
      if (d.userData.life <= 0) {
        this.scene.remove(d);
        d.geometry.dispose();
        d.material.dispose();
        this.debris.splice(i, 1);
        continue;
      }
      d.position.addScaledVector(d.userData.vel, dt);
      d.userData.vel.y -= 12 * dt;
      if (d.position.y < 0.05) { d.position.y = 0.05; d.userData.vel.y *= -0.3; }
      d.rotation.x += d.userData.rotVel.x * dt;
      d.rotation.y += d.userData.rotVel.y * dt;
      d.rotation.z += d.userData.rotVel.z * dt;
    }
  }

  /** 检查位置是否被掩体挡住 */
  isBlocked(pos, targetPos) {
    for (const p of this.props) {
      if (!p.userData.alive || p.userData.type !== "cover") continue;
      // 简单判定：掩体在 pos 与 targetPos 之间
      const toTarget = new THREE.Vector3().subVectors(targetPos, pos);
      const toCover = new THREE.Vector3().subVectors(p.position, pos);
      const proj = toCover.dot(toTarget.clone().normalize());
      if (proj > 0 && proj < toTarget.length()) {
        const perp = toCover.sub(toTarget.clone().normalize().multiplyScalar(proj)).length();
        if (perp < 1.2) return true;
      }
    }
    return false;
  }
}
