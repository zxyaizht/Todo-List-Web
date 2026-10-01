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

log('--- 等级：轻重 + 缓急（2026-10-01 从单一优先级拆出来） ---')
check('轻重的四档文案', ['none', 'low', 'medium', 'high'].map((k) => core.WEIGHT_LABELS[k]), ['无', '轻', '中', '重'])
check('缓急的四档文案', ['none', 'low', 'medium', 'high'].map((k) => core.URGENCY_LABELS[k]), ['无', '缓', '中', '急'])
check('初次使用的默认是「无」', core.DEFAULT_LEVEL, 'none')
check('点一下切一级：无 → 轻 → 中 → 重 → 无',
  [core.nextLevel('none'), core.nextLevel('low'), core.nextLevel('medium'), core.nextLevel('high')],
  ['low', 'medium', 'high', 'none'])
check('认不出的值一律当「无」',
  [core.normalizeLevel('xx'), core.normalizeLevel(undefined), core.normalizeLevel(''), core.normalizeLevel(null)],
  ['none', 'none', 'none', 'none'])
check('合法档位原样返回', [core.normalizeLevel('high'), core.normalizeLevel('none')], ['high', 'none'])

// 两个维度各自筛，且互不影响；老数据没有 urgency 字段要当「无」
const twoDim = [
  { id: 1, text: 'A', done: false, priority: 'high', urgency: 'low', createdAt: now - 3000 },
  { id: 2, text: 'B', done: false, priority: 'low', urgency: 'high', createdAt: now - 2000 },
  { id: 3, text: 'C', done: false, priority: 'none', createdAt: now - 1000 },
]
check('只按轻重筛', core.getFilteredItems(twoDim, 'all', 'high').map((t) => t.text), ['A'])
check('只按缓急筛', core.getFilteredItems(twoDim, 'all', 'all', 'high').map((t) => t.text), ['B'])
check('两个维度叠加', core.getFilteredItems(twoDim, 'all', 'low', 'high').map((t) => t.text), ['B'])
check('两个维度互不相容时筛空', core.getFilteredItems(twoDim, 'all', 'high', 'high').map((t) => t.text), [])
check('没有 urgency 的老数据算「无」', core.getFilteredItems(twoDim, 'all', 'all', 'none').map((t) => t.text), ['C'])
check('筛轻重「无」也能命中老数据', core.getFilteredItems(twoDim, 'all', 'none').map((t) => t.text), ['C'])

log('--- 排序 ---')
const vis = (arr) => arr.map((t) => ({ todo: t, indices: null }))
check('「无」在轻重降序里排最后', core.sortVisibleItems(vis(twoDim), 'priority-desc').map((x) => x.todo.text), ['A', 'B', 'C'])
check('「无」在轻重升序里排最前', core.sortVisibleItems(vis(twoDim), 'priority-asc').map((x) => x.todo.text), ['C', 'B', 'A'])
// 缓急排序（2026-10-01 新增）
check('缓急降序（同级按时间从新到旧）', core.sortVisibleItems(vis(twoDim), 'urgency-desc').map((x) => x.todo.text), ['B', 'A', 'C'])
check('缓急升序', core.sortVisibleItems(vis(twoDim), 'urgency-asc').map((x) => x.todo.text), ['C', 'A', 'B'])
check('缓急的两个选项都在排序清单里', core.SORT_ORDER.filter((k) => k.indexOf('urgency') === 0), ['urgency-desc', 'urgency-asc'])
check('缓急的排序文案与短标签', [core.SORT_LABELS['urgency-desc'], core.SORT_LABELS['urgency-asc'], core.SORT_SHORT['urgency-desc'], core.SORT_SHORT['urgency-asc']],
  ['按照缓急降序', '按照缓急升序', '缓急 ↓', '缓急 ↑'])
check('排序清单一共 8 项（时间/轻重/缓急 各两向 + 名称两向）', core.SORT_ORDER.length, 8)
check('每项排序都有文案与短标签', core.SORT_ORDER.every((k) => core.SORT_LABELS[k] && core.SORT_SHORT[k]), true)
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

log('--- 钢琴全音域（频率滑杆 88 键） ---')
check('最左键 0 = A0 / 27.5Hz', core.keyToFreq(0), 27.5)
check('最右键 87 = C8', core.keyNameOf(87), 'C8')
check('C8 频率约 4186Hz', Math.round(core.keyToFreq(87)), 4186)
check('默认键 51 = C5', core.PIANO_DEFAULT_KEY, 51)
check('C5 频率 523.25Hz', Math.round(core.keyToFreq(51) * 100) / 100, 523.25)
check('键 3 = C1', core.keyNameOf(3), 'C1')
check('键 12 = A1', core.keyNameOf(12), 'A1')
check('键 0 = A0', core.keyNameOf(0), 'A0')
check('键 51 = C5', core.keyNameOf(51), 'C5')
check('相邻八度正好差 2 倍频', Math.round(core.keyToFreq(12) * 100) / 100, Math.round(core.keyToFreq(0) * 2 * 100) / 100)
check('越界收敛：-5 → A0', core.keyNameOf(-5), 'A0')
check('越界收敛：999 → C8', core.keyNameOf(999), 'C8')
check('非法输入回默认 C5', core.keyNameOf(NaN), 'C5')
check('频率反推：523.25 → 51', core.freqToKey(523.25), 51)
check('频率反推：27.5 → 0', core.freqToKey(27.5), 0)
check('频率反推：非法值回默认', core.freqToKey(0), 51)

