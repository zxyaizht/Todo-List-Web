/* 任务组子页面
 *
 * 结构与主列表几乎一致，但有几处关键差别：
 *   · 只显示属于这个组的任务（组内任务不在主列表里单独出现）；
 *   · 顶部只剩「轻重 / 缓急」，没有齿轮（设置）、没有历史记录；底部只有清空已完成 / 清空未完成，
 *     没有合并、清空全部、完成所有并清空；
 *   · 输入框是「还要做什么？」—— 新任务直接落进这个组；
 *   · 导航栏标题 = 任务组名，返回箭头用平台默认的（与设置页同一套）。
 *
 * ⚠️ **最重要的正确性约束**：所有增删改都必须落在**整份清单**上 ——
 * 先把 loadTodos() 整份读出来，只对属于本组的任务动手，再整份写回。
 * 绝对不能拿"组内任务"的子集直接 saveTodos，那会把其它任务全部冲掉。 */
const core = require('../../utils/core')
const store = require('../../utils/storage')
const sound = require('../../utils/sound')
const perf = require('../../utils/perf')
const pagedit = require('../../utils/pagedit')
const undo = require('../../utils/undo')

const app = getApp()

// 视图状态（与主列表各自独立；都不持久化）
const view = { search: '', filter: 'all', sort: core.DEFAULT_SORT, priority: 'all', urgency: 'all', page: 1 }

// 页码跳转弹窗要用的三个回调（弹窗与解析规则都在 utils/pagedit.js）
const PAGE_OPTS = {
  getTotal() { return this.data.totalPages },
  getCurrent() { return view.page },
  apply(next) {
    if (next === view.page) return
    view.page = next
    this.refresh()
  },
}

// 新建任务时用的等级：和主页面共用同一份"上次选择"（存在 storage 里）
let selectedWeight = 'none'
let selectedUrgency = 'none'

function decorate(item, indices) {
  return {
    id: item.id,
    text: item.text,
    done: !!item.done,
    priority: core.normalizeLevel(item.priority),
    weightLabel: core.WEIGHT_LABELS[core.normalizeLevel(item.priority)],
    urgency: core.normalizeLevel(item.urgency),
    segments: core.highlightSegments(item.text, indices).map((s, i) => ({ v: s.v, hit: s.hit, i })),
    dateText: core.formatCreatedAt(item.createdAt),
  }
}

