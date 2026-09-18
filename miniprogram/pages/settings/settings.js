const core = require('../../utils/core')
const store = require('../../utils/storage')
const sound = require('../../utils/sound')
const perf = require('../../utils/perf')

const app = getApp()

Page({
  data: {
    themeStyle: '',
    theme: '#2563eb',
    presets: core.RAINBOW_COLORS,
    customInput: '',
    customColors: [],
    soundRows: [],
    allSoundOn: true,
    // 音效全局参数：音量用百分比显示；频率用钢琴琴键序号（0=A0、87=C8，全音域）
    soundVolume: 100,
    soundKey: core.PIANO_DEFAULT_KEY,
    soundNote: 'C5',
    soundFreqHz: 523,
  },

  // 同回收站：数据在 onLoad 备好，第一次绘制即完整
  onLoad() {
    perf.mark('settings onLoad 开始')
    this.refresh()
    perf.mark('settings 数据就绪')
  },

  onReady() {
    perf.finish('设置')
  },

  refresh() {
    const theme = app.globalData.theme
    const soundSettings = store.loadSoundSettings()
    this.setData({
      themeStyle: app.globalData.themeStyle,
      theme,
      customColors: store.loadCustomColors(),
      soundRows: store.SOUND_TYPES.map((s) => ({
        key: s.key,
        label: s.label,
        on: !!soundSettings[s.key],
      })),
      allSoundOn: store.SOUND_TYPES.every((s) => !!soundSettings[s.key]),
      soundVolume: Math.round((soundSettings.volume == null ? 1 : soundSettings.volume) * 100),
      soundKey: soundSettings.pianoKey,
      soundNote: core.keyNameOf(soundSettings.pianoKey),
      soundFreqHz: Math.round(core.keyToFreq(soundSettings.pianoKey)),
    })
  },

  /* ── 主题色 ── */

  pickTheme(e) {
    const hex = e.currentTarget.dataset.hex
    // 点预设色时把色码同步填进下面的自定义输入框，方便直接看到 / 复制这个色值
    this.setData({ customInput: hex })
    this.applyTheme(hex, false)
  },

  onCustomInput(e) {
    this.setData({ customInput: e.detail.value })
  },

  applyCustom() {
    const hex = core.parseColor(this.data.customInput)
    if (!hex) {
      wx.showToast({ title: '认不出这个颜色', icon: 'none' })
      return
    }
    // 规范化后的色值回填到输入框
    this.setData({ customInput: hex })
    store.rememberCustomColor(hex)
    this.applyTheme(hex, true)
  },

  applySaved(e) {
    this.applyTheme(e.currentTarget.dataset.hex, false)
  },

  applyTheme(hex, remember) {
    app.setTheme(hex)
    if (remember) store.rememberCustomColor(hex)
    this.refresh()
  },

  /* ── 自定义色码：点击复制（小程序里比浏览器可靠得多） ── */

  copyCode(e) {
    const hex = e.currentTarget.dataset.hex
    wx.setClipboardData({
      data: hex,
      success: () => {
        wx.showToast({ title: `已复制 ${hex}`, icon: 'none' })
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'none' })
      },
    })
  },

  // 删除单个颜色不弹确认框（与网页版一致）：颜色会先进回收站
  removeColor(e) {
    const hex = e.currentTarget.dataset.hex
    store.deleteCustomColor(hex)
    this.refresh()
  },

  clearAllColors() {
    if (!this.data.customColors.length) return
    wx.showModal({
      title: '删除全部自定义色',
      content: '这些颜色会一起移到历史记录，可以再恢复。',
      confirmText: '全部删除',
      success: (res) => {
        if (!res.confirm) return
        const count = store.clearAllCustomColors()
        wx.showToast({ title: `已移入回收站 ${count} 个`, icon: 'none' })
        this.refresh()
      },
    })
  },

  /* ── 音效 ── */

  toggleSound(e) {
    const key = e.currentTarget.dataset.key
    const settings = store.loadSoundSettings()
    settings[key] = !settings[key]
    store.saveSoundSettings(settings)
    if (settings[key]) sound.play(key)
    this.refresh()
  },

  // 总开关：自绘 toggle（不用原生 switch —— 原生组件在模拟器里创建开销大）
  toggleMaster() {
    const on = !this.data.allSoundOn
    const settings = store.loadSoundSettings()
    store.SOUND_TYPES.forEach((s) => { settings[s.key] = on })
    store.saveSoundSettings(settings)
    if (on) {
      // 与网页版一致：打开总开关时随机播一个，让用户听到效果
      const pick = store.SOUND_TYPES[Math.floor(Math.random() * store.SOUND_TYPES.length)]
      sound.play(pick.key)
    }
    this.refresh()
  },

  /* ── 音效参数：音量 / 频率（松手即保存，并用当前音高试听一个钢琴音） ── */

  onVolumeChange(e) {
    const percent = e.detail.value
    const settings = store.loadSoundSettings()
    settings.volume = percent / 100
    store.saveSoundSettings(settings)
    this.setData({ soundVolume: percent })
    // 音量改完立刻按当前音高试听，能直接听出大小变化
    sound.preview(this.data.soundKey)
  },

  onFreqChange(e) {
    const key = e.detail.value
    const settings = store.loadSoundSettings()
    settings.pianoKey = key
    store.saveSoundSettings(settings)
    this.setData({
      soundKey: key,
      soundNote: core.keyNameOf(key),
      soundFreqHz: Math.round(core.keyToFreq(key)),
    })
    sound.preview(key)
  },

  /* ── 点右侧数值自定义输入（与拖滑杆等效：设置成功后同样试听） ── */

  editVolume() {
    wx.showModal({
      title: '音量（0 ~ 100）',
      editable: true,
      placeholderText: '输入 0 ~ 100 的数字',
      content: String(this.data.soundVolume),
      success: (res) => {
        if (!res.confirm) return
        const raw = String(res.content == null ? '' : res.content).trim()
        const num = parseFloat(raw)
        if (!isFinite(num)) {
          wx.showToast({ title: '请输入数字', icon: 'none' })
          return
        }
        const percent = Math.round(Math.min(100, Math.max(0, num)))
        const settings = store.loadSoundSettings()
        settings.volume = percent / 100
        store.saveSoundSettings(settings)
        this.setData({ soundVolume: percent })
        if (percent !== Math.round(num)) {
          wx.showToast({ title: '已收敛到 ' + percent + '%', icon: 'none' })
        }
        sound.preview(this.data.soundKey)
      },
    })
  },

  editPitch() {
    wx.showModal({
      title: '频率（音名或 Hz）',
      editable: true,
      placeholderText: '如 C5 / A#3 / 523',
      content: this.data.soundNote,
      success: (res) => {
        if (!res.confirm) return
        const key = core.parsePitch(res.content)
        if (key == null) {
          wx.showToast({ title: '认不出这个音高', icon: 'none' })
          return
        }
        const settings = store.loadSoundSettings()
        settings.pianoKey = key
        store.saveSoundSettings(settings)
        this.setData({
          soundKey: key,
          soundNote: core.keyNameOf(key),
          soundFreqHz: Math.round(core.keyToFreq(key)),
        })
        sound.preview(key)
      },
    })
  },
})
