/**
 * NPR（NPR+PBR 混合）风格化材质 —— 参考绝区零「赛璐璐基底 + 果冻质感」语汇。
 *
 * 设计要点（依据项目计划书 §3.2 可借语汇 + 公开渲染技术）：
 *  1. 半兰伯特漫反射：NdotL 从 [-1,1] 重映射到 [0,1]，暗部不死黑（动画感）。
 *  2. 色调分离（Tone Separation）：把漫反射量化成 2–3 档软边界（美术圣经 v2 §2），形成赛璐璐大色块。
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
  // 美术圣经 v2 §2：banding 统一 2 档（角色=场景=立绘同一条 toon 语言；[] 键限 2–3）
  steps: 2,
  // 暗部提升（圣经 v2 §2：0.42 高环境抬升，暗部不死黑）
  shadowLift: 0.42,
  // 高光强度（圣经 v2 §2：哑光硅胶 0.8，压 PVC 锐反射）
  specularStrength: 0.8,
  // 高光锐度（圣经 v2 §2：14 = 宽软高光，替代 v1 的 30 锐高光）
  specularPower: 14.0,
  // 高光颜色（美术圣经 §3：果冻高光 0xfff8e0 不改）
  specularColor: 0xfff8e0,
  // 轮廓光强度（圣经 v2 §6：我方奶油暖 0.24；对手冷白银走 FACTION_RIM.foe）
  rimStrength: 0.24,
  // 轮廓光颜色（圣经 v2 §6：我方奶油暖 0xffe2a0；对手冷白银 0xd8e6f4 走 FACTION_RIM.foe，洋红退出 3D）
  rimColor: 0xffe2a0,
  // 轮廓光衰减幂（美术圣经 §3：rimPower 3.0 是奶感来源，不许改硬）
  rimPower: 3.0,
  // 描边宽度（圣经 v2 §2：预设 0.010；角色壳/立绘宽由调用方覆写 0.016/0.005）
  outlineWidth: 0.010,
  // 描边颜色（美术圣经 §6：我方深底 0x1a1410；对手洋红深底走 FACTION_RIM.foe）
  outlineColor: 0x1a1410,
  // 主光颜色（与场景 key 灯 main.mjs:55 同源；已接线为 NPR 主光顺向小幅叠加，不再是死数据）
  keyColor: 0xffe8c8,
  // 补光颜色（圣经 v2 §2 奶油补光；已接线为暗侧反方向小幅叠加）
  fillColor: 0xffdf9e,
  // 环境色（圣经 v2 §2 高环境抬升；已接线为暗部小幅叠加）
  ambientColor: 0x8090a8,
  // 主光方向（美术圣经重做线「方向统一」：与 main.mjs:53 场景 key 灯 (4,8,6) 同向；
  // 立绘 portrait.mjs 以自身 key 灯方向覆写此值）
  keyDir: new THREE.Vector3(4, 8, 6).normalize(),
  // 色调分离硬度（圣经 v2 §2：0.55 软边界；已接线进量化 smoothstep，不再是死数据）
  toonHardness: 0.55,
};

/**
 * 敌我阵营 rim/描边预设（圣经 v2 §6：我方奶油暖 vs 对手冷白银，UI 洋红共存）。
 * 洋红从 3D rim 全链退场，只活在 UI 层（血条/失衡格/弹反预警/受击闪）。
 */
