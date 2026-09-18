/* utils/undo.js 的行为测试（用假的 wx 存储跑）
 *
 * 撤回/取消撤回是"快照式"的：改之前存一份（任务 + 回收站 + 自定义色），撤回时整体写回。
 * 这里把几个关键性质钉住：
 *   · 撤回能把**多处改动一起还原**（删除任务 = 任务出栈 + 进回收站）
 *   · 取消撤回能把撤回掉的那一步再做一遍
 *   · 做了新操作后，"取消撤回"必须失效
 *   · 栈有深度上限，撤到底不会崩
 *   · 自定义色也在快照里（颜色进统一回收站，少还原一处就会丢数据）
 *
 * 运行： node miniprogram/test/undo.test.js */

const fs = require('fs')

const OUT = (process.env.TEMP || '.') + '/miniprogram-undo-report.txt'
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

/* ── 假的 wx 存储：写的时候深拷贝，模拟真实存储的序列化 ── */
const storage = {}
global.wx = {
  getStorageSync: (k) => storage[k],
  setStorageSync: (k, v) => { storage[k] = JSON.parse(JSON.stringify(v)) },
}

const undo = require('../utils/undo')
const store = require('../utils/storage')

function seed() {
  store.saveTodos([
    { id: 1, text: 'A', done: false, priority: 'high', createdAt: 1 },
    { id: 2, text: 'B', done: true, priority: 'low', createdAt: 2 },
  ])
  store.saveHistory([{ id: 9, text: '旧记录', done: false, priority: 'medium', kind: 'task', deletedAt: 5 }])
  store.saveCustomColors(['#ff8800', '#00ff00'])
}
const todosText = () => store.loadTodos().map((t) => t.text).join(',')
const historyText = () => store.loadHistory().map((t) => t.text).join(',')
const colors = () => store.loadCustomColors().join(',')

lines.push('=== 小程序 undo.js 行为测试（假 wx 存储） ===')

lines.push('--- 基本撤回 / 取消撤回 ---')
undo.reset()
seed()
check('初始数据', [todosText(), historyText(), colors()], ['A,B', '旧记录', '#ff8800,#00ff00'])
check('还没操作时不能撤回', undo.canUndo(), false)
check('还没撤回时不能取消撤回', undo.canRedo(), false)

// 模拟「删除任务 B」：先记一步，再改（任务出栈 + 进回收站）
undo.push()
store.saveTodos(store.loadTodos().filter((t) => t.text !== 'B'))
store.pushToHistory([{ id: 2, text: 'B', done: true, priority: 'low' }])
check('删除后清单里没有 B', todosText(), 'A')
check('B 进了回收站', historyText(), 'B,旧记录')
check('这时可以撤回了', undo.canUndo(), true)

undo.undo()
check('撤回后清单回到 A,B', todosText(), 'A,B')
check('撤回后 B 从回收站消失（两个地方一起还原）', historyText(), '旧记录')
check('撤回后可以取消撤回', undo.canRedo(), true)

undo.redo()
check('取消撤回后又是删除后的状态', todosText(), 'A')
check('回收站也跟着回去', historyText(), 'B,旧记录')

lines.push('--- 快照是独立的一份 ---')
undo.reset()
seed()
undo.push()
const loaded = store.loadTodos()
loaded[0].done = true
loaded[0].text = '改过了'
store.saveTodos(loaded)
check('改动生效', [store.loadTodos()[0].text, store.loadTodos()[0].done], ['改过了', true])
undo.undo()
check('撤回后回到改动前（快照没被污染）', [store.loadTodos()[0].text, store.loadTodos()[0].done], ['A', false])

lines.push('--- 做了新操作后，「取消撤回」失效 ---')
undo.reset()
seed()
undo.push()
store.saveTodos([])
undo.undo()
check('撤回后可以取消撤回', undo.canRedo(), true)
undo.push()
store.saveTodos([{ id: 3, text: '新任务', done: false, priority: 'medium', createdAt: 9 }])
check('新操作让取消撤回失效', undo.canRedo(), false)
check('但仍然可以继续撤回', undo.canUndo(), true)

lines.push('--- 自定义色也在快照里 ---')
undo.reset()
seed()
undo.push()
store.deleteCustomColor('#ff8800')
check('颜色被删掉', colors(), '#00ff00')
check('删掉的颜色进了回收站', /#ff8800/.test(historyText()), true)
undo.undo()
check('撤回后颜色回到列表', colors(), '#ff8800,#00ff00')
check('回收站里那条也一起消失', /#ff8800/.test(historyText()), false)

lines.push('--- 深度上限 ---')
undo.reset()
seed()
for (let i = 0; i < undo.MAX_DEPTH + 10; i++) {
  undo.push()
  store.saveTodos([{ id: 100 + i, text: 'T' + i, done: false, priority: 'low', createdAt: i }])
}
check('撤回栈不超过上限', undo.depths().undo, undo.MAX_DEPTH)
for (let i = 0; i < undo.MAX_DEPTH + 10; i++) undo.undo()
check('一路撤回不会崩，撤到底后不能再撤', undo.canUndo(), false)

lines.push('--- 空栈 / reset ---')
undo.reset()
check('空栈撤回返回 false', undo.undo(), false)
check('空栈取消撤回返回 false', undo.redo(), false)
undo.push()
undo.reset()
check('reset 清空两个栈', [undo.canUndo(), undo.canRedo()], [false, false])

lines.push('--- 一步撤回同时还原清单与回收站 ---')
undo.reset()
seed()
undo.push()
store.pushToHistory(store.loadTodos()) // 模拟「完成所有并清空」
store.saveTodos([])
check('清空后清单为空、回收站多了两条', [todosText(), store.loadHistory().length], ['', 3])
undo.undo()
check('撤回后清单原样回来', todosText(), 'A,B')
check('回收站也回到原样', store.loadHistory().length, 1)

lines.push('')
lines.push(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
