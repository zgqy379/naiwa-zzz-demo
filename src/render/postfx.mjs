/**
 * 后处理管线 —— 电影感渲染的关键。
 *
 * 三层：
 *  1. **Bloom（泛光）**：让霓虹/高光溢出发光，形成「光晕」
 *  2. **色彩分级**：暖色高光 + 冷色阴影（黄昏撞色）+ 对比度/饱和度
 *  3. **FXAA（抗锯齿）**：消除几何边缘锯齿
 *
 * 全部基于 three 官方后处理模块（UnrealBloomPass / ShaderPass / FXAAShader），
 * 不引入外部依赖。
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

/** 色彩分级 Shader（自研：暖高光 + 冷阴影 + 对比/饱和） */
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uWarmHighlights: { value: new THREE.Color(0xffd0a0) }, // 暖色高光（圣经 v2 §3：色相保留）
    uCoolShadows: { value: new THREE.Color(0x5a7ac0) },    // 冷色阴影（圣经 v2 §3：紫蓝→黄昏蓝灰）
    uLift: { value: 0.06 },      // 阴影提升（圣经 v2 §3：不动）
    uContrast: { value: 1.06 },  // 对比度（圣经 v2 §3：1.08→1.06，中到亮别压死）
    uSaturation: { value: 1.02 },// 饱和度（圣经 v2 §3：1.05→1.02）
    uVignette: { value: 0.10 },  // 暗角强度（圣经 v2 §3：0.12→0.10）
    uWarmMix: { value: 0.16 },   // 暖高光混合系数（圣经 v2 §3：0.20→0.16，暖高光减弱）
    uCoolMix: { value: 0.14 },   // 冷阴影加色系数（圣经 v2 §3：0.08→0.14，冷调主导）
    uChromatic: { value: 0 },    // 命中脉冲：径向 RGB 色散强度，默认 0（无额外采样）
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uWarmHighlights;
    uniform vec3 uCoolShadows;
    uniform float uLift;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uWarmMix;
    uniform float uCoolMix;
    uniform float uChromatic;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb;

      // 命中瞬间的径向色散：R/B 沿画面中心方向微量错开，制造镜头冲击感。
      // uChromatic 常态为 0，分支不触发时不产生额外采样开销。
      if (uChromatic > 0.0001) {
        vec2 dir = (vUv - 0.5) * uChromatic;
        c.r = texture2D(tDiffuse, vUv + dir).r;
        c.b = texture2D(tDiffuse, vUv - dir).b;
      }

      // 1) 分离高光/阴影（按亮度）
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      float hiMask = smoothstep(0.55, 1.0, lum);
      float loMask = smoothstep(0.45, 0.0, lum);

      // 2) 暖高光 + 冷阴影（系数走 uniform，默认值 = 美术圣经 §2 目标）
      c = mix(c, c * (uWarmHighlights / 1.0), hiMask * uWarmMix);
      c = mix(c, c + uCoolShadows * uCoolMix, loMask * 0.3);

      // 3) 阴影提升
      c += uLift * (1.0 - lum);

      // 4) 对比度（以 0.5 为中心）
      c = (c - 0.5) * uContrast + 0.5;

      // 5) 饱和度
      float g = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(g), c, uSaturation);

      // 6) 暗角
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - smoothstep(0.4, 0.95, d) * uVignette;

      gl_FragColor = vec4(max(c, 0.0), color.a);
    }
  `,
};

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} opts { bloom, grade, fxaa, quality }
   */
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = opts.enabled !== false;

    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(size.x, size.y);

    // 1) 渲染通道
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // 2) Bloom（泛光）
    // 阈值按美术圣经 v2 §3 定为 0.90：只让散景/灯笼/橱窗等点光源柔辉泛光，
    // 角色奶油基色（#f5d98a 亮度≈0.83）不被整只判成高光烧平。
    // 默认值与 main.mjs 构造传参一致（单入口，消除双入口漂移）。
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      opts.bloomStrength ?? 0.20,  // 强度（圣经 v2 §3：0.20 不动，低强度柔辉光）
      opts.bloomRadius ?? 0.55,    // 半径（圣经 v2 §3：0.50→0.55，更散的柔光）
      opts.bloomThreshold ?? 0.90  // 阈值（圣经 v2 §3：0.85→0.90）
    );
    this.composer.addPass(this.bloom);

    // 3) 色彩分级
    this.grade = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.grade);

    // 4) FXAA（分辨率用渲染缓冲尺寸，而非 CSS 像素）
    this.fxaa = new ShaderPass(FXAAShader);
    const dpr = renderer.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (size.x * dpr), 1 / (size.y * dpr));
    this.composer.addPass(this.fxaa);

    // 5) 输出（色彩空间转换）
    this.output = new OutputPass();
    this.composer.addPass(this.output);

    // 命中色散脉冲状态（默认恒 0，不产生任何视觉/性能影响）
    this._chromaticT = 0;
    this._chromaticDur = 0;
    this._chromaticPeak = 0;
  }

  /** 命中瞬间径向色散脉冲：0.18s 平方衰减，峰值很轻不糊画面 */
  pulseChromatic(peak = 0.012, dur = 0.18) {
    this._chromaticPeak = peak;
    this._chromaticDur = dur;
    this._chromaticT = dur;
    this.grade.material.uniforms.uChromatic.value = peak;
  }

  /** 每帧渲染 */
  render(dt) {
    // 脉冲衰减放在 enabled 判断之前，保证低配/lite 模式下也能归零
    if (this._chromaticT > 0) {
      this._chromaticT = Math.max(0, this._chromaticT - dt);
      const k = this._chromaticDur > 0 ? this._chromaticT / this._chromaticDur : 0;
      this.grade.material.uniforms.uChromatic.value = this._chromaticPeak * k * k;
    } else if (this.grade.material.uniforms.uChromatic.value !== 0) {
      this.grade.material.uniforms.uChromatic.value = 0;
    }
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(dt);
  }

  /** 尺寸变化 */
  setSize(w, h) {
    this.composer.setSize(w, h);
    const dpr = this.renderer.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
  }

  /** 开关 Bloom */
  setBloom(on, strength) {
    this.bloom.enabled = on;
    if (strength !== undefined) this.bloom.strength = strength;
  }

  /** 调整色彩分级 */
  setGrade({ lift, contrast, saturation, vignette, warmMix, coolMix } = {}) {
    const u = this.grade.material.uniforms;
    if (lift !== undefined) u.uLift.value = lift;
    if (contrast !== undefined) u.uContrast.value = contrast;
    if (saturation !== undefined) u.uSaturation.value = saturation;
    if (vignette !== undefined) u.uVignette.value = vignette;
    if (warmMix !== undefined) u.uWarmMix.value = warmMix;
    if (coolMix !== undefined) u.uCoolMix.value = coolMix;
  }

  /** 低配模式：关 Bloom，只留 FXAA + 分级 */
  setLowQuality() {
    this.bloom.enabled = false;
  }
}