export const FACTION_RIM = {
  ally: { rimColor: 0xffe2a0, rimStrength: 0.24, outlineColor: 0x1a1410 },
  foe: { rimColor: 0xd8e6f4, rimStrength: 0.26, outlineColor: 0x10151d },
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
  // 展示层重染（roster-audit-20261110 差距#1）：p.tintColor 存在时启用 USE_TINT_NPR
  // 重染路径（albedo 去色→按明度乘 tint）；无 tint 时 defines/uniform/注入块全部不生效，
  // shader 编译产物与 cache key 与未加 tint 前一致（其余 13 只零行为变化）。
  const tintColor = p.tintColor ?? null;
  const tintMix = p.tintMix ?? 1.0;     // 1.0 = 完全重染；0 = 原贴图色（运行时同帧对照用）

  // 修：用 MeshStandardMaterial 而非 MeshToonMaterial
  // 原因：MeshToonMaterial 的 gradientMap 会与 map 相乘，压暗贴图细节
  // MeshStandardMaterial 保留完整 PBR 贴图通道，NPR 效果由 onBeforeCompile 注入
  const mat = new THREE.MeshStandardMaterial({
    color: base.color ? base.color.clone() : new THREE.Color(0xffffff),
    map: base.map || null,
    // 圣经 v2 §2「哑光硅胶」：压掉 GLB 自带 PVC 锐反射（metalness ≤ 0.05、roughness ≥ 0.85）
    metalness: Math.min(base.metalness ?? 0, 0.05),
    roughness: Math.max(base.roughness ?? 1, 0.85),
    // 保留贴图驱动（GLB 的 metalnessMap/roughnessMap）
    metalnessMap: base.metalnessMap || null,
    roughnessMap: base.roughnessMap || null,
    normalMap: base.normalMap || null,
    normalScale: base.normalScale ? base.normalScale.clone() : new THREE.Vector2(1, 1),
  });

  // 仅 tint 材质注入 define（无 tint 的 13 只编译产物与现状一致）
  if (tintColor != null) mat.defines = { ...(mat.defines ?? {}), USE_TINT_NPR: "" };

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
    // 主光方向（CPU 侧注入，避免 shader 引用内建灯光变量导致编译问题；
    // 缺省取 preset.keyDir —— 与场景 key 灯同向，方向统一）
    shader.uniforms.uKeyDir = { value: (p.keyDir ?? new THREE.Vector3(0.5, 0.8, 0.6)).clone().normalize() };
    // 圣经 v2 §2：keyColor/fillColor/ambientColor 三个死数据接线（此前 preset 有值、shader 未使用）
    shader.uniforms.uKeyColorNpr = { value: new THREE.Color(p.keyColor) };
    shader.uniforms.uFillColorNpr = { value: new THREE.Color(p.fillColor) };
    shader.uniforms.uAmbientColorNpr = { value: new THREE.Color(p.ambientColor) };
    // 色调分离软边界（0=纯硬切，1=纯软渐变）
    shader.uniforms.uToonHardness = { value: p.toonHardness };
    // 展示层重染 uniforms（仅 USE_TINT_NPR 材质注入；与 fragmentShader 声明块成对，
    // uKeyDir 教训：注入了 uniform 却忘声明会直接让角色消失）
    if (tintColor != null) {
      // tint 色的 HSV（linear 空间）：ColorManagement 默认开，setHex 已把 sRGB hex 转
      // linear-sRGB，与 sRGB 贴图解码后的 diffuseColor 同一工作空间；HSV 的 h/s 全链
      // 自洽在 linear 空间（tint2 返工：只取色相/饱和度，明度保留原 albedo 分布）
      const c = new THREE.Color(tintColor);
      const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
      const d = mx - mn;
      let h = 0;
      if (d > 1e-6) {
        if (mx === c.r) h = ((c.g - c.b) / d) % 6;
        else if (mx === c.g) h = (c.b - c.r) / d + 2;
        else h = (c.r - c.g) / d + 4;
        h = (h * 60 + 360) % 360;
      }
      const s = mx > 1e-6 ? d / mx : 0;
      shader.uniforms.uTintHS = { value: new THREE.Vector2(h / 360, s) };
      shader.uniforms.uTintMix = { value: tintMix };
    }

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
      // 展示层重染（仅 USE_TINT_NPR）：map_fragment 之后、光照之前改写 albedo——
      // 只动 diffuseColor（albedo），半兰伯特/色调分离/rim/specular 分层逻辑不受影响。
      // 【tint2 返工】保原明度重着色：HSV 空间只替换色相/饱和度，明度通道（V=max）
      // 完全保留原 albedo 分布——亮度峰值/明暗分层与重染前一致，泛白不复现。
      // 上一版「单位亮度 tint × 原 luma」把输出亮度锚到 tint 色亮度（浅色 tint 推亮
      // ~28%：奶猫 mean 168→194、nearWhite 1.06%→16.24%，leader 仲裁实测）。
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        #ifdef USE_TINT_NPR
          vec3 hsvNpr = rgb2hsvNpr(diffuseColor.rgb);
          diffuseColor.rgb = mix(diffuseColor.rgb, hsv2rgbNpr(vec3(uTintHS.x, uTintHS.y, hsvNpr.z)), uTintMix);
        #endif`
      )
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
         uniform vec3 uKeyDir;
         uniform vec3 uKeyColorNpr;
         uniform vec3 uFillColorNpr;
         uniform vec3 uAmbientColorNpr;
         uniform float uToonHardness;
         #ifdef USE_TINT_NPR
         uniform vec2 uTintHS;
         uniform float uTintMix;
         // HSV 互转（数学公共域算法，仅 tint 材质编译进 program；无 tint 材质被
         // 预处理器移除，编译产物与未加 tint 前一致）
         vec3 rgb2hsvNpr(vec3 c) {
           vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
           vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
           vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
           float d = q.x - min(q.w, q.y);
           return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
         }
         vec3 hsv2rgbNpr(vec3 c) {
           vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
           return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
         }
         #endif`
      )
      // 在光照计算后注入 rim + specular
      .replace(
        "#include <opaque_fragment>",
        `
        // ---- NPR 风格化层（自研注入）----
        vec3 nrm = normalize(vWorldNormalNpr);
        vec3 vdir = normalize(vViewDirNpr);

        // 主光方向：由 CPU 侧 uniform 传入（修：原硬编码导致场景三点光失效）
        vec3 keyDir = normalize(uKeyDir);

        // 加性光颜色变量：无 tint 材质 = uniform 原值（编译器内联后与未加 tint 前等价）。
        // 【tint2 返工】tint 材质加性光：只把色相对齐到 tint 色，S/V（=强度）严格保留
        // 原值——加性光不推高亮度（上一版「单位亮度 tint 色」mix 会改加性光明度分布）；
        // S≈0 的灰白加性光（如 spec 0xfff8e0）换 hue 无效果，天然保持白高光。
        vec3 specC = uSpecColor;
        vec3 rimC = uRimColor;
        vec3 keyC = uKeyColorNpr;
        vec3 fillC = uFillColorNpr;
        vec3 ambC = uAmbientColorNpr;
        #ifdef USE_TINT_NPR
        vec3 specH = rgb2hsvNpr(uSpecColor);      specH.x = uTintHS.x; specC = mix(specC, hsv2rgbNpr(specH), uTintMix);
        vec3 rimH = rgb2hsvNpr(uRimColor);        rimH.x = uTintHS.x; rimC = mix(rimC, hsv2rgbNpr(rimH), uTintMix);
        vec3 keyH = rgb2hsvNpr(uKeyColorNpr);     keyH.x = uTintHS.x; keyC = mix(keyC, hsv2rgbNpr(keyH), uTintMix);
        vec3 fillH = rgb2hsvNpr(uFillColorNpr);   fillH.x = uTintHS.x; fillC = mix(fillC, hsv2rgbNpr(fillH), uTintMix);
        vec3 ambH = rgb2hsvNpr(uAmbientColorNpr); ambH.x = uTintHS.x; ambC = mix(ambC, hsv2rgbNpr(ambH), uTintMix);
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
        // 圣经 v2 §2 toonHardness 软边界：0=硬切、1=整段线性（smoothstep 半宽 = hardness·0.5）
        float x = lum * steps;
        float softW = max(uToonHardness * 0.5, 0.001);
        float edge = smoothstep(0.5 - softW, 0.5 + softW, clamp(fract(x), 0.0, 1.0));
        float q = (floor(x) + edge) / steps;
        float quantizeK = mix(1.0, q / max(lum, 1e-4), 0.75);

        // 圣经 v2 §2：keyColor/fillColor/ambientColor 接线（自研注入，量级取小，
        // 防止与场景三点光/环境光重复加亮：主光顺向 10%、奶油补光 18%、暗部环境抬升 28%）
        vec3 fillDir = normalize(vec3(-keyDir.x, 0.35, -keyDir.z));
        float fill = max(dot(nrm, fillDir), 0.0);
        vec3 nprLight = outgoingLight * quantizeK
                      + specC * spec + rimC * rim
                      + keyC * (max(dot(nrm, keyDir), 0.0) * 0.10)
                      + fillC * (fill * 0.18)
                      + ambC * ((1.0 - lifted) * 0.28);
        outgoingLight = nprLight;
        #include <opaque_fragment>`
      );

    mat.userData.shader = shader;
  };

  // 让 three 缓存不同参数的 shader（避免材质间串扰）
  // tint 材质加 _tint 后缀防 program 缓存串扰；无 tint 材质 key 与未加 tint 前逐字节一致
  mat.customProgramCacheKey = () => `npr_${p.steps}_${p.shadowLift}_${p.specularPower}_${p.rimPower}${tintColor != null ? "_tint" : ""}`;
  return mat;
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
 * @param {object} outlineOpts { color, width, addOutline, tintColor, tintMix }
 *   tintColor: 展示层重染目标色（0xRRGGBB；不传/undefined/null = 无 tint 路径）。
 *              仅取其 HSV 色相/饱和度（linear 空间），明度保留原 albedo 分布
 *   tintMix:   重染强度 0–1（默认 1.0 = 完全重染）
 * @returns {{ nprMeshes: THREE.Mesh[], outlineMeshes: THREE.Mesh[] }}
 */
