const core = require('./utils/core')
const store = require('./utils/storage')
const sound = require('./utils/sound')

App({
  globalData: {
    theme: '#2563eb',
    themeStyle: '',
  },

  onLaunch() {
    this.applyTheme(store.loadTheme())
  },

  // 音频实例是模块级共享的，只能在 App 级释放；
  // 放到页面 onUnload 里会把别的页面正在用的实例一起销毁（曾这么写，已修正）
  onHide() {
    sound.release()
  },

  // 应用主题色：算出 CSS 变量串供页面根节点用，同时同步导航栏颜色
  applyTheme(hex) {
    const color = core.parseColor(hex) || '#2563eb'
    this.globalData.theme = color
    this.globalData.themeStyle = core.themeStyleVars(color)
    try {
      wx.setNavigationBarColor({
        // 主题色偏亮时用黑字，否则白字
        frontColor: core.isLightColor(color) ? '#000000' : '#ffffff',
        backgroundColor: color,
      })
    } catch (e) {}
    return color
  },

  // 页面里改主题后调用，保证各页取到的是最新值
  setTheme(hex) {
    const color = this.applyTheme(hex)
    store.saveTheme(color)
    return color
  },
})
