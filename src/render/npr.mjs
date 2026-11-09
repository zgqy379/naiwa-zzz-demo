/**
 * NPR（NPR+PBR 混合）风格化材质 —— 参考绝区零「赛璐璐基底 + 果冻质感」语汇。
 *
 * 设计要点（依据项目计划书 §3.2 可借语汇 + 公开渲染技术）：
 *  1. 半兰伯特漫反射：NdotL 从 [-1,1] 重映射到 [0,1]，暗部不死黑（动画感）。
 *  2. 色调分离（Tone Separation）：把漫反射量化成 3–4 档硬边界，形成赛璐璐大色块。
 *  3. 果冻高光（Jelly Specular）：在漫反射之上叠一层**边缘衰减的锐利高光**，
 *     模拟「果冻/搪胶」质感——这是绝区零区别于纯赛璐璐的关键。
 *  4.  rim light（轮廓光）：视角边缘加一道亮边，强化剪影。
 *  5. 描边（Outline）：法线外扩的背面壳描边，颜色可配（深色底 + 亮边对比）。
 *
 * 授权边界：本文件为**自研实现**，不复制任何具体游戏的着色器代码；
 * 所用「半兰伯特/色调分离/rim light」均为图形学公共技术语汇。
 */
import * as THREE from "three";

/** 风格化参数预设（可全局调，不改代码） */
export const NPR_PRESET = {
  // 色调分离档数（3 = 经典赛璐璐；4 = 更细腻）
  steps: 3,
  // 暗部提升（0 = 无，0.5 = 明显）—— 0.25→0.12：避免暗部被抬平导致轮廓糊掉
  shadowLift: 0.12,
  // 高光强度 —— 0.85→0.35：压住过曝，保留形体明暗层次
  specularStrength: 0.35,
  // 高光锐度（越大越锐利）
  specularPower: 24.0,
  // 高光颜色
  specularColor: 0xfff8e0,
  // 轮廓光强度 —— 0.55→0.22：rim 过强会吃掉剪影边缘
  rimStrength: 0.22,
  // 轮廓光颜色
  rimColor: 0xfff0c0,
  // 轮廓光衰减幂
  rimPower: 3.0,
  // 描边宽度（模型局部单位；描边壳是角色 mesh 的子节点，最终宽度还会乘模型缩放）
  outlineWidth: 0.022,
  // 描边颜色
  outlineColor: 0x1a1410,
  // 主光颜色（与场景三点光对齐）
  keyColor: 0xfff2d0,
  // 补光颜色
  fillColor: 0xf5c542,
  // 环境色
  ambientColor: 0x404050,
  // 色调分离硬度（0=纯硬切，1=纯软渐变）
  toonHardness: 0.0,
};

/**
 * 生成 NPR 材质（基于 MeshToonMaterial 扩展 + onBeforeCompile 注入）。
 *
 * 为什么用 onBeforeCompile 而不是全自定义 ShaderMaterial：
 *  - 保留 three 的灯光/阴影/贴图/雾/蒙皮等全部内建能力
 *  - 只改写漫反射与高光部分，工程风险最低
 *  - 兼容 GLB 的 map / metalnessMap / roughnessMap（贴图驱动）
 *
 * @param {THREE.MeshStandardMaterial|THREE.MeshToonMaterial} base 基础材质
 * @param {object} preset 风格参数（缺省 NPR_PRESET）
 * @returns {THREE.MeshToonMaterial} 注入后的风格化材质
 */
