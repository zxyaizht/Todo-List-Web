/* 纯逻辑层
 * 与网页版 main.js 的行为保持一致，被各页面共用；不依赖小程序 API，
 * 因此可以在 Node 里直接跑单元测试（见 miniprogram/test/core.test.js）。
 * 模块规范用 CommonJS —— 小程序的 require 机制就是这样。 */

/* ── 颜色：hex / hsl 互转与主题推导 ── */

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
      default: break
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100
  let r; let g; let b
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  // +1e-6 抵消浮点误差（hsl(210,100%,50%) 的 g 会算成 127.49999…，应进位为 128）
  const toHex = (c) => Math.round(c * 255 + 1e-6).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function deriveShades(hex) {
  const { h, s, l } = hexToHsl(hex)
  return {
    primary: hex,
    dark: hslToHex(h, s, Math.max(l - 12, 15)),
    light: hslToHex(h, Math.min(s + 5, 100), 88),
    soft: hslToHex(h, Math.min(s + 3, 100), 95),
    appBg: hslToHex(h, Math.min(s + 6, 100), 96),
    appBg2: hslToHex(h, Math.min(s + 12, 100), 89),
  }
}

function hexToRgbTriplet(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ].join(', ')
}

// 生成可以塞进 style="{{themeStyle}}" 的 CSS 变量串（WXSS 支持 CSS 自定义属性）
function themeStyleVars(hex) {
  const s = deriveShades(hex)
  return [
    `--primary:${s.primary}`,
    `--primary-rgb:${hexToRgbTriplet(s.primary)}`,
    `--primary-dark:${s.dark}`,
    `--primary-light:${s.light}`,
    `--primary-soft:${s.soft}`,
    `--app-bg:${s.appBg}`,
    `--app-bg-2:${s.appBg2}`,
  ].join(';')
}

// 判断颜色是否偏亮 —— 用于决定导航栏文字用白还是黑
function isLightColor(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * f(ch[0]) + 0.7152 * f(ch[1]) + 0.0722 * f(ch[2])
  return luminance > 0.6
}

/* ── 颜色输入解析：越宽容越好，统一返回 #rrggbb，认不出返回 null ── */

const NAMED_COLORS = {
  red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e',
  blue: '#2563eb', purple: '#8b5cf6', cyan: '#06b6d4', pink: '#ec4899',
  black: '#000000', white: '#ffffff', gray: '#6b7280', grey: '#6b7280',
  silver: '#cbd5e1', gold: '#f59e0b', brown: '#92400e', navy: '#1e3a8a',
  teal: '#14b8a6', indigo: '#6366f1', lime: '#84cc16', sky: '#0ea5e9',
  maroon: '#7f1d1d', olive: '#808000', coral: '#f87171', violet: '#8b5cf6',
}

function parseColor(input) {
  const s = String(input == null ? '' : input).trim().toLowerCase()
  if (!s) return null

  if (NAMED_COLORS[s]) return NAMED_COLORS[s]

  // 十六进制：# 可省，3 位自动展开，8 位（带透明度）取前 6 位
  const hexBody = s.startsWith('#') ? s.slice(1) : s
  if (/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(hexBody)) {
    const full = hexBody.length === 3
      ? hexBody.split('').map((c) => c + c).join('')
      : hexBody
    return `#${full}`
  }
  if (/^[0-9a-f]{8}$/.test(hexBody)) return `#${hexBody.slice(0, 6)}`

  const nums = (s.match(/\d{1,3}(?:\.\d+)?/g) || []).map(Number)

  // hsl(210, 100%, 50%)，括号同样可省
  if (s.indexOf('hsl') !== -1 && nums.length >= 3) {
    const h = nums[0]
    const sat = nums[1]
    const light = nums[2]
    if (h >= 0 && h <= 360 && sat >= 0 && sat <= 100 && light >= 0 && light <= 100) {
      return hslToHex(h, sat, light)
    }
    return null
  }

  // rgb / rgba：取前三个 0-255 的数字，括号、中英文逗号、空格都不影响
  if (nums.length >= 3) {
    const rgb = nums.slice(0, 3)
    if (rgb.every((n) => n >= 0 && n <= 255)) {
      const toHex = (c) => Math.round(c).toString(16).padStart(2, '0')
      return `#${rgb.map(toHex).join('')}`
    }
  }

  return null
}

