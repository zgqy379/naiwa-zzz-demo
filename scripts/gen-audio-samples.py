"""
生成「自有」离线渲染音效采样（可复现，授权零风险）。

为什么离线：Web Audio 实时合成只能挂几个 Oscillator；离线可以叠几十个
非谐波泛音、多段包络、反馈延迟混响与软限幅，金属/打击质感明显更厚。
这些 WAV 是本项目自己生成的原创素材，不是第三方录音，符合
docs/ASSET-LICENSES.md 的「自有 或 明确 CC0」红线。

用法：python scripts/gen-audio-samples.py
输出：public/audio/*.wav
  - 既有 4 段（hit_light / hit_heavy / clash_metal / whoosh）：44.1kHz / 16bit / mono，
    种子与参数自 2026-11-12 版冻结不变 → 重跑逐字节可复现（sha256 不变）。
  - 演出项工作流·音效 P0 新增 13 段（2026-11-14）：防疲劳变体 ×8、clash 的 60-80Hz
    sub 垫底层、hit 碎裂余音层、刃口/钝器两族、弹反专用 counter_clash —— 22.05kHz /
    16bit / mono（decodeAudioData 会自动重采样到 AudioContext 采样率，体积减半）。
"""
import array
import math
import os
import random
import wave

SR = 44100
SR_SMALL = 22050  # 新增变体/分层的采样率（金属高阶泛音 >9.9kHz 的会按奈奎斯特守卫跳过）
SEED = 20261112
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "audio")


def env_exp(t, dur, k=6.0):
    return math.exp(-k * t / dur) if t < dur else 0.0