export function applyNpr(root, preset = {}, outlineOpts = {}) {
  const nprMeshes = [];
  const outlineMeshes = [];
  const width = outlineOpts.width ?? NPR_PRESET.outlineWidth;
  const oColor = outlineOpts.color ?? NPR_PRESET.outlineColor;
  // 显式传入描边色（阵营描边，见 FACTION_RIM）时跳过下方明度微调，保证描边色全场一致
  const lumaTweak = outlineOpts.color === undefined;
  // 是否加描边壳（默认 true；场景构件可传 false）
  const addOutline = outlineOpts.addOutline !== false;
  // 展示层重染（roster-audit-20261110 差距#1）：outlineOpts.tintColor 存在时拼进
  // preset 传给 makeNprMaterial（不新增第四参，侵入最小）；不传 = 无 tint 路径，
  // preset 对象保持原样（portrait.mjs / stage.mjs 等调用方零影响）。
  const tintColor = outlineOpts.tintColor ?? null;
  const nprPreset = tintColor != null
    ? { ...preset, tintColor, tintMix: outlineOpts.tintMix, tintGain: outlineOpts.tintGain }
    : preset;

  // 先收集（避免 traverse 中新增子节点导致递归死循环）
  const targets = [];
  root.traverse((child) => {
    if (child.isMesh && child.geometry && !child.userData.__npr && !child.userData.__isOutline && !child.userData.__skipNpr) {
      targets.push(child);
    }
  });

  for (const child of targets) {
    const npr = makeNprMaterial(child.material, nprPreset);
    child.material = npr;
    child.userData.__npr = true;
    nprMeshes.push(child);

    if (!addOutline) continue; // 场景模式：只换材质，不加壳

    // 修：描边色随材质微调（暗部材质用更深描边，亮部偏暖）；阵营描边（显式传色）不做微调
    let outColor = oColor;
    if (lumaTweak && child.material?.color) {
      const c = child.material.color;
      const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
      if (lum < 0.25) {
        // 暗部材质：描边更深
        outColor = 0x0a0806;
      } else if (lum > 0.7) {
        // 亮部材质：描边偏暖
        outColor = 0x2a1e10;
      }
    }

    // 描边壳：共享 geometry 引用（不额外占内存）
    const outline = new THREE.Mesh(child.geometry, makeOutlineMaterial({ color: outColor, width }));
    outline.userData.__isOutline = true;
    outline.userData.__npr = true; // 标记，避免重复处理
    outline.raycast = () => {}; // 描边不参与拾取
    child.add(outline);
    outlineMeshes.push(outline);
  }

  return { nprMeshes, outlineMeshes };
}

