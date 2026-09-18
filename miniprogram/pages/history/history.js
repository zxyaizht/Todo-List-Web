const core = require('../../utils/core')
const store = require('../../utils/storage')
const sound = require('../../utils/sound')
const perf = require('../../utils/perf')
const pagedit = require('../../utils/pagedit')
const undo = require('../../utils/undo')

const app = getApp()

// 回收站的视图状态与主列表各自独立
const view = { search: '', filter: 'all', sort: core.DEFAULT_SORT, priority: 'all', page: 1 }

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

// 只给要显示的条目做高亮分段
function decorate(rec, indices) {
  const isColor = rec.kind === 'color'
  return {
    id: rec.id,
    text: rec.text,
    isColor,
    done: !!rec.done,
    priority: rec.priority,
    priorityLabel: core.PRIORITY_LABELS[rec.priority] || '中',
    // 补一个下标当 wx:key（片段内容可能重复，不能用内容做 key）
    segments: core.highlightSegments(rec.text, indices).map((s, i) => ({ v: s.v, hit: s.hit, i })),
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
    // 页码跳转弹窗（自绘：平台的 showModal 会自动弹键盘）
    pageDialog: false,
    pageInput: '',
    pageTotal: 1,
    visibleCount: 0,
    totalPages: 1,
    page: 1,
    hint: '',
    hintNoMatch: false,
    emptyIcon: '🗑️',
    emptyTitle: '回收站是空的',
    emptyDesc: '删除任务后，它们会先放到这里，可随时恢复',
  },

  // 数据在 onLoad 里就准备好：navigateTo 每次都会新建页面实例，
  // 这样第一次绘制就是完整内容，不会出现"先空白、再填充"的延迟感。
  onLoad() {
    perf.mark('history onLoad 开始')
    this.setData({ themeStyle: app.globalData.themeStyle })
    this.refresh()
    perf.mark('history 数据就绪')
  },

  onReady() {
    perf.finish('历史记录')
    // 页面切换过程中设导航栏可能被忽略，渲染完成后再补一次
    app.syncNavigationBar()
  },

  // 导航栏（含刘海/状态栏）只作用于当前页面：切到这个页面要重新跟随一次主题，
  // 否则会显示 app.json 里的静态配色（用户报「刘海颜色有时候丢失跟随」）
  onShow() {
    app.syncNavigationBar()
  },

  refresh() {
    const history = store.loadHistory()
    // 计数用**全部记录**，不随优先级筛选变化：恢复 / 清空这些按钮的作用范围是整个回收站
    const completed = history.filter((t) => t.done).length
    // 一次拿到过滤结果 + 页码 + 当前页条目（分段只算当前页这几条）
    const pageInfo = core.getPageItems(history, view)
    const visible = pageInfo.visible
    view.page = pageInfo.page
    const pageItems = pageInfo.pageItems
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
      items: pageItems.map((x) => decorate(x.todo, x.indices)),
      total: history.length,
      completed,
      incomplete: history.length - completed,
      visibleCount: visible.length,
      totalPages: pageInfo.totalPages,
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
    undo.push()
    this.restoreItems([rec])
    store.saveHistory(history.filter((t) => String(t.id) !== String(id)))
    sound.play('add')
    this.refresh()
  },

  // 单条彻底删除不弹确认框（与网页版一致），批量清空才需要确认
  purgeOne(e) {
    const id = e.currentTarget.dataset.id
    const history = store.loadHistory()
    undo.push()
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
    undo.push()
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
        undo.push()
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

  // 这里原有 completeClear（「完成所有并清空」）：回收站里本来就是永久删除，
  // 再"先标记为已完成再删"没有任何区别，效果与「全部清空」完全重复（当初的实现
  // 也只是 purgeByFilter(() => true)），已按用户要求连同按钮一起去掉。

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

  /* 点页码 → 弹出跳页弹窗（自绘，输入框**不自动聚焦**，用户点它才弹键盘）。
   * 规则（越界收敛、认不出保持原页，与网页版一致）都在 utils/pagedit.js 里。 */
  editPage() {
    pagedit.openPageDialog(this, PAGE_OPTS)
  },

  onPageDialogInput(e) {
    pagedit.inputPageDialog(this, e)
  },

  closePageDialog() {
    pagedit.closePageDialog(this)
  },

  confirmPageDialog() {
    pagedit.confirmPageDialog(this, PAGE_OPTS)
  },
})
