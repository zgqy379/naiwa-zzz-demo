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
    uWarmHighlights: { value: new THREE.Color(0xffd0a0) }, // 暖色高光
    uCoolShadows: { value: new THREE.Color(0x4a6aff) },    // 冷色阴影
    uLift: { value: 0.06 },      // 阴影提升（修：原 0.12 导致暗部冷蓝污染）
    uContrast: { value: 1.08 },  // 对比度
    uSaturation: { value: 1.12 },// 饱和度（修：原 1.25 过艳）
    uVignette: { value: 0.12 },  // 暗角强度（修：原 0.28 像望远镜）
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
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb;

      // 1) 分离高光/阴影（按亮度）
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      float hiMask = smoothstep(0.55, 1.0, lum);
      float loMask = smoothstep(0.45, 0.0, lum);

      // 2) 暖高光 + 冷阴影
      c = mix(c, c * (uWarmHighlights / 1.0), hiMask * 0.35);
      c = mix(c, c + uCoolShadows * 0.15, loMask * 0.3);

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
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      opts.bloomStrength ?? 0.55,  // 强度
      opts.bloomRadius ?? 0.5,     // 半径
      opts.bloomThreshold ?? 0.72  // 阈值（只让亮部泛光）
    );
    this.composer.addPass(this.bloom);

    // 3) 色彩分级
    this.grade = new ShaderPass(ColorGradeShader);
    this.composer.addPass(this.grade);

    // 4) FXAA
    this.fxaa = new ShaderPass(FXAAShader);
    this.fxaa.material.uniforms.resolution.value.set(1 / size.x, 1 / size.y);
    this.composer.addPass(this.fxaa);

    // 5) 输出（色彩空间转换）
    this.output = new OutputPass();
    this.composer.addPass(this.output);
  }

  /** 每帧渲染 */
  render(dt) {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(dt);
  }

  /** 尺寸变化 */
  setSize(w, h) {
    this.composer.setSize(w, h);
    this.fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
  }

  /** 开关 Bloom */
  setBloom(on, strength) {
    this.bloom.enabled = on;
    if (strength !== undefined) this.bloom.strength = strength;
  }

  /** 调整色彩分级 */
  setGrade({ lift, contrast, saturation, vignette } = {}) {
    const u = this.grade.material.uniforms;
    if (lift !== undefined) u.uLift.value = lift;
    if (contrast !== undefined) u.uContrast.value = contrast;
    if (saturation !== undefined) u.uSaturation.value = saturation;
    if (vignette !== undefined) u.uVignette.value = vignette;
  }

  /** 低配模式：关 Bloom，只留 FXAA + 分级 */
  setLowQuality() {
    this.bloom.enabled = false;
  }
}
