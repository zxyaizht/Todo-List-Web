/* utils/core.js 的单元测试：比对小程序版与网页版行为是否一致。
 * 运行： node miniprogram/test/core.test.js
 * 报告写到 %TEMP%\miniprogram-core-report.txt */
const fs = require('fs')
const core = require('../utils/core')

const OUT = (process.env.TEMP || '.') + '/miniprogram-core-report.txt'
const lines = []
let pass = 0
let fail = 0
const log = (s) => lines.push(s)
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  ok ? pass++ : fail++
  log(`${ok ? 'PASS' : 'FAIL'} | ${label} -> ${a}${ok ? '' : `  (期望 ${e})`}`)
}

log('=== 小程序 core.js 单元测试 ===')
log('名称排序是否用了拼音：' + core.NAME_COMPARE.pinyin)

log('--- 颜色解析 ---')
check('省略 # ', core.parseColor('ff8800'), '#ff8800')
check('3 位展开', core.parseColor('abc'), '#aabbcc')
check('8 位取前 6', core.parseColor('ff8800cc'), '#ff8800')
check('三个数字按 rgb', core.parseColor('255,0,0'), '#ff0000')
check('中文逗号', core.parseColor('0，128，255'), '#0080ff')
check('空格分隔', core.parseColor('255 0 0'), '#ff0000')
check('完整 rgb', core.parseColor('rgb(1, 2, 3)'), '#010203')
check('rgba 忽略透明度', core.parseColor('rgba(4,5,6,0.5)'), '#040506')
check('hsl 转换', core.parseColor('hsl(210, 100%, 50%)'), '#0080ff')
check('英文颜色名', core.parseColor('red'), '#ef4444')
check('完整十六进制', core.parseColor('#123456'), '#123456')
check('非法输入', core.parseColor('not-a-color'), null)
check('空输入', core.parseColor(''), null)

log('--- 主题推导 ---')
const shades = core.deriveShades('#2563eb')
check('primary 原样保留', shades.primary, '#2563eb')
// 注意：dark / soft 是运行时按 HSL 算法推导出来的，不等于 CSS 里的静态默认值
check('dark 由算法推导', shades.dark, '#1249c1')
check('soft 由算法推导', shades.soft, '#e7eefd')
check('dark 确实比 primary 暗', core.hexToHsl(shades.dark).l < core.hexToHsl(shades.primary).l, true)
check('soft 确实比 primary 亮', core.hexToHsl(shades.soft).l > core.hexToHsl(shades.primary).l, true)
check('主题变量串包含 --primary', core.themeStyleVars('#ff8800').indexOf('--primary:#ff8800') === 0, true)
check('浅色判断：白色算浅', core.isLightColor('#ffffff'), true)
check('浅色判断：深蓝不算浅', core.isLightColor('#2563eb'), false)

log('--- 日期显示 ---')
const now = Date.now()
const DAY = 86400000
check('今天显示「今天 时:分」', /^今天 \d{2}:\d{2}$/.test(core.formatCreatedAt(now)), true)
check('没有时间戳则不显示', core.formatCreatedAt(0), '')
check('三天前显示月日时分或年月日', /^(\d{2}-\d{2} \d{2}:\d{2}|\d{4}-\d{2}-\d{2})$/.test(core.formatCreatedAt(now - 3 * DAY)), true)
check('删除时间今天格式', /^今天 \d{2}:\d{2}$/.test(core.formatDeletedAt(now)), true)

log('--- 筛选 ---')
const items = [
  { id: 1, text: 'A', done: false, priority: 'high', createdAt: now - 4000 },
  { id: 2, text: 'B', done: true, priority: 'low', createdAt: now - 1000 },
  { id: 3, text: 'C', done: false, priority: 'medium', createdAt: now - 3000 },
  { id: 4, text: 'D', done: false, priority: 'high', createdAt: now - 2000 },
]
check('全部', core.getFilteredItems(items, 'all', 'all').length, 4)
check('只看已完成', core.getFilteredItems(items, 'done', 'all').map((t) => t.text), ['B'])
check('只看未完成', core.getFilteredItems(items, 'active', 'all').map((t) => t.text), ['A', 'C', 'D'])
check('优先级筛选（高）', core.getFilteredItems(items, 'all', 'high').map((t) => t.text), ['A', 'D'])
check('完成状态 + 优先级叠加', core.getFilteredItems(items, 'active', 'high').map((t) => t.text), ['A', 'D'])

