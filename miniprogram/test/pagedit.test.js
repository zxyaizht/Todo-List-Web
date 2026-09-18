/* utils/pagedit.js 的行为测试（用假的 wx 跑交互）
 *
 * 三个页面（主页 / 历史记录 / 最近用色）的「点页码跳页」都走这个模块，
 * 规则要和网页版 startPageEdit 一致，所以把四种情况都钉住：
 *   正常跳页 / 越界收敛 / 认不出保持原页 / 取消什么都不做。
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

/* ── 假的 wx ── */
let modalCalls = []
let toasts = []
let modalReply = { confirm: true, content: '' }

global.wx = {
  showModal(options) {
    modalCalls.push(options)
    // 模拟用户操作：真机是异步回调，这里同步执行即可
    options.success(Object.assign({ confirm: modalReply.confirm, cancel: !modalReply.confirm }, modalReply))
  },
  showToast(options) {
    toasts.push(options.title)
  },
}

const pagedit = require('../utils/pagedit')
const core = require('../utils/core')

// 跑一次交互，返回 onPick 收到的页码（没调用就是 null）
function run(current, total, reply) {
  modalCalls = []
  toasts = []
  modalReply = reply
  let picked = null
  pagedit.promptJumpPage(current, total, (n) => { picked = n })
  return { picked, modal: modalCalls[0], toasts }
}

lines.push('=== 小程序 pagedit.js 行为测试（假 wx） ===')

lines.push('--- 弹窗本身 ---')
{
  const r = run(2, 5, { confirm: true, content: '2' })
  check('弹出一个输入框', modalCalls.length, 1)
  check('是 editable 的输入框', r.modal.editable, true)
  check('标题说明是跳页', r.modal.title, '跳转到第几页')
  check('输入框预填当前页码', r.modal.content, '2')
  check('提示里写明范围', r.modal.placeholderText, '输入 1 ~ 5')
}
check('只有一页时不弹窗（分页控件本来也不渲染）', run(1, 1, { confirm: true, content: '1' }).modal, undefined)
check('onPick 不是函数时安全返回', (() => {
  modalCalls = []
  pagedit.promptJumpPage(1, 3, null)
  return modalCalls.length
})(), 0)

lines.push('--- 正常跳页 ---')
{
  const r = run(1, 5, { confirm: true, content: '4' })
  check('输入合法页码 → 跳过去', r.picked, 4)
  check('不提示"收敛"', r.toasts, [])
}
{
  const r = run(3, 5, { confirm: true, content: ' 2 ' })
  check('前后空格不影响', r.picked, 2)
  check('无多余提示', r.toasts, [])
}

lines.push('--- 越界收敛（与网页版一致：收敛到末页并提示） ---')
{
  const r = run(1, 3, { confirm: true, content: '99' })
  check('超过总页数 → 收敛到末页', r.picked, 3)
  check('并提示收敛到哪一页', r.toasts, ['已收敛到第 3 页'])
}
{
  const r = run(2, 3, { confirm: true, content: '3页' })
  check('parseInt 语义：带汉字的输入也能取出整数', r.picked, 3)
}
{
  const r = run(1, 3, { confirm: true, content: '2.5' })
  check('小数按 parseInt 语义取整', r.picked, 2)
}

lines.push('--- 认不出 / 小于 1：保持原页 ---')
;['', 'abc', '0', '-3', '#', '第2页'].forEach((bad) => {
  const r = run(2, 5, { confirm: true, content: bad })
  check(`输入 ${JSON.stringify(bad)} → 不动页面`, r.picked, null)
  check(`输入 ${JSON.stringify(bad)} → 提示请输入数字`, r.toasts, ['请输入页码数字'])
})

lines.push('--- 取消 ---')
{
  const r = run(2, 5, { confirm: false, content: '4' })
  check('点取消 → 不跳页', r.picked, null)
  check('点取消 → 不提示', r.toasts, [])
}

lines.push('--- 与 core.parsePageInput 的规则一致 ---')
check('parsePageInput("99", 3) 收敛到 3', core.parsePageInput('99', 3), 3)
check('parsePageInput("2", 5) 是 2', core.parsePageInput('2', 5), 2)
check('parsePageInput("abc", 5) 是 null', core.parsePageInput('abc', 5), null)

lines.push('')
lines.push(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
