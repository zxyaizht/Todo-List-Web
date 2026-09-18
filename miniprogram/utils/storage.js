/* 本地存储层
 * 数据结构与网页版保持一致（同样的字段名），方便将来做导入导出。
 * 小程序的 wx.setStorageSync 可以直接存对象，不像浏览器只能存字符串。 */

const core = require('./core')

const TODOS_KEY = 'todo-list-items'
const HISTORY_KEY = 'todo-history-items'
const THEME_KEY = 'todo-theme-color'
const SOUND_KEY = 'todo-sound-settings'
const PRIORITY_KEY = 'todo-priority'
const COLORS_KEY = 'todo-custom-colors'
const MAX_HISTORY = 200
// 自定义色数量**不限**（用户要求）：只受小程序存储上限约束。
// 列表用分页展示，条数再多也只渲染当前页，不会拖慢页面。
const MAX_CUSTOM_COLORS = Infinity

const HISTORY_TITLES = {
  color: '自定义色',
  task: '任务',
}

function readList(key) {
  try {
    const raw = wx.getStorageSync(key)
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    }
    return []
  } catch (e) {
    return []
  }
}

function writeList(key, list) {
  try {
    wx.setStorageSync(key, list)
  } catch (e) {
    // 存储写满等情况：忽略，不影响界面
  }
}

/* ── 任务 ── */

function loadTodos() {
  return readList(TODOS_KEY).map((t) => ({
    ...t,
    priority: t.priority || 'medium',
    done: !!t.done,
    // 老数据没有 createdAt：id 本身就是 Date.now() 生成的，可直接复用
    createdAt: t.createdAt || (isFinite(Number(t.id)) && Number(t.id) > 1e12 ? Number(t.id) : 0),
  }))
}

function saveTodos(todos) {
  writeList(TODOS_KEY, todos)
}

/* ── 回收站（任务与自定义色共用） ── */

function loadHistory() {
  return readList(HISTORY_KEY).map((t) => ({
    ...t,
    priority: t.priority || 'medium',
    done: !!t.done,
    // 历史条目原先只存了 deletedAt；用它兜底，让「按照时间」排序在回收站也有意义
    createdAt: t.createdAt || t.deletedAt || 0,
  }))
}

function saveHistory(list) {
  writeList(HISTORY_KEY, list)
}

// 只需要数量时别走 map：历史最多 200 条，为显示一个数字整体映射是浪费
function countHistory() {
  return readList(HISTORY_KEY).length
}

function pushToHistory(items, options) {
  const opts = options || {}
  if (!items || !items.length || opts.skipHistory) return
  const history = loadHistory()
  const stamped = items.map((t) => ({
    id: t.id,
    text: t.text,
    done: !!t.done,
    priority: t.priority || 'medium',
    kind: t.kind,
    createdAt: t.createdAt,
    deletedAt: Date.now(),
  }))
  const next = stamped.concat(history)
  if (next.length > MAX_HISTORY) next.length = MAX_HISTORY
  saveHistory(next)
}

/* ── 主题色 ── */

function loadTheme() {
  try {
    const raw = wx.getStorageSync(THEME_KEY)
    return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : '#2563eb'
  } catch (e) {
    return '#2563eb'
  }
}

function saveTheme(hex) {
  try {
    wx.setStorageSync(THEME_KEY, hex)
  } catch (e) {}
}

/* ── 自定义色记录（最近用过的，LIFO 去重，最多 8 个） ── */

function loadCustomColors() {
  return readList(COLORS_KEY).filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
}

function rememberCustomColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return
  const list = loadCustomColors().filter((c) => c.toLowerCase() !== hex.toLowerCase())
  list.unshift(hex.toLowerCase())
  if (list.length > MAX_CUSTOM_COLORS) list.length = MAX_CUSTOM_COLORS
  writeList(COLORS_KEY, list)
}

// 整体写回（撤回 / 重做用：把快照里的颜色表原样还原）
function saveCustomColors(list) {
  writeList(COLORS_KEY, Array.isArray(list) ? list : [])
}

function deleteCustomColor(hex) {
  const target = String(hex).toLowerCase()
  const remaining = loadCustomColors().filter((c) => c.toLowerCase() !== target)
  writeList(COLORS_KEY, remaining)
  // 删掉的颜色进统一回收站，kind:'color' 表示是颜色而不是任务
  pushToHistory([{
    id: `color-${Date.now()}`,
    text: target,
    done: false,
    priority: 'medium',
    kind: 'color',
  }])
}

