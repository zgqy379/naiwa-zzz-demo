import{D as e,E as t,S as n,T as r,_ as i,b as a,c as o,k as s,m as c,y as l}from"./index-CDoGGTde.js";var u=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,d=`
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
`;function f(){let f=document.getElementById(`glass-layer`),p=document.getElementById(`title-video`),m=document.getElementById(`screen-title`);if(!f||!p||!m)return!1;let h;try{h=new o({canvas:f,alpha:!0,antialias:!1,premultipliedAlpha:!1,powerPreference:`low-power`})}catch(e){return console.warn(`[glass] WebGL 不可用，降级 CSS`,e?.message),!1}h.setClearColor(0,0),h.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));let g=new r,_=new a(0,1,0,1,-1,1),v=new n(1,1),y=new s(p);y.minFilter=i,y.magFilter=i,y.generateMipmaps=!1;let b=[...document.querySelectorAll(`#screen-title .menu-btn`),document.getElementById(`title-sound`),document.querySelector(`#screen-title .title-footer`)].filter(Boolean).map(n=>{let r=n.classList.contains(`primary`),i=new t({vertexShader:u,fragmentShader:d,uniforms:{uVideo:{value:y},uQuadOrigin:{value:new e},uQuadSize:{value:new e(1,1)},uVideoOffset:{value:new e},uVideoDisplay:{value:new e(1,1)},uPointer:{value:new e(-9999,-9999)},uResolution:{value:new e(1,1)},uScale:{value:38},uRadius:{value:12},uTint:{value:new c(r?16769184:14215423)}},transparent:!0,depthTest:!1,depthWrite:!1}),a=new l(v,i);return a.frustumCulled=!1,g.add(a),{el:n,mat:i,mesh:a}}),x=-9999,S=-9999;window.addEventListener(`pointermove`,e=>{x=e.clientX,S=e.clientY},{passive:!0});function C(){let e=window.innerWidth,t=window.innerHeight;h.setSize(e,t,!1),_.left=0,_.right=e,_.top=0,_.bottom=t,_.updateProjectionMatrix();let n=p.videoWidth||1280,r=p.videoHeight||720,i=Math.max(e/n,t/r),a=n*i,o=r*i,s=(e-a)*.5,c=(t-o)*.5;for(let n of b)n.mat.uniforms.uVideoOffset.value.set(s,c),n.mat.uniforms.uVideoDisplay.value.set(a,o),n.mat.uniforms.uResolution.value.set(e,t)}window.addEventListener(`resize`,C,{passive:!0}),C();let w=!0,T=[],E=!0,D=()=>{E=!0};window.addEventListener(`resize`,D,{passive:!0}),window.addEventListener(`scroll`,D,{passive:!0});let O=!1,k=0,A=()=>{O||(O=!0,k=requestAnimationFrame(M))},j=()=>{O&&(O=!1,cancelAnimationFrame(k))};new MutationObserver(()=>{m.classList.contains(`hidden`)?j():(D(),A())}).observe(m,{attributes:!0,attributeFilter:[`class`]});function M(){if(O){if(k=requestAnimationFrame(M),!w)h.clear();else if(!(p.readyState<2)){E&&=(T=b.map(e=>e.el.getBoundingClientRect()),!1);for(let e=0;e<b.length;e++){let t=b[e],n=T[e];!n||!n.width||!n.height?t.mesh.visible=!1:(t.mesh.visible=!0,t.mesh.position.set(n.x+n.width*.5,n.y+n.height*.5,0),t.mesh.scale.set(n.width,n.height,1),t.mat.uniforms.uQuadOrigin.value.set(n.x,n.y),t.mat.uniforms.uQuadSize.value.set(n.width,n.height),t.mat.uniforms.uPointer.value.set(x,S),t.mat.uniforms.uRadius.value=Math.min(16,n.height*.42))}h.render(g,_)}}}return A(),window.__nprGlass={setScale(e){for(let t of b)t.mat.uniforms.uScale.value=e},setEnabled(e){w=!!e},hide(){f.style.display=`none`},show(){f.style.display=``}},!0}export{f as initWebGLGlass};