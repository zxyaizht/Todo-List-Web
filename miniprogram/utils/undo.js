/* 撤回 / 取消撤回（undo / redo）
 *
 * 做法是**快照**：每次"要改动数据"之前，先把当前的任务清单 + 回收站 + 自定义色存一份；
 * 撤回就是把快照整体写回去，同时把当前状态压进重做栈。
 * 比逐条记录差异简单得多，也不会漏掉某次操作的副作用
 * （比如「删除任务」= 任务出栈 + 进回收站，两处都要还原）。
 *
 * 进撤回栈的操作：
 *   · 任务：新增 / 删除 / 改内容 / 勾选、完成所有（取消所有）、清空已完成 / 未完成 / 全部 /
 *     完成所有并清空
 *   · 回收站：批量恢复、单条恢复、单条彻底删除、批量清空
 *   · 自定义色：新增 / 删除单个 / 全部删除（颜色是进**统一回收站**的，所以必须和回收站
 *     一起快照，否则撤回时会只还原一半、把颜色弄丢）
 * **不进**撤回栈的：主题色、音量/频率这类"外观设置"——撤回只针对数据。
 *
 * 栈只在内存里：小程序退到后台再回来还在（进程没被杀），完全退出就清空 —— 这是刻意的，
 * 免得跨会话撤回一步把几天前的数据翻出来。 */
const store = require('./storage')

// 最多记多少步。每步只是几十条扁平对象的拷贝，50 步的开销可以忽略
const MAX_DEPTH = 50

let undoStack = []
let redoStack = []

/* 取当前状态快照。
 * 逐条拷贝是**防御性**的：`loadTodos()` 现在每次都会造新对象，但别依赖这一点 ——
 * 只要快照和外面的对象共享了引用，外面一句 `todo.done = true` 就会把快照一起改掉，
 * 撤回就变成了"什么都没变"。 */
function snapshot() {
  return {
    todos: store.loadTodos().map((t) => Object.assign({}, t)),
    history: store.loadHistory().map((t) => Object.assign({}, t)),
    colors: store.loadCustomColors().slice(),
  }
}

function restore(snap) {
  store.saveTodos(snap.todos)
  store.saveHistory(snap.history)
  store.saveCustomColors(snap.colors)
}

/* 在**改动之前**调用：把当前状态压进撤回栈。
 * 任何新操作都会让"重做"失效（与所有编辑器一致）。 */
function push() {
  undoStack.push(snapshot())
  if (undoStack.length > MAX_DEPTH) undoStack.shift()
  redoStack = []
  return true
}

function undo() {
  if (!undoStack.length) return false
  const prev = undoStack.pop()
  redoStack.push(snapshot()) // 当前状态留给"取消撤回"
  restore(prev)
  return true
}

function redo() {
  if (!redoStack.length) return false
  const next = redoStack.pop()
  undoStack.push(snapshot())
  restore(next)
  return true
}

function canUndo() {
  return undoStack.length > 0
}

function canRedo() {
  return redoStack.length > 0
}

// 供测试观察 / 清理
function depths() {
  return { undo: undoStack.length, redo: redoStack.length }
}

function reset() {
  undoStack = []
  redoStack = []
}

module.exports = {
  MAX_DEPTH,
  push,
  undo,
  redo,
  canUndo,
  canRedo,
  depths,
  reset,
}
