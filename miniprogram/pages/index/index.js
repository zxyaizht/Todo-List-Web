const core = require('../../utils/core')
const store = require('../../utils/storage')
const sound = require('../../utils/sound')
const perf = require('../../utils/perf')
const pagedit = require('../../utils/pagedit')
const undo = require('../../utils/undo')

const app = getApp()

// 视图状态（与网页版一致：筛选/排序/两个等级筛选都只存在内存，重启回到默认）
// view.priority 是「轻重」、view.urgency 是「缓急」，两个筛选互不影响
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

/* 新建任务时用的等级：两个维度各自记住上次的选择（存在 storage 里，跨启动保留）。
 * 初次使用都是「无」（用户要求）。 */
let selectedWeight = 'none'
let selectedUrgency = 'none'

// 只给要显示的条目做高亮分段（原来是对全部可见条目都算一遍，纯浪费）
function decorate(item, indices) {
  return {
    id: item.id,
    text: item.text,
    done: !!item.done,
    // 轻重 = 右边的圆形（存字段仍是 priority），缓急 = 沙漏
    priority: core.normalizeLevel(item.priority),
    weightLabel: core.WEIGHT_LABELS[core.normalizeLevel(item.priority)],
    urgency: core.normalizeLevel(item.urgency),
    // 补一个下标当 wx:key（片段内容可能重复，不能用内容做 key）
    segments: core.highlightSegments(item.text, indices).map((s, i) => ({ v: s.v, hit: s.hit, i })),
    dateText: core.formatCreatedAt(item.createdAt),
  }
}

/* 列表行有两种：任务组（文件夹）和普通任务。
 * wx:key 用带前缀的 key —— 任务组和任务的 id 都是 Date.now() 生成的，理论上会撞。
 * 行样式也在这里算好（任务组的行不加 priority-xxx / done）。 */
function decorateRow(row) {
  if (row.kind === 'group') {
    return {
      kind: 'group',
      key: 'g-' + row.group.id,
      id: row.group.id,
      name: row.name,
      count: row.count,
      rowClass: 'item-group',
      segments: core.highlightSegments(row.name, row.indices).map((s, i) => ({ v: s.v, hit: s.hit, i })),
    }
  }
  const t = decorate(row.todo, row.indices)
  return Object.assign({ kind: 'todo', key: 't-' + t.id }, t, {
    rowClass: `priority-${t.priority}${t.done ? ' done' : ''}`,
  })
}

