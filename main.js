import './style.css'

const STORAGE_KEY = 'todo-list-items'

const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' }

function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return list.map((t) => ({ ...t, priority: t.priority || 'medium' }))
  } catch {
    return []
  }
}

function saveTodos(todos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function render() {
  const app = document.querySelector('#app')
  const todos = loadTodos()
  const completed = todos.filter((t) => t.done).length
  const active = todos.length - completed

  app.innerHTML = `
    <div class="todo-wrapper">
      <header class="todo-header">
        <h1><span class="title-icon">📝</span> 我的待办清单</h1>
        <p class="subtitle">记录你的每一项任务</p>
      </header>

      <form id="todo-form" class="todo-form">
        <input
          id="todo-input"
          type="text"
          placeholder="今天要做什么？"
          autocomplete="off"
          maxlength="200"
        />
        <button type="submit" class="btn-add">➕ 添加任务</button>
      </form>

      <div class="todo-stats">
        <div class="priority-select" id="todo-priority" data-value="medium" role="group" aria-label="任务优先级">
          <button type="button" class="priority-option priority-high" data-priority="high"><span class="priority-dot high-dot"></span>高</button>
          <button type="button" class="priority-option priority-medium selected" data-priority="medium"><span class="priority-dot medium-dot"></span>中</button>
          <button type="button" class="priority-option priority-low" data-priority="low"><span class="priority-dot low-dot"></span>低</button>
        </div>
        <div class="stats-summary">
          <div class="stat">
            <span class="stat-dot active-dot"></span>
            <span class="stat-num">${active}</span>
            <span class="stat-label">未完成</span>
          </div>
          <div class="stat">
            <span class="stat-dot done-dot"></span>
            <span class="stat-num">${completed}</span>
            <span class="stat-label">已完成</span>
          </div>
        </div>
      </div>

      <ul class="todo-list" id="todo-list">
        ${
          todos.length === 0
            ? `
            <li class="empty-state">
              <div class="empty-icon">🎉</div>
              <p class="empty-title">清单空空如也</p>
              <p class="empty-desc">添加第一个任务，开启高效一天吧！</p>
            </li>`
            : todos
                .map(
                  (t) => `
          <li class="todo-item ${t.done ? 'done' : ''} priority-${t.priority}" data-id="${t.id}">
            <span class="priority-badge priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
            <label class="checkbox-wrap">
              <input type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle" />
              <span class="checkmark"></span>
            </label>
            <span class="todo-text" data-action="edit">${escapeHtml(t.text)}</span>
            <button class="btn-edit" data-action="edit" aria-label="编辑任务">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-delete" data-action="delete" aria-label="删除任务">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </li>
        `
                )
                .join('')
        }
      </ul>

      <div class="todo-actions">
        ${completed > 0 ? `<button class="btn-clear-done" data-action="clear-done">🗑️ 清空已完成 (${completed})</button>` : ''}
        ${todos.length > 0 ? `<button class="btn-clear-all" data-action="clear-all">⚡ 全部清空</button>` : ''}
      </div>
    </div>

    <div class="modal-overlay" id="confirm-modal">
      <div class="modal">
        <div class="modal-icon">⚠️</div>
        <p class="modal-title">确认全部清空</p>
        <p class="modal-desc">这将删除所有任务，包括未完成的任务。此操作不可撤销。</p>
        <div class="modal-actions">
          <button class="btn-cancel" data-action="cancel">取消</button>
          <button class="btn-confirm" data-action="confirm">确认清空</button>
        </div>
      </div>
    </div>
  `

  bindEvents()
}

function startEdit(item, todo, todos) {
  const textEl = item.querySelector('.todo-text')
  const oldText = todo.text
  const input = document.createElement('input')
  input.type = 'text'
  input.value = oldText
  input.className = 'edit-input'
  input.maxLength = 200
  textEl.replaceWith(input)
  input.focus()
  input.select()

  const finishEdit = (save) => {
    const newText = input.value.trim()
    if (save && newText && newText !== oldText) {
      todo.text = newText
      saveTodos(todos)
    }
    render()
  }

  input.addEventListener('blur', () => finishEdit(true))
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      finishEdit(true)
    } else if (e.key === 'Escape') {
      finishEdit(false)
    }
  })
}

function bindEvents() {
  const form = document.querySelector('#todo-form')
  const input = document.querySelector('#todo-input')
  const prioritySelect = document.querySelector('#todo-priority')
  const list = document.querySelector('#todo-list')
  const modal = document.querySelector('#confirm-modal')

  prioritySelect.addEventListener('click', (e) => {
    const option = e.target.closest('[data-priority]')
    if (!option) return
    prioritySelect.dataset.value = option.dataset.priority
    prioritySelect.querySelectorAll('.priority-option').forEach((button) => button.classList.remove('selected'))
    option.classList.add('selected')
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) return
    const todos = loadTodos()
    todos.push({ id: Date.now(), text, done: false, priority: prioritySelect.dataset.value })
    saveTodos(todos)
    input.value = ''
    render()
    document.querySelector('#todo-input').focus()
  })

  list.addEventListener('click', (e) => {
    const item = e.target.closest('.todo-item')
    if (!item) return
    const id = Number(item.dataset.id)
    const actionEl = e.target.closest('[data-action]')
    if (!actionEl) return
    const action = actionEl.dataset.action

    const todos = loadTodos()
    const todo = todos.find((t) => t.id === id)
    if (!todo) return

    if (action === 'toggle') {
      todo.done = !todo.done
      saveTodos(todos)
      render()
    } else if (action === 'delete') {
      const filtered = todos.filter((t) => t.id !== id)
      saveTodos(filtered)
      render()
    } else if (action === 'edit') {
      startEdit(item, todo, todos)
    }
  })

  const clearDoneBtn = document.querySelector('.btn-clear-done')
  if (clearDoneBtn) {
    clearDoneBtn.addEventListener('click', () => {
      const todos = loadTodos()
      const remaining = todos.filter((t) => !t.done)
      saveTodos(remaining)
      render()
    })
  }

  const clearAllBtn = document.querySelector('.btn-clear-all')
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      modal.classList.add('show')
    })
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-action="cancel"]')) {
      modal.classList.remove('show')
    } else if (e.target.closest('[data-action="confirm"]')) {
      saveTodos([])
      modal.classList.remove('show')
      render()
    }
  })
}

render()
