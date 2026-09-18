/* 运行时音频合成
 * 为什么不用预渲染的 wav：频率滑杆要覆盖钢琴 88 键全音域（A0~C8，7.25 个八度），
 * 而 InnerAudioContext 的 playbackRate 被限制在 0.5~2 倍（一个八度），
 * 预渲染方案得为每个音效准备 8 个八度版本、几十个文件才能精确移调。
 * 改成运行时合成：音高想多准就多准，而且一条音频资源都不用打包。
 *
 * 本文件是**纯 JS**（不碰任何小程序 API），所以能直接在 Node 里单测。
 * 音色定义与网页版 main.js 的 playSound 一致。 */

const SAMPLE_RATE = 22050

// 音效的基准音高：「添加任务」的第一个音。频率设置就是按它整体移调的。
const REF_FREQ = 523.25

/* 归一化目标峰值。各音色的包络峰值原来只有 0.1~0.18，
 * 用户反馈"音量调到 100% 还是很轻"——归一化能在不削波的前提下把响度拉满。 */
const SOUND_PEAK = 0.92
const PIANO_PEAK = 0.9

/* 5 个事件音效。type 是波形，delay 是相对开始的延迟（秒）。
 * 注：priority 原来只有 0.06s / 音量 0.08，实测几乎听不见，
 * 这里提到 0.09s / 0.18（用户反馈"设置优先级时没有音效"）。 */
const SOUND_SPECS = {
  add: [
    { freq: 523.25, dur: 0.12, type: 'sine', vol: 0.15, delay: 0 },
    { freq: 659.25, dur: 0.15, type: 'sine', vol: 0.15, delay: 0.08 },
  ],
  priority: [
    { freq: 800, dur: 0.09, type: 'square', vol: 0.18, delay: 0 },
  ],
  delete: [
    { freq: 392, dur: 0.1, type: 'triangle', vol: 0.12, delay: 0 },
    { freq: 261.63, dur: 0.15, type: 'triangle', vol: 0.12, delay: 0.06 },
  ],
  clearDone: [
    { freq: 600, dur: 0.08, type: 'sine', vol: 0.12, delay: 0 },
    { freq: 900, dur: 0.1, type: 'sine', vol: 0.1, delay: 0.05 },
  ],
  clearAll: [
    { freq: 400, dur: 0.1, type: 'sawtooth', vol: 0.1, delay: 0 },
    { freq: 300, dur: 0.1, type: 'sawtooth', vol: 0.1, delay: 0.08 },
    { freq: 150, dur: 0.2, type: 'sawtooth', vol: 0.1, delay: 0.16 },
  ],
}

function wave(type, phase) {
  switch (type) {
    case 'square':
      return Math.sin(phase) >= 0 ? 1 : -1
    case 'triangle': {
      const t = (phase / (2 * Math.PI)) % 1
      return 4 * Math.abs(t - 0.5) - 1
    }
    case 'sawtooth': {
      const t = (phase / (2 * Math.PI)) % 1
      return 2 * t - 1
    }
    case 'sine':
    default:
      return Math.sin(phase)
  }
}

/* 把一串音渲染成浮点采样。scale 用来整体移调（目标频率 / 基准频率）。 */
function renderTones(tones, scale) {
  const s = isFinite(scale) && scale > 0 ? scale : 1
  const total = Math.max.apply(null, tones.map((t) => t.delay + t.dur)) + 0.03
  const length = Math.ceil(total * SAMPLE_RATE)
  const out = new Float32Array(length)
  tones.forEach((tone) => {
    const f = tone.freq * s
    const start = Math.floor(tone.delay * SAMPLE_RATE)
    const samples = Math.ceil(tone.dur * SAMPLE_RATE)
    for (let i = 0; i < samples; i++) {
      const idx = start + i
      if (idx >= length) break
      const t = i / SAMPLE_RATE
      // 包络：0.01s 线性升到峰值，之后指数衰减到 0.001（与网页版一致）
      let gain
      if (t < 0.01) gain = (t / 0.01) * tone.vol
      else gain = tone.vol * Math.pow(0.001 / tone.vol, (t - 0.01) / tone.dur)
      out[idx] += wave(tone.type, 2 * Math.PI * f * t) * gain
    }
  })
  return out
}

/* 钢琴音色：7 个谐波叠加 + 极快起音 + 指数衰减 + 尾部淡出，
 * 听感接近琴音（不是纯正弦）。0.65s 也把体积控制住了。 */
function renderPiano(f0) {
  const dur = 0.65
  const fade = 0.04
  const length = Math.ceil(dur * SAMPLE_RATE)
  const out = new Float32Array(length)
  const partials = [
    { mult: 1, amp: 1.0 },
    { mult: 2, amp: 0.42 },
    { mult: 3, amp: 0.22 },
    { mult: 4, amp: 0.12 },
    { mult: 5, amp: 0.07 },
    { mult: 6, amp: 0.05 },
    { mult: 8, amp: 0.03 },
  ]
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE
    const attack = t < 0.006 ? t / 0.006 : 1
    const tail = t > dur - fade ? (dur - t) / fade : 1
    const env = attack * Math.exp(-t / 0.32) * Math.max(0, tail)
    let s = 0
    for (let p = 0; p < partials.length; p++) {
      s += partials[p].amp * Math.sin(2 * Math.PI * f0 * partials[p].mult * t)
    }
    out[i] = s * env * 0.22
  }
  return out
}

/* 把采样归一到目标峰值：不削波的前提下尽量响，同时保持原有包络形状。 */
function normalize(samples, peak) {
  let max = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] < 0 ? -samples[i] : samples[i]
    if (v > max) max = v
  }
  if (max <= 0) return samples
  const k = peak / max
  for (let i = 0; i < samples.length; i++) samples[i] *= k
  return samples
}

// 16bit 单声道 PCM 的 WAV 头 + 数据
function toWavBuffer(samples) {
  const dataLength = samples.length * 2
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // 单声道
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataLength, true)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, Math.round(v * 32767), true)
  }
  return buffer
}

// 某个事件音效在目标频率下的 WAV
function soundWav(name, freq) {
  const tones = SOUND_SPECS[name]
  if (!tones) return null
  const scale = freq / REF_FREQ
  return toWavBuffer(normalize(renderTones(tones, scale), SOUND_PEAK))
}

// 某个频率下的钢琴音 WAV
function pianoWav(freq) {
  return toWavBuffer(normalize(renderPiano(freq), PIANO_PEAK))
}

module.exports = {
  SAMPLE_RATE,
  REF_FREQ,
  SOUND_PEAK,
  PIANO_PEAK,
  SOUND_SPECS,
  normalize,
  renderTones,
  renderPiano,
  toWavBuffer,
  soundWav,
  pianoWav,
}