/* ── 音量换算 ──
 * 滑杆给的是 0~75 的「分贝档位」（相对刻度，**不是**实测声压级：
 * 手机无法自我校准，真实响度还取决于机型喇叭与系统音量）。
 * 用平方律映射到播放器的 0~1 增益：低档位变化更细腻，接近人耳感受。 */
const MAX_VOLUME_DB = 75

function dbToGain(db) {
  const v = Math.min(MAX_VOLUME_DB, Math.max(0, Number(db) || 0))
  return Math.pow(v / MAX_VOLUME_DB, 2)
}

function gainToDb(gain) {
  const g = Math.min(1, Math.max(0, Number(gain) || 0))
  return Math.round(Math.sqrt(g) * MAX_VOLUME_DB)
}

/* ── 钢琴音域（频率滑杆用） ──
 * 用「琴键序号」建模：0 = A0（27.5Hz）、87 = C8（4186Hz），正好是钢琴 88 键全音域，
 * 每个刻度都是一个准的音；默认 51 = C5（523.25Hz，与音效基准音一致）。 */
const PIANO_MIN_KEY = 0
const PIANO_MAX_KEY = 87
const PIANO_DEFAULT_KEY = 51 // C5
const A0_FREQ = 27.5
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function clampKey(n) {
  const v = Math.round(Number(n))
  if (!isFinite(v)) return PIANO_DEFAULT_KEY
  return Math.min(PIANO_MAX_KEY, Math.max(PIANO_MIN_KEY, v))
}

function keyToFreq(k) {
  return A0_FREQ * Math.pow(2, clampKey(k) / 12)
}

// 由频率反推最近的琴键（兼容旧数据里存的 Hz）
function freqToKey(hz) {
  const f = Number(hz)
  if (!isFinite(f) || f <= 0) return PIANO_DEFAULT_KEY
  return clampKey(12 * Math.log2(f / A0_FREQ))
}

// 0 -> A0，3 -> C1，12 -> A1，51 -> C5，87 -> C8
function keyNameOf(k) {
  const s = clampKey(k) + 9 // 换成「以 C0 为 0」的半音序号
  return NOTE_NAMES[s % 12] + Math.floor(s / 12)
}

/* 输入解析：支持音名（C5 / A#3 / Bb4 / 带八度）或频率（523 / 523Hz）。
 * 认不出返回 null，交给调用方提示。 */