function clearAllCustomColors() {
  const colors = loadCustomColors()
  if (!colors.length) return 0
  const items = colors.map((c, i) => ({
    id: `color-${Date.now()}-${i}`,
    text: c.toLowerCase(),
    done: false,
    priority: 'medium',
    kind: 'color',
  }))
  pushToHistory(items)
  writeList(COLORS_KEY, [])
  return items.length
}

function restoreCustomColor(hex) {
  const target = String(hex).toLowerCase()
  const list = loadCustomColors().filter((c) => c.toLowerCase() !== target)
  list.unshift(target)
  if (list.length > MAX_CUSTOM_COLORS) list.length = MAX_CUSTOM_COLORS
  writeList(COLORS_KEY, list)
}

/* ── 优先级（跨启动记住上次手选值） ── */

function loadPriority() {
  try {
    const raw = wx.getStorageSync(PRIORITY_KEY)
    return core.PRIORITY_ORDER.indexOf(raw) !== -1 ? raw : core.DEFAULT_PRIORITY
  } catch (e) {
    return core.DEFAULT_PRIORITY
  }
}

function savePriority(value) {
  try {
    wx.setStorageSync(PRIORITY_KEY, value)
  } catch (e) {}
}

/* ── 音效开关 + 音量/频率 ── */

const SOUND_TYPES = [
  { key: 'add', label: '添加任务' },
  { key: 'priority', label: '设置优先级' },
  { key: 'delete', label: '删除任务' },
  { key: 'clearDone', label: '清空已完成' },
  { key: 'clearAll', label: '清空全部' },
]

// 音效全局参数：
//   volume   0~1（滑杆显示百分比）
//   pianoKey 钢琴琴键序号，0=A0、87=C8（滑杆用它，播放时由 core.keyToFreq 换算成频率）
const SOUND_DEFAULTS = { volume: 1, pianoKey: core.PIANO_DEFAULT_KEY }

function loadSoundSettings() {
  const merged = { ...SOUND_DEFAULTS }
  SOUND_TYPES.forEach((s) => { merged[s.key] = true })
  try {
    const raw = wx.getStorageSync(SOUND_KEY)
    if (!raw) return merged
    const stored = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!stored) return merged
    SOUND_TYPES.forEach((s) => {
      if (typeof stored[s.key] === 'boolean') merged[s.key] = stored[s.key]
    })
    if (typeof stored.volume === 'number' && isFinite(stored.volume)) {
      merged.volume = Math.min(1, Math.max(0, stored.volume))
    } else if (typeof stored.volumeDb === 'number' && isFinite(stored.volumeDb)) {
      // 兼容按「分贝档位」(0~75) 存过的那一版
      merged.volume = core.dbToGain(stored.volumeDb)
    }
    if (typeof stored.pianoKey === 'number' && isFinite(stored.pianoKey)) {
      merged.pianoKey = core.clampKey(stored.pianoKey)
    } else if (typeof stored.semitone === 'number' && isFinite(stored.semitone)) {
      // 兼容上一版：那时档位以 C3 为 0（0=C3、36=C6）
      merged.pianoKey = core.freqToKey(130.8128 * Math.pow(2, stored.semitone / 12))
    } else if (typeof stored.frequency === 'number' && isFinite(stored.frequency)) {
      // 兼容更早版本直接存的 Hz
      merged.pianoKey = core.freqToKey(stored.frequency)
    }
    return merged
  } catch (e) {
    return merged
  }
}

function saveSoundSettings(settings) {
  try {
    wx.setStorageSync(SOUND_KEY, settings)
  } catch (e) {}
}

module.exports = {
  TODOS_KEY,
  HISTORY_KEY,
  THEME_KEY,
  SOUND_KEY,
  PRIORITY_KEY,
  COLORS_KEY,
  MAX_HISTORY,
  MAX_CUSTOM_COLORS,
  SOUND_TYPES,
  SOUND_DEFAULTS,
  HISTORY_TITLES,
  loadTodos,
  saveTodos,
  loadHistory,
  saveHistory,
  countHistory,
  pushToHistory,
  loadTheme,
  saveTheme,
  loadCustomColors,
  rememberCustomColor,
  saveCustomColors,
  deleteCustomColor,
  clearAllCustomColors,
  restoreCustomColor,
  loadPriority,
  savePriority,
  loadSoundSettings,
  saveSoundSettings,
}