Page({
  data: {
    themeStyle: '',
    groupName: '',
    inputValue: '',
    inputFocus: false,
    // 新建任务的两个等级（点按钮循环切换）
    priority: 'none',
    weightLabel: '无',
    urgency: 'none',
    levelOrder: core.LEVELS,
    weightLabels: core.WEIGHT_LABELS,
    urgencyLabels: core.URGENCY_LABELS,
    search: '',
    filter: 'all',
    priorityFilter: 'all',
    urgencyFilter: 'all',
    levelFilterOrder: core.LEVEL_FILTER_ORDER,
    weightFilterLabels: core.WEIGHT_FILTER_LABELS,
    urgencyFilterLabels: core.URGENCY_FILTER_LABELS,
    sortLabel: '排序',
    sort: core.DEFAULT_SORT,
    sortOrder: core.SORT_ORDER,
    sortLabels: core.SORT_LABELS,
    openMenu: '',
    items: [],
    total: 0,
    completed: 0,
    incomplete: 0,
    completeAllLabel: '✅ 完成所有',
    canUndo: false,
    canRedo: false,
    // 页码跳转弹窗
    pageDialog: false,
    pageInput: '',
    pageTotal: 1,
    pageKeyHeight: 0,
    // 改等级弹窗（点任务上的圆形或沙漏）
    levelDialog: false,
    levelPick: { priority: 'none', urgency: 'none' },
    visibleCount: 0,
    totalPages: 1,
    page: 1,
    hint: '',
    hintNoMatch: false,
    emptyTitle: '',
    emptyDesc: '',
    emptyIcon: '',
  },

  onLoad(options) {
    perf.mark('group onLoad 开始')
    const id = options && options.id
    const group = id == null ? null : store.findGroup(id)
    if (!group) {
      // 组不存在（被删了 / 参数不对）：提示一下直接退回，别停在空白页
      wx.showToast({ title: '任务组不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    // 用存储里的真实 id（类型一致），后面比较一律 String() 兜底
    this.groupId = group.id
    this.groupName = group.name
    selectedWeight = store.loadPriority()
    selectedUrgency = store.loadUrgency()
    wx.setNavigationBarTitle({ title: group.name })
    this.setData({
      groupName: group.name,
      priority: selectedWeight,
      weightLabel: core.WEIGHT_LABELS[selectedWeight],
      urgency: selectedUrgency,
      themeStyle: app.globalData.themeStyle,
    })
    this.refresh()
    perf.mark('group 数据就绪')
  },

  onReady() {
    perf.finish('任务组')
    app.syncNavigationBar()
    // loaded 在 onReady 里才置位：onLoad 已经渲染好了，第一次 onShow 必须跳过
    // （onShow 总在 onLoad 之后触发，在 onLoad 里置位等于没拦）
    this.loaded = true
  },

  onShow() {
    app.syncNavigationBar()
    // 从后台回来、或从别处回来时重算一次（组名可能没变，但任务可能被改过）
    if (this.loaded && this.groupId != null) this.refresh()
  },

  refresh() {
    if (this.groupId == null) return
    // 只取本组的任务；但所有写操作都回到整份清单上（见文件头注释）
    const todos = store.loadGroupTodos(this.groupId)
    // 计数按**当前等级筛选范围**算（与主列表同一套规则，见 core.countByLevelScope）
    const counts = core.countByLevelScope(todos, view.priority, view.urgency)
    const completed = counts.completed
    const incomplete = counts.incomplete
    const pageInfo = core.getPageItems(todos, view)
    const visible = pageInfo.visible
    view.page = pageInfo.page
    const scopeCount = core.getFilteredItems(todos, view.filter, view.priority, view.urgency).length

    let emptyIcon = '📂'
    let emptyTitle = '这个任务组还是空的'
    let emptyDesc = '在上面输入框加任务，或用主列表的「合并」把任务并进来'
    if (todos.length > 0) {
      if (view.search.trim()) {
        emptyIcon = '🔍'
        emptyTitle = '没有找到匹配的任务'
        emptyDesc = '试试别的关键词，或清空搜索框看全部任务'
      } else if (view.filter === 'done') {
        emptyIcon = '📋'
        emptyTitle = '还没有已完成的任务'
        emptyDesc = '完成任意任务后，它会出现在这里'
      } else if (view.filter === 'active') {
        emptyIcon = '🎉'
        emptyTitle = '没有未完成的任务'
        emptyDesc = '这个组里的任务都完成了，休息一下吧！'
      }
    }

    let hint = ''
    let hintNoMatch = false
    if (view.search.trim() && scopeCount > 0) {
      const scoped = view.filter !== 'all' || view.priority !== 'all' || view.urgency !== 'all'
      const prefix = scoped ? '当前筛选范围内 ' : ''
      if (visible.length > 0) hint = `${prefix}找到 ${visible.length} 项匹配（共 ${scopeCount} 项）`
      else {
        hint = `${prefix}没有找到匹配的任务`
        hintNoMatch = true
      }
    }

    this.setData({
      items: pageInfo.pageItems.map((x) => decorate(x.todo, x.indices)),
      groupName: this.groupName,
      total: todos.length,
      completed,
      incomplete,
      completeAllLabel: incomplete > 0 ? `✅ 完成所有 (${incomplete})` : '↩️ 取消所有',
      canUndo: undo.canUndo(),
      canRedo: undo.canRedo(),
      visibleCount: visible.length,
      totalPages: pageInfo.totalPages,
      page: view.page,
      search: view.search,
      filter: view.filter,
      priorityFilter: view.priority,
      urgencyFilter: view.urgency,
      sortLabel: core.SORT_SHORT[view.sort] || '排序',
      sort: view.sort,
      hint,
      hintNoMatch,
      emptyIcon,
      emptyTitle,
      emptyDesc,
    })
  },

  /* ── 新增任务 ── */

  // 输入过程中不 setData（每敲一个字都重渲染会让光标跳），值先存在页面属性上
  onInput(e) {
    const raw = String(e.detail.value == null ? '' : e.detail.value)
    if (raw.indexOf('\n') !== -1) {
      this.inputText = raw.replace(/\s*\n\s*/g, ' ')
      this.addTodo(null, true)
      return
    }
    this.inputText = raw
  },

  addTodo(e, keepGoing) {
    if (this.groupId == null) return
    const text = String(this.inputText || '').replace(/\s*\n\s*/g, ' ').trim()
    if (!text) return
    const fromKeyboard = !!(e && e.detail && typeof e.detail.value === 'string')
    const hadFocus = this.data.inputFocus

    undo.push() // 记一步撤回（必须在改动之前）
    const todos = store.loadTodos()
    const now = Date.now()
    todos.unshift({
      id: now,
      text,
      done: false,
      priority: selectedWeight,
      urgency: selectedUrgency,
      groupId: this.groupId, // 直接落进这个组
      createdAt: now,
    })
    store.saveTodos(todos)
    if (view.filter === 'done') view.filter = 'all'
    if (view.priority !== 'all' && view.priority !== selectedWeight) view.priority = 'all'
    if (view.urgency !== 'all' && view.urgency !== selectedUrgency) view.urgency = 'all'
    view.page = 1
    this.inputText = ''
    this.setData({ inputValue: '' })
    sound.play('add')
    this.refresh()

    if (fromKeyboard || hadFocus || keepGoing) this.keepInputFocus()
  },

  onInputBlur() {
    this.setData({ inputFocus: false })
  },

  keepInputFocus() {
    // 延迟一点断言：不同平台在回车后"失焦"的时机不一样
    setTimeout(() => {
      if (!this.data.inputFocus) this.setData({ inputFocus: true })
    }, 50)
  },

  /* 新建任务的两个等级：点一下切一级，并把选择记住 */
  cycleWeight() {
    selectedWeight = core.nextLevel(selectedWeight)
    store.savePriority(selectedWeight)
    this.setData({ priority: selectedWeight, weightLabel: core.WEIGHT_LABELS[selectedWeight] })
    sound.play('priority')
  },

  cycleUrgency() {
    selectedUrgency = core.nextLevel(selectedUrgency)
    store.saveUrgency(selectedUrgency)
    this.setData({ urgency: selectedUrgency })
    sound.play('priority')
  },

  /* ── 任务操作 ── */

  toggleTodo(e) {
    const id = e.currentTarget.dataset.id
    const todos = store.loadTodos()
    const todo = todos.find((t) => String(t.id) === String(id) && String(t.groupId) === String(this.groupId))
    if (!todo) return
    undo.push()
    todo.done = !todo.done
    store.saveTodos(todos)
    this.refresh()
  },

  // 单个删除不弹确认框（与主列表一致）：任务先进回收站，那里就是后悔药。
  // groupId 会跟着进回收站，恢复时能回到这个组里。
  deleteTodo(e) {
    const id = e.currentTarget.dataset.id
    const todos = store.loadTodos()
    const todo = todos.find((t) => String(t.id) === String(id) && String(t.groupId) === String(this.groupId))
    if (!todo) return
    undo.push()
    store.saveTodos(todos.filter((t) => String(t.id) !== String(id)))
    store.pushToHistory([todo])
    sound.play('delete')
    this.refresh()
  },

  editTodo(e) {
    const id = e.currentTarget.dataset.id
    const todos = store.loadTodos()
    const todo = todos.find((t) => String(t.id) === String(id) && String(t.groupId) === String(this.groupId))
    if (!todo) return
    wx.showModal({
      title: '编辑任务',
      editable: true,
      placeholderText: '任务内容',
      content: todo.text,
      success: (res) => {
        if (!res.confirm) return
        const text = String(res.content || '').trim()
        if (!text) return
        undo.push()
        todo.text = text
        store.saveTodos(todos)
        this.refresh()
      },
    })
  },

  /* 完成所有 / 取消所有：只作用于本组**且在当前等级筛选范围内**的任务 */
  completeAll() {
    const todos = store.loadTodos()
    const mine = core.getFilteredItems(
      todos.filter((t) => String(t.groupId) === String(this.groupId)),
      'all', view.priority, view.urgency
    )
    const target = mine.some((t) => !t.done)
    if (!mine.some((t) => t.done !== target)) return
    undo.push()
    mine.forEach((t) => { t.done = target })
    store.saveTodos(todos)
    sound.play('add')
    this.refresh()
  },

  /* 清空已完成 / 未完成：只动本组**且在当前等级筛选范围内**的，移入回收站（可恢复） */
  clearDone() {
    this.clearByDone(true)
  },

  clearIncomplete() {
    this.clearByDone(false)
  },

  clearByDone(isDone) {
    const todos = store.loadTodos()
    const mine = core.getFilteredItems(
      todos.filter((t) => String(t.groupId) === String(this.groupId)),
      'all', view.priority, view.urgency
    )
    const target = mine.filter((t) => !!t.done === isDone)
    if (!target.length) return
    const scoped = core.hasLevelScope(view.priority, view.urgency)
    const prefix = scoped ? '当前筛选范围内' : '本组'
    wx.showModal({
      title: isDone ? '确认清空已完成' : '确认清空未完成',
      content: `${prefix}${isDone ? '已完成' : '未完成'}的 ${target.length} 个任务将被移入历史记录，可随时恢复。`,
      confirmText: '清空',
      success: (res) => {
        if (!res.confirm) return
        undo.push()
        const ids = {}
        target.forEach((t) => { ids[String(t.id)] = true })
        store.pushToHistory(target)
        store.saveTodos(todos.filter((t) => !ids[String(t.id)]))
        sound.play('clearDone')
        this.refresh()
      },
    })
  },

  setFilter(e) {
    const value = e.currentTarget.dataset.filter
    if (value === view.filter) return
    view.filter = value
    view.page = 1
    this.refresh()
  },

  /* ── 改等级（点任务上的圆形或沙漏） ── */

  openLevelDialog(e) {
    const id = e.currentTarget.dataset.id
    const todo = store.loadTodos().find((t) => String(t.id) === String(id) && String(t.groupId) === String(this.groupId))
    if (!todo) return
    this.levelTargetId = String(id)
    this.setData({
      levelDialog: true,
      levelPick: {
        priority: core.normalizeLevel(todo.priority),
        urgency: core.normalizeLevel(todo.urgency),
      },
    })
  },

  pickLevel(e) {
    const kind = e.currentTarget.dataset.kind
    const level = e.currentTarget.dataset.level
    if (!kind || this.data.levelPick[kind] === level) return
    this.setData({ ['levelPick.' + kind]: level })
    sound.play('priority')
  },

  closeLevelDialog() {
    this.levelTargetId = null
    this.setData({ levelDialog: false })
  },

  confirmLevelDialog() {
    const id = this.levelTargetId
    const pick = this.data.levelPick
    this.levelTargetId = null
    this.setData({ levelDialog: false })
    if (id == null || !pick) return
    const todos = store.loadTodos()
    const todo = todos.find((t) => String(t.id) === String(id) && String(t.groupId) === String(this.groupId))
    if (!todo || (todo.priority === pick.priority && todo.urgency === pick.urgency)) return
    undo.push()
    todo.priority = pick.priority
    todo.urgency = pick.urgency
    store.saveTodos(todos)
    sound.play('priority')
    this.refresh()
  },

  /* ── 撤回 / 取消撤回（与主列表共用同一个内存栈） ── */

  undoAction() {
    if (!undo.undo()) return
    this.afterTimeTravel('add')
  },

  redoAction() {
    if (!undo.redo()) return
    this.afterTimeTravel('priority')
  },

  afterTimeTravel(soundKey) {
    // 被还原的数据可能落在任何一边，切回「全部」并回第 1 页才看得见
    view.filter = 'all'
    view.page = 1
    sound.play(soundKey)
    this.refresh()
  },

  /* ── 工具栏三个下拉（排序 / 轻重 / 缓急） ── */

  toggleMenu(e) {
    const menu = e.currentTarget.dataset.menu
    if (!menu) return
    this.setData({ openMenu: this.data.openMenu === menu ? '' : menu })
  },

  closeMenu() {
    if (this.data.openMenu) this.setData({ openMenu: '' })
  },

  pickSort(e) {
    const value = e.currentTarget.dataset.sort
    this.setData({ openMenu: '' })
    if (!value || value === view.sort) return
    view.sort = value
    view.page = 1
    this.refresh()
  },

  pickLevelFilter(e) {
    const menu = e.currentTarget.dataset.menu
    const level = e.currentTarget.dataset.level
    this.setData({ openMenu: '' })
    if (!menu || !level) return
    if (menu === 'weight') {
      if (level === view.priority) return
      view.priority = level
    } else if (menu === 'urgency') {
      if (level === view.urgency) return
      view.urgency = level
    } else {
      return
    }
    view.page = 1
    sound.play('priority')
    this.refresh()
  },

  /* ── 搜索 ── */

  onSearch(e) {
    view.search = e.detail.value
    view.page = 1
    this.refresh()
  },

  clearSearch() {
    view.search = ''
    view.page = 1
    this.refresh()
  },

  /* ── 分页 ── */

  prevPage() {
    if (view.page <= 1) return
    view.page -= 1
    this.refresh()
  },

  nextPage() {
    if (view.page >= this.data.totalPages) return
    view.page += 1
    this.refresh()
  },

  /* 点页码 → 弹出跳页弹窗（自绘，输入框是数字键盘；规则见 utils/pagedit.js） */
  editPage() {
    pagedit.openPageDialog(this, PAGE_OPTS)
  },

  onPageDialogInput(e) {
    pagedit.inputPageDialog(this, e)
  },

  onPageDialogKeyboard(e) {
    pagedit.onDialogKeyboard(this, e)
  },

  closePageDialog() {
    pagedit.closePageDialog(this)
  },

  confirmPageDialog() {
    pagedit.confirmPageDialog(this, PAGE_OPTS)
  },
})