log('--- 音高输入解析（点数值自定义输入用） ---')
check('音名 C5', core.parsePitch('C5'), 51)
check('音名 A0', core.parsePitch('A0'), 0)
check('音名 C8', core.parsePitch('C8'), 87)
check('小写也认', core.parsePitch('c5'), 51)
check('带空格也认', core.parsePitch(' C5 '), 51)
check('升号 ♯ 与 # 等价', core.parsePitch('A♯3'), core.parsePitch('A#3'))
check('降号 Bb4 等于 A#4', core.parsePitch('Bb4'), core.parsePitch('A#4'))
check('♭ 也与 b 等价', core.parsePitch('B♭4'), core.parsePitch('Bb4'))
check('纯数字按 Hz 解析', core.parsePitch('523'), 51)
check('带 Hz 单位', core.parsePitch('523Hz'), 51)
check('超出音域的输入收敛到端点', core.parsePitch('C9'), 87)
check('认不出的返回 null', core.parsePitch('not-a-note'), null)
check('空输入返回 null', core.parsePitch('   '), null)
check('非法数字返回 null', core.parsePitch('0'), null)

log('--- 分页 ---')
check('总页数（12 条 / 每页 5）', core.getTotalPages(12), 3)
check('总页数（空列表也要 1 页）', core.getTotalPages(0), 1)
check('页码越界收敛到末页', core.clampPage(99, 3), 3)
check('页码小于 1 收敛到 1', core.clampPage(0, 3), 1)
check('非法页码回到 1', core.clampPage(NaN, 3), 1)
check('PAGE_SIZE 为 5', core.PAGE_SIZE, 5)

// 点页码手动输入（与网页版 startPageEdit 同一套规则）
log('--- 手动输入页码 ---')
check('正常输入', core.parsePageInput('2', 5), 2)
check('前后空格不影响', core.parsePageInput(' 3 ', 5), 3)
check('超过总页数收敛到末页', core.parsePageInput('99', 5), 5)
check('刚好等于末页', core.parsePageInput('5', 5), 5)
check('parseInt 语义：带汉字也能取值', core.parsePageInput('3页', 5), 3)
check('parseInt 语义：小数取整', core.parsePageInput('2.9', 5), 2)
check('空输入认不出', core.parsePageInput('', 5), null)
check('非数字认不出', core.parsePageInput('abc', 5), null)
check('0 认不出（小于 1 不收敛，保持原页）', core.parsePageInput('0', 5), null)
check('负数认不出', core.parsePageInput('-3', 5), null)
check('乱码认不出', core.parsePageInput('#', 5), null)
check('null / undefined 安全', [core.parsePageInput(null, 5), core.parsePageInput(undefined, 5)], [null, null])
check('总页数缺失时按 1 页处理', core.parsePageInput('9', 0), 1)

log('--- 任务组：默认组名 ---')
// 取最小的、当前没被占用的「任务组N」；删掉的不占号
check('没有任务组时是 任务组1', core.nextGroupName([]), '任务组1')
check('有 1 / 2 时下一个是 3', core.nextGroupName([{ name: '任务组1' }, { name: '任务组2' }]), '任务组3')
check('两个都删了 → 又回到 任务组1', core.nextGroupName([]), '任务组1')
check('只有 任务组2 → 下一个是 任务组1', core.nextGroupName([{ name: '任务组2' }]), '任务组1')
check('补上中间的空号：有 1 / 3 → 下一个是 2', core.nextGroupName([{ name: '任务组1' }, { name: '任务组3' }]), '任务组2')
check('自定义名字不占号', core.nextGroupName([{ name: '买菜' }]), '任务组1')
check('名字前后有空格也算已占用', core.nextGroupName([{ name: ' 任务组1 ' }]), '任务组2')
check('数据异常（null / 没有 name）不崩', [core.nextGroupName(null), core.nextGroupName([{}])], ['任务组1', '任务组1'])

