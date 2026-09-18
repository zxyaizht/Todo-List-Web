/* 音效播放
 * 音源不是打包好的 wav，而是运行时用 synth.js 现场合成 → 写进本地缓存文件 →
 * 交给 InnerAudioContext 播放。这样频率设置可以覆盖钢琴全音域（A0~C8），
 * 每个琴键都能精确合成，而且一条音频资源都不用打包。
 *
 * ⚠️ 两个踩过的坑（对应「声音时好时坏」「每个频率的声音都差不多一样」）：
 *
 * 1) 缓存文件名必须**把音高写进去**。原来固定叫 sfx-piano.wav：换音高后文件内容
 *    确实重写了、播放实例也重建了，但播放器是**按路径缓存音频**的，换到哪个音高
 *    放的都还是最早那一段 → 听感上"每个频率都差不多一样"。
 *    现在文件名是 sfx-<琴键序号>-<音效名>.wav，路径与内容一一对应。
 *
 * 2) 每次播放都**新建**一个 InnerAudioContext，播完即销毁。复用同一个实例做
 *    stop() → play() 在部分安卓机上会静默失效（就是"时好时坏"）。
 *
 * 另外，换音高时**不再**立刻删文件 / 销毁实例：那会把正在响的音掐断，部分机型上
 * 还在播的文件也写不进去（又一次"时好时坏"）。改成延迟清理旧音高的文件。 */
const core = require('./core')
const synth = require('./synth')
const store = require('./storage')

// 同时存活（正在播 / 待播完）的实例上限 —— 小程序对 InnerAudioContext 数量有限制
const MAX_LIVE = 6
// 换音高后延迟清理旧文件：等正在响的那一两个音自然播完再删
const CLEAN_DELAY = 1600

const live = []
const written = {}
let currentKey = null
let cleanTimer = null

function dir() {
  return wx.env.USER_DATA_PATH
}

// 文件名带音高 → 「路径」就是内容的唯一标识（见文件头注释 1）
function fileOf(name, key) {
  return `${dir()}/sfx-${key}-${name}.wav`
}

function keyOf(settings) {
  const k = settings ? settings.pianoKey : null
  return k == null ? core.PIANO_DEFAULT_KEY : core.clampKey(k)
}

function volumeOf(settings) {
  const v = settings && typeof settings.volume === 'number' ? settings.volume : 1
  return Math.min(1, Math.max(0, v))
}

function fileExists(p) {
  try {
    wx.getFileSystemManager().accessSync(p)
    return true
  } catch (e) {
    return false
  }
}

function dispose(ctx) {
  try { ctx.stop() } catch (e) {}
  try { ctx.destroy() } catch (e) {}
}

function forget(ctx) {
  const i = live.indexOf(ctx)
  if (i !== -1) live.splice(i, 1)
  dispose(ctx)
}

function track(ctx) {
  live.push(ctx)
  while (live.length > MAX_LIVE) dispose(live.shift())
}

// 音高变了：不做任何破坏性操作，只安排一次延迟清理
function ensureKey(key) {
  if (currentKey === key) return
  currentKey = key
  if (cleanTimer) clearTimeout(cleanTimer)
  cleanTimer = setTimeout(() => {
    cleanTimer = null
    cleanStale(key)
  }, CLEAN_DELAY)
}

// 清掉不是当前音高的合成文件（文件名形如 sfx-<琴键序号>-<音效名>.wav）
function cleanStale(keepKey) {
  try {
    const fsm = wx.getFileSystemManager()
    const base = dir()
    fsm.readdirSync(base).forEach((f) => {
      const m = /^sfx-(\d+)-[a-zA-Z]+\.wav$/.exec(f)
      if (!m || Number(m[1]) === keepKey) return
      const full = `${base}/${f}`
      try {
        fsm.unlinkSync(full)
      } catch (e) {}
      delete written[full]
    })
  } catch (e) {}
}

// 确保某个音效已按指定音高合成好，返回文件路径
function ensureFile(name, key) {
  const path = fileOf(name, key)
  // 缓存标记 + 文件真的还在（系统可能清理过缓存目录，这时必须重合成）
  if (written[path] && fileExists(path)) return path
  let buffer = null
  try {
    buffer = name === 'piano'
      ? synth.pianoWav(core.keyToFreq(key))
      : synth.soundWav(name, core.keyToFreq(key))
  } catch (e) {
    return null
  }
  if (!buffer) return null
  const fsm = wx.getFileSystemManager()
  try {
    fsm.writeFileSync(path, buffer)
  } catch (e) {
    // 残留的脏文件 / 被占用：删掉再写一次
    try { fsm.unlinkSync(path) } catch (e2) {}
    try { fsm.writeFileSync(path, buffer) } catch (e3) { return null }
  }
  written[path] = true
  return path
}

function playFile(name, settings, retried) {
  const key = keyOf(settings)
  ensureKey(key)
  const path = ensureFile(name, key)
  if (!path) return null

  const ctx = wx.createInnerAudioContext()
  // 一次播放只有一次"结束"：ended / error 谁先来谁生效，避免重复释放或重复补播
  let done = false
  const finish = () => {
    if (done) return
    done = true
    forget(ctx)
  }
  const fail = () => {
    if (done) return
    done = true
    forget(ctx)
    // 文件被系统清掉 / 解码失败：丢掉缓存，重合成一次再试
    if (retried) return
    delete written[path]
    playFile(name, settings, true)
  }

  ctx.volume = volumeOf(settings)
  ctx.onEnded(finish)
  ctx.onError(fail)
  ctx.src = path
  track(ctx)
  try {
    ctx.play()
  } catch (e) {
    // 少数机型上 play() 会直接抛错：走和 onError 一样的补救流程
    fail()
  }
  return path
}

// 播放一个事件音效（受 5 个开关控制）
function play(name) {
  if (!synth.SOUND_SPECS[name]) return
  const settings = store.loadSoundSettings()
  if (!settings[name]) return
  playFile(name, settings, false)
}

/* 试听：用指定音高发一个钢琴音（音高与设置完全一致）。
 * 不受 5 个开关限制 —— 它是对设置本身的反馈，不是事件音效。 */
function preview(key) {
  const settings = store.loadSoundSettings()
  const target = key == null || key === '' ? settings.pianoKey : core.clampKey(key)
  playFile('piano', { ...settings, pianoKey: target }, false)
}

/* 只在 App.onHide 里调用：只释放播放实例，**不删文件**。
 * 文件名与内容一一对应，留着重进小程序可以直接复用。
 * 注意：放到页面 onUnload 里会把别的页面正在用的实例一起销毁（曾这么写，已修正）。 */
function release() {
  while (live.length) dispose(live.pop())
  currentKey = null
  if (cleanTimer) {
    clearTimeout(cleanTimer)
    cleanTimer = null
  }
}

// 供测试观察内部状态（小程序运行时不会用到）
function stats() {
  return { live: live.length, files: Object.keys(written).length, currentKey }
}

module.exports = {
  play,
  preview,
  release,
  fileOf,
  dir,
  stats,
  MAX_LIVE,
  CLEAN_DELAY,
}
