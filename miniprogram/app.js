const core = require('./utils/core')
const store = require('./utils/storage')
const sound = require('./utils/sound')
const perf = require('./utils/perf')

// 默认主题色（与 app.wxss 里 page{} 的静态变量值一致）
const DEFAULT_THEME = '#2563eb'

App({
  globalData: {
    theme: '#2563eb',
    themeStyle: '',
  },

  onLaunch() {
    perf.tap('启动小程序')
    // 尽量让音效可闻：iOS 上忽略静音开关、安卓优先走扬声器。
    // 注意：这**不能**突破系统音量——小程序音频最终仍会被系统音量衰减，
    // 没法做到"设了多少分贝就一定是多少分贝"（手机也无法自我校准声压级）。
    try {
      wx.setInnerAudioOption({
        mixWithOther: true,
        obeyMuteSwitch: false,
        speakerOn: true,
      })
    } catch (e) {}
    this.applyTheme(store.loadTheme())
  },

  // 音频实例是模块级共享的，只能在 App 级释放；
  // 放到页面 onUnload 里会把别的页面正在用的实例一起销毁（曾这么写，已修正）
  onHide() {
    sound.release()
  },

  // 应用主题色：算出 CSS 变量串供页面根节点用，同时同步导航栏颜色
  applyTheme(hex) {
    const color = core.parseColor(hex) || DEFAULT_THEME
    this.globalData.theme = color
    // 默认蓝色时**不写内联变量**：app.wxss 里 page{} 的静态值就是它，
    // 这样省掉每次渲染都要重算整页 CSS 变量的开销；换主题时才写内联覆盖。
    this.globalData.themeStyle =
      String(color).toLowerCase() === DEFAULT_THEME ? '' : core.themeStyleVars(color)
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
