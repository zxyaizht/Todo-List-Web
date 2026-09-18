/* utils/sound.js 的行为测试（用假的 wx 在 Node 里把整条播放链路跑一遍）
 *
 * 为什么单独测这一层：用户报过两个只在真机播放时才暴露的 bug ——
 *   1. 音效播放有问题，声音时好时坏
 *   2. 频率设置每个频率的声音都差不多一样
 * 这两个都不是合成算法的锅（synth.test.js 全过），而是播放链路的问题：
 * 缓存文件 + InnerAudioContext。所以这里用一个假的 wx 把「合成 → 落盘 → 播放」
 * 完整跑一遍，把两个 bug 都钉成回归测试。
 *
 * 运行： node miniprogram/test/sound.test.js */

const fs = require('fs')
const synth = require('../utils/synth')

const OUT = (process.env.TEMP || '.') + '/miniprogram-sound-report.txt'
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
const checkTrue = (label, cond) => check(label, !!cond, true)

/* ── 假的 wx：内存文件系统 + 假的音频实例 ── */

const files = {}
let writeCount = 0
let unlinkCount = 0
const contexts = []
let failNextPlay = false
const storage = {}

function makeCtx() {
  const ctx = {
    src: '',
    volume: 1,
    played: 0,
    stopped: 0,
    destroyed: false,
    throwOnPlay: false,
    _ended: null,
    _error: null,
    onEnded(fn) { ctx._ended = fn },
    onError(fn) { ctx._error = fn },
    play() {
      if (ctx.throwOnPlay) throw new Error('play failed')
      ctx.played++
    },
    stop() { ctx.stopped++ },
    destroy() { ctx.destroyed = true },
    fireEnded() { if (ctx._ended) ctx._ended() },
    fireError() { if (ctx._error) ctx._error({ errMsg: 'mock error' }) },
  }
  if (failNextPlay) {
    failNextPlay = false
    ctx.throwOnPlay = true
  }
  contexts.push(ctx)
  return ctx
}

global.wx = {
  env: { USER_DATA_PATH: '/mem' },
  getStorageSync: (k) => storage[k],
  setStorageSync: (k, v) => { storage[k] = v },
  getFileSystemManager: () => ({
    writeFileSync: (p, buf) => {
      if (files[p]) throw new Error('mock: 文件已被占用')
      files[p] = buf
      writeCount++
    },
    accessSync: (p) => {
      if (!files[p]) throw new Error('ENOENT: ' + p)
    },
    unlinkSync: (p) => {
      if (!files[p]) throw new Error('ENOENT: ' + p)
      delete files[p]
      unlinkCount++
    },
    readdirSync: (dir) => Object.keys(files)
      .filter((p) => p.indexOf(dir + '/') === 0)
      .map((p) => p.slice(dir.length + 1)),
  }),
  createInnerAudioContext: () => makeCtx(),
}

// 必须在 global.wx 就位之后再 require
const sound = require('../utils/sound')
const core = require('../utils/core')

const last = () => contexts[contexts.length - 1]
const countFiles = (pat) => Object.keys(files).filter((p) => pat.test(p)).length

