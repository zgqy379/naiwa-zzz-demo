/**
 * Aholo World 真实街区表面 —— 「写实底」视差背景层。
 *
 * 素材来源：Aholo 官方世界导出 `aholo.world.export/v1`
 *   worldId 3FO4K4VSNJ4F / assetId 3FO4K4WNAN1L / versionId 16456
 *   `霓虹废弃工业巷_pointcloud_surface.ply`（721×360 全景连续表面，47.3 万面）
 * 由 `scripts/build-aholo-street.py` 减面为 29,152 面 / 589KB 的 GLB。
 *
 * 设计意图（BRIEF.md 的「写实底 + 卡通前景」）：
 *   - 项目的程序化店铺立面是连续的，把真实街景放在最底层会被整排
 *     卡通楼完全盖住（实测：加载成功但画面一点都看不到）。
 *     所以改画在 3D 之上，用屏幕空间径向遮罩只在画面四周透出来：
 *     中心的奶蛙、高对比招牌、HUD 完全不受影响，边缘得到一层
 *     带视差的写实霓虹巷，像录像带漏光 / 镜头暗角。
 *   - 它是真实 3D 网格而不是贴图，相机移动时边缘街景会跟着走，
 *     但不参与碰撞、不做玩法交互。
 *   - 不交给 optimizeScene 合批，也不交给 applyNpr 换材质，
 *     因此必须在 buildStage() 的最后才挂载。
 *
 * 失败降级：GLB 没部署成功或加载报错时只打一条 warn，
 * 场景照常返回，Demo 不会因为一个背景层而白屏。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const GLB_URL = "./world/aholo-street.glb";
// 原始壳半径中位 4.5m / p95 10m。放大到 8 倍后落在 36–80m，
// 高于程序化店铺立面（约 10m），边缘透出来的才是巷子纵深而不是贴脸墙。
const SHELL_SCALE = 8.0;
// 画在 3D 之上（HUD 是 DOM 层，不受影响）
const RENDER_ORDER = 9000;
// 屏幕空间径向遮罩：中心 0.42 以内完全透明，到 0.75 渐显，峰值不透明度 0.32
// （2026-11-09 23:5x 美术复核后收紧：原 0.18/0.56/0.60 会让写实层在画面
//  中部糊出一条白雾带、边缘灰白块，把招牌文字冲淡——对比实测关掉后更干净。
//  现在只留最外圈一点写实质感，中心交给 NPR 卡通。）
const EDGE_INNER = 0.42;
const EDGE_OUTER = 0.75;
const EDGE_OPACITY = 0.32;

export function attachAholoStreet(group, opts = {}) {
  const state = { loaded: false, triangles: 0, error: null };
  // 挂到全局方便验收脚本读，风格与项目已有的 window.__npr 一致
  if (typeof window !== "undefined") window.__aholoStreet = state;

  const loader = new GLTFLoader();
  loader.load(
    GLB_URL,
    (gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => {
        if (o.isMesh && !mesh) mesh = o;
      });
      if (!mesh) {
        state.error = "GLB 里没有 mesh";
        console.warn("[aholo-street] " + state.error);
        return;
      }

      // 顶点色已在导出时压暗 / 降饱和，这里只决定「怎么画」：
      // 不受光照、不吃雾（否则被 FOG_FAR=55 抹掉）、不写深度、双面。
      // 边缘遮罩在片元着色器里按屏幕坐标算，保证画面中心干净。
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        fog: false,
        toneMapped: false,
        transparent: true,
        opacity: 1,
      });
      // DoubleSide + transparent 在 Three.js 里默认正反各画一遍，
      // 会把 29,152 面翻倍成 57,624。壳是内向球，只需单遍。
      material.forceSinglePass = true;
      let shaderRef = null;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uRes = { value: new THREE.Vector2(1, 1) };
        shader.uniforms.uEdge = { value: new THREE.Vector4(EDGE_INNER, EDGE_OUTER, EDGE_OPACITY, 0) };
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform vec2 uRes;\nuniform vec4 uEdge;")
          .replace("#include <dithering_fragment>", `#include <dithering_fragment>
            vec2 sp = gl_FragCoord.xy / max(uRes, vec2(1.0));
            float dd = distance(sp, vec2(0.5));
            float edge = smoothstep(uEdge.x, uEdge.y, dd);
            gl_FragColor.a = edge * uEdge.z;`);
        shaderRef = shader;
      };
      mesh.material = material;
      mesh.onBeforeRender = (renderer) => {
        // drawingBufferSize 是物理像素，与 gl_FragCoord 同一坐标系
        if (shaderRef) renderer.getDrawingBufferSize(shaderRef.uniforms.uRes.value);
      };
      mesh.name = "aholo-world-parallax-shell";
      mesh.renderOrder = RENDER_ORDER;
      mesh.scale.setScalar(SHELL_SCALE);
      mesh.frustumCulled = false; // 壳包住相机，包围盒剔除容易误判
      mesh.matrixAutoUpdate = true;
      mesh.updateMatrix();

      group.add(mesh);
      const idx = mesh.geometry.getIndex();
      state.triangles = idx ? idx.count / 3 : mesh.geometry.getAttribute("position").count / 3;
      state.loaded = true;
      if (opts.onReady) opts.onReady(state);
    },
    undefined,
    (err) => {
      state.error = String(err && err.message ? err.message : err);
      console.warn("[aholo-street] 背景层加载失败，已降级为程序化街道：", state.error);
    },
  );

  return state;
}