/**
 * 程序化主题色饰带（美术圣经重做线 A1/A2 角色可读性；不改 GLB 文件本身）。
 *
 * 在角色容器（g / opponentGroup：无旋转缩放、局部 y=0 即地面）内加一圈平色布带：
 *  - MeshBasicMaterial 纯色不受光 = 任意灯光/量化下主题色恒定可辨；
 *  - __skipNpr：不进 NPR 量化与描边壳，restyleAll 反复 applyNpr 也不会处理它；
 *  - 随容器整体移动，零贴图成本。
 *
 * @param {THREE.Object3D} container 角色容器（模型底部对齐其局部 y=0）
 * @param {object} opts { color, heightRatio, margin }
 * @returns {THREE.Mesh|null} 饰带 mesh（容器缺失/重复添加时返回 null）
 */
export function attachThemeBand(container, { color = 0xf5c542, heightRatio = 0.52, margin = 1.1 } = {}) {
  if (!container || container.getObjectByName("theme-band")) return null;
  const box = new THREE.Box3().setFromObject(container);
  const size = box.getSize(new THREE.Vector3());
  if (!(size.y > 0)) return null;
  const radius = (Math.max(size.x, size.z) / 2) * margin;
  const tube = Math.max(0.02, Math.min(0.05, size.y * 0.035));
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 10, 40),
    new THREE.MeshBasicMaterial({ color })
  );
  band.name = "theme-band";
  band.userData.__skipNpr = true;
  band.rotation.x = Math.PI / 2;
  band.position.y = size.y * heightRatio;
  band.raycast = () => {};
  container.add(band);
  return band;
}
