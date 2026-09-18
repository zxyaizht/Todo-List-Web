const core = require('../../utils/core')
const store = require('../../utils/storage')
const sound = require('../../utils/sound')
const perf = require('../../utils/perf')

const app = getApp()

// 视图状态（与网页版一致：筛选/排序/优先级筛选都只存在内存，重启回到默认）
const view = { search: '', filter: 'all', sort: core.DEFAULT_SORT, priority: 'all', page: 1 }

let selectedPriority = 'medium'

// 只给要显示的条目做高亮分段（原来是对全部可见条目都算一遍，纯浪费）
function decorate(item, indices) {
  return {
    id: item.id,
    text: item.text,
    done: !!item.done,
    priority: item.priority,
    priorityLabel: core.PRIORITY_LABELS[item.priority] || '中',
    // 补一个下标当 wx:key（片段内容可能重复，不能用内容做 key）
    segments: core.highlightSegments(item.text, indices).map((s, i) => ({ v: s.v, hit: s.hit, i })),
    dateText: core.formatCreatedAt(item.createdAt),
  }
}

Page({
  data: {
    themeStyle: '',
    inputValue: '',
    // 绑定到输入框的 focus：失焦时置 false，添加任务后按需置 true 让它重新获得光标
    inputFocus: false,
    priority: 'medium',
    priorityOrder: core.PRIORITY_ORDER,
    priorityLabels: core.PRIORITY_LABELS,
    search: '',
    filter: 'all',
    priorityFilter: 'all',
    priorityFilterOrder: core.PRIORITY_FILTER_ORDER,
    priorityFilterLabels: core.PRIORITY_FILTER_LABELS,
    sortLabel: '排序',
    sortShort: core.SORT_SHORT,
    items: [],
    total: 0,
    completed: 0,
    incomplete: 0,
    visibleCount: 0,
    totalPages: 1,
    page: 1,
    historyCount: 0,
    hint: '',
    hintNoMatch: false,
    emptyTitle: '',
    emptyDesc: '',
    emptyIcon: '',
  },

  // 首屏在 onLoad 里就渲染好，避免启动后"先空白再填充"
  onLoad() {
    perf.mark('index onLoad 开始')
    selectedPriority = store.loadPriority()
    this.setData({ priority: selectedPriority, themeStyle: app.globalData.themeStyle })
    this.refresh()
    this.loaded = true
    perf.mark('index 数据就绪')
  },

  onReady() {
    perf.finish('主列表首屏')
  },

  // onShow 仍要刷新：从设置改完主题、或从回收站恢复任务回来，数据都可能变了。
  // 首次进入时 onLoad 已经渲染过，跳过以免重复做一遍。
  onShow() {
    if (this.loaded) {
      this.setData({ themeStyle: app.globalData.themeStyle })
      this.refresh()
    }
  },

  /* ── 数据刷新 ── */

  refresh() {
    const todos = store.loadTodos()
    const filteredByPriority = core.getFilteredItems(todos, 'all', view.priority)
    const completed = filteredByPriority.filter((t) => t.done).length
    // 一次拿到过滤结果 + 页码 + 当前页条目（分段只算当前页这几条）
    const pageInfo = core.getPageItems(todos, view)
    const visible = pageInfo.visible
    view.page = pageInfo.page
    const pageItems = pageInfo.pageItems
    const scopeCount = core.getFilteredItems(todos, view.filter, view.priority).length

    // 空态文案：优先提示"没搜到"，其次按筛选说明
    let emptyIcon = '🎉'
    let emptyTitle = '清单空空如也'
    let emptyDesc = '添加第一个任务，开启高效一天吧！'
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
        emptyDesc = '所有任务都已清空，休息一下吧！'
      }
    }

    let hint = ''
    let hintNoMatch = false
    if (view.search.trim() && scopeCount > 0) {
      const scoped = view.filter !== 'all' || view.priority !== 'all'
      const prefix = scoped ? '当前筛选范围内 ' : ''
      if (visible.length > 0) hint = `${prefix}找到 ${visible.length} 项匹配（共 ${scopeCount} 项）`
      else {
        hint = `${prefix}没有找到匹配的任务`
        hintNoMatch = true
      }
    }

    this.setData({
      items: pageItems.map((x) => decorate(x.todo, x.indices)),
      total: todos.length,
      completed,
      incomplete: filteredByPriority.length - completed,
      visibleCount: visible.length,
      totalPages: pageInfo.totalPages,
      page: view.page,
      historyCount: store.countHistory(),
      search: view.search,
      filter: view.filter,
      priorityFilter: view.priority,
      sortLabel: core.SORT_SHORT[view.sort] || '排序',
      hint,
      hintNoMatch,
      emptyIcon,
      emptyTitle,
      emptyDesc,
    })
  },

  /* ── 新增任务 ── */

  // 输入过程中不 setData：每敲一个字都重渲染会拖慢输入、还容易让光标跳动。
  // 值先存在页面属性上，等提交时再读。
  onInput(e) {
    this.inputText = e.detail.value
  },

  addTodo(e) {
    const text = String(this.inputText || '').trim()
    if (!text) return
    // 回车（bindconfirm）和点「添加」都会走这里，用 detail.value 区分来源
    const fromKeyboard = !!(e && e.detail && typeof e.detail.value === 'string')
    const hadFocus = this.data.inputFocus

    const todos = store.loadTodos()
    const now = Date.now()
    // LIFO：新任务插到数组头部，显示在最上方
    todos.unshift({ id: now, text, done: false, priority: selectedPriority, createdAt: now })
    store.saveTodos(todos)
    // 新任务一定是未完成：若正筛选「已完成」就切回全部，否则用户以为没加成功
    if (view.filter === 'done') view.filter = 'all'
    // 同理，优先级筛选若会挡住它，也一并取消
    if (view.priority !== 'all' && view.priority !== selectedPriority) view.priority = 'all'
    view.page = 1
    this.inputText = ''
    this.setData({ inputValue: '' })
    sound.play('add')
    this.refresh()

    // 与网页版一致：加完不让光标跑掉，可以一直「打字 + 回车」连续添加。
    // 只在本来就处于输入状态时才保持焦点，避免点按钮时凭空弹出键盘。
    if (fromKeyboard || hadFocus) this.keepInputFocus()
  },

  onInputBlur() {
    this.setData({ inputFocus: false })
  },

  // focus 属性只在「值变化」时才生效，所以已经失焦时才去置 true
  keepInputFocus() {
    // 延迟一点断言：不同平台在回车后「失焦」的时机不一样（有的在 confirm 之后）
    setTimeout(() => {
      if (!this.data.inputFocus) this.setData({ inputFocus: true })
    }, 50)
  },

  pickPriority(e) {
    const value = e.currentTarget.dataset.priority
    if (value === selectedPriority) return
    selectedPriority = value
    store.savePriority(value)
    this.setData({ priority: value })
    sound.play('priority')
  },

  /* ── 任务操作 ── */

  toggleTodo(e) {
    const id = e.currentTarget.dataset.id
    const todos = store.loadTodos()
    const todo = todos.find((t) => String(t.id) === String(id))
    if (!todo) return
    todo.done = !todo.done
    store.saveTodos(todos)
    this.refresh()
  },

  // 单个删除不弹确认框（与网页版一致）：任务先进回收站，那里就是后悔药
  deleteTodo(e) {
    const id = e.currentTarget.dataset.id
    const todos = store.loadTodos()
    const todo = todos.find((t) => String(t.id) === String(id))
    if (!todo) return
    store.saveTodos(todos.filter((t) => String(t.id) !== String(id)))
    store.pushToHistory([todo])
    sound.play('delete')
    this.refresh()
  },

  editTodo(e) {
    const id = e.currentTarget.dataset.id
    const todos = store.loadTodos()
    const todo = todos.find((t) => String(t.id) === String(id))
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
        todo.text = text
        store.saveTodos(todos)
        this.refresh()
      },
    })
  },

  /* ── 筛选 / 排序 / 优先级筛选 ── */

  setFilter(e) {
    const value = e.currentTarget.dataset.filter
    if (value === view.filter) return
    view.filter = value
    view.page = 1
    this.refresh()
  },

  openSort() {
    wx.showActionSheet({
      itemList: core.SORT_ORDER.map((k) => core.SORT_LABELS[k]),
      success: (res) => {
        view.sort = core.SORT_ORDER[res.tapIndex]
        view.page = 1
        this.refresh()
      },
      fail: () => {},
    })
  },

  setPriorityFilter(e) {
    const value = e.currentTarget.dataset.priority
    if (value === view.priority) return
    view.priority = value
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

  /* ── 批量操作 ── */

  completeAll() {
    const todos = store.loadTodos()
    let changed = false
    todos.forEach((t) => {
      if (!t.done) {
        t.done = true
        changed = true
      }
    })
    if (changed) {
      store.saveTodos(todos)
      sound.play('add')
    }
    this.refresh()
  },

  clearDone() {
    if (this.data.completed === 0) return
    wx.showModal({
      title: '确认清空已完成',
      content: '已完成的任务将被移入历史记录，可随时恢复。',
      confirmText: '清空',
      success: (res) => {
        if (!res.confirm) return
        const todos = store.loadTodos()
        store.pushToHistory(todos.filter((t) => t.done))
        store.saveTodos(todos.filter((t) => !t.done))
        sound.play('clearDone')
        this.refresh()
      },
    })
  },

  clearIncomplete() {
    if (this.data.incomplete === 0) return
    wx.showModal({
      title: '确认清空未完成',
      content: '未完成的任务将被移入历史记录，可随时恢复。',
      confirmText: '清空',
      success: (res) => {
        if (!res.confirm) return
        const todos = store.loadTodos()
        store.pushToHistory(todos.filter((t) => !t.done))
        store.saveTodos(todos.filter((t) => t.done))
        sound.play('clearDone')
        this.refresh()
      },
    })
  },

  clearAll() {
    if (this.data.total === 0) return
    wx.showModal({
      title: '确认全部清空',
      content: '所有任务（含未完成）将被移入历史记录，可随时恢复。',
      confirmText: '清空',
      success: (res) => {
        if (!res.confirm) return
        const todos = store.loadTodos()
        store.pushToHistory(todos)
        store.saveTodos([])
        sound.play('clearAll')
        this.refresh()
      },
    })
  },

  completeClear() {
    if (this.data.total === 0) return
    wx.showModal({
      title: '确认完成所有并清空',
      content: '全部任务会先标记为已完成，再一起移入历史记录，可随时恢复。',
      confirmText: '确定',
      success: (res) => {
        if (!res.confirm) return
        const todos = store.loadTodos()
        todos.forEach((t) => { t.done = true })
        store.pushToHistory(todos)
        store.saveTodos([])
        sound.play('clearAll')
        this.refresh()
      },
    })
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

  /* ── 跳转 ── */

  goHistory() {
    perf.tap('打开历史记录')
    wx.navigateTo({ url: '/pages/history/history' })
  },

  goSettings() {
    perf.tap('打开设置')
    wx.navigateTo({ url: '/pages/settings/settings' })
  },
})