function parsePitch(raw) {
  const s = String(raw == null ? '' : raw).trim()
  if (!s) return null

  const note = /^([A-Ga-g])\s*([#♯b♭]?)\s*(-?\d{1,2})$/.exec(s)
  if (note) {
    let semi = NOTE_NAMES.indexOf(note[1].toUpperCase())
    if (semi === -1) return null
    if (note[2] === '#' || note[2] === '♯') semi += 1
    else if (note[2] === 'b' || note[2] === '♭') semi -= 1
    const octave = parseInt(note[3], 10)
    // 以 C0 为 0 的半音序号，再换算成 A0=0 的琴键序号
    return clampKey(octave * 12 + semi - 9)
  }

  const num = /^(\d+(?:\.\d+)?)\s*(?:hz|赫兹)?$/i.exec(s)
  if (num) {
    const hz = parseFloat(num[1])
    if (!isFinite(hz) || hz <= 0) return null
    return freqToKey(hz)
  }

  return null
}

/* ── 日期显示 ── */

function pad2(n) {
  return String(n).padStart(2, '0')
}

// 任务名右侧的添加日期：今天 / 昨天 / 同年 MM-DD HH:mm / 跨年 YYYY-MM-DD
function formatCreatedAt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((dayStart(now) - dayStart(d)) / 86400000)
  if (diffDays === 0) return `今天 ${time}`
  if (diffDays === 1) return `昨天 ${time}`
  if (d.getFullYear() === now.getFullYear()) return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${time}`
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// 回收站条目的删除时间
function formatDeletedAt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  return sameDay ? `今天 ${time}` : `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${time}`
}

/* ── 优先级 / 筛选 / 排序 ── */

// 设置页的七个预设主题色（与网页版一致）
const RAINBOW_COLORS = [
  { name: '红', hex: '#ef4444' },
  { name: '橙', hex: '#f59e0b' },
  { name: '黄', hex: '#eab308' },
  { name: '绿', hex: '#22c55e' },
  { name: '青', hex: '#06b6d4' },
  { name: '蓝', hex: '#2563eb' },
  { name: '紫', hex: '#8b5cf6' },
]

/* 任务的等级分成两个维度（2026-10-01 用户要求，从原来的单一「优先级」拆出来）：
 *   · 轻重（weight）—— 事情的重要性，显示成任务左边的**圆形**，存在 `priority` 字段里
 *   · 缓急（urgency）—— 事情的紧急性，显示成任务名右边的**沙漏**，存在 `urgency` 字段里
 * 两个维度共用同一套档位值，颜色沿用原来的优先级色；只有「无」是固定的灰色（不跟主题）。
 * 字段名继续用 `priority` 存「轻重」，是为了和网页版/桌面版的老数据保持兼容（它们只有 priority）。 */
const LEVELS = ['none', 'low', 'medium', 'high'] // 也是"点一下切一级"的循环顺序
const LEVEL_RANK = { none: 0, low: 1, medium: 2, high: 3 }
const DEFAULT_LEVEL = 'none' // 两个维度**初次使用**的默认都是「无」
const WEIGHT_LABELS = { none: '无', low: '轻', medium: '中', high: '重' }
const URGENCY_LABELS = { none: '无', low: '缓', medium: '中', high: '急' }

/* 排序用得到（原来叫 PRIORITY_RANK，现在加上了 none 档） */
const PRIORITY_RANK = LEVEL_RANK

const FILTER_ORDER = ['all', 'done', 'active']
const FILTER_LABELS = { all: '全部', done: '已完成', active: '未完成' }

/* 两个维度各一行筛选：全部 + 四档（顺序与"点一下切一级"的循环一致：无 → 轻 → 中 → 重） */
const LEVEL_FILTER_ORDER = ['all', 'none', 'low', 'medium', 'high']
const WEIGHT_FILTER_LABELS = { all: '全部', none: '无', low: '轻', medium: '中', high: '重' }
const URGENCY_FILTER_LABELS = { all: '全部', none: '无', low: '缓', medium: '中', high: '急' }

/* 认不出 / 缺省（老数据没有 urgency）一律当「无」，别让它变成 undefined 漏进筛选和排序 */
function normalizeLevel(level) {
  return LEVELS.indexOf(level) === -1 ? DEFAULT_LEVEL : level
}

/* 点一下切一级：无 → 轻 → 中 → 重 → 无（缓急同理，只是文案不同） */
function nextLevel(level) {
  return LEVELS[(LEVELS.indexOf(normalizeLevel(level)) + 1) % LEVELS.length]
}

const SORT_ORDER = [
  'time-desc', 'time-asc',
  'priority-desc', 'priority-asc',
  'urgency-desc', 'urgency-asc',
  'name-asc', 'name-desc',
]
const SORT_LABELS = {
  'time-desc': '按照时间降序',
  'time-asc': '按照时间升序',
  'priority-desc': '按照轻重降序',
  'priority-asc': '按照轻重升序',
  'urgency-desc': '按照缓急降序',
  'urgency-asc': '按照缓急升序',
  'name-asc': '按照名称升序',
  'name-desc': '按照名称降序',
}
const SORT_SHORT = {
  'time-desc': '时间 ↓',
  'time-asc': '时间 ↑',
  'priority-desc': '轻重 ↓',
  'priority-asc': '轻重 ↑',
  'urgency-desc': '缓急 ↓',
  'urgency-asc': '缓急 ↑',
  'name-asc': '名称 ↑',
  'name-desc': '名称 ↓',
}
const DEFAULT_SORT = 'default'

/* 名称排序：中文按拼音、英文按 a-z。
 * 先用 Intl.Collator 探测 —— 小程序 iOS 端是 JavaScriptCore，ICU 可能不全，
 * 探测失败就降级为码点比较（英文仍正确，中文退化为 Unicode 序）。 */
function makeNameCompare() {
  try {
    if (typeof Intl !== 'undefined' && Intl.Collator) {
      const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })
      // 探针：拼音序里「阿(a)」应排在「张(zhang)」前面
      if (collator.compare('阿', '张') < 0 && collator.compare('apple', 'banana') < 0) {
        return { compare: (a, b) => collator.compare(String(a), String(b)), pinyin: true }
      }
    }
  } catch (e) {
    // 落到底部降级
  }
  return {
    compare: (a, b) => {
      const x = String(a)
      const y = String(b)
      return x < y ? -1 : (x > y ? 1 : 0)
    },
    pinyin: false,
  }
}

const NAME_COMPARE = makeNameCompare()

function matchesFilter(item, filter) {
  if (filter === 'done') return !!item.done
  if (filter === 'active') return !item.done
  return true
}

/* 筛选：完成状态 + 「轻重」+ 「缓急」两个维度（两个筛选项都可以是 'all' 表示不限）。
 * 判定一律走 normalizeLevel —— 老数据没有 urgency 字段，会被当成「无」，
 * 这样筛「无」时能正确地把它们一起筛出来。 */
function getFilteredItems(items, filter, weight, urgency) {
  let list = filter === 'all' ? items.slice() : items.filter((t) => matchesFilter(t, filter))
  if (weight && weight !== 'all') list = list.filter((t) => normalizeLevel(t.priority) === weight)
  if (urgency && urgency !== 'all') list = list.filter((t) => normalizeLevel(t.urgency) === urgency)
  return list
}

function sortVisibleItems(visible, sort) {
  if (!sort || sort === DEFAULT_SORT) return visible
  const timeOf = (t) => (typeof t.createdAt === 'number' ? t.createdAt : 0)
  // 排序按「轻重」算，「无」排最后（等级最低）；同档内按时间从新到旧
  const rankOf = (t) => LEVEL_RANK[normalizeLevel(t.priority)]
  // 按「缓急」排序同理
  const urgencyRankOf = (t) => LEVEL_RANK[normalizeLevel(t.urgency)]
  const comparators = {
    'time-desc': (a, b) => timeOf(b.todo) - timeOf(a.todo),
    'time-asc': (a, b) => timeOf(a.todo) - timeOf(b.todo),
    'priority-desc': (a, b) => rankOf(b.todo) - rankOf(a.todo) || timeOf(b.todo) - timeOf(a.todo),
    'priority-asc': (a, b) => rankOf(a.todo) - rankOf(b.todo) || timeOf(b.todo) - timeOf(a.todo),
    'urgency-desc': (a, b) => urgencyRankOf(b.todo) - urgencyRankOf(a.todo) || timeOf(b.todo) - timeOf(a.todo),
    'urgency-asc': (a, b) => urgencyRankOf(a.todo) - urgencyRankOf(b.todo) || timeOf(b.todo) - timeOf(a.todo),
    'name-asc': (a, b) => NAME_COMPARE.compare(a.todo.text, b.todo.text),
    'name-desc': (a, b) => NAME_COMPARE.compare(b.todo.text, a.todo.text),
  }
  const cmp = comparators[sort]
  return cmp ? visible.slice().sort(cmp) : visible
}

// 模糊匹配：先连续子串，再退化为顺序子序列
function fuzzyMatch(text, rawQuery) {
  const q = String(rawQuery == null ? '' : rawQuery).trim().toLowerCase()
  if (!q) return { matched: true, indices: null }
  const source = String(text).toLowerCase()

  const direct = source.indexOf(q)
  if (direct !== -1) {
    const indices = []
    for (let i = 0; i < q.length; i++) indices.push(direct + i)
    return { matched: true, indices }
  }

  const indices = []
  let cursor = 0
  for (const ch of q) {
    const found = source.indexOf(ch, cursor)
    if (found === -1) return { matched: false, indices: null }
    indices.push(found)
    cursor = found + 1
  }
  return { matched: true, indices }
}

// 把文本切成 [{v, hit}]，供 WXML 用 wx:for 渲染高亮（小程序没有 innerHTML）
function highlightSegments(text, indices) {
  const str = String(text == null ? '' : text)
  if (!indices || !indices.length) return [{ v: str, hit: false }]
  const hits = {}
  indices.forEach((i) => { hits[i] = true })
  const segs = []
  let i = 0
  while (i < str.length) {
    const code = str.codePointAt(i)
    const size = code > 0xffff ? 2 : 1
    const isHit = !!hits[i]
    const last = segs[segs.length - 1]
    if (last && last.hit === isHit) last.v += str.slice(i, i + size)
    else segs.push({ v: str.slice(i, i + size), hit: isHit })
    i += size
  }
  return segs
}

// filter + 搜索 + 排序，**不做高亮分段**：分段只给当前页那几条算就够了
function queryItems(items, view) {
  // 两个维度一起筛：view.priority 是「轻重」、view.urgency 是「缓急」
  const scoped = getFilteredItems(items, view.filter, view.priority, view.urgency)
  const q = String(view.search || '').trim()
  let visible
  if (!q) {
    visible = scoped.map((todo) => ({ todo, indices: null }))
  } else {
    visible = []
    for (const todo of scoped) {
      const result = fuzzyMatch(todo.text, q)
      if (result.matched) visible.push({ todo, indices: result.indices })
    }
  }
  return sortVisibleItems(visible, view.sort)
}

// 带上高亮分段（条目多时别用这个，用 queryItems + 只给当前页算分段）
function getVisibleItems(items, view) {
  return queryItems(items, view).map((x) => ({
    todo: x.todo,
    indices: x.indices,
    segments: highlightSegments(x.todo.text, x.indices),
  }))
}

// 一次拿到：过滤后的全量、页码信息、当前页那几条（只给这几条算高亮分段）
function getPageItems(items, view) {
  const visible = queryItems(items, view)
  const totalPages = getTotalPages(visible.length)
  const page = clampPage(view.page, totalPages)
  const start = (page - 1) * PAGE_SIZE
  return {
    visible,
    page,
    totalPages,
    pageItems: visible.slice(start, start + PAGE_SIZE),
  }
}

/* ── 分页 ── */

const PAGE_SIZE = 5

function getTotalPages(totalItems, pageSize) {
  const size = pageSize || PAGE_SIZE
  return Math.max(1, Math.ceil(totalItems / size))
}

function clampPage(p, totalPages) {
  if (!isFinite(p) || p < 1) return 1
  return Math.min(p, totalPages)
}

/* 解析「点页码后手动输入的页码」，行为与网页版 startPageEdit 完全一致：
 *   · 取开头的整数（parseInt 语义："3页" → 3、"2.5" → 2）
 *   · 认不出或小于 1（空、"abc"、"0"、"-3"）→ 返回 null，调用方保持原页不动
 *   · 大于总页数 → 收敛到末页
 * 返回 1 ~ totalPages 的整数，或 null。 */
function parsePageInput(raw, totalPages) {
  const s = String(raw == null ? '' : raw).trim()
  const matched = /^[+-]?\d+/.exec(s)
  if (!matched) return null
  const n = parseInt(matched[0], 10)
  if (!isFinite(n) || n < 1) return null
  const total = Math.max(1, Math.floor(Number(totalPages)) || 1)
  return Math.min(total, n)
}

module.exports = {
  hexToHsl,
  hslToHex,
  deriveShades,
  hexToRgbTriplet,
  themeStyleVars,
  isLightColor,
  parseColor,
  NAMED_COLORS,
  MAX_VOLUME_DB,
  dbToGain,
  gainToDb,
  PIANO_MIN_KEY,
  PIANO_MAX_KEY,
  PIANO_DEFAULT_KEY,
  A0_FREQ,
  NOTE_NAMES,
  clampKey,
  keyToFreq,
  freqToKey,
  keyNameOf,
  parsePitch,
  formatCreatedAt,
  formatDeletedAt,
  RAINBOW_COLORS,
  // 等级：轻重（priority 字段）+ 缓急（urgency 字段）两个维度共用一套档位
  LEVELS,
  LEVEL_RANK,
  DEFAULT_LEVEL,
  WEIGHT_LABELS,
  URGENCY_LABELS,
  normalizeLevel,
  nextLevel,
  PRIORITY_RANK,
  FILTER_ORDER,
  FILTER_LABELS,
  LEVEL_FILTER_ORDER,
  WEIGHT_FILTER_LABELS,
  URGENCY_FILTER_LABELS,
  SORT_ORDER,
  SORT_LABELS,
  SORT_SHORT,
  DEFAULT_SORT,
  NAME_COMPARE,
  matchesFilter,
  getFilteredItems,
  sortVisibleItems,
  fuzzyMatch,
  highlightSegments,
  queryItems,
  getVisibleItems,
  getPageItems,
  PAGE_SIZE,
  getTotalPages,
  clampPage,
  parsePageInput,
}