log('--- 任务组：列表行合成 ---')
const grp = { id: 9001, name: '任务组1', createdAt: 1 }
const grpTasks = [
  { id: 1, text: 'A', done: false, priority: 'high', urgency: 'none', createdAt: now, groupId: 9001 },
  { id: 2, text: 'B', done: false, priority: 'high', urgency: 'none', createdAt: now },
  { id: 3, text: 'C', done: false, priority: 'none', urgency: 'none', createdAt: now, groupId: 12345 }, // 指向不存在的组
]
const grpView = { search: '', filter: 'all', sort: 'default', priority: 'all', urgency: 'all', page: 1 }
const rowText = (r) => r.kind + ':' + (r.kind === 'group' ? r.name : r.todo.text)
check('任务组排最前，组内任务不再单列', core.buildListRows([grp], grpTasks, grpView).map(rowText), ['group:任务组1', 'todo:B', 'todo:C'])
check('组里几个任务要数出来', core.buildListRows([grp], grpTasks, grpView)[0].count, 1)
// 组左侧勾选框的状态：组内都完成了才算勾上（空组不勾）
const doneGrpTasks = [
  { id: 1, text: 'A', done: true, priority: 'high', urgency: 'none', createdAt: now, groupId: 9001 },
  { id: 2, text: 'B', done: false, priority: 'high', urgency: 'none', createdAt: now, groupId: 9001 },
]
check('组内没全完成 → allDone=false', core.buildListRows([grp], doneGrpTasks, grpView)[0].allDone, false)
check('组内全完成 → allDone=true', core.buildListRows([grp], doneGrpTasks.map((t) => Object.assign({}, t, { done: true })), grpView)[0].allDone, true)
check('空组不算完成', core.buildListRows([grp], [], grpView)[0].allDone, false)
check('groupId 指向不存在的组 → 按未分组处理（任务绝不能消失）',
  core.buildListRows([grp], grpTasks, grpView).filter((r) => r.kind === 'todo').length, 2)
check('搜索命中组名 → 只留那个组', core.buildListRows([grp], grpTasks, Object.assign({}, grpView, { search: '任务组1' })).map(rowText), ['group:任务组1'])
check('搜索没命中组名 → 组不显示', core.buildListRows([grp], grpTasks, Object.assign({}, grpView, { search: 'zzz' })).length, 0)
check('等级筛选照样作用于任务，但不影响任务组',
  core.buildListRows([grp], grpTasks, Object.assign({}, grpView, { priority: 'high' })).map(rowText), ['group:任务组1', 'todo:B'])
check('分页把任务组也算进行数', (() => {
  const many = []
  for (let i = 0; i < 6; i++) many.push({ id: 200 + i, text: 'T' + i, done: false, priority: 'none', urgency: 'none', createdAt: now - i })
  const info = core.getListPage([grp], many, grpView)
  return info.visibleCount === 7 && info.totalPages === 2 && info.pageRows.length === 5 && info.pageRows[0].kind === 'group'
})(), true)

log('--- 计数范围：跟随等级筛选 ---')
// 用户要求：筛了轻重/缓急之后，按钮上的数字要跟筛选后的任务匹配
const cntTasks = [
  { id: 1, text: 'A', done: true, priority: 'low', urgency: 'none', createdAt: now },
  { id: 2, text: 'B', done: false, priority: 'low', urgency: 'high', createdAt: now },
  { id: 3, text: 'C', done: false, priority: 'high', urgency: 'none', createdAt: now },
  { id: 4, text: 'D', done: true, priority: 'high', urgency: 'none', createdAt: now },
]
check('不筛时 = 全量', core.countByLevelScope(cntTasks, 'all', 'all'), { completed: 2, incomplete: 2 })
check('筛轻重=轻 → 只数轻的（1 完成 1 未完成）', core.countByLevelScope(cntTasks, 'low', 'all'), { completed: 1, incomplete: 1 })
check('筛轻重=重 → 1 完成 1 未完成', core.countByLevelScope(cntTasks, 'high', 'all'), { completed: 1, incomplete: 1 })
check('筛缓急=急 → 只有 B（未完成）', core.countByLevelScope(cntTasks, 'all', 'high'), { completed: 0, incomplete: 1 })
check('筛缓急=无 → A/D 完成、C 未完成', core.countByLevelScope(cntTasks, 'all', 'none'), { completed: 2, incomplete: 1 })
check('两个维度叠加会有交集', core.countByLevelScope(cntTasks, 'high', 'high'), { completed: 0, incomplete: 0 })
check('这批任务里没有「轻重=无」的', core.countByLevelScope(cntTasks, 'none', 'all'), { completed: 0, incomplete: 0 })
check('有没有生效的等级筛选', [core.hasLevelScope('all', 'all'), core.hasLevelScope('low', 'all'), core.hasLevelScope('all', 'high')], [false, true, true])
check('单条是否在范围内', [
  core.inLevelScope({ priority: 'low', urgency: 'high' }, 'low', 'all'),
  core.inLevelScope({ priority: 'low', urgency: 'high' }, 'high', 'all'),
  core.inLevelScope({ priority: 'low' }, 'all', 'none'),
  core.inLevelScope(null, 'all', 'all'),
], [true, false, true, false])

log('')
log(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
