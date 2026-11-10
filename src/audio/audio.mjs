/**
 * 音效系统 —— Web Audio 程序化合成（零外部音频文件，授权合规）。
 *
 * 内容：
 *  - BGM：主界面（轻松循环）、战斗（紧张循环）
 *  - 打击音：轻击/重击/终结
 *  - UI 音：点击/悬停/确认/取消
 *  - 环境音：街道（低频噪底）
 *
 * 全部用 OscillatorNode + GainNode + 噪声合成，不加载任何音频文件。
 */

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.volume = 0.7;
    this.bgmNodes = null;
    this.currentBgm = null;
    this.enabled = true;
  }

  /** 初始化（需用户交互后调用） */
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.enabled = false;
      return;
    }
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume;
    this.masterGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.35;
    this.bgmGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.6;
    this.sfxGain.connect(this.masterGain);
  }

  /** 恢复 AudioContext（浏览器自动暂停后） */
  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
  }

  // ==================== BGM ====================

  /** 预渲染的 BGM buffer 缓存 */
  async _ensureBgmBuffer(style) {
    if (this._bgmBuffers?.[style]) return this._bgmBuffers[style];
    this._bgmBuffers = this._bgmBuffers || {};
    // 动态 import（避免循环依赖）
    const { renderBGM } = await import("./music.mjs");
    const buf = await renderBGM({
      style,
      bpm: style === "battle" ? 128 : 88,
      bars: 8,
    });
    this._bgmBuffers[style] = buf;
    return buf;
  }

  /** 播放 BGM：title | battle（预渲染 AudioBuffer，循环） */
  async playBgm(type) {
    if (!this.ctx || this.currentBgm === type) return;
    this.stopBgm();
    this.currentBgm = type;
    this.resume();

    try {
      const style = type === "battle" ? "tense" : (type === "title" ? "bright" : "bright");
      const buf = await this._ensureBgmBuffer(style);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      // 经 bgmGain（音量控制）
      src.connect(this.bgmGain);
      src.start();
      this._bgmSource = src;
    } catch (e) {
      console.warn("BGM 加载失败，回退到合成器", e?.message);
      if (type === "title") this._bgmTitle();
      else if (type === "battle") this._bgmBattle();
    }
  }

  stopBgm() {
    if (this._bgmTimer) { clearInterval(this._bgmTimer); this._bgmTimer = null; }
    // 停预渲染 buffer
    if (this._bgmSource) {
      try { this._bgmSource.stop(); } catch (e) {}
      this._bgmSource = null;
    }
    if (!this.bgmNodes) return;
    const t = this.ctx.currentTime;
    for (const n of this.bgmNodes) {
      try {
        if (n.stop) n.stop(t);
        if (n.gain) n.gain.gain.linearRampToValueAtTime(0, t + 0.4);
      } catch (e) {}
    }
    this.bgmNodes = null;
    this.currentBgm = null;
  }

  /**
   * BGM 调度核心（lookahead 预排）。
   *
   * 修：原 setTimeout 逐拍触发有两处缺陷——① JS 定时器与音频时钟独立，
   * 毫秒级抖动逐拍累积成可闻的节奏漂移；② 后台标签页定时器被节流到 ≥1s，
   * BGM 直接断拍。现改为标准 lookahead 调度器（Chris Wilson《A Tale of Two
   * Clocks》模式）：低精度定时器只负责「往未来补排」，真正的节拍时刻由
   * AudioContext.currentTime 时间线保证，采样精确。
   *
   * @param {string} type 当前 BGM 类型（防切歌后旧循环串台）
   * @param {(t: number) => void} stepFn 单拍调度函数（t = 绝对音频时刻）
   * @param {number} stepDurS 单拍时长（秒）
   */
  _startLoop(type, stepFn, stepDurS) {
    // 预排窗口 ≥1.2s：即使后台 setInterval 被节流到 1000ms 也能接上不断流
    const LOOKAHEAD_S = 1.2;
    const TICK_MS = 200;
    this._bgmNextTime = this.ctx.currentTime + 0.05;
    const tick = () => {
      if (this.currentBgm !== type) return;
      const horizon = this.ctx.currentTime + LOOKAHEAD_S;
      while (this._bgmNextTime < horizon) {
        stepFn(this._bgmNextTime);
        this._bgmNextTime += stepDurS;
      }
    };
    tick();
    this._bgmTimer = setInterval(tick, TICK_MS);
  }

  /** 主界面 BGM：轻松合成器循环（lookahead 预排） */
  _bgmTitle() {
    const ctx = this.ctx;
    const nodes = this.bgmNodes = [];

    // 4 和弦循环（Am - F - G - C），单拍 = 一个和弦 1.7s
    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [196, 246.94, 293.66],
      [261.63, 329.63, 392],
    ];

    let step = 0;
    this._startLoop("title", (t) => {
      const chord = chords[step % chords.length];

      chord.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = i === 0 ? "triangle" : "sine";
        osc.frequency.value = f;
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(0.08, t + 0.1);
        g.gain.linearRampToValueAtTime(0.0, t + 1.6);
        osc.connect(g).connect(this.bgmGain);
        osc.start(t);
        osc.stop(t + 1.8);
        nodes.push({ stop: (tt) => osc.stop(tt), gain: g });
      });

      step++;
    }, 1.7);
  }

  /** 战斗 BGM：紧张节奏（lookahead 预排，130 BPM） */
  _bgmBattle() {
    const ctx = this.ctx;
    const nodes = this.bgmNodes = [];
    const bpm = 130;
    const beat = 60 / bpm;
    const bassNotes = [55, 55, 65.41, 49];

    let step = 0;
    this._startLoop("battle", (t) => {
      // 鼓点（噪声爆发）
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const ng = ctx.createGain();
      ng.gain.value = 0.25;
      noise.connect(ng).connect(this.bgmGain);
      noise.start(t);
      nodes.push({ stop: (tt) => noise.stop(tt), gain: ng });

      // 贝斯
      const bass = ctx.createOscillator();
      const bg = ctx.createGain();
      bass.type = "sawtooth";
      bass.frequency.value = bassNotes[step % bassNotes.length];
      bg.gain.value = 0.06;
      bg.gain.linearRampToValueAtTime(0.0, t + beat * 0.8);
      bass.connect(bg).connect(this.bgmGain);
      bass.start(t);
      bass.stop(t + beat);
      nodes.push({ stop: (tt) => bass.stop(tt), gain: bg });

      step++;
    }, beat);
  }

  // ==================== SFX ====================

  /** 打击音 */
  playHit(tier = "light") {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const cfg = {
      light:    { freq: 800,  dur: 0.08, vol: 0.3,  type: "square" },
      medium:   { freq: 500,  dur: 0.12, vol: 0.4,  type: "square" },
      heavy:    { freq: 250,  dur: 0.2,  vol: 0.5,  type: "sawtooth" },
      ultimate: { freq: 120,  dur: 0.4,  vol: 0.6,  type: "sawtooth" },
    }[tier] ?? { freq: 600, dur: 0.1, vol: 0.3, type: "square" };

    // 修：分层打击音（低频冲击 + 中频打击 + 高频噪声）
    // 1) 低频冲击（body）
    const low = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    low.type = "sine";
    low.frequency.setValueAtTime(cfg.freq * 0.5, t);
    low.frequency.exponentialRampToValueAtTime(40, t + cfg.dur);
    lg.gain.setValueAtTime(cfg.vol * 0.7, t);
    lg.gain.exponentialRampToValueAtTime(0.001, t + cfg.dur);
    low.connect(lg).connect(this.sfxGain);
    low.start(t);
    low.stop(t + cfg.dur + 0.02);

    // 2) 中频打击（attack）
    const mid = this.ctx.createOscillator();
    const mg = this.ctx.createGain();
    mid.type = cfg.type;
    mid.frequency.setValueAtTime(cfg.freq, t);
    mid.frequency.exponentialRampToValueAtTime(cfg.freq * 0.4, t + cfg.dur * 0.6);
    mg.gain.setValueAtTime(cfg.vol * 0.5, t);
    mg.gain.exponentialRampToValueAtTime(0.001, t + cfg.dur * 0.6);
    mid.connect(mg).connect(this.sfxGain);
    mid.start(t);
    mid.stop(t + cfg.dur);

    // 3) 高频噪声（impact transient）
    const nb = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.06, this.ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 2);
    const ns = this.ctx.createBufferSource();
    ns.buffer = nb;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2000;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(cfg.vol * 0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    ns.connect(hp).connect(ng).connect(this.sfxGain);
    ns.start(t);
  }

  /** 弹反音 */
  playCounter() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 1200 + i * 400;
      g.gain.value = 0.15;
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + i * 0.02);
      osc.connect(g).connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  /** UI 点击 */
  playClick() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.06);
    g.gain.value = 0.2;
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** UI 确认 */
  playConfirm() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const start = t + i * 0.06;
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.18, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(g).connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  }

  /** 连携触发 */
  playChain() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      const start = t + i * 0.05;
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.22, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(g).connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }

  /** 终结技 */
  playFinisher() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const low = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    low.type = "sine";
    low.frequency.setValueAtTime(80, t);
    low.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    lg.gain.value = 0.5;
    lg.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    low.connect(lg).connect(this.sfxGain);
    low.start(t);
    low.stop(t + 0.75);

    [1046.5, 1318.5, 1568].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const start = t + 0.1 + i * 0.08;
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.2, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.connect(g).connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  /** 环境音（街道噪底） */
  startAmbient() {
    if (!this.ctx || !this.enabled || this._ambientNode) return;
    this.resume();
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 200;
    const g = ctx.createGain();
    g.gain.value = 0.04;
    src.connect(filter).connect(g).connect(this.bgmGain);
    src.start();
    this._ambientNode = { src, g };
  }
}
