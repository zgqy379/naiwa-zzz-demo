/**
 * 程序化音乐生成器 —— 预渲染 AudioBuffer，避免实时合成的廉价感。
 *
 * 生成内容：
 *  - 和弦进行（I-V-vi-IV 等）
 *  - 贝斯线（根音 + 五音）
 *  - 鼓点（kick/snare/hihat）
 *  - 琶音/主旋律（可选）
 *
 * 全部用 Web Audio 离线渲染（OfflineAudioContext），一次生成、循环播放。
 */

/** 音符频率表（十二平均律） */
const NOTE_FREQ = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** 和弦进行（MIDI 根音） */
const CHORD_PROGRESSIONS = {
  // 明亮：C - G - Am - F（流行经典）
  bright: [
    [60, 64, 67],  // C
    [55, 59, 62],  // G
    [57, 60, 64],  // Am
    [53, 57, 60],  // F
  ],
  // 紧张：Am - F - Dm - E（小调）
  tense: [
    [57, 60, 64],  // Am
    [53, 57, 60],  // F
    [50, 53, 57],  // Dm
    [52, 56, 59],  // E
  ],
  // 史诗：C - Am - F - G
  epic: [
    [60, 64, 67],
    [57, 60, 64],
    [53, 57, 60],
    [55, 59, 62],
  ],
};

/**
 * 离线渲染一段 BGM。
 * @param {object} opts
 *  - style: bright | tense | epic
 *  - bpm: 速度
 *  - bars: 小节数
 *  - sampleRate
 * @returns {Promise<AudioBuffer>}
 */
export async function renderBGM(opts = {}) {
  const {
    style = "bright",
    bpm = 90,
    bars = 8,
    sampleRate = 44100,
  } = opts;

  const chords = CHORD_PROGRESSIONS[style] ?? CHORD_PROGRESSIONS.bright;
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;
  const totalDur = barDur * bars;

  // 离线上下文
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineCtx(1, Math.ceil(totalDur * sampleRate), sampleRate);

  // ---- 和弦垫（Pad）----
  const padGain = ctx.createGain();
  padGain.gain.value = 0.18;
  padGain.connect(ctx.destination);

  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length];
    const start = bar * barDur;

    // 每个和弦音一个长音
    for (const midi of chord) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = NOTE_FREQ(midi);
      // 轻微微调（合唱效果）
      osc.detune.value = (Math.random() - 0.5) * 8;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.12, start + 0.1);
      g.gain.setValueAtTime(0.12, start + barDur - 0.2);
      g.gain.linearRampToValueAtTime(0, start + barDur);

      // 低通（柔化）
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;

      osc.connect(lp).connect(g).connect(padGain);
      osc.start(start);
      osc.stop(start + barDur);
    }
  }

  // ---- 贝斯线 ----
  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.22;
  bassGain.connect(ctx.destination);

  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length];
    const root = chord[0] - 12;  // 低八度
    const start = bar * barDur;

    // 4 分音符贝斯（根音 + 五音交替）
    for (let b = 0; b < 4; b++) {
      const midi = b % 2 === 0 ? root : root + 7;
      const t = start + b * beatDur;

      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = NOTE_FREQ(midi);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + beatDur * 0.7);

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 400;

      osc.connect(lp).connect(g).connect(bassGain);
      osc.start(t);
      osc.stop(t + beatDur);
    }
  }

  // ---- 鼓点 ----
  const drumGain = ctx.createGain();
  drumGain.gain.value = 0.3;
  drumGain.connect(ctx.destination);

  for (let bar = 0; bar < bars; bar++) {
    const start = bar * barDur;
    for (let b = 0; b < 4; b++) {
      const t = start + b * beatDur;

      // Kick（每拍）
      _kick(ctx, drumGain, t);
      // Snare（2、4 拍）
      if (b === 1 || b === 3) _snare(ctx, drumGain, t);
      // Hihat（8 分音符）
      _hihat(ctx, drumGain, t);
      _hihat(ctx, drumGain, t + beatDur / 2);
    }
  }

  // ---- 琶音（高音点缀）----
  const arpGain = ctx.createGain();
  arpGain.gain.value = 0.1;
  arpGain.connect(ctx.destination);

  for (let bar = 0; bar < bars; bar++) {
    const chord = chords[bar % chords.length];
    const start = bar * barDur;
    // 8 分音符琶音（上行）
    for (let i = 0; i < 8; i++) {
      const midi = chord[i % chord.length] + 12;  // 高八度
      const t = start + i * (beatDur / 2);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = NOTE_FREQ(midi);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + beatDur * 0.4);
      osc.connect(g).connect(arpGain);
      osc.start(t);
      osc.stop(t + beatDur * 0.5);
    }
  }

  return await ctx.startRendering();
}

// ---------- 鼓件 ----------

function _kick(ctx, dest, t) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.25);
}

function _snare(ctx, dest, t) {
  // 噪声 + 短音
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.value = 0.25;
  src.connect(bp).connect(g).connect(dest);
  src.start(t);

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 180;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.15, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  osc.connect(og).connect(dest);
  osc.start(t);
  osc.stop(t + 0.12);
}

function _hihat(ctx, dest, t) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.value = 0.12;
  src.connect(hp).connect(g).connect(dest);
  src.start(t);
}
