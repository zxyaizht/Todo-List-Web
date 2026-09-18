/* 生成 5 个音效 WAV 文件
 * 小程序里没有 Web Audio 的现场合成，只能用音频文件。
 * 这里用 Node 把网页版 playSound 的音色合成成 wav，听感与网页版一致。
 * 运行： node miniprogram/tools/gen-sounds.js */
const fs = require('fs')
const path = require('path')

// 试听用的钢琴音：C3 / C4 / C5 三个基准，靠播放倍率就能覆盖 C3~C6 全音域
// （平台倍率限制在 0.5~2，相邻基准正好隔一个八度，所以选最近的基准后倍率总在 0.7~2 之间）
const C3 = 130.8128
const PIANO_BASES = [
  { name: 'tone-c3', freq: C3 },
  { name: 'tone-c4', freq: C3 * 2 },
  { name: 'tone-c5', freq: C3 * 4 },
]

const SAMPLE_RATE = 22050
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds')

// 与网站 main.js 的 playSound 一一对应：type 是波形
const SOUNDS = {
  add: [
    { freq: 523.25, duration: 0.12, type: 'sine', volume: 0.15, delay: 0 },
    { freq: 659.25, duration: 0.15, type: 'sine', volume: 0.15, delay: 0.08 },
  ],
  priority: [
    { freq: 800, duration: 0.06, type: 'square', volume: 0.08, delay: 0 },
  ],
  delete: [
    { freq: 392, duration: 0.1, type: 'triangle', volume: 0.12, delay: 0 },
    { freq: 261.63, duration: 0.15, type: 'triangle', volume: 0.12, delay: 0.06 },
  ],
  'clear-done': [
    { freq: 600, duration: 0.08, type: 'sine', volume: 0.12, delay: 0 },
    { freq: 900, duration: 0.1, type: 'sine', volume: 0.1, delay: 0.05 },
  ],
  'clear-all': [
    { freq: 400, duration: 0.1, type: 'sawtooth', volume: 0.1, delay: 0 },
    { freq: 300, duration: 0.1, type: 'sawtooth', volume: 0.1, delay: 0.08 },
    { freq: 150, duration: 0.2, type: 'sawtooth', volume: 0.1, delay: 0.16 },
  ],
}

function wave(type, phase) {
  switch (type) {
    case 'square': return Math.sin(phase) >= 0 ? 1 : -1
    case 'triangle': {
      const t = (phase / (2 * Math.PI)) % 1
      return 4 * Math.abs(t - 0.5) - 1
    }
    case 'sawtooth': {
      const t = (phase / (2 * Math.PI)) % 1
      return 2 * t - 1
    }
    case 'sine':
    default: return Math.sin(phase)
  }
}

function render(tones) {
  const total = Math.max.apply(null, tones.map((t) => t.delay + t.duration)) + 0.05
  const length = Math.ceil(total * SAMPLE_RATE)
  const out = new Float32Array(length)
  tones.forEach((tone) => {
    const start = Math.floor(tone.delay * SAMPLE_RATE)
    const samples = Math.ceil(tone.duration * SAMPLE_RATE)
    for (let i = 0; i < samples; i++) {
      const idx = start + i
      if (idx >= length) break
      const t = i / SAMPLE_RATE
      // 包络：0.01s 线性升到峰值，之后指数衰减到 0.001（与网页版一致）
      let gain
      if (t < 0.01) gain = (t / 0.01) * tone.volume
      else gain = tone.volume * Math.pow(0.001 / tone.volume, (t - 0.01) / tone.duration)
      out[idx] += wave(tone.type, 2 * Math.PI * tone.freq * t) * gain
    }
  })
  return out
}

function toWav(samples) {
  const dataLength = samples.length * 2
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // 单声道
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataLength, 40)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buffer
}

// 钢琴音色：几个谐波叠加 + 极快起音 + 指数衰减，听感接近钢琴（不是纯正弦）
// 时长压到 0.65s 并在尾部淡出——既能听出琴音，又不会让音频资源超过 200K 的推荐上限
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

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const report = []
Object.keys(SOUNDS).forEach((name) => {
  const samples = render(SOUNDS[name])
  const wav = toWav(samples)
  const file = path.join(OUT_DIR, `${name}.wav`)
  fs.writeFileSync(file, wav)
  report.push(`${name}.wav  ${wav.length} bytes  ${(samples.length / SAMPLE_RATE).toFixed(2)}s`)
})

// 试听用的钢琴音基准
PIANO_BASES.forEach((p) => {
  const samples = renderPiano(p.freq)
  const wav = toWav(samples)
  const file = path.join(OUT_DIR, `${p.name}.wav`)
  fs.writeFileSync(file, wav)
  report.push(`${p.name}.wav  ${wav.length} bytes  ${p.freq.toFixed(2)}Hz  ${(samples.length / SAMPLE_RATE).toFixed(2)}s`)
})

fs.writeFileSync(process.env.TEMP + '/gen-sounds.txt', report.join('\n') + '\n', 'utf8')
console.log(report.join('\n'))
