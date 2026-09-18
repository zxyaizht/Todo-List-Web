/* 「点页码 → 输入页码跳转」这段交互三个页面（主页 / 历史记录 / 最近用色）都要用，
 * 抽成一个模块避免抄三遍。
 *
 * 规则与网页版 main.js 的 startPageEdit **完全一致**：
 *   · 取开头的整数（parseInt 语义："3页" → 3、"2.5" → 2）
 *   · 认不出或小于 1（空、"abc"、"0"、"-3"）→ 保持原页不动，只提示一下
 *   · 大于总页数 → 收敛到末页，并提示收敛到了哪一页
 *   · 取消 → 什么都不做
 *
 * 小程序里没有行内 input 可以就地替换，所以用的是本项目统一的
 * 「点数值 → showModal 输入」（音量 / 频率那两个滑杆右侧的数值也是这么做的）。
 * 输入框预填当前页码，用户直接改数字即可。 */
const core = require('./core')

function promptJumpPage(current, totalPages, onPick) {
  const total = Math.max(1, Math.floor(Number(totalPages) || 1))
  // 只有一页时不存在跳页的意义（此时分页控件本来也不渲染）
  if (total <= 1 || typeof onPick !== 'function') return
  wx.showModal({
    title: '跳转到第几页',
    editable: true,
    placeholderText: `输入 1 ~ ${total}`,
    content: String(current),
    success: (res) => {
      if (!res.confirm) return
      const raw = String(res.content == null ? '' : res.content)
      // 先用一个"不设上限"的解析拿到用户真正想去的页码，再按总页数收敛：
      // 这样"越界"和"认不出"两种情况都能准确区分（解析规则只有一份）。
      const asked = core.parsePageInput(raw, Number.MAX_SAFE_INTEGER)
      if (asked == null) {
        wx.showToast({ title: '请输入页码数字', icon: 'none' })
        return
      }
      const next = Math.min(asked, total)
      if (next !== asked) {
        wx.showToast({ title: `已收敛到第 ${next} 页`, icon: 'none' })
      }
      onPick(next)
    },
  })
}

module.exports = { promptJumpPage }
