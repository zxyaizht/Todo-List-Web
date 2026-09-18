/* 生成 5 个音效 WAV 文件
 * 小程序里没有 Web Audio 的现场合成，只能用音频文件。
 * 这里用 Node 把网页版 playSound 的音色合成成 wav，听感与网页版一致。
 * 运行： node miniprogram/tools/gen-sounds.js */
const fs = require('fs')
const path = require('path')

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

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const report = []
Object.keys(SOUNDS).forEach((name) => {
  const samples = render(SOUNDS[name])
  const wav = toWav(samples)
  const file = path.join(OUT_DIR, `${name}.wav`)
  fs.writeFileSync(file, wav)
  report.push(`${name}.wav  ${wav.length} bytes  ${(samples.length / SAMPLE_RATE).toFixed(2)}s`)
})

fs.writeFileSync(process.env.TEMP + '/gen-sounds.txt', report.join('\n') + '\n', 'utf8')
console.log(report.join('\n'))
