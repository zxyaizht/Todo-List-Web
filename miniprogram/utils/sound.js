/* 音效播放
 * 网页版用 Web Audio 现场合成，小程序没有等价能力，所以改成播放预生成的 wav
 * （见 tools/gen-sounds.js，音色与网页版一一对应）。 */
const core = require('./core')
const store = require('./storage')

const SOUND_FILES = {
  add: '/assets/sounds/add.wav',
  priority: '/assets/sounds/priority.wav',
  delete: '/assets/sounds/delete.wav',
  clearDone: '/assets/sounds/clear-done.wav',
  clearAll: '/assets/sounds/clear-all.wav',
}

const contexts = {}

// 「添加任务」第一个音的音高（523.25Hz）。频率设置就是拿它当基准换算播放倍率的。
const PITCH_REF = 523.25

// wav 是预先合成好的，没法在播放时改音高，
// 所以用播放倍率来变调（0.5~2.0，平台限制）；音量则可以直接设。
function applyParams(ctx, settings) {
  const db = typeof settings.volumeDb === 'number' ? settings.volumeDb : core.MAX_VOLUME_DB
  ctx.volume = core.dbToGain(db)
  const hz = typeof settings.frequency === 'number' ? settings.frequency : PITCH_REF
  try {
    ctx.playbackRate = Math.min(2, Math.max(0.5, hz / PITCH_REF))
  } catch (e) {
    // 个别基础库不支持 playbackRate 时忽略，音高保持原样
  }
}

function play(name) {
  if (!SOUND_FILES[name]) return
  const settings = store.loadSoundSettings()
  if (!settings[name]) return
  try {
    let ctx = contexts[name]
    if (!ctx) {
      ctx = wx.createInnerAudioContext()
      ctx.src = SOUND_FILES[name]
      contexts[name] = ctx
    }
    // 连续点击时先停再放，避免叠在一起
    ctx.stop()
    applyParams(ctx, settings)
    ctx.play()
  } catch (e) {
    // 静默失败：音效不该影响主流程
  }
}

// 页面卸载时释放，避免音频实例泄漏
function release() {
  Object.keys(contexts).forEach((k) => {
    try {
      contexts[k].destroy()
    } catch (e) {}
    delete contexts[k]
  })
}

module.exports = { play, release, SOUND_FILES }