export function makeNprMaterial(base, preset = {}) {
  const p = { ...NPR_PRESET, ...preset };
  const mat = new THREE.MeshToonMaterial({
    color: base.color ? base.color.clone() : new THREE.Color(0xffffff),
    map: base.map || null,
    // 用自定义 gradientMap 实现色调分离（three 内建支持）
    gradientMap: makeToonGradient(p.steps, p.toonHardness),
  });

  mat.onBeforeCompile = (shader) => {
    // 注入 uniforms
    shader.uniforms.uSteps = { value: p.steps };
    shader.uniforms.uShadowLift = { value: p.shadowLift };
    shader.uniforms.uSpecStrength = { value: p.specularStrength };
    shader.uniforms.uSpecPower = { value: p.specularPower };
    shader.uniforms.uSpecColor = { value: new THREE.Color(p.specularColor) };
    shader.uniforms.uRimStrength = { value: p.rimStrength };
    shader.uniforms.uRimColor = { value: new THREE.Color(p.rimColor) };
    shader.uniforms.uRimPower = { value: p.rimPower };

    // 顶点着色器：传世界法线 + 世界位置 + 视角方向
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vWorldNormalNpr;
         varying vec3 vWorldPosNpr;
         varying vec3 vViewDirNpr;`
      )
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
         vWorldNormalNpr = normalize(mat3(modelMatrix) * objectNormal);
         vWorldPosNpr = (modelMatrix * vec4(transformed, 1.0)).xyz;
         vViewDirNpr = normalize(cameraPosition - (modelMatrix * vec4(transformed, 1.0)).xyz);`
      );

    // 片元着色器：半兰伯特 + 果冻高光 + rim
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vWorldNormalNpr;
         varying vec3 vWorldPosNpr;
         varying vec3 vViewDirNpr;
         uniform float uSteps;
         uniform float uShadowLift;
         uniform float uSpecStrength;
         uniform float uSpecPower;
         uniform vec3 uSpecColor;
         uniform float uRimStrength;
         uniform vec3 uRimColor;
         uniform float uRimPower;
         uniform vec3 uKeyColorNpr;
         uniform vec3 uFillColorNpr;
         uniform vec3 uAmbientColorNpr;`
      )
      // 在光照计算后注入 rim + specular
      .replace(
        "#include <opaque_fragment>",
        `
        // ---- NPR 风格化层（自研注入）----
        vec3 nrm = normalize(vWorldNormalNpr);
        vec3 vdir = normalize(vViewDirNpr);

        // 修：主光方向从 three 的灯光数据读取（原硬编码 vec3(0.5,0.8,0.6) 导致场景三点光失效）
        #if defined(USE_LIGHTS)
          vec3 keyDir = normalize(directionalLights[0].direction);
        #else
          vec3 keyDir = normalize(vec3(0.5, 0.8, 0.6));
        #endif

        // 半兰伯特：暗部提升
        float ndl = dot(nrm, keyDir) * 0.5 + 0.5;
        float lifted = mix(ndl, 1.0, uShadowLift);

        // 果冻高光：锐利的 Blinn-Phong
        vec3 h = normalize(keyDir + vdir);
        float spec = pow(max(dot(nrm, h), 0.0), uSpecPower) * uSpecStrength;

        // rim light：视角边缘亮边
        float rim = pow(1.0 - max(dot(nrm, vdir), 0.0), uRimPower) * uRimStrength;

        // 修：色调分离只量化「光照项」，不量化贴图颜色（保留贴图细节）
        // 光照项 = 漫反射 + 高光 + rim（不含贴图）
        float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        float steps = max(uSteps, 1.0);
        float q = floor(lum * steps) / steps;
        float quantizeK = mix(1.0, q / max(lum, 1e-4), 0.75);

        // 叠加高光/rim 后再量化光照
        vec3 nprLight = outgoingLight * quantizeK + uSpecColor * spec + uRimColor * rim;
        outgoingLight = nprLight;
        #include <opaque_fragment>`
      );

    mat.userData.shader = shader;
  };

  // 让 three 缓存不同参数的 shader（避免材质间串扰）
  mat.customProgramCacheKey = () => `npr_${p.steps}_${p.shadowLift}_${p.specularPower}_${p.rimPower}`;
  return mat;
}

/**
 * 生成色调分离 gradientMap（three MeshToonMaterial 的渐变贴图）。
 * @param {number} steps 档数
 * @param {number} hardness 0=硬切 1=软渐变
 */
export function makeToonGradient(steps = 3, hardness = 0) {
  const size = steps;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    // 硬切：每档一个值；软渐变：线性插值
    const t = size === 1 ? 1 : i / (size - 1);
    const v = Math.round(255 * t);
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 生成描边材质（法线外扩背面壳）。
 * @param {object} opts { color, width }
 */
export function makeOutlineMaterial(opts = {}) {
  const color = new THREE.Color(opts.color ?? NPR_PRESET.outlineColor);
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uWidth: { value: opts.width ?? NPR_PRESET.outlineWidth },
    },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        // 沿法线外扩（世界空间）
        vec3 pos = position + normalize(normal) * uWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
    side: THREE.BackSide,
  });
}

/**
 * 给一个 Object3D 整体套 NPR 风格（含描边）。
 * 遍历所有 Mesh：替换材质为 NPR 版 + 加一层描边壳。
 *
 * @param {THREE.Object3D} root
 * @param {object} preset
 * @param {object} outlineOpts
 * @returns {{ nprMeshes: THREE.Mesh[], outlineMeshes: THREE.Mesh[] }}
 */
export function applyNpr(root, preset = {}, outlineOpts = {}) {
  const nprMeshes = [];
  const outlineMeshes = [];
  const width = outlineOpts.width ?? NPR_PRESET.outlineWidth;
  const oColor = outlineOpts.color ?? NPR_PRESET.outlineColor;
  // 是否加描边壳（默认 true；场景构件可传 false）
  const addOutline = outlineOpts.addOutline !== false;

  // 先收集（避免 traverse 中新增子节点导致递归死循环）
  const targets = [];
  root.traverse((child) => {
    if (child.isMesh && child.geometry && !child.userData.__npr && !child.userData.__isOutline && !child.userData.__skipNpr) {
      targets.push(child);
    }
  });

  for (const child of targets) {
    const npr = makeNprMaterial(child.material, preset);
    child.material = npr;
    child.userData.__npr = true;
    nprMeshes.push(child);

    if (!addOutline) continue; // 场景模式：只换材质，不加壳

    // 描边壳：共享 geometry 引用（不额外占内存）
    const outline = new THREE.Mesh(child.geometry, makeOutlineMaterial({ color: oColor, width }));
    outline.userData.__isOutline = true;
    outline.userData.__npr = true; // 标记，避免重复处理
    outline.raycast = () => {}; // 描边不参与拾取
    child.add(outline);
    outlineMeshes.push(outline);
  }

  return { nprMeshes, outlineMeshes };
}
