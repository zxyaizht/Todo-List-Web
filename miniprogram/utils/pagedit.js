/* 「点页码 → 输入页码跳转」这段交互三个页面（主页 / 历史记录 / 最近用色）都要用，
 * 抽成一个模块避免抄三遍。
 *
 * 为什么不用 `wx.showModal({ editable: true })`：平台会**自动聚焦**里面的输入框 ——
 * 手指刚点完页码，键盘就自己弹出来了（用户反馈："应该等我再点一下输入框才弹"）。
 * 而 showModal 的官方参数只有 title / content / showCancel / cancelText / cancelColor /
 * confirmText / confirmColor / editable / placeholderText，**没有**关闭自动聚焦的选项。
 * 所以这里改成页面里自绘的弹窗：输入框不聚焦，用户点它才弹键盘。
 *
 * 规则与网页版 main.js 的 startPageEdit 保持一致（都由 core.parsePageInput 决定）：
 *   · 取开头的整数（parseInt 语义："3页" → 3、"2.5" → 2）
 *   · 认不出或小于 1（空、"abc"、"0"、"-3"）→ 保持原页不动，只提示一下
 *   · 大于总页数 → 收敛到末页，并提示收敛到了哪一页
 *   · 取消 → 什么都不做
 *
 * 页面侧要做的（三个页面一样）：
 *   1. data 里放 `pageDialog: false, pageInput: '', pageTotal: 1`
 *   2. 放好弹窗的 WXML（见 pages/index/index.wxml 注释）
 *   3. 接四个一行 handler（见各页面 PAGE_OPTS 附近的写法） */
const core = require('./core')

/* 打开弹窗：只把当前页码回填进输入框，**不聚焦**，键盘不会自己弹出来 */
function openPageDialog(page, opts) {
  const total = Math.max(1, Math.floor(Number(opts.getTotal.call(page)) || 1))
  if (total <= 1) return // 只有一页时没有跳页的意义（分页控件本来也不渲染）
  page.pageInputRaw = String(opts.getCurrent.call(page))
  page.setData({ pageDialog: true, pageInput: page.pageInputRaw, pageTotal: total })
}

/* 输入过程不逐字 setData（同任务名输入框的做法：逐字重渲染会让光标跳） */
function inputPageDialog(page, e) {
  page.pageInputRaw = String(e.detail.value == null ? '' : e.detail.value)
}

function closePageDialog(page) {
  page.setData({ pageDialog: false })
}

/* 确定：解析 + 收敛，然后交给页面自己的 apply（三个页面各自的"跳到第 N 页"逻辑） */
function confirmPageDialog(page, opts) {
  const total = Math.max(1, Math.floor(Number(opts.getTotal.call(page)) || 1))
  const raw = page.pageInputRaw == null ? '' : page.pageInputRaw
  page.setData({ pageDialog: false })
  // 先用一个"不设上限"的解析拿到用户真正想去的页码，再按总页数收敛：
  // 这样"越界"和"认不出"两种情况都能准确区分（解析规则只有一份）
  const asked = core.parsePageInput(raw, Number.MAX_SAFE_INTEGER)
  if (asked == null) {
    wx.showToast({ title: '请输入页码数字', icon: 'none' })
    return
  }
  const next = Math.min(asked, total)
  if (next !== asked) {
    wx.showToast({ title: `已收敛到第 ${next} 页`, icon: 'none' })
  }
  opts.apply.call(page, next)
}

module.exports = {
  openPageDialog,
  inputPageDialog,
  closePageDialog,
  confirmPageDialog,
}
