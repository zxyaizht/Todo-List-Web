/* 音效播放
 * 网页版用 Web Audio 现场合成，小程序没有等价能力，所以改成播放预生成的 wav
 * （见 tools/gen-sounds.js，音色与网页版一一对应）。 */
const store = require('./storage')

const SOUND_FILES = {
  add: '/assets/sounds/add.wav',
  priority: '/assets/sounds/priority.wav',
  delete: '/assets/sounds/delete.wav',
  clearDone: '/assets/sounds/clear-done.wav',
  clearAll: '/assets/sounds/clear-all.wav',
}

const contexts = {}

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
