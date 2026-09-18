/* utils/pagedit.js 的行为测试（用假的 page + 假的 wx）
 *
 * 三个页面（主页 / 历史记录 / 最近用色）的「点页码跳页」都走这个模块。
 * 为什么不用 wx.showModal：它的 editable 输入框会**自动聚焦**，一点页码键盘就弹出来
 * （用户反馈"应该等我再点一下输入框才弹"），而 showModal 没有关闭自动聚焦的参数。
 * 所以弹窗是自绘的，输入框不聚焦 —— 键盘只在用户点输入框时由系统拉起，
 * 这一点由 WXML 里没有 focus 属性保证（validate.js 有静态断言）。
 *
 * 这里把四种情况钉住：正常跳页 / 越界收敛 / 认不出保持原页 / 取消什么都不做。
 *
 * 运行： node miniprogram/test/pagedit.test.js */

const fs = require('fs')

const OUT = (process.env.TEMP || '.') + '/miniprogram-pagedit-report.txt'
const lines = []
let pass = 0
let fail = 0
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  ok ? pass++ : fail++
  lines.push(`${ok ? 'PASS' : 'FAIL'} | ${label} -> ${a}${ok ? '' : `  (期望 ${e})`}`)
}
const checkTrue = (label, cond) => check(label, !!cond, true)

/* ── 假的 wx：只需要 showToast（弹窗已经不用 showModal 了） ── */
let toasts = []
global.wx = {
  showToast(options) {
    toasts.push(options.title)
  },
}

const pagedit = require('../utils/pagedit')

// 假页面实例：setData 合并进 data，refresh 记账，apply 记账
function makePage(current, total) {
  return {
    data: { pageDialog: false, pageInput: '', pageTotal: 1 },
    current,
    total,
    setDataCalls: 0,
    refreshed: 0,
    applyCalls: [],
    setData(patch) {
      this.setDataCalls++
      Object.assign(this.data, patch)
    },
    refresh() { this.refreshed++ },
    getTotal() { return this.total },
    getCurrent() { return this.current },
    apply(next) {
      this.applyCalls.push(next)
      this.current = next
      this.refresh()
    },
  }
}
function optsOf(page) {
  return {
    getTotal: page.getTotal,
    getCurrent: page.getCurrent,
    apply: page.apply,
  }
}
function openIt(current, total) {
  toasts = []
  const page = makePage(current, total)
  pagedit.openPageDialog(page, optsOf(page))
  return page
}

lines.push('=== 小程序 pagedit.js 行为测试（自绘弹窗，假 page + 假 wx） ===')

lines.push('--- 打开弹窗 ---')
{
  const page = openIt(2, 5)
  check('弹窗打开', page.data.pageDialog, true)
  check('输入框预填当前页码', page.data.pageInput, '2')
  check('提示里写明范围', page.data.pageTotal, 5)
  checkTrue('打开时没有产生额外的输入值（等用户自己点输入框）', page.pageInputRaw === '2')
}
check('只有一页时不弹（分页控件本来也不渲染）', openIt(1, 1).data.pageDialog, false)
check('总页数为 0 / undefined 时按 1 页处理，不弹窗',
  [openIt(1, 0).data.pageDialog, openIt(1, undefined).data.pageDialog], [false, false])

lines.push('--- 输入过程不逐字 setData ---')
{
  const page = openIt(1, 5)
  const before = page.setDataCalls
  pagedit.inputPageDialog(page, { detail: { value: '4' } })
  check('输入时不 setData（避免光标跳）', page.setDataCalls, before)
  check('值存到页面实例上', page.pageInputRaw, '4')
  pagedit.inputPageDialog(page, { detail: {} })
  check('没有 value 时按空串处理', page.pageInputRaw, '')
}

lines.push('--- 确定：正常跳页 ---')
{
  const page = openIt(1, 5)
  pagedit.inputPageDialog(page, { detail: { value: '4' } })
  pagedit.confirmPageDialog(page, optsOf(page))
  check('跳到第 4 页', page.applyCalls, [4])
  check('弹窗关闭', page.data.pageDialog, false)
  check('不提示"收敛"', toasts, [])
}
{
  const page = openIt(3, 5)
  pagedit.inputPageDialog(page, { detail: { value: ' 2 ' } })
  pagedit.confirmPageDialog(page, optsOf(page))
  check('前后空格不影响', page.applyCalls, [2])
}
{
  const page = openIt(2, 5)
  // 不改直接确定 = 回到当前页（幂等，不会乱跳）
  pagedit.confirmPageDialog(page, optsOf(page))
  check('不输入直接确定 = 当前页', page.applyCalls, [2])
  check('也没有多余提示', toasts, [])
}

lines.push('--- 确定：越界收敛（与网页版一致） ---')
{
  const page = openIt(1, 3)
  pagedit.inputPageDialog(page, { detail: { value: '99' } })
  pagedit.confirmPageDialog(page, optsOf(page))
  check('超过总页数 → 收敛到末页', page.applyCalls, [3])
  check('并提示收敛到哪一页', toasts, ['已收敛到第 3 页'])
}
{
  const page = openIt(2, 3)
  pagedit.inputPageDialog(page, { detail: { value: '3页' } })
  pagedit.confirmPageDialog(page, optsOf(page))
  check('parseInt 语义：带汉字也能取整数', page.applyCalls, [3])
  check('取值正确就不提示收敛', toasts, [])
}
{
  const page = openIt(1, 3)
  pagedit.inputPageDialog(page, { detail: { value: '2.5' } })
  pagedit.confirmPageDialog(page, optsOf(page))
  check('小数按 parseInt 语义取整', page.applyCalls, [2])
}

lines.push('--- 确定：认不出 / 小于 1 → 保持原页 ---')
;['', 'abc', '0', '-3', '#', '第2页'].forEach((bad) => {
  const page = openIt(2, 5)
  pagedit.inputPageDialog(page, { detail: { value: bad } })
  pagedit.confirmPageDialog(page, optsOf(page))
  check(`输入 ${JSON.stringify(bad)} → 不动页面`, page.applyCalls, [])
  check(`输入 ${JSON.stringify(bad)} → 提示请输入数字`, toasts, ['请输入页码数字'])
  check(`输入 ${JSON.stringify(bad)} → 弹窗仍然关闭`, page.data.pageDialog, false)
})

lines.push('--- 取消 ---')
{
  const page = openIt(2, 5)
  pagedit.inputPageDialog(page, { detail: { value: '4' } })
  pagedit.closePageDialog(page)
  check('取消后弹窗关闭', page.data.pageDialog, false)
  check('取消不跳页', page.applyCalls, [])
  check('取消不提示', toasts, [])
}

lines.push('--- 解析规则与 core.parsePageInput 一致 ---')
const core = require('../utils/core')
check('parsePageInput("99", 3) 收敛到 3', core.parsePageInput('99', 3), 3)
check('parsePageInput("abc", 5) 是 null', core.parsePageInput('abc', 5), null)

lines.push('')
lines.push(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
