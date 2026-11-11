/**
 * WebGL 液态玻璃透镜层。
 *
 * 与首页 DOM 的关系：
 *   video(背景) → 本 canvas(透镜) → .title-inner(文字/描边/点击)
 * 不复用游戏主 canvas，也不改 main.mjs 的渲染循环，避免影响战斗渲染。
 *
 * 做法：把 <video> 当 VideoTexture，按每个按钮的 getBoundingClientRect()
 * 在正交相机里画一片 quad；片元着色器用圆角矩形 SDF 求边缘法线，
 * 中心不偏移、边缘按法线位移采样视频，R/G/B 用不同位移量产生色散，
 * 再叠镜面高光与边缘亮线。这是真的像素弯折，不是 backdrop-filter 的模糊。
 *
 * 参考原理：Apple Liquid Glass / kucukkanat liquid-glass 的 SDF displacement map，
 * 此处为自写实现，未复制任何第三方代码。
 */
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uVideo;
  uniform vec2  uQuadOrigin;    // quad 左上角（屏幕像素，Y 向下）
  uniform vec2  uQuadSize;      // quad 尺寸（像素）
  uniform vec2  uVideoOffset;   // object-fit:cover 后视频显示区左上角
  uniform vec2  uVideoDisplay;  // object-fit:cover 后视频显示尺寸
  uniform vec2  uPointer;       // 指针屏幕像素
  uniform vec2  uResolution;    // 屏幕尺寸（用于复刻 .title-bg 遮罩）
  uniform float uScale;         // 边缘折射强度（像素）
  uniform float uRadius;        // 圆角半径（像素）
  uniform vec3  uTint;          // 玻璃色调
  varying vec2 vUv;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  // 屏幕像素 → 视频纹理 uv（VideoTexture 默认 flipY=true）
  vec2 videoUv(vec2 screenPx) {
    vec2 uv = (screenPx - uVideoOffset) / uVideoDisplay;
    return vec2(uv.x, 1.0 - uv.y);
  }

  void main() {
    // vUv.y 向上；转成以 quad 中心为原点、Y 向下的 SDF 坐标
    vec2 p = vec2((vUv.x - 0.5) * uQuadSize.x, (0.5 - vUv.y) * uQuadSize.y);
    vec2 halfSize = uQuadSize * 0.5 - 1.5;
    float d = sdRoundBox(p, halfSize, uRadius);
    if (d > 1.5) discard;

    // 屏幕像素（用于采样视频）
    vec2 screenPx = uQuadOrigin + vec2(vUv.x * uQuadSize.x, (1.0 - vUv.y) * uQuadSize.y);

    // SDF 梯度 = 边缘外法线
    vec2 ex = vec2(1.0, 0.0);
    vec2 ey = vec2(0.0, 1.0);
    vec2 n = normalize(vec2(
      sdRoundBox(p + ex, halfSize, uRadius) - sdRoundBox(p - ex, halfSize, uRadius),
      sdRoundBox(p + ey, halfSize, uRadius) - sdRoundBox(p - ey, halfSize, uRadius)
    ) + vec2(1e-5));

    // 只在边缘 bevel 带内弯折，中心保持清晰
    float bevel = 30.0;
    float edge = 1.0 - smoothstep(-bevel, -1.0, d);
    edge = pow(clamp(edge, 0.0, 1.0), 1.4);

    vec2 base = videoUv(screenPx);
    vec2 disp = n * edge * uScale / uVideoDisplay;

    // 三通道不同位移 → 色散彩边
    vec3 c;
    c.r = texture2D(uVideo, base + disp * 1.00).r;
    c.g = texture2D(uVideo, base + disp * 0.82).g;
    c.b = texture2D(uVideo, base + disp * 0.66).b;

    // 边缘轻微磨砂（中心清晰）
    vec2 px = 1.4 / uVideoDisplay;
    vec3 soft = vec3(0.0);
    soft += texture2D(uVideo, base + disp + vec2(px.x, 0.0)).rgb;
    soft += texture2D(uVideo, base + disp - vec2(px.x, 0.0)).rgb;
    soft += texture2D(uVideo, base + disp + vec2(0.0, px.y)).rgb;
    soft += texture2D(uVideo, base + disp - vec2(0.0, px.y)).rgb;
    soft *= 0.25;
    c = mix(c, soft, 0.30 + 0.50 * edge);

    // 复刻 .title-bg 的深蓝遮罩：透镜采的是原始视频，不补这层会与周围断层
    float t = clamp(screenPx.y / uResolution.y, 0.0, 1.0);
    float maskA = t < 0.30
      ? mix(0.62, 0.16, t / 0.30)
      : (t < 0.58 ? mix(0.16, 0.34, (t - 0.30) / 0.28)
                  : mix(0.34, 0.94, (t - 0.58) / 0.42));
    vec3 maskC = mix(vec3(0.039, 0.063, 0.118), vec3(0.031, 0.051, 0.102), t);
    c = mix(c, maskC, maskA);

    // 玻璃本体：轻微提亮 + 冷调体色
    c = c * 1.08 + vec3(0.035);
    c = mix(c, c * uTint, 0.18);

    // 跟随指针的镜面高光
    vec2 ptr = (uPointer - (uQuadOrigin + uQuadSize * 0.5)) / uQuadSize;
    vec2 hp = vec2(ptr.x, 1.0 - ptr.y);
    vec2 dv = (vUv - hp) * vec2(2.2, 3.0);
    float sheen = exp(-dot(dv, dv) * 3.0);
    c += vec3(0.17) * sheen;

    // 1px 边缘亮线（厚度感）
    float rim = smoothstep(-2.6, -0.3, d) * (1.0 - smoothstep(-0.3, 1.3, d));
    c += vec3(0.40) * rim;

    float alpha = 1.0 - smoothstep(-1.0, 1.5, d);
    gl_FragColor = vec4(c, alpha);
  }
