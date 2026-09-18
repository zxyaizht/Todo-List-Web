/* 「点页码 → 输入页码跳转」这段交互三个页面（主页 / 历史记录 / 最近用色）都要用，
 * 抽成一个模块避免抄三遍。
 *
 * 为什么自己画弹窗，而不是用 `wx.showModal({ editable: true })`：
 *   · 弹窗要**打开就自动聚焦**，键盘立刻弹出来 —— 用户点一下就进入输入状态，不用再点第二下；
 *   · 弹窗还要**跟着键盘平滑上移**，不能被键盘挡住。
 *   showModal 只能传 title / content / showCancel / cancelText / cancelColor / confirmText /
 *   confirmColor / editable / placeholderText，弹窗位置与键盘行为完全不受控，
 *   所以这里自己画：输入框 `focus="{{true}}"` 一出现就聚焦，
 *   再用 `keyboardheightchange`（和 focus 自带的 height 兜底）把蒙层顶到键盘上方。
 *
 * 规则与网页版 main.js 的 startPageEdit 保持一致（都由 core.parsePageInput 决定）：
 *   · 取开头的整数（parseInt 语义："3页" → 3、"2.5" → 2）
 *   · 认不出或小于 1（空、"abc"、"0"、"-3"）→ 保持原页不动，只提示一下
 *   · 大于总页数 → 收敛到末页，并提示收敛到了哪一页
 *   · 取消 → 什么都不做
 *
 * 页面侧要做的（三个页面一样）：
 *   1. data 里放 `pageDialog: false, pageInput: '', pageTotal: 1, pageKeyHeight: 0`
 *   2. 放好弹窗的 WXML（见 pages/index/index.wxml 里那段注释）
 *   3. 接五个一行 handler（见各页面 PAGE_OPTS 附近的写法） */
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
  page.setData({ pageDialog: false, pageKeyHeight: 0 })
}

/* 键盘高度变化 → 把弹窗整体抬到键盘上方。
 * 为什么要自己做：弹窗是 `position: fixed` 的蒙层，**不会**跟着平台"自动上推页面"动
 * （所以输入框上要写 adjust-position="{{false}}"，避免和这里重复位移）；
 * 官方也建议这种自绘弹窗用 keyboardheightchange 自己顶上去。
 * 注意官方 tip：这个事件会重复触发，相同高度要忽略掉，否则会白白重渲染。
 * 聚焦事件（bindfocus）的 detail 里也有 height，所以两个事件绑同一个 handler 兜底。 */
function onDialogKeyboard(page, e) {
  const detail = (e && e.detail) || {}
  const height = Math.max(0, Math.round(Number(detail.height) || 0))
  if (page.data.pageKeyHeight === height) return
  page.setData({ pageKeyHeight: height })
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
  onDialogKeyboard,
  closePageDialog,
  confirmPageDialog,
}