// 解码写进「磁盘」的 wav，用过零次数估算主频率
function estimateFreq(buf, fromSec, toSec) {
  const v = new DataView(buf)
  const total = (buf.byteLength - 44) / 2
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

// 单频点 DFT 幅度（检查某个频率上到底有没有能量）
function magAt(buf, freq, fromSec, toSec) {
  const v = new DataView(buf)
  const total = (buf.byteLength - 44) / 2
  const start = Math.max(0, Math.floor(fromSec * synth.SAMPLE_RATE))
  const end = Math.min(total, Math.floor(toSec * synth.SAMPLE_RATE))
  let re = 0
  let im = 0
  for (let i = start; i < end; i++) {
    const s = v.getInt16(44 + i * 2, true) / 32767
    const t = (i - start) / synth.SAMPLE_RATE
    re += s * Math.cos(2 * Math.PI * freq * t)
    im += s * Math.sin(2 * Math.PI * freq * t)
  }
  return Math.sqrt(re * re + im * im) / Math.max(1, end - start)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  lines.push('=== 小程序 sound.js 行为测试（假 wx） ===')

  /* ── 1. 缓存文件名必须带音高（bug 2 的直接原因） ── */
  lines.push('--- 缓存文件按音高命名（原来固定文件名 → 播放器按路径缓存旧音频） ---')
  sound.preview(51) // C5
  const c5ctx = last()
  sound.preview(63) // C6
  const c6ctx = last()
  checkTrue('两次播放用的是两个实例', c5ctx !== c6ctx)
  checkTrue('C5 的缓存文件名含音高 51', /sfx-51-piano\.wav$/.test(c5ctx.src))
  checkTrue('C6 的缓存文件名含音高 63', /sfx-63-piano\.wav$/.test(c6ctx.src))
  checkTrue('两个音高写到两个不同文件（路径即内容）', c5ctx.src !== c6ctx.src)
  check('每个实例都调了 play()', [c5ctx.played, c6ctx.played], [1, 1])

  // 文件内容确实换成了新音高，而不是旧的
  const mC5 = magAt(files[c5ctx.src], 523.25, 0.02, 0.2)
  const mC5half = magAt(files[c5ctx.src], 261.63, 0.02, 0.2)
  const mC6 = magAt(files[c6ctx.src], 1046.5, 0.02, 0.2)
  const mC6des = magAt(files[c6ctx.src], 523.25, 0.02, 0.2)
  checkTrue('C5 文件里是 523Hz（不是别的音）', mC5 > mC5half * 5)
  checkTrue('C6 文件里是 1046Hz（不是 C5 的旧内容）', mC6 > mC6des * 5)

  /* ── 2. 事件音效也跟着音高走（钉住"5 个音效随频率变调"） ── */
  lines.push('--- 事件音效按当前音高合成 ---')
  // 事件音效的音高来自「设置里存下的 pianoKey」（设置页改滑杆时会存进去）
  storage['todo-sound-settings'] = { volume: 1, pianoKey: 63 }
  sound.play('add')
  const addC6 = last()
  checkTrue('事件音效文件名也带音高', /sfx-63-add\.wav$/.test(addC6.src))
  // add 的第一个音基准是 523.25Hz(=C5)，移到 C6 就是 1046.5Hz
  const addFreq = estimateFreq(files[addC6.src], 0.02, 0.06)
  checkTrue(`add 音效已移到 C6（实测 ${addFreq.toFixed(0)}Hz）`, Math.abs(addFreq - 1046.5) < 60)
  // 把设置改回 C5，同一个音效应该落成另一个文件、音高减半
  storage['todo-sound-settings'] = { volume: 1, pianoKey: 51 }
  sound.play('add')
  const addC5 = last()
  checkTrue('设置改回 C5 后从新文件播放', addC5.src !== addC6.src)
  const addFreq5 = estimateFreq(files[addC5.src], 0.02, 0.06)
  checkTrue(`add 音效跟着回到 C5（实测 ${addFreq5.toFixed(0)}Hz）`, Math.abs(addFreq5 - 523.25) < 40)
  sound.play('add') // 同一音高再来一次
  checkTrue('同一音高复用同一个缓存文件', last().src === addC5.src)

  /* ── 3. 播完即释放；出错自动补救一次（bug 1） ── */
  lines.push('--- 播放实例：每次新建、播完销毁、出错补救 ---')
  const n0 = contexts.length
  sound.preview(52)
  const c52 = last()
  checkTrue('每次播放都新建实例（不复用做 stop→play）', contexts.length === n0 + 1)
  check('音量透传给了实例', c52.volume, 1)
  const liveBefore = sound.stats().live
  c52.fireEnded()
  checkTrue('播完就销毁实例', c52.destroyed)
  check('实例从存活列表里移除', sound.stats().live, liveBefore - 1)

  const n1 = contexts.length
  const w1 = writeCount
  sound.preview(53)
  last().fireError()
  checkTrue('播放报错会自动重播一次', contexts.length === n1 + 2)
  checkTrue('重播前会重新合成（丢掉坏缓存）', writeCount > w1)
  last().fireError()
  checkTrue('补救只做一次，不会无限循环', contexts.length, n1 + 2)

  const n2 = contexts.length
  const w2 = writeCount
  failNextPlay = true // 让下一次 play() 直接抛错
  sound.preview(54)
  checkTrue('play() 直接抛错时同样会补救', contexts.length === n2 + 2)
  checkTrue('补救时重新合成文件', writeCount > w2)

  /* ── 4. 缓存命中：同一音高不重复写盘 ── */
  lines.push('--- 合成缓存 ---')
  const w3 = writeCount
  sound.preview(54)
  sound.preview(54)
  check('同一音高重复播放不重复写盘', writeCount, w3)
  const w4 = writeCount
  sound.preview(55)
  checkTrue('换音高必须重新合成', writeCount > w4)

  // 缓存文件被系统清掉 → 必须重新合成，而不是静默没声音
  delete files['/mem/sfx-55-piano.wav']
  const w5 = writeCount
  sound.preview(55)
  checkTrue('缓存文件被清掉后会自动重合成', writeCount > w5)

  /* ── 5. 音量 / 开关 ── */
  lines.push('--- 音量与开关 ---')
  storage['todo-sound-settings'] = { volume: 0.35, pianoKey: 51 }
  sound.preview(51)
  check('试听时应用设置的音量', last().volume, 0.35)
  storage['todo-sound-settings'] = { volume: 1, pianoKey: 51, add: false }
  const n3 = contexts.length
  sound.play('add')
  check('关掉的音效不播放', contexts.length, n3)
  sound.preview(51)
  checkTrue('试听不受 5 个开关限制', contexts.length === n3 + 1)

  /* ── 6. 换音高后延迟清理旧文件（不删正在播的） ── */
  lines.push('--- 旧音高文件延迟清理 ---')
  sound.preview(56) // 最后一次换音高，开始计时
  checkTrue('此刻旧文件还在（不立刻删，避免掐断正在播的音）', countFiles(/sfx-51-/) > 0)
  await sleep(sound.CLEAN_DELAY + 300)
  checkTrue('旧音高的文件已清理', countFiles(/sfx-5[0-5]-/) === 0)
  checkTrue('当前音高的文件保留', countFiles(/sfx-56-/) > 0)
  check('清理确实走了 unlinkSync', unlinkCount > 0, true)

  /* ── 7. 并发实例数有上限（不超平台限制） ── */
  lines.push('--- 实例数量上限 ---')
  for (let i = 0; i < 20; i++) sound.preview(60 + i)
  check('并发实例数不超过上限', sound.stats().live, sound.MAX_LIVE)
  checkTrue('上限是个合理的小数值', sound.MAX_LIVE >= 2 && sound.MAX_LIVE <= 10)

  /* ── 8. release（App.onHide） ── */
  lines.push('--- release ---')
  const preserved = last().src
  sound.release()
  check('release 释放全部实例', sound.stats().live, 0)
  check('release 重置当前音高', sound.stats().currentKey, null)
  checkTrue('release 不删缓存文件（下次进来直接复用）', !!files[preserved])

  lines.push('')
  lines.push(`通过 ${pass} 项，失败 ${fail} 项`)
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  lines.push('EXCEPTION | ' + (e && e.stack ? e.stack : e))
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
  process.exit(1)
})
