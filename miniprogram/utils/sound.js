/* 音效播放
 * 音源不再是打包好的 wav，而是运行时用 synth.js 现场合成 → 写进本地缓存文件 →
 * 交给 InnerAudioContext 播放。这样：
 *   · 频率设置覆盖钢琴全音域（A0~C8）都能精确移调（预渲染 wav 做不到）
 *   · 不需要打包任何音频资源
 * 只在音高变化时重新合成；文件名固定，音高一变就清掉旧文件与旧实例，不会堆积。 */
const core = require('./core')
const synth = require('./synth')
const store = require('./storage')

const contexts = {}
const written = {} // name -> 已合成的音高档位
let currentKey = null

function dir() {
  return wx.env.USER_DATA_PATH
}

function fileOf(name) {
  return `${dir()}/sfx-${name}.wav`
}

function destroyContexts() {
  Object.keys(contexts).forEach((k) => {
    try {
      contexts[k].destroy()
    } catch (e) {}
    delete contexts[k]
  })
}

// 音高变了：丢掉已合成的文件与播放实例，之后按需重合成
function syncKey(key) {
  if (currentKey === key) return
  currentKey = key
  destroyContexts()
  Object.keys(written).forEach((k) => { delete written[k] })
  try {
    const fsm = wx.getFileSystemManager()
    const files = fsm.readdirSync(dir())
    files.forEach((f) => {
      if (f.indexOf('sfx-') === 0 && f.indexOf('.wav') > 0) {
        try {
          fsm.unlinkSync(`${dir()}/${f}`)
        } catch (e) {}
      }
    })
  } catch (e) {}
}

// 确保某个音效已按当前音高合成好，返回文件路径
function ensureFile(name) {
  const key = currentKey == null ? core.PIANO_DEFAULT_KEY : currentKey
  const path = fileOf(name)
  if (written[name] === key) return path
  const buffer = name === 'piano'
    ? synth.pianoWav(core.keyToFreq(key))
    : synth.soundWav(name, core.keyToFreq(key))
  if (!buffer) return null
  try {
    wx.getFileSystemManager().writeFileSync(path, buffer)
  } catch (e) {
    return null
  }
  written[name] = key
  return path
}

function playFile(name, settings) {
  try {
    syncKey(settings.pianoKey == null ? core.PIANO_DEFAULT_KEY : settings.pianoKey)
    const path = ensureFile(name)
    if (!path) return
    let ctx = contexts[name]
    if (!ctx) {
      ctx = wx.createInnerAudioContext()
      contexts[name] = ctx
    }
    if (ctx.src !== path) ctx.src = path
    // 连续点击时先停再放，避免叠在一起
    ctx.stop()
    ctx.volume = Math.min(1, Math.max(0, typeof settings.volume === 'number' ? settings.volume : 1))
    ctx.play()
  } catch (e) {
    // 静默失败：音效不该影响主流程
  }
}

function play(name) {
  if (!synth.SOUND_SPECS[name]) return
  const settings = store.loadSoundSettings()
  if (!settings[name]) return
  playFile(name, settings)
}

/* 试听：用当前音高发一个钢琴音（音高与设置完全一致）。
 * 不受 5 个开关限制——它是对设置本身的反馈，不是事件音效。 */
function preview(key) {
  const settings = store.loadSoundSettings()
  const target = key == null || key === '' ? settings.pianoKey : core.clampKey(key)
  playFile('piano', { ...settings, pianoKey: target })
}

// 音频实例与缓存文件都是模块级共享的，只能在 App 级释放；
// 放到页面 onUnload 里会把别的页面正在用的实例一起销毁（曾这么写，已修正）
function release() {
  destroyContexts()
  currentKey = null
  Object.keys(written).forEach((k) => { delete written[k] })
}

module.exports = { play, preview, release, fileOf, dir }
