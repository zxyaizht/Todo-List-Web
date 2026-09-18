/* 进页面耗时打点
 * 作用：把"点进去慢"拆成三段，判断该往哪优化——
 *   ① onLoad 开始    ：从点击到页面代码开始执行（这一段是框架创建页面）
 *   ② 数据就绪       ：页面里 JS 读存储 + 筛选排序的耗时（我们自己的代码）
 *   ③ 进入耗时       ：点击 → onReady（首次渲染完成），也就是用户感知的总延迟
 * 用法：点击前 perf.tap('打开历史记录')；目标页 onLoad 里 perf.mark('...')，
 *       onReady 里 perf.finish('历史记录') —— 会直接弹出数字，不用看控制台。
 * 排查完把 PERF_DEBUG 改成 false 即可全部关闭（弹窗与打点都不再执行）。 */

const PERF_DEBUG = false

let tapAt = 0
const marks = []

function now() {
  return Date.now()
}

// 记下"用户点击"的时刻（模块是单例，跨页面共享，所以目标页读得到）
function tap(label) {
  tapAt = now()
  marks.length = 0
  if (PERF_DEBUG) console.log('[perf] 点击 → ' + label)
}

// 打一个点：输出"距点击多少毫秒"
function mark(label) {
  if (!PERF_DEBUG || !tapAt) return
  marks.push(label + '：+ ' + (now() - tapAt) + ' ms')
}

// 在目标页 onReady 里调用：把整段拆解弹出来（不用看控制台）
function finish(title) {
  if (!PERF_DEBUG || !tapAt) return
  const total = now() - tapAt
  wx.showModal({
    title: '进入耗时 ' + total + ' ms',
    content: (title || '') + (marks.length ? '\n' + marks.join('\n') : ''),
    showCancel: false,
    confirmText: '知道了',
  })
}

module.exports = { tap, mark, finish, PERF_DEBUG }
