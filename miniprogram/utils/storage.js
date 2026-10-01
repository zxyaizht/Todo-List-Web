/* 本地存储层
 * 数据结构与网页版保持一致（同样的字段名），方便将来做导入导出。
 * 小程序的 wx.setStorageSync 可以直接存对象，不像浏览器只能存字符串。 */

const core = require('./core')

const TODOS_KEY = 'todo-list-items'
const HISTORY_KEY = 'todo-history-items'
const THEME_KEY = 'todo-theme-color'
const SOUND_KEY = 'todo-sound-settings'
const PRIORITY_KEY = 'todo-priority' // 「轻重」（沿用老键，老数据不用迁移）
const URGENCY_KEY = 'todo-urgency' // 「缓急」（新键）
const GROUPS_KEY = 'todo-groups' // 任务组（把多个任务装进一个"文件夹"）
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
    // 等级两个维度都收敛到合法档位：老数据没有 urgency 字段 → 当「无」
    priority: core.normalizeLevel(t.priority),
    urgency: core.normalizeLevel(t.urgency),
    // 属于哪个任务组（null = 不在任何组里）
    groupId: t.groupId == null ? null : t.groupId,
    done: !!t.done,
    // 老数据没有 createdAt：id 本身就是 Date.now() 生成的，可直接复用
    createdAt: t.createdAt || (isFinite(Number(t.id)) && Number(t.id) > 1e12 ? Number(t.id) : 0),
  }))
}

function saveTodos(todos) {
  writeList(TODOS_KEY, todos)
}

/* ── 任务组（把多个任务装进一个"文件夹"）──
 * 任务组本身只存 id / name / createdAt；"谁属于这个组"记在**任务**的 groupId 上，
 * 这样清单、回收站、筛选、排序的数据结构都不用动，也不会出现嵌套结构。 */

function loadGroups() {
  return readList(GROUPS_KEY).map((g) => ({
    id: g.id,
    name: String(g.name == null ? '' : g.name),
    createdAt: typeof g.createdAt === 'number' ? g.createdAt : 0,
  }))
}

function saveGroups(list) {
  writeList(GROUPS_KEY, list)
}

/* 把一批任务放进某个组。返回实际改动的条数 */
function addTasksToGroup(groupId, taskIds) {
  const wanted = {}
  ;(taskIds || []).forEach((id) => {
    if (id != null) wanted[String(id)] = true
  })
  if (!Object.keys(wanted).length) return 0
  const todos = loadTodos()
  let changed = 0
  todos.forEach((t) => {
    if (!wanted[String(t.id)]) return
    t.groupId = groupId
    changed += 1
  })
  if (changed) saveTodos(todos)
  return changed
}

/* 建一个任务组并把这批任务放进去（合并就是走这里）。返回新建的组 */
function createGroup(name, taskIds) {
  const now = Date.now()
  const group = { id: now, name: String(name == null ? '' : name), createdAt: now }
  // 新组放最前面，和任务的 LIFO 一致
  saveGroups([group].concat(loadGroups()))
  addTasksToGroup(group.id, taskIds)
  return group
}

/* 解散任务组：组内任务**回到清单**（不删任务），然后删掉这个组。
 * 返回 { name, count }，方便上层提示"解散了 xx，N 个任务回到清单"。 */
function dissolveGroup(groupId) {
  const key = String(groupId)
  const groups = loadGroups()
  const target = groups.find((g) => String(g.id) === key)
  const todos = loadTodos()
  let count = 0
  todos.forEach((t) => {
    if (String(t.groupId) === key) {
      t.groupId = null
      count += 1
    }
  })
  if (count) saveTodos(todos)
  if (target) saveGroups(groups.filter((g) => String(g.id) !== key))
  return { name: target ? target.name : '', count }
}

// 某个组里的任务（按清单顺序；组不存在就返回空数组）
function loadGroupTodos(groupId) {
  const key = String(groupId)
  return loadTodos().filter((t) => String(t.groupId) === key)
}

// 某个组的信息（找不到返回 null）
function findGroup(groupId) {
  const key = String(groupId)
  return loadGroups().find((g) => String(g.id) === key) || null
}

/* ── 回收站（任务与自定义色共用） ── */

function loadHistory() {
  return readList(HISTORY_KEY).map((t) => ({
    ...t,
    priority: core.normalizeLevel(t.priority),
    urgency: core.normalizeLevel(t.urgency),
    // 记住它原来属于哪个组：从回收站恢复时还能回到组里（组没了就当未分组，见 core.buildListRows）
    groupId: t.groupId == null ? null : t.groupId,
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
    // 进回收站时两个等级都要透传，否则恢复回来会丢
    priority: core.normalizeLevel(t.priority),
    urgency: core.normalizeLevel(t.urgency),
    // 原来在哪个组也记着，恢复时能回组里
    groupId: t.groupId == null ? null : t.groupId,
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
    // 颜色条目没有等级，统一记「无」（回收站里它显示成色块，不显示圆和沙漏）
    priority: 'none',
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
    // 颜色条目没有等级，统一记「无」（回收站里它显示成色块，不显示圆和沙漏）
    priority: 'none',
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

/* ── 等级（轻重 / 缓急，各自跨启动记住上次手选值） ── */

// 「轻重」沿用原来的 todo-priority 键（老数据不用迁移）；「缓急」是新键
function loadLevel(key) {
  try {
    return core.normalizeLevel(wx.getStorageSync(key))
  } catch (e) {
    return core.DEFAULT_LEVEL
  }
}

function saveLevel(key, value) {
  try {
    wx.setStorageSync(key, core.normalizeLevel(value))
  } catch (e) {}
}

function loadPriority() {
  return loadLevel(PRIORITY_KEY)
}

function savePriority(value) {
  saveLevel(PRIORITY_KEY, value)
}

function loadUrgency() {
  return loadLevel(URGENCY_KEY)
}

function saveUrgency(value) {
  saveLevel(URGENCY_KEY, value)
}

/* ── 音效开关 + 音量/频率 ── */

const SOUND_TYPES = [
  { key: 'add', label: '添加任务' },
  { key: 'priority', label: '切换等级' },
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
  URGENCY_KEY,
  COLORS_KEY,
  MAX_HISTORY,
  MAX_CUSTOM_COLORS,
  SOUND_TYPES,
  SOUND_DEFAULTS,
  HISTORY_TITLES,
  loadTodos,
  saveTodos,
  // 任务组
  loadGroups,
  saveGroups,
  addTasksToGroup,
  createGroup,
  dissolveGroup,
  loadGroupTodos,
  findGroup,
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
  loadUrgency,
  saveUrgency,
  loadLevel,
  saveLevel,
  loadSoundSettings,
  saveSoundSettings,
}