log('--- 排序 ---')
const vis = (arr) => arr.map((t) => ({ todo: t, indices: null }))
check('时间降序', core.sortVisibleItems(vis(items), 'time-desc').map((x) => x.todo.text), ['B', 'D', 'C', 'A'])
check('时间升序', core.sortVisibleItems(vis(items), 'time-asc').map((x) => x.todo.text), ['A', 'C', 'D', 'B'])
check('优先级降序（同级按时间从新到旧）', core.sortVisibleItems(vis(items), 'priority-desc').map((x) => x.todo.text), ['D', 'A', 'C', 'B'])
check('优先级升序', core.sortVisibleItems(vis(items), 'priority-asc').map((x) => x.todo.text), ['B', 'C', 'D', 'A'])
check('不排序保持原顺序', core.sortVisibleItems(vis(items), 'default').map((x) => x.todo.text), ['A', 'B', 'C', 'D'])
check('排序不改动原数组', items.map((t) => t.text), ['A', 'B', 'C', 'D'])

const nameItems = [
  { id: 1, text: '张三', priority: 'low', createdAt: now },
  { id: 2, text: '李四', priority: 'low', createdAt: now },
  { id: 3, text: '王五', priority: 'low', createdAt: now },
  { id: 4, text: '阿三', priority: 'low', createdAt: now },
  { id: 5, text: '陈一', priority: 'low', createdAt: now },
]
const nameAsc = core.sortVisibleItems(vis(nameItems), 'name-asc').map((x) => x.todo.text)
check('名称降序是升序的反向', core.sortVisibleItems(vis(nameItems), 'name-desc').map((x) => x.todo.text), nameAsc.slice().reverse())
if (core.NAME_COMPARE.pinyin) {
  check('中文按拼音升序', nameAsc, ['阿三', '陈一', '李四', '王五', '张三'])
} else {
  log('SKIP | 当前环境无拼音排序，跳过中文拼音断言（小程序 iOS 端可能降级）')
}
const enItems = [
  { id: 1, text: 'banana', priority: 'low', createdAt: now },
  { id: 2, text: 'Apple', priority: 'low', createdAt: now },
  { id: 3, text: 'cherry', priority: 'low', createdAt: now },
]
check('英文按字母序（忽略大小写）', core.sortVisibleItems(vis(enItems), 'name-asc').map((x) => x.todo.text.toLowerCase()), ['apple', 'banana', 'cherry'])

log('--- 模糊搜索与高亮 ---')
check('连续子串命中', core.fuzzyMatch('Buy Milk', 'buy').matched, true)
check('连续子串下标', core.fuzzyMatch('Buy Milk', 'buy').indices, [0, 1, 2])
check('子序列命中（跳字符）', core.fuzzyMatch('买牛奶', '买奶').matched, true)
check('未命中', core.fuzzyMatch('Buy Milk', 'zzzz').matched, false)
check('空查询视为全命中', core.fuzzyMatch('任何', '').matched, true)
const segs = core.highlightSegments('买牛奶', [0, 2])
check('高亮分段数', segs.length, 3)
check('高亮分段内容', segs.map((s) => s.v), ['买', '牛', '奶'])
check('高亮命中标记', segs.map((s) => s.hit), [true, false, true])
check('分段拼回原文', core.highlightSegments('Buy Milk', [0, 1, 2]).map((s) => s.v).join(''), 'Buy Milk')

