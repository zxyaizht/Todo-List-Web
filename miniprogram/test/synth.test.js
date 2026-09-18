/* utils/synth.js 的单元测试
 * 重点验证三件事：
 *   1. 输出的是合法 WAV（头、字节数、采样率都对）
 *   2. 音高准确（用「过零次数」估算主频率）
 *   3. **事件音效会随「频率设置」移调**（用户要求的第 1 条）
 * 运行： node miniprogram/test/synth.test.js */
const fs = require('fs')
const synth = require('../utils/synth')

const OUT = (process.env.TEMP || '.') + '/miniprogram-synth-report.txt'
const lines = []
let pass = 0
let fail = 0
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  ok ? pass++ : fail++
  lines.push(`${ok ? 'PASS' : 'FAIL'} | ${label} -> ${a}${ok ? '' : `  (期望 ${e})`}`)
}
// 浮点比较：允许相对误差
const checkNear = (label, actual, expected, tolRatio) => {
  const tol = Math.abs(expected) * (tolRatio || 0.03)
  const ok = Math.abs(actual - expected) <= tol
  ok ? pass++ : fail++
  lines.push(
    `${ok ? 'PASS' : 'FAIL'} | ${label} -> ${actual.toFixed(1)}（期望 ${expected}±${tol.toFixed(1)}）`
  )
}

const tagOf = (buf, offset, len) => {
  const v = new DataView(buf)
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode(v.getUint8(offset + i))
  return s
}
const sampleCount = (buf) => (buf.byteLength - 44) / 2

// 用「过零次数」估算一段时间内的主频率
function estimateFreq(buf, fromSec, toSec) {
  const v = new DataView(buf)
  const total = sampleCount(buf)
  const start = Math.max(0, Math.floor(fromSec * synth.SAMPLE_RATE))
  const end = Math.min(total, Math.floor(toSec * synth.SAMPLE_RATE))
  let cross = 0
  let prev = v.getInt16(44 + start * 2, true)
  for (let i = start + 1; i < end; i++) {
    const cur = v.getInt16(44 + i * 2, true)
    if ((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0)) cross++
    prev = cur
  }
  return cross / 2 / ((end - start) / synth.SAMPLE_RATE)
}

lines.push('=== 小程序 synth.js 单元测试 ===')

lines.push('--- WAV 结构 ---')
const wav = synth.soundWav('add', synth.REF_FREQ)
check('返回 ArrayBuffer', wav instanceof ArrayBuffer, true)
check('RIFF 标识', tagOf(wav, 0, 4), 'RIFF')
check('WAVE 标识', tagOf(wav, 8, 4), 'WAVE')
check('fmt 标识', tagOf(wav, 12, 4), 'fmt ')
check('data 标识', tagOf(wav, 36, 4), 'data')
check('PCM 格式码', new DataView(wav).getUint16(20, true), 1)
check('单声道', new DataView(wav).getUint16(22, true), 1)
check('采样率', new DataView(wav).getUint32(24, true), synth.SAMPLE_RATE)
check('位深 16bit', new DataView(wav).getUint16(34, true), 16)
check('字节数 = 44 + 采样数×2', wav.byteLength, 44 + sampleCount(wav) * 2)
check('data 段的长度字段一致', new DataView(wav).getUint32(40, true), sampleCount(wav) * 2)
check('有实际音频数据', sampleCount(wav) > 1000, true)

lines.push('--- 音高准确性 ---')
// priority 是 800Hz 方波，波形简单，过零估算应该很准
checkNear('priority 在基准音高下 ≈ 800Hz', estimateFreq(synth.soundWav('priority', synth.REF_FREQ), 0.02, 0.06), 800, 0.03)
// add 的第一个音是 523.25Hz 正弦（第二个音从 0.08s 开始，取样时避开）
checkNear('add 首个音 ≈ 523Hz', estimateFreq(synth.soundWav('add', synth.REF_FREQ), 0.02, 0.06), 523.25, 0.03)
// delete 第一个音 392Hz（三角波）
checkNear('delete 首个音 ≈ 392Hz', estimateFreq(synth.soundWav('delete', synth.REF_FREQ), 0.02, 0.05), 392, 0.05)

