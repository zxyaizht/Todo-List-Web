/* utils/pagedit.js 的行为测试（用假的 page + 假的 wx）
 *
 * 三个页面（主页 / 历史记录 / 最近用色）的「点页码跳页」都走这个模块。
 * 为什么自绘弹窗而不用 wx.showModal：showModal 的位置与键盘行为都不受控，而这里要
 *   1) 弹窗打开就**自动聚焦**（键盘立刻弹出来，点一下就能改，不用再点第二下）；
 *   2) 弹窗要靠键盘高度把自己**顶到键盘上方**（固定定位的蒙层不会跟着平台"上推页面"动）。
 * 这两点在 WXML / WXSS 里落实（focus、adjust-position、padding-bottom + 过渡），
 * 弹窗里"卡片怎么动"的数值逻辑就是本文件要测的 onDialogKeyboard。
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
    data: { pageDialog: false, pageInput: '', pageTotal: 1, pageKeyHeight: 0 },
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
  check('打开时输入值已就绪（配合 focus 直接就能改）', page.pageInputRaw, '2')
  check('初始键盘高度为 0（卡片先居中，键盘一弹就上移）', page.data.pageKeyHeight, 0)
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

lines.push('--- 键盘高度：把弹窗顶到键盘上方 ---')
{
  const page = openIt(1, 5)
  const before = page.setDataCalls
  pagedit.onDialogKeyboard(page, { detail: { height: 320, duration: 250 } })
  check('键盘弹起后记下高度', page.data.pageKeyHeight, 320)
  check('确实写进了 data', page.setDataCalls, before + 1)
  pagedit.onDialogKeyboard(page, { detail: { height: 320, duration: 250 } })
  check('相同高度忽略掉（官方 tip：这个事件会重复触发）', page.setDataCalls, before + 1)
  pagedit.onDialogKeyboard(page, { detail: { height: 300 } })
  check('高度变了就跟着更新（键盘收放时卡片会跟着动）', page.data.pageKeyHeight, 300)
  pagedit.onDialogKeyboard(page, {})
  check('没有 detail 时按 0 处理', page.data.pageKeyHeight, 0)
  pagedit.onDialogKeyboard(page, { detail: { height: -50 } })
  check('负数收敛到 0', page.data.pageKeyHeight, 0)
  pagedit.onDialogKeyboard(page, { detail: { height: '360' } })
  check('字符串高度也能处理', page.data.pageKeyHeight, 360)
}
{
  const page = openIt(1, 5)
  pagedit.onDialogKeyboard(page, { detail: { height: 300 } })
  pagedit.closePageDialog(page)
  check('关掉弹窗时键盘高度复位（免得下次打开带着上次的位移）',
    [page.data.pageDialog, page.data.pageKeyHeight], [false, 0])
}

lines.push('--- 解析规则与 core.parsePageInput 一致 ---')
const core = require('../utils/core')
check('parsePageInput("99", 3) 收敛到 3', core.parsePageInput('99', 3), 3)
check('parsePageInput("abc", 5) 是 null', core.parsePageInput('abc', 5), null)

lines.push('')
lines.push(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