log('--- getVisibleItems（筛选 + 搜索 + 排序 一起） ---')
const view = { filter: 'all', priority: 'all', search: '', sort: 'time-desc' }
check('全流程：时间降序', core.getVisibleItems(items, view).map((x) => x.todo.text), ['B', 'D', 'C', 'A'])
check('全流程：带搜索', core.getVisibleItems(items, { filter: 'all', priority: 'all', search: 'c', sort: 'default' }).map((x) => x.todo.text), ['C'])
check('每条都带 segments', core.getVisibleItems(items, view).every((x) => Array.isArray(x.segments)), true)

log('--- 音量 dB ↔ 增益换算 ---')
check('上限常量为 75', core.MAX_VOLUME_DB, 75)
check('满档 75dB → 增益 1', core.dbToGain(75), 1)
check('0dB → 静音', core.dbToGain(0), 0)
check('37.5dB → 增益 0.25（平方律）', core.dbToGain(37.5), 0.25)
check('超过 75 被夹到上限', core.dbToGain(200), 1)
check('负数被夹到 0', core.dbToGain(-10), 0)
check('非法值按 0 处理', core.dbToGain(NaN), 0)
check('增益 1 → 75dB', core.gainToDb(1), 75)
check('增益 0.25 → 38dB（取整）', core.gainToDb(0.25), 38)
check('增益 0 → 0dB', core.gainToDb(0), 0)
check('来回换算保持一致', core.gainToDb(core.dbToGain(50)), 50)

log('--- 钢琴音高（频率滑杆） ---')
check('C3 常量', Math.round(core.C3_FREQ * 100) / 100, 130.81)
check('默认档位是 C5（24）', core.PIANO_DEFAULT_SEMITONE, 24)
check('滑杆最左 = C3 / 130.81Hz', Math.round(core.semitoneToFreq(0) * 100) / 100, 130.81)
check('中间 = C4 / 261.63Hz', Math.round(core.semitoneToFreq(12) * 100) / 100, 261.63)
check('滑杆最右 = C6 / 1046.5Hz', Math.round(core.semitoneToFreq(36) * 100) / 100, 1046.5)
check('音符名 0 → C3', core.noteNameOf(0), 'C3')
check('音符名 12 → C4', core.noteNameOf(12), 'C4')
check('音符名 24 → C5', core.noteNameOf(24), 'C5')
check('音符名 36 → C6', core.noteNameOf(36), 'C6')
check('音符名 13 → C#4', core.noteNameOf(13), 'C#4')
check('音符名 11 → B3', core.noteNameOf(11), 'B3')
check('越界收敛：-5 → C3', core.noteNameOf(-5), 'C3')
check('越界收敛：99 → C6', core.noteNameOf(99), 'C6')
check('非法档位回默认 C5', core.noteNameOf(NaN), 'C5')
check('频率反推半音：523.25 → 24', core.freqToSemitone(523.25), 24)
check('频率反推半音：130.8 → 0', core.freqToSemitone(130.8), 0)
check('频率反推半音：非法值回默认', core.freqToSemitone(0), 24)

// 试听实现：三个基准各隔一个八度，选最近基准后倍率必定落在平台允许的 0.5~2 内
let maxRate = 0
for (let s = 0; s <= 36; s++) {
  const hz = core.semitoneToFreq(s)
  let best = Infinity
  ;[0, 12, 24].forEach((b) => {
    best = Math.min(best, Math.abs(Math.log2(hz / core.semitoneToFreq(b))))
  })
  maxRate = Math.max(maxRate, Math.pow(2, best))
}
check('C3~C6 每个半音都能用 0.5~2 倍率覆盖', maxRate <= 2 && maxRate >= 0.5, true)

log('--- 分页 ---')
check('总页数（12 条 / 每页 5）', core.getTotalPages(12), 3)
check('总页数（空列表也要 1 页）', core.getTotalPages(0), 1)
check('页码越界收敛到末页', core.clampPage(99, 3), 3)
check('页码小于 1 收敛到 1', core.clampPage(0, 3), 1)
check('非法页码回到 1', core.clampPage(NaN, 3), 1)
check('PAGE_SIZE 为 5', core.PAGE_SIZE, 5)

log('')
log(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