lines.push('--- 事件音效随频率设置移调（关键需求） ---')
const p1 = estimateFreq(synth.soundWav('priority', 800), 0.02, 0.06)
const p2 = estimateFreq(synth.soundWav('priority', 1600), 0.02, 0.06)
const ph = estimateFreq(synth.soundWav('priority', 400), 0.02, 0.06)
checkNear('目标音高翻倍 → 实际也翻倍', p2, p1 * 2, 0.03)
checkNear('目标音高减半 → 实际也减半', ph, p1 / 2, 0.03)
// 直接用琴键序号：C5（51）与 C6（63）应差一个八度
const core = require('../utils/core')
const c5 = estimateFreq(synth.soundWav('add', core.keyToFreq(51)), 0.02, 0.06)
const c6 = estimateFreq(synth.soundWav('add', core.keyToFreq(63)), 0.02, 0.06)
checkNear('按琴键移调：C6 是 C5 的两倍', c6, c5 * 2, 0.05)
// 全音域两端都能合成出有声音的数据
const lowBuf = synth.soundWav('add', core.keyToFreq(0)) // A0 27.5Hz
const highBuf = synth.soundWav('add', core.keyToFreq(87)) // C8 4186Hz
check('最低音 A0 也能合成', sampleCount(lowBuf) > 1000, true)
check('最高音 C8 也能合成', sampleCount(highBuf) > 1000, true)
checkNear('最高音 C8 的音高正确', estimateFreq(highBuf, 0.02, 0.06), 4186, 0.05)

lines.push('--- 钢琴音 ---')
const pianoA = synth.pianoWav(261.63)
const pianoB = synth.pianoWav(523.25)
check('钢琴音也是合法 WAV', tagOf(pianoA, 0, 4), 'RIFF')
check('钢琴音比事件音效长', sampleCount(pianoA) > sampleCount(synth.soundWav('priority', 800)), true)
// 钢琴音含多个谐波，过零率会高于基频，所以只比较「翻倍关系」
const ca = estimateFreq(pianoA, 0.02, 0.1)
const cb = estimateFreq(pianoB, 0.02, 0.1)
checkNear('钢琴音高翻倍 → 过零率也翻倍', cb, ca * 2, 0.05)

lines.push('--- 响度（用户反馈"调到 100% 还是很小声"，已归一化拉满） ---')
function peakOf(buf) {
  const v = new DataView(buf)
  let max = 0
  for (let i = 0; i < sampleCount(buf); i++) {
    const s = Math.abs(v.getInt16(44 + i * 2, true))
    if (s > max) max = s
  }
  return max / 32767
}
checkNear('priority 峰值接近满刻度', peakOf(synth.soundWav('priority', synth.REF_FREQ)), 0.92, 0.03)
checkNear('钢琴音峰值接近满刻度', peakOf(synth.pianoWav(523.25)), 0.9, 0.03)
check(
  '5 个事件音效都够响（峰值 ≥ 0.85）',
  ['add', 'priority', 'delete', 'clearDone', 'clearAll'].every((k) => peakOf(synth.soundWav(k, synth.REF_FREQ)) >= 0.85),
  true
)
check('最低音 A0 也拉满', peakOf(synth.soundWav('add', core.keyToFreq(0))) >= 0.85, true)
check('最高音 C8 也拉满', peakOf(synth.soundWav('add', core.keyToFreq(87))) >= 0.85, true)
check('不削波（峰值不超过满刻度）', peakOf(synth.soundWav('clearAll', synth.REF_FREQ)) <= 1, true)

lines.push('--- 边界 ---')
check('未知音效返回 null', synth.soundWav('nope', 523), null)
check('5 个事件音效都有定义', Object.keys(synth.SOUND_SPECS).length, 5)
check('每个音效都有音', Object.keys(synth.SOUND_SPECS).every((k) => synth.SOUND_SPECS[k].length > 0), true)
check('priority 已调响（原来 0.08 太轻听不见）', synth.SOUND_SPECS.priority[0].vol >= 0.15, true)
check('priority 时长已加长', synth.SOUND_SPECS.priority[0].dur >= 0.08, true)

lines.push('')
lines.push(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
