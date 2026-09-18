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

// 试听用的钢琴音基准（三个八度各一个），见 preview()
const PIANO_FILES = [
  { semitone: 0, src: '/assets/sounds/tone-c3.wav' },
  { semitone: 12, src: '/assets/sounds/tone-c4.wav' },
  { semitone: 24, src: '/assets/sounds/tone-c5.wav' },
]
const pianoContexts = {}

// 「添加任务」第一个音的音高（523.25Hz）。频率设置就是拿它当基准换算播放倍率的。
const PITCH_REF = 523.25

// wav 是预先合成好的，没法在播放时改音高，
// 所以用播放倍率来变调（0.5~2.0，平台限制）；音量则可以直接设。
function applyParams(ctx, settings) {
  ctx.volume = Math.min(1, Math.max(0, typeof settings.volume === 'number' ? settings.volume : 1))
  const hz = core.semitoneToFreq(
    settings.semitone == null ? core.PIANO_DEFAULT_SEMITONE : settings.semitone
  )
  try {
    ctx.playbackRate = Math.min(2, Math.max(0.5, hz / PITCH_REF))
  } catch (e) {
    // 个别基础库不支持 playbackRate 时忽略，音高保持原样
  }
}

/* 试听：松开滑杆时发一个**音高与设置完全一致**的钢琴音。
 * 平台倍率限制在 0.5~2，而三个基准正好隔一个八度，所以总能挑到一个倍率落在
 * 0.7~2 之间的基准——C3 到 C6 的每个半音都能准准地响出来。
 * 它不受 5 个开关限制（这是对设置本身的反馈，不是事件音效）。 */
function preview(semitone) {
  const hz = core.semitoneToFreq(semitone == null ? core.PIANO_DEFAULT_SEMITONE : semitone)
  let best = PIANO_FILES[0]
  let bestDist = Infinity
  PIANO_FILES.forEach((b) => {
    const dist = Math.abs(Math.log2(hz / core.semitoneToFreq(b.semitone)))
    if (dist < bestDist - 1e-9) {
      bestDist = dist
      best = b
    }
  })
  const rate = Math.min(2, Math.max(0.5, hz / core.semitoneToFreq(best.semitone)))
  try {
    let ctx = pianoContexts[best.src]
    if (!ctx) {
      ctx = wx.createInnerAudioContext()
      ctx.src = best.src
      pianoContexts[best.src] = ctx
    }
    ctx.stop()
    ctx.volume = Math.min(1, Math.max(0, store.loadSoundSettings().volume))
    try {
      ctx.playbackRate = rate
    } catch (e) {}
    ctx.play()
  } catch (e) {
    // 静默失败
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
  Object.keys(pianoContexts).forEach((k) => {
    try {
      pianoContexts[k].destroy()
    } catch (e) {}
    delete pianoContexts[k]
  })
}

module.exports = { play, preview, release, SOUND_FILES, PIANO_FILES, PITCH_REF }