def write_wav(name, buf, peak=0.88, sr=SR, reverb=True):
    # 轻混响：多抽头反馈延迟，给小房间空间感（离线才做得起）
    if reverb:
        dry = buf[:]
        for delay_s, gain in ((0.011, 0.26), (0.023, 0.17), (0.041, 0.10), (0.067, 0.055)):
            d = int(sr * delay_s)
            for i in range(d, len(buf)):
                buf[i] += dry[i - d] * gain
    # 软限幅，避免叠加后削顶
    buf = [math.tanh(x * 1.15) for x in buf]
    mx = max(abs(x) for x in buf) or 1.0
    scale = peak / mx
    pcm = array.array("h", (int(max(-1.0, min(1.0, x * scale)) * 32767) for x in buf))
    path = os.path.join(OUT_DIR, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    print(f"  {name}: {len(buf)/sr:.2f}s  {os.path.getsize(path)/1024:.1f} KB")


def make_hit(name, dur, base, body_f, vol, seed=None, sr=SR):
    random.seed(SEED if seed is None else seed)
    n = int(sr * dur)
    buf = [0.0] * n
    for i in range(n):
        t = i / sr
        # 1) 低频冲击：频率快速下滑 + 长包络
        low_f = body_f * math.exp(-t * 9) + 42
        phase = 2 * math.pi * (body_f * (1 - math.exp(-t * 9)) / 9 + 42 * t)
        low = math.sin(phase) * env_exp(t, dur * 0.8, 5.0) * 0.75
        # 2) 中频打击：带轻微失谐的双锯齿，快速衰减
        mid_f = base * (1 - 0.55 * min(1, t / (dur * 0.6)))
        mid = (math.sin(2 * math.pi * mid_f * t) * 0.6
               + math.sin(2 * math.pi * mid_f * 1.007 * t) * 0.4) * env_exp(t, dur * 0.5, 7.0) * 0.42
        # 3) 高频瞬态：一阶差分噪声（近似高通）只在开头 60ms
        nz = (random.random() * 2 - 1) if t < 0.075 else 0.0
        trans = nz * math.exp(-t * 55) * 0.35
        buf[i] = (low + mid + trans) * vol
    write_wav(name, buf, sr=sr)


def make_clash(name, dur=0.62, base=1750, seed=None, sr=SR,
               sub_f=0.0, sub_amp=0.0, ring_amp=0.0, scratch_amp=0.28):
    sseed = SEED + 7 if seed is None else seed
    random.seed(sseed)
    n = int(sr * dur)
    buf = [0.0] * n
    # 非谐波泛音列（金属板的特征），每个泛音独立失谐与衰减
    # （失谐种子沿用原版口径 SEED + j；变体显式传 seed 时才跟随 seed + j）
    dseed = SEED if seed is None else seed
    ratios = [1, 1.48, 2.21, 2.94, 3.62, 4.37, 5.19, 6.08]
    detunes = [1 + (random.Random(dseed + j).random() - 0.5) * 0.018 for j in range(len(ratios))]
    nyq = 0.45 * sr  # 奈奎斯特守卫：22.05kHz 渲染时跳过会混叠的高阶泛音（44.1kHz 下永不触发）
    for i in range(n):
        t = i / sr
        s = 0.0
        for j, r in enumerate(ratios):
            f = base * r * detunes[j]
            if f > nyq:
                continue
            f *= (1 - 0.05 * min(1, t / dur))          # 轻微下滑
            decay = env_exp(t, dur * (1 - j * 0.085), 5.5 + j * 0.6)
            s += math.sin(2 * math.pi * f * t) * decay * (0.62 ** j)
        # 震刀 ring：低阶模态拖长尾自行消散（弹反「更高 clang = 回合易主」的余鸣）
        if ring_amp > 0.0:
            s += (math.sin(2 * math.pi * base * t) * env_exp(t, dur, 2.1)
                  + math.sin(2 * math.pi * base * 1.48 * t) * env_exp(t, dur, 2.8) * 0.6) * ring_amp
        # 60-80Hz sub 垫底层：快速下滑正弦（相位积分防爆音），垫在金属高频响之下撑重量
        if sub_amp > 0.0:
            tau = 0.09
            sub_lo, sub_hi = sub_f * 0.86, sub_f * 1.18
            sub_ph = 2 * math.pi * (sub_lo * t + (sub_hi - sub_lo) * tau * (1 - math.exp(-t / tau)))
            s += math.sin(sub_ph) * min(1.0, t / 0.004) * env_exp(t, dur * 0.55, 4.5) * sub_amp
        # 金属刮擦瞬态：带包络的噪声，前 90ms
        scratch = (random.random() * 2 - 1) * math.exp(-t * 42) * scratch_amp if t < 0.09 else 0.0
        buf[i] = (s * 0.55 + scratch) * 0.9
    write_wav(name, buf, sr=sr)


def make_whoosh(name, dur=0.30, seed=None, sr=SR):
    random.seed(SEED + 13 if seed is None else seed)
    n = int(sr * dur)
    buf = [0.0] * n
    # 扫频带通噪声：用一阶低通状态模拟风声中心上移再落下
    lp = 0.0
    for i in range(n):
        t = i / sr
        p = t / dur
        cutoff = 0.06 + 0.28 * math.sin(math.pi * p)   # 钟形扫频
        nz = random.random() * 2 - 1
        lp += cutoff * (nz - lp)
        body = (nz - lp) * 0.9                          # 高通分量
        bell = math.sin(math.pi * p) ** 1.6
        buf[i] = body * bell * 0.7
    write_wav(name, buf, sr=sr)


def make_clash_sub(name, dur=0.34, f_hi=80.0, f_lo=62.0):
    """② clash 的 60-80Hz sub 垫底层：短下滑正弦（80→62Hz），快速衰减、无混响。"""
    n = int(SR_SMALL * dur)
    buf = [0.0] * n
    tau = 0.09
    for i in range(n):
        t = i / SR_SMALL
        phase = 2 * math.pi * (f_lo * t + (f_hi - f_lo) * tau * (1 - math.exp(-t / tau)))
        buf[i] = math.sin(phase) * min(1.0, t / 0.004) * env_exp(t, dur, 5.5) * 0.9
    write_wav(name, buf, peak=0.8, sr=SR_SMALL, reverb=False)


def make_hit_crumble(name, dur=0.30):
    """③ 命中碎裂余音层：高频碎屑噪声（一阶高通）+ 颗粒调幅 + 指数淡出（body 后 200-400ms 尾巴）。"""
    rng = random.Random(SEED + 17)
    n = int(SR_SMALL * dur)
    buf = [0.0] * n
    a = math.exp(-2 * math.pi * 2600 / SR_SMALL)  # 一阶高通系数
    hp = 0.0
    px = 0.0
    ph1 = rng.random() * 2 * math.pi
    ph2 = rng.random() * 2 * math.pi
    for i in range(n):
        t = i / SR_SMALL
        x = rng.random() * 2 - 1
        hp = a * (hp + x - px)  # 一阶差分高通
        px = x
        # 颗粒感：双慢速随机相位调幅，模拟碎屑断续
        grain = 0.55 + 0.30 * math.sin(2 * math.pi * 11.0 * t + ph1) + 0.15 * math.sin(2 * math.pi * 23.0 * t + ph2)
        fade = min(1.0, t / 0.012) * env_exp(t, dur, 4.2)
        buf[i] = hp * grain * fade * 0.85
    write_wav(name, buf, peak=0.5, sr=SR_SMALL)


def make_counter_clash(name):
    """④ 弹反音：clash 提 pitch ×1.3 + ring 长尾（Sekiro：更高更亮的 clang = 回合易主）。"""
    make_clash(name, dur=0.64, base=int(1750 * 1.3), seed=SEED + 71, sr=SR_SMALL,
               sub_f=70, sub_amp=0.42, ring_amp=0.30, scratch_amp=0.24)


def make_clash_blade(name):
    """② 刃口族：亮、短的金属 clang（sub 轻、刮擦亮）。"""
    make_clash(name, dur=0.42, base=2150, seed=SEED + 91, sr=SR_SMALL,
               sub_f=68, sub_amp=0.26, scratch_amp=0.36)


def make_clash_blunt(name):
    """② 钝器族：暗、长的低频 thud（sub 重、刮擦弱）。"""
    make_clash(name, dur=0.50, base=920, seed=SEED + 113, sr=SR_SMALL,
               sub_f=62, sub_amp=0.85, scratch_amp=0.18)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    print("生成自有音效采样 →", OUT_DIR)
    # 既有 4 段（种子与参数保持 2026-11-12 版冻结 → 逐字节可复现）
    make_hit("hit_light.wav", 0.26, 760, 150, 0.85)
    make_hit("hit_heavy.wav", 0.46, 260, 95, 0.95)
    make_clash("clash_metal.wav")
    make_whoosh("whoosh.wav")
    # ① 防疲劳变体 ×8（改种子 + 微调时长/基频；For Honor：每击微随机防听觉疲劳）
    make_whoosh("whoosh_v1.wav", dur=0.20, seed=SEED + 29, sr=SR_SMALL)
    make_whoosh("whoosh_v2.wav", dur=0.25, seed=SEED + 31, sr=SR_SMALL)
    make_hit("hit_light_v1.wav", 0.20, 820, 165, 0.85, seed=SEED + 41, sr=SR_SMALL)
    make_hit("hit_light_v2.wav", 0.24, 690, 135, 0.85, seed=SEED + 43, sr=SR_SMALL)
    make_hit("hit_heavy_v1.wav", 0.32, 290, 105, 0.95, seed=SEED + 47, sr=SR_SMALL)
    make_hit("hit_heavy_v2.wav", 0.38, 230, 85, 0.95, seed=SEED + 53, sr=SR_SMALL)
    make_clash("clash_metal_v1.wav", dur=0.40, seed=SEED + 61, sr=SR_SMALL)
    make_clash("clash_metal_v2.wav", dur=0.48, base=1630, seed=SEED + 67, sr=SR_SMALL)
    # ② clash 的 sub 垫底层 + 刃口/钝器两族（sub 已烘焙进两族采样）
    make_clash_sub("clash_sub.wav")
    make_clash_blade("clash_blade.wav")
    make_clash_blunt("clash_blunt.wav")
    # ③ 命中碎裂余音层
    make_hit_crumble("hit_crumble.wav")
    # ④ 弹反专用（clash ×1.3 + ring 尾）
    make_counter_clash("counter_clash.wav")
    print("完成")