Page({
  data: {
    themeStyle: '',
    inputValue: '',
    // 绑定到输入框的 focus：失焦时置 false，添加任务后按需置 true 让它重新获得光标
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
    // 两个维度各一行筛选
    priorityFilter: 'all',
    urgencyFilter: 'all',
    levelFilterOrder: core.LEVEL_FILTER_ORDER,
    weightFilterLabels: core.WEIGHT_FILTER_LABELS,
    urgencyFilterLabels: core.URGENCY_FILTER_LABELS,
    sortLabel: '排序',
    sortShort: core.SORT_SHORT,
    // 排序下拉：当前值 + 全部选项（8 条，含缓急两个方向）
    sort: core.DEFAULT_SORT,
    sortOrder: core.SORT_ORDER,
    sortLabels: core.SORT_LABELS,
    // 当前打开的是哪一个下拉（'' / 'sort' / 'weight' / 'urgency'）
    openMenu: '',
    items: [],
    total: 0,
    completed: 0,
    incomplete: 0,
    // 「完成所有」的文案随状态变：还有没完成的 → 完成所有 (N)；全完成了 → 取消所有
    completeAllLabel: '✅ 完成所有',
    // 撤回 / 取消撤回 是否可用（决定两个箭头是否置灰）
    canUndo: false,
    canRedo: false,
    // 页码跳转弹窗（自绘：位置与键盘行为都要自己控制）
    pageDialog: false,
    pageInput: '',
    pageTotal: 1,
    // 当前键盘高度（px）：弹窗靠它把卡片顶到键盘上方
    pageKeyHeight: 0,
    // 改等级弹窗（点任务上的圆形或沙漏）：一个弹窗两行，轻重 + 缓急
    levelDialog: false,
    levelPick: { priority: 'none', urgency: 'none' },
    // 批量合并模式：这一模式下左侧勾选框表示"要不要加入新组"，不再是"完成"
    mergeMode: false,
    pickedIds: {},
    pickedCount: 0,
    // 新建任务组的命名弹窗（打开即自动聚焦，什么都不输就确定 → 用默认名）
    groupDialog: false,
    groupName: '',
    groupPlaceholder: '',
    // 拖动任务去合并：跟随手指的浮标 + 落点高亮
    dragging: false,
    dragText: '',
    dragY: 0,
    dragId: '',
    dragOverId: '',
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
    selectedWeight = store.loadPriority()
    selectedUrgency = store.loadUrgency()
    this.setData({
      priority: selectedWeight,
      weightLabel: core.WEIGHT_LABELS[selectedWeight],
      urgency: selectedUrgency,
      themeStyle: app.globalData.themeStyle,
    })
    this.refresh()
    perf.mark('index 数据就绪')
  },

  onReady() {
    perf.finish('主列表首屏')
    // 页面切换过程中设导航栏可能被忽略，渲染完成后再补一次
    app.syncNavigationBar()
    // loaded 放在这里才置位：onLoad 已经把首屏渲染好了，第一次 onShow 必须跳过。
    // （以前在 onLoad 里置位，而 onShow 总是在 onLoad 之后触发，等于根本没拦住，
    //   启动时会白跑一遍整页渲染。）
    this.loaded = true
  },

  // onShow 仍要刷新：从设置改完主题、或从回收站恢复任务回来，数据都可能变了。
  // 首次进入时 onLoad 已经渲染过，跳过以免重复做一遍。
  onShow() {
    // wx.setNavigationBarColor 只作用于当前页面，切页回来必须补一次，
    // 否则导航栏（含刘海/状态栏）会回落到 app.json 里的静态配色
    app.syncNavigationBar()
    if (this.loaded) {
      this.setData({ themeStyle: app.globalData.themeStyle })
      this.refresh()
    }
  },

  /* ── 数据刷新 ── */

  refresh() {
    const todos = store.loadTodos()
    const groups = store.loadGroups()
    /* 计数一律用**全部任务**，不随优先级筛选变化。
     * 这几个数字对应的是「清空已完成 / 清空未完成 / 完成所有 / 取消所有」这些**全局动作**：
     * 作用范围必须和数字一致，否则一旦筛了优先级就会出现
     * 「按钮写着取消所有、点下去却把别的优先级的任务也一起取消了」这种坑。
     * 网页版同样是全量计数，这里与它保持一致。 */
    const completed = todos.filter((t) => t.done).length
    const incomplete = todos.length - completed
    // 列表行 = 任务组（永远排最前）+ 未分组任务；一次拿到过滤结果 + 页码 + 当前页那几行
    const pageInfo = core.getListPage(groups, todos, view)
    const visible = pageInfo.rows
    view.page = pageInfo.page
    const scopeCount = core.getFilteredItems(todos, view.filter, view.priority, view.urgency).length

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
      const scoped = view.filter !== 'all' || view.priority !== 'all' || view.urgency !== 'all'
      const prefix = scoped ? '当前筛选范围内 ' : ''
      if (visible.length > 0) hint = `${prefix}找到 ${visible.length} 项匹配（共 ${scopeCount} 项）`
      else {
        hint = `${prefix}没有找到匹配的任务`
        hintNoMatch = true
      }
    }

    this.setData({
      items: pageInfo.pageRows.map(decorateRow),
      total: todos.length,
      completed,
      incomplete,
      completeAllLabel: incomplete > 0 ? `✅ 完成所有 (${incomplete})` : '↩️ 取消所有',
      canUndo: undo.canUndo(),
      canRedo: undo.canRedo(),
      visibleCount: visible.length,
      totalPages: pageInfo.totalPages,
      page: view.page,
      historyCount: store.countHistory(),
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

  // 输入过程中不 setData：每敲一个字都重渲染会拖慢输入、还容易让光标跳动。
  // 值先存在页面属性上，等提交时再读。
  onInput(e) {
    const raw = String(e.detail.value == null ? '' : e.detail.value)
    // 兜底：个别机型上 textarea 的回车会往内容里插一个换行，而不是触发 bindconfirm。
    // 这种情况直接当提交处理，保证「打字 + 回车」连续添加的手感不掉。
    if (raw.indexOf('\n') !== -1) {
      this.inputText = raw.replace(/\s*\n\s*/g, ' ')
      this.addTodo(null, true)
      return
    }
    this.inputText = raw
  },

  addTodo(e, keepGoing) {
    // 任务名里不允许出现换行（textarea 的换行键在个别机型上会插进来）
    const text = String(this.inputText || '').replace(/\s*\n\s*/g, ' ').trim()
    if (!text) return
    // 回车（bindconfirm）和点「添加」都会走这里，用 detail.value 区分来源
    const fromKeyboard = !!(e && e.detail && typeof e.detail.value === 'string')
    const hadFocus = this.data.inputFocus

    undo.push() // 记一步撤回（必须在改动之前）
    const todos = store.loadTodos()
    const now = Date.now()
    // LIFO：新任务插到数组头部，显示在最上方
    // LIFO：新任务插到数组头部，显示在最上方
    todos.unshift({
      id: now,
      text,
      done: false,
      priority: selectedWeight, // 轻重（左边的圆形）
      urgency: selectedUrgency, // 缓急（右边名称后的沙漏）
      createdAt: now,
    })
    store.saveTodos(todos)
    // 新任务一定是未完成：若正筛选「已完成」就切回全部，否则用户以为没加成功
    if (view.filter === 'done') view.filter = 'all'
    // 同理，两个等级筛选若会挡住它，也一并取消
    if (view.priority !== 'all' && view.priority !== selectedWeight) view.priority = 'all'
    if (view.urgency !== 'all' && view.urgency !== selectedUrgency) view.urgency = 'all'
    view.page = 1
    this.inputText = ''
    this.setData({ inputValue: '' })
    sound.play('add')
    this.refresh()

    // 与网页版一致：加完不让光标跑掉，可以一直「打字 + 回车」连续添加。
    // 只在本来就处于输入状态时才保持焦点，避免点按钮时凭空弹出键盘。
    if (fromKeyboard || hadFocus || keepGoing) this.keepInputFocus()
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

  /* 新建任务的两个等级：点一下切一级（无 → 轻 → 中 → 重 / 无 → 缓 → 中 → 急），
   * 并把这次选择记住（下次进来还是这一档）。切换只改这两个按钮本身，不整页重渲染。 */
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

  /* 改等级：点任务上的圆形（轻重）或沙漏（缓急）都打开同一个弹窗，
   * 弹窗里两行（轻重 / 缓急），改完点确定才写盘。
   * 弹窗里的选中态是**独立的一份拷贝** data.levelPick —— 绝不能借用 selectedWeight /
   * selectedUrgency（那是"新建任务用哪一档"），否则改一条任务会连带改掉下次新建的默认值。 */
  openLevelDialog(e) {
    if (this.tapBlocked()) return
    const id = e.currentTarget.dataset.id
    const todo = store.loadTodos().find((t) => String(t.id) === String(id))
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

  // data-kind 区分改的是哪一行（priority = 轻重 / urgency = 缓急）
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
    const todo = todos.find((t) => String(t.id) === String(id))
    // 两个等级都没变就什么也不做（不写盘、也不白记一步撤回）
    if (!todo || (todo.priority === pick.priority && todo.urgency === pick.urgency)) return
    undo.push()
    todo.priority = pick.priority
    todo.urgency = pick.urgency
    store.saveTodos(todos)
    sound.play('priority')
    this.refresh()
  },

  toggleTodo(e) {
    const id = e.currentTarget.dataset.id
    const todos = store.loadTodos()
    const todo = todos.find((t) => String(t.id) === String(id))
    if (!todo) return
    undo.push()
    todo.done = !todo.done
    store.saveTodos(todos)
    this.refresh()
  },

  // 单个删除不弹确认框（与网页版一致）：任务先进回收站，那里就是后悔药
  deleteTodo(e) {
    if (this.tapBlocked()) return
    const id = e.currentTarget.dataset.id
    const todos = store.loadTodos()
    const todo = todos.find((t) => String(t.id) === String(id))
    if (!todo) return
    // 删除 = 任务出栈 + 进回收站，撤回要把两处一起还原（快照里有回收站）
    undo.push()
    store.saveTodos(todos.filter((t) => String(t.id) !== String(id)))
    store.pushToHistory([todo])
    sound.play('delete')
    this.refresh()
  },

  editTodo(e) {
    if (this.tapBlocked()) return
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
        undo.push()
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

  /* ── 工具栏三个下拉（排序 / 轻重 / 缓急）──
   * 统一自绘：排序原来用 wx.showActionSheet，但它的 itemList 最多 6 项，
   * 加上「缓急」的两个排序选项就超了；两个筛选也和它长一个样，用同一套更好维护。 */

  // 点按钮开/关自己那张卡片；点别处由透明蒙层关掉
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

  // 两个等级筛选共用一个 handler，用 data-menu 区分改的是哪一个（都是视图状态、不持久化）
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

  /* ── 批量操作 ── */

  /* 一键全选 / 全不选：
   * 还有未完成的 → 全部打勾（按钮显示「完成所有 (N)」）；
   * 都已经完成 → 全部取消勾选（按钮显示「取消所有」）。
   * 文案由 refresh() 根据 incomplete 算好放进 completeAllLabel。 */
  completeAll() {
    const todos = store.loadTodos()
    const target = todos.some((t) => !t.done) // 有没完成的 → 目标是"全完成"，否则是"全取消"
    if (!todos.some((t) => t.done !== target)) return // 已经是目标状态：不动，也不记撤回
    undo.push()
    todos.forEach((t) => { t.done = target })
    store.saveTodos(todos)
    sound.play('add')
    this.refresh()
  },

  /* ── 批量合并（合并按钮 → 勾选 → 完成 → 命名） ── */

  /* 分页行最左那个按钮：普通模式是「合并」，进入合并模式后变成「完成」。
   * 进模式前先把当前视图状态（筛选/搜索/页码）记下来，点「取消」时原样还回去。 */
  mergeAction() {
    if (!this.data.mergeMode) {
      this.mergeBefore = {
        filter: view.filter,
        priority: view.priority,
        urgency: view.urgency,
        search: view.search,
        page: view.page,
      }
      this.picked = {}
      this.setData({ mergeMode: true, pickedIds: {}, pickedCount: 0 })
      return
    }
    const ids = Object.keys(this.picked || {})
    if (ids.length < 2) {
      wx.showToast({ title: '至少选两个任务才能合并', icon: 'none' })
      return
    }
    this.openGroupDialog(ids)
  },

  // 取消合并：完全恢复到点「合并」之前的样子（筛选/搜索/页码都还原，勾选清空）
  cancelMerge() {
    const before = this.mergeBefore || {}
    view.filter = before.filter == null ? 'all' : before.filter
    view.priority = before.priority == null ? 'all' : before.priority
    view.urgency = before.urgency == null ? 'all' : before.urgency
    view.search = before.search == null ? '' : before.search
    view.page = before.page == null ? 1 : before.page
    this.picked = {}
    this.pendingMergeIds = null
    this.mergeBefore = null
    this.setData({ mergeMode: false, pickedIds: {}, pickedCount: 0 })
    this.refresh()
  },

  /* 左侧勾选框：普通模式 = 完成/取消完成；合并模式 = 要不要加入新组。
   * 合并模式下**绝不能**碰任务的 done —— 那样就不是"选择"了。 */
  onCheckTap(e) {
    if (this.tapBlocked()) return
    if (!this.data.mergeMode) return this.toggleTodo(e)
    const id = String(e.currentTarget.dataset.id)
    if (this.picked && this.picked[id]) delete this.picked[id]
    else {
      if (!this.picked) this.picked = {}
      this.picked[id] = true
    }
    const pickedIds = Object.assign({}, this.picked)
    this.setData({ pickedIds, pickedCount: Object.keys(pickedIds).length })
    sound.play('priority')
  },

  /* ── 新建任务组的命名弹窗 ── */

  openGroupDialog(taskIds) {
    // 默认名实时算：取最小的、当前没被占用的「任务组N」
    const fallback = core.nextGroupName(store.loadGroups())
    this.pendingMergeIds = (taskIds || []).slice()
    this.groupNameText = ''
    this.setData({
      groupDialog: true,
      groupName: '',
      groupPlaceholder: `直接确认默认为${fallback}`,
    })
  },

  onGroupNameInput(e) {
    // 同任务名输入框：输入过程不逐字 setData，值先存在实例上
    this.groupNameText = String(e.detail.value == null ? '' : e.detail.value)
  },

  closeGroupDialog() {
    // 只关弹窗：合并模式还留着，可以继续调整选择；要退出合并模式请点「取消」
    this.setData({ groupDialog: false })
  },

  confirmGroupDialog() {
    const ids = this.pendingMergeIds || []
    if (ids.length < 2) {
      this.setData({ groupDialog: false })
      return
    }
    const typed = String(this.groupNameText == null ? '' : this.groupNameText).trim()
    // 没输就按默认名（用户要求：直接确认 = 任务组N）
    const name = typed || core.nextGroupName(store.loadGroups())
    this.groupNameText = ''
    this.pendingMergeIds = null
    undo.push() // 合并会同时改「组」和「任务的 groupId」，必须先记一步撤回
    store.createGroup(name, ids)
    this.picked = {}
    this.mergeBefore = null
    view.page = 1
    sound.play('add')
    this.setData({ groupDialog: false, mergeMode: false, pickedIds: {}, pickedCount: 0 })
    this.refresh()
    wx.showToast({ title: `已合并为「${name}」`, icon: 'none' })
  },

  /* ── 任务组：进组 / 解散 ── */

  openGroup(e) {
    if (this.tapBlocked()) return
    const id = e.currentTarget.dataset.id
    if (id == null) return
    wx.navigateTo({ url: `/pages/group/group?id=${id}` })
  },

  // 解散任务组：组内任务**一起进回收站**（用户选择），属于批量操作所以要二次确认
  removeGroup(e) {
    if (this.tapBlocked()) return
    const id = e.currentTarget.dataset.id
    const group = store.findGroup(id)
    if (!group) return
    const members = store.loadGroupTodos(group.id)
    wx.showModal({
      title: '删除任务组',
      content: members.length
        ? `「${group.name}」里的 ${members.length} 个任务会一起移入历史记录，可随时恢复。`
        : `「${group.name}」是空的，删除后不可恢复。`,
      confirmText: '删除',
      success: (res) => {
        if (!res.confirm) return
        undo.push()
        const ids = {}
        members.forEach((t) => { ids[String(t.id)] = true })
        if (members.length) store.pushToHistory(members)
        if (members.length) store.saveTodos(store.loadTodos().filter((t) => !ids[String(t.id)]))
        store.saveGroups(store.loadGroups().filter((g) => String(g.id) !== String(group.id)))
        sound.play('delete')
        this.refresh()
      },
    })
  },

  /* ── 拖动任务去合并（按住不放 → 拖到另一个任务或任务组上松手） ── */

  // 拖拽刚结束时别把随后的点击当成普通点击（避免误触发改名 / 完成 / 改等级）
  tapBlocked() {
    return !!(this.suppressTapUntil && Date.now() < this.suppressTapUntil)
  },

  /* 量一次所有行的位置（视口坐标），拖动时用它判断手指压在哪一行上。
   * 视口坐标和 touch 的 clientY 是同一套，可以直接比。 */
  measureRows() {
    const query = wx.createSelectorQuery()
    query.selectAll('.item').boundingClientRect()
    query.exec((res) => {
      this.rowRects = (res && res[0]) || []
    })
  },

  onItemLongPress(e) {
    if (this.data.mergeMode) return // 合并模式下用勾选，不用拖
    const id = String(e.currentTarget.dataset.id)
    const row = (this.data.items || []).find((x) => String(x.id) === id)
    if (!row || row.kind === 'group') return // 任务组本身不能拖（它就是文件夹）
    this.dragId = id
    this.dragMoved = false
    this.dragOver = null
    this.measureRows()
    // 每 300ms 重量一次：万一页面被拖动带得滚动了一点，落点也不会算错
    if (this.dragTimer) clearInterval(this.dragTimer)
    this.dragTimer = setInterval(() => {
      if (this.data.dragging) this.measureRows()
    }, 300)
    this.setData({ dragging: true, dragText: row.text, dragY: 0, dragId: id, dragOverId: '' })
  },

  // 手指压在 y 这一行的哪一行上？返回 { id, kind }（排除被拖的那行本身）
  rowAtPoint(y) {
    const rects = this.rowRects || []
    const items = this.data.items || []
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]
      if (!r) continue
      if (y >= r.top && y <= r.bottom) {
        const row = items[i]
        if (!row || String(row.id) === this.dragId) return null
        return { id: String(row.id), kind: row.kind }
      }
    }
    return null
  },

  onItemTouchMove(e) {
    if (!this.data.dragging) return
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
    if (!t) return
    this.dragMoved = true
    const y = Math.round(t.clientY)
    const over = this.rowAtPoint(y)
    this.dragOver = over
    const overId = over ? over.id : ''
    const patch = { dragY: Math.max(0, y - 34) }
    if (overId !== this.data.dragOverId) patch.dragOverId = overId
    this.setData(patch)
  },

  onItemTouchEnd() {
    if (!this.data.dragging) return
    const over = this.dragOver
    const dragId = this.dragId
    this.dragId = null
    this.dragOver = null
    this.dragMoved = false
    this.rowRects = null
    if (this.dragTimer) {
      clearInterval(this.dragTimer)
      this.dragTimer = null
    }
    // 拖完这 300ms 内屏蔽行的点击
    this.suppressTapUntil = Date.now() + 300
    this.setData({ dragging: false, dragText: '', dragId: '', dragOverId: '' })
    if (!over || !over.id || !dragId) return

    if (over.kind === 'group') {
      // 落在任务组上：直接加入那个组（组名已经有了，不用再问）
      const group = store.findGroup(over.id)
      if (!group) return
      undo.push()
      store.addTasksToGroup(group.id, [dragId])
      sound.play('add')
      this.refresh()
      wx.showToast({ title: `已加入「${group.name}」`, icon: 'none' })
      return
    }
    if (String(over.id) === String(dragId)) return
    // 落在另一个任务上：合成一个新组，让用户起名
    this.openGroupDialog([String(dragId), String(over.id)])
  },

  /* ── 撤回 / 取消撤回 ── */

  undoAction() {
    if (!undo.undo()) return
    this.afterTimeTravel('add')
  },

  redoAction() {
    if (!undo.redo()) return
    this.afterTimeTravel('priority')
  },

  /* 撤回 / 取消撤回之后统一收尾。
   * 把筛选切回「全部」并回到第 1 页：被还原的数据可能落在任何一边
   * （撤回一个"完成"会让任务从已完成回到未完成），只有显示全部才能让用户马上看见结果。 */
  afterTimeTravel(soundKey) {
    view.filter = 'all'
    view.page = 1
    sound.play(soundKey)
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
        undo.push()
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
        undo.push()
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
        undo.push()
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
        undo.push()
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

  /* 点页码 → 弹出跳页弹窗（自绘，输入框**不自动聚焦**，用户点它才弹键盘）。
   * 规则（越界收敛、认不出保持原页，与网页版一致）都在 utils/pagedit.js 里。 */
  editPage() {
    pagedit.openPageDialog(this, PAGE_OPTS)
  },

  onPageDialogInput(e) {
    pagedit.inputPageDialog(this, e)
  },

  // 键盘高度变化（focus 事件里也带高度，绑同一个 handler 兜底）→ 把弹窗顶到键盘上方
  onPageDialogKeyboard(e) {
    pagedit.onDialogKeyboard(this, e)
  },

  closePageDialog() {
    pagedit.closePageDialog(this)
  },

  confirmPageDialog() {
    pagedit.confirmPageDialog(this, PAGE_OPTS)
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
