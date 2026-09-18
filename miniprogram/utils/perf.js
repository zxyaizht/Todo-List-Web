/* 进页面耗时打点
 * 目的：把"点进去慢"拆成两段，判断到底该往哪优化——
 *   ① 页面数据准备：onLoad / onShow 里的 JS（存储读取 + 筛选排序）
 *   ② 页面创建与首次渲染：onLoad 结束 → onReady（框架 + 模拟器/真机）
 * 用法：点击前 perf.tap('打开历史记录')，目标页 onLoad / onReady 里 perf.sinceTap('...')。
 * 结论看完后，把 PERF_DEBUG 改成 false 即可全部关闭（或删掉本文件与相关调用）。 */

const PERF_DEBUG = true

let tapAt = 0

function now() {
  return Date.now()
}

// 记下"用户点击"的时刻（模块是单例，跨页面共享，所以目标页能读到）
function tap(label) {
  tapAt = now()
  if (PERF_DEBUG) console.log('[perf] 点击 → ' + label)
}

// 距上次点击过了多久
function sinceTap(where) {
  if (!PERF_DEBUG || !tapAt) return
  console.log('[perf] ' + where + '：距点击 ' + (now() - tapAt) + 'ms')
}

// 量自己的一段代码：const t = perf.start(); ...; perf.step(t, '数据准备')
function start() {
  return PERF_DEBUG ? now() : 0
}

function step(t0, label) {
  if (!PERF_DEBUG || !t0) return
  console.log('[perf] ' + label + '：' + (now() - t0) + 'ms')
}

module.exports = { tap, sinceTap, start, step, PERF_DEBUG }
