/* 性能基准：模拟 200 条任务 / 200 条历史，量各步骤耗时
 * 运行： node miniprogram/test/bench.js */
const OUT = (process.env.TEMP || '.') + '/mp-bench.txt'
const lines = []

// 桩：小程序存储 API
global.wx = {
  _s: {},
  getStorageSync(k) { return this._s[k] === undefined ? '' : this._s[k] },
  setStorageSync(k, v) { this._s[k] = v },
}

const store = require('../utils/storage')
const core = require('../utils/core')

const N = 200
const base = 1700000000000
const todos = []
const hist = []
for (let i = 0; i < N; i++) {
  const t = {
    id: base + i,
    text: '任务 ' + i + ' 的名字有点长一些',
    done: i % 3 === 0,
    priority: ['high', 'medium', 'low'][i % 3],
    createdAt: base + i,
  }
  todos.push(t)
  hist.push({ ...t, deletedAt: base + i })
}
wx.setStorageSync('todo-list-items', todos)
wx.setStorageSync('todo-history-items', hist)
wx.setStorageSync('todo-sound-settings', { add: true, priority: true, delete: true, clearDone: true, clearAll: true })
wx.setStorageSync('todo-custom-colors', ['#111111', '#222222', '#333333', '#444444'])

function time(label, fn, iter) {
  const n = iter || 200
  fn() // 预热
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < n; i++) fn()
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n
  lines.push(label.padEnd(46) + ms.toFixed(3) + ' ms')
  return ms
}

lines.push('数据量：任务 ' + N + ' 条，历史 ' + N + ' 条')
lines.push('--- 存储读取 ---')
time('store.loadHistory()', () => store.loadHistory())
time('store.loadTodos()', () => store.loadTodos())
time('store.loadHistory().length（只为取计数）', () => store.loadHistory().length)
time('store.loadSoundSettings()', () => store.loadSoundSettings())
time('store.loadCustomColors()', () => store.loadCustomColors())

lines.push('--- 纯逻辑 ---')
const view = { search: '', filter: 'all', sort: 'default', priority: 'all', page: 1 }
time('core.getVisibleItems(200 条, default)', () => core.getVisibleItems(todos, view))
time('core.getVisibleItems(200 条, 名称升序)', () => core.getVisibleItems(todos, { ...view, sort: 'name-asc' }))

lines.push('--- 两个页面当前的整轮刷新 ---')
time('history.refresh 等价流程', () => {
  const h = store.loadHistory()
  const byPriority = core.getFilteredItems(h, 'all', view.priority)
  const completed = byPriority.filter((t) => t.done).length
  const visible = core.getVisibleItems(h, view)
  const totalPages = core.getTotalPages(visible.length)
  const page = core.clampPage(1, totalPages)
  const start = (page - 1) * core.PAGE_SIZE
  const pageItems = visible.slice(start, start + core.PAGE_SIZE)
  const scopeCount = core.getFilteredItems(h, view.filter, view.priority).length
  const out = pageItems.map((x) => ({
    id: x.todo.id,
    text: x.todo.text,
    segments: (x.segments || []).map((s, i) => ({ v: s.v, hit: s.hit, i })),
    dateText: core.formatDeletedAt(x.todo.deletedAt),
  }))
  return out.length + scopeCount
})

time('settings.refresh 等价流程', () => {
  const soundSettings = store.loadSoundSettings()
  const colors = store.loadCustomColors()
  const rows = store.SOUND_TYPES.map((s) => ({ key: s.key, label: s.label, on: !!soundSettings[s.key] }))
  return rows.length + colors.length
})

lines.push('--- 优化后：先分页，只为当前页那几条算高亮/日期 ---')
time('history.refresh（优化版）', () => {
  const h = store.loadHistory()
  const byPriority = core.getFilteredItems(h, 'all', view.priority)
  const completed = byPriority.filter((t) => t.done).length
  const info = core.getPageItems(h, view)
  const scopeCount = core.getFilteredItems(h, view.filter, view.priority).length
  const decor = info.pageItems.map((x) => ({
    segments: core.highlightSegments(x.todo.text, x.indices).map((s, i) => ({ v: s.v, hit: s.hit, i })),
    dateText: core.formatDeletedAt(x.todo.deletedAt),
  }))
  return decor.length + scopeCount + completed + info.totalPages
})

time('index.refresh（优化版，计数走 countHistory）', () => {
  const todos = store.loadTodos()
  const byPriority = core.getFilteredItems(todos, 'all', view.priority)
  const completed = byPriority.filter((t) => t.done).length
  const info = core.getPageItems(todos, view)
  const scopeCount = core.getFilteredItems(todos, view.filter, view.priority).length
  const items = info.pageItems.map((x) => ({
    segments: core.highlightSegments(x.todo.text, x.indices).map((s, i) => ({ v: s.v, hit: s.hit, i })),
    dateText: core.formatCreatedAt(x.todo.createdAt),
  }))
  return items.length + scopeCount + completed + info.totalPages + store.countHistory()
})

time('store.countHistory()（不再是 loadHistory().length）', () => store.countHistory())

lines.push('--- 对比：只给当前页 5 条做高亮/日期 ---')
time('只为 5 条构造 segments + 日期', () => {
  const slice = todos.slice(0, 5)
  return slice.map((t) => ({
    segments: core.highlightSegments(t.text, null).map((s, i) => ({ v: s.v, hit: s.hit, i })),
    dateText: core.formatCreatedAt(t.createdAt),
  }))
})

const fs = require('fs')
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
console.log(lines.join('\n'))