`;

/**
 * 初始化透镜层。失败时返回 false，由调用方降级到纯 CSS 玻璃。
 * @returns {boolean}
 */
export function initWebGLGlass() {
  const canvas = document.getElementById("glass-layer");
  const video = document.getElementById("title-video");
  const screen = document.getElementById("screen-title");
  if (!canvas || !video || !screen) return false;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
  } catch (e) {
    console.warn("[glass] WebGL 不可用，降级 CSS", e?.message);
    return false;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  // 像素坐标系：left=0 right=w，top=0 bottom=h → Y 向下，与 DOM rect 一致
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
  const geometry = new THREE.PlaneGeometry(1, 1);

  const texture = new THREE.VideoTexture(video);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const els = [
    ...document.querySelectorAll("#screen-title .menu-btn"),
    document.getElementById("title-sound"),
    document.querySelector("#screen-title .title-footer"),
  ].filter(Boolean);

  const lenses = els.map((el) => {
    const primary = el.classList.contains("primary");
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uVideo: { value: texture },
        uQuadOrigin: { value: new THREE.Vector2() },
        uQuadSize: { value: new THREE.Vector2(1, 1) },
        uVideoOffset: { value: new THREE.Vector2() },
        uVideoDisplay: { value: new THREE.Vector2(1, 1) },
        uPointer: { value: new THREE.Vector2(-9999, -9999) },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uScale: { value: 38 },
        uRadius: { value: 12 },
        uTint: { value: new THREE.Color(primary ? 0xffe0a0 : 0xd8e8ff) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { el, mat, mesh };
  });

  let pointerX = -9999;
  let pointerY = -9999;
  window.addEventListener("pointermove", (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
  }, { passive: true });

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.left = 0;
    camera.right = w;
    camera.top = 0;
    camera.bottom = h;
    camera.updateProjectionMatrix();

    // object-fit: cover 映射
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const s = Math.max(w / vw, h / vh);
    const dw = vw * s;
    const dh = vh * s;
    const ox = (w - dw) * 0.5;
    const oy = (h - dh) * 0.5;
    for (const l of lenses) {
      l.mat.uniforms.uVideoOffset.value.set(ox, oy);
      l.mat.uniforms.uVideoDisplay.value.set(dw, dh);
      l.mat.uniforms.uResolution.value.set(w, h);
    }
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();

  let enabled = true;
  // 透镜位置缓存：原先每帧对每个透镜调 getBoundingClientRect()（强制 layout），
  //   而这些按钮的位置在页面不滚动时是不变的。现按需重算（resize / 滚动）。
  let lensRects = [];
  let lensRectsDirty = true;
  const invalidateLensRects = () => { lensRectsDirty = true; };
  window.addEventListener("resize", invalidateLensRects, { passive: true });
  window.addEventListener("scroll", invalidateLensRects, { passive: true });

  // 离屏时**整条 rAF 停掉**（此前离屏仍每帧 renderer.clear()，白占一个 GL 调用 + rAF 槽位）
  let running = false;
  let rafId = 0;
  const startLoop = () => { if (running) return; running = true; rafId = requestAnimationFrame(frame); };
  const stopLoop = () => { if (!running) return; running = false; cancelAnimationFrame(rafId); };
  new MutationObserver(() => {
    if (screen.classList.contains("hidden")) stopLoop();
    else { invalidateLensRects(); startLoop(); }
  }).observe(screen, { attributes: true, attributeFilter: ["class"] });

  function frame() {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    if (!enabled) {
      renderer.clear();
      return;
    }
    if (video.readyState < 2) return;

    if (lensRectsDirty) {
      lensRects = lenses.map((l) => l.el.getBoundingClientRect());
      lensRectsDirty = false;
    }
    for (let li = 0; li < lenses.length; li++) {
      const l = lenses[li];
      const r = lensRects[li];
      if (!r || !r.width || !r.height) {
        l.mesh.visible = false;
        continue;
      }
      l.mesh.visible = true;
      l.mesh.position.set(r.x + r.width * 0.5, r.y + r.height * 0.5, 0);
      l.mesh.scale.set(r.width, r.height, 1);
      l.mat.uniforms.uQuadOrigin.value.set(r.x, r.y);
      l.mat.uniforms.uQuadSize.value.set(r.width, r.height);
      l.mat.uniforms.uPointer.value.set(pointerX, pointerY);
      l.mat.uniforms.uRadius.value = Math.min(16, r.height * 0.42);
    }
    renderer.render(scene, camera);
  }
  startLoop();

  // 供调试/性能对比：?glass=off 临时停掉透镜层
  window.__nprGlass = {
    setScale(v) { for (const l of lenses) l.mat.uniforms.uScale.value = v; },
    setEnabled(v) { enabled = !!v; },
    hide() { canvas.style.display = "none"; },
    show() { canvas.style.display = ""; },
  };
  return true;
}
