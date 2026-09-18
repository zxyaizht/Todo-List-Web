const core = require('../../utils/core')
const store = require('../../utils/storage')
const sound = require('../../utils/sound')

const app = getApp()

// 回收站的视图状态与主列表各自独立
const view = { search: '', filter: 'all', sort: core.DEFAULT_SORT, priority: 'all', page: 1 }

function decorate(rec, segments) {
  const isColor = rec.kind === 'color'
  const segs = segments || [{ v: rec.text, hit: false }]
  return {
    id: rec.id,
    text: rec.text,
    isColor,
    done: !!rec.done,
    priority: rec.priority,
    priorityLabel: core.PRIORITY_LABELS[rec.priority] || '中',
    // 补一个下标当 wx:key（片段内容可能重复，不能用内容做 key）
    segments: segs.map((s, i) => ({ v: s.v, hit: s.hit, i })),
    dateText: core.formatDeletedAt(rec.deletedAt),
    kindLabel: isColor ? '自定义色' : '',
  }
}

Page({
  data: {
    themeStyle: '',
    search: '',
    filter: 'all',
    priorityFilter: 'all',
    priorityFilterOrder: core.PRIORITY_FILTER_ORDER,
    priorityFilterLabels: core.PRIORITY_FILTER_LABELS,
    sortLabel: '排序',
    items: [],
    total: 0,
    completed: 0,
    incomplete: 0,
    visibleCount: 0,
    totalPages: 1,
    page: 1,
    hint: '',
    hintNoMatch: false,
    emptyIcon: '🗑️',
    emptyTitle: '回收站是空的',
    emptyDesc: '删除任务后，它们会先放到这里，可随时恢复',
  },

  onShow() {
    this.setData({ themeStyle: app.globalData.themeStyle })
    this.refresh()
  },

  onUnload() {
    sound.release()
  },

  refresh() {
    const history = store.loadHistory()
    const byPriority = core.getFilteredItems(history, 'all', view.priority)
    const completed = byPriority.filter((t) => t.done).length
    const visible = core.getVisibleItems(history, view)
    const totalPages = core.getTotalPages(visible.length)
    view.page = core.clampPage(view.page, totalPages)

    const start = (view.page - 1) * core.PAGE_SIZE
    const pageItems = visible.slice(start, start + core.PAGE_SIZE)
    const scopeCount = core.getFilteredItems(history, view.filter, view.priority).length

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
      items: pageItems.map((x) => decorate(x.todo, x.segments)),
      total: history.length,
      completed,
      incomplete: byPriority.length - completed,
      visibleCount: visible.length,
      totalPages,
      page: view.page,
      search: view.search,
      filter: view.filter,
      priorityFilter: view.priority,
      sortLabel: core.SORT_SHORT[view.sort] || '排序',
      hint,
      hintNoMatch,
    })
  },

  /* ── 单条：恢复 / 彻底删除 ── */

  restoreOne(e) {
    const id = e.currentTarget.dataset.id
    const history = store.loadHistory()
    const rec = history.find((t) => String(t.id) === String(id))
    if (!rec) return
    this.restoreItems([rec])
    store.saveHistory(history.filter((t) => String(t.id) !== String(id)))
    sound.play('add')
    this.refresh()
  },

  // 单条彻底删除不弹确认框（与网页版一致），批量清空才需要确认
  purgeOne(e) {
    const id = e.currentTarget.dataset.id
    const history = store.loadHistory()
    store.saveHistory(history.filter((t) => String(t.id) !== String(id)))
    sound.play('delete')
    this.refresh()
  },

  /* ── 批量恢复 ── */

  restoreItems(items) {
    const colors = []
    const tasks = []
    items.forEach((rec) => {
      if (rec.kind === 'color') colors.push(rec.text)
      else tasks.push(rec)
    })
    if (colors.length) colors.forEach((hex) => store.restoreCustomColor(hex))
    if (tasks.length) {
      const todos = store.loadTodos()
      // 与网页版一致：恢复的任务插到列表最前面
      tasks.slice().reverse().forEach((rec) => {
        todos.unshift({
          id: rec.id,
          text: rec.text,
          done: rec.done,
          priority: rec.priority,
          createdAt: rec.createdAt,
        })
      })
      store.saveTodos(todos)
    }
  },

  restoreByFilter(predicate) {
    const history = store.loadHistory()
    const picked = history.filter(predicate)
    if (!picked.length) return
    this.restoreItems(picked)
    store.saveHistory(history.filter((t) => !predicate(t)))
    sound.play('add')
    this.refresh()
  },

  restoreDone() {
    this.restoreByFilter((t) => !!t.done)
  },

  restoreIncomplete() {
    this.restoreByFilter((t) => !t.done)
  },

  restoreAll() {
    this.restoreByFilter(() => true)
  },

  /* ── 批量清空（回收站里就是永久删除） ── */

  purgeByFilter(predicate, title, content) {
    const history = store.loadHistory()
    const picked = history.filter(predicate)
    if (!picked.length) return
    wx.showModal({
      title,
      content,
      confirmText: '永久删除',
      success: (res) => {
        if (!res.confirm) return
        store.saveHistory(history.filter((t) => !predicate(t)))
        sound.play('clearAll')
        this.refresh()
      },
    })
  },

  clearDone() {
    this.purgeByFilter((t) => !!t.done, '确认清空已完成', '将从回收站永久删除已完成的记录，无法恢复。')
  },

  clearIncomplete() {
    this.purgeByFilter((t) => !t.done, '确认清空未完成', '将从回收站永久删除未完成的记录，无法恢复。')
  },

  clearAll() {
    this.purgeByFilter(() => true, '确认清空历史记录', '这将永久删除回收站中的全部记录，无法恢复。')
  },

  completeClear() {
    this.purgeByFilter(() => true, '确认完成所有并清空', '回收站里的记录会先标记为已完成，再被永久删除，无法恢复。')
  },

  /* ── 筛选 / 排序 / 搜索 / 分页 ── */

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
})
