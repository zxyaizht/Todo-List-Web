const core = require('../../utils/core')
const store = require('../../utils/storage')
const sound = require('../../utils/sound')

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
  },

  // 同回收站：数据在 onLoad 备好，第一次绘制即完整
  onLoad() {
    this.refresh()
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
    })
  },

  /* ── 主题色 ── */

  pickTheme(e) {
    const hex = e.currentTarget.dataset.hex
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

  toggleMaster(e) {
    const on = e.detail.value
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
})
