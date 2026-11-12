"""
生成「自有」离线渲染音效采样（可复现，授权零风险）。

为什么离线：Web Audio 实时合成只能挂几个 Oscillator；离线可以叠几十个
非谐波泛音、多段包络、反馈延迟混响与软限幅，金属/打击质感明显更厚。
这些 WAV 是本项目自己生成的原创素材，不是第三方录音，符合
docs/ASSET-LICENSES.md 的「自有 或 明确 CC0」红线。

用法：python scripts/gen-audio-samples.py
输出：public/audio/*.wav （44.1kHz / 16bit / mono）
"""
import array
import math
import os
import random
import wave

SR = 44100
SEED = 20261112
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "audio")


def env_exp(t, dur, k=6.0):
    return math.exp(-k * t / dur) if t < dur else 0.0


def write_wav(name, buf, peak=0.88):
    # 轻混响：多抽头反馈延迟，给小房间空间感（离线才做得起）
    dry = buf[:]
    for delay_s, gain in ((0.011, 0.26), (0.023, 0.17), (0.041, 0.10), (0.067, 0.055)):
        d = int(SR * delay_s)
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
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"  {name}: {len(buf)/SR:.2f}s  {os.path.getsize(path)/1024:.1f} KB")


def make_hit(name, dur, base, body_f, vol):
    random.seed(SEED)
    n = int(SR * dur)
    buf = [0.0] * n
    for i in range(n):
        t = i / SR
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
    write_wav(name, buf)


def make_clash(name, dur=0.62, base=1750):
    random.seed(SEED + 7)
    n = int(SR * dur)
    buf = [0.0] * n
    # 非谐波泛音列（金属板的特征），每个泛音独立失谐与衰减
    ratios = [1, 1.48, 2.21, 2.94, 3.62, 4.37, 5.19, 6.08]
    detunes = [1 + (random.Random(SEED + j).random() - 0.5) * 0.018 for j in range(len(ratios))]
    for i in range(n):
        t = i / SR
        s = 0.0
        for j, r in enumerate(ratios):
            f = base * r * detunes[j]
            f *= (1 - 0.05 * min(1, t / dur))          # 轻微下滑
            decay = env_exp(t, dur * (1 - j * 0.085), 5.5 + j * 0.6)
            s += math.sin(2 * math.pi * f * t) * decay * (0.62 ** j)
        # 金属刮擦瞬态：带包络的噪声，前 90ms
        scratch = (random.random() * 2 - 1) * math.exp(-t * 42) * 0.28 if t < 0.09 else 0.0
        buf[i] = (s * 0.55 + scratch) * 0.9
    write_wav(name, buf)


def make_whoosh(name, dur=0.30):
    random.seed(SEED + 13)
    n = int(SR * dur)
    buf = [0.0] * n
    # 扫频带通噪声：用一阶低通状态模拟风声中心上移再落下
    lp = 0.0
    for i in range(n):
        t = i / SR
        p = t / dur
        cutoff = 0.06 + 0.28 * math.sin(math.pi * p)   # 钟形扫频
        nz = random.random() * 2 - 1
        lp += cutoff * (nz - lp)
        body = (nz - lp) * 0.9                          # 高通分量
        bell = math.sin(math.pi * p) ** 1.6
        buf[i] = body * bell * 0.7
    write_wav(name, buf)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    print("生成自有音效采样 →", OUT_DIR)
    make_hit("hit_light.wav", 0.26, 760, 150, 0.85)
    make_hit("hit_heavy.wav", 0.46, 260, 95, 0.95)
    make_clash("clash_metal.wav")
    make_whoosh("whoosh.wav")
    print("完成")
