import './style.css'

const STORAGE_KEY = 'todo-list-items'
const THEME_KEY = 'todo-theme-color'
const SOUND_KEY = 'todo-sound-settings'
const PRIORITY_LABELS = { high: '高', medium: '中', low: '低' }

const RAINBOW_COLORS = [
  { name: '红', hex: '#ef4444' },
  { name: '橙', hex: '#f59e0b' },
  { name: '黄', hex: '#eab308' },
  { name: '绿', hex: '#22c55e' },
  { name: '青', hex: '#06b6d4' },
  { name: '蓝', hex: '#2563eb' },
  { name: '紫', hex: '#8b5cf6' },
]

const SOUND_TYPES = [
  { key: 'add', label: '添加任务' },
  { key: 'priority', label: '设置优先级' },
  { key: 'delete', label: '删除任务' },
  { key: 'clearDone', label: '清空已完成' },
  { key: 'clearAll', label: '清空全部' },
]

/* ── Color utilities ── */

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100
  let r, g, b
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
  const toHex = (c) => Math.round(c * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function deriveShades(hex) {
  const { h, s, l } = hexToHsl(hex)
  return {
    primary: hex,
    dark: hslToHex(h, s, Math.max(l - 12, 15)),
    light: hslToHex(h, Math.min(s + 5, 100), 88),
    soft: hslToHex(h, Math.min(s + 3, 100), 95),
  }
}

function applyTheme(hex) {
  const root = document.documentElement
  const shades = deriveShades(hex)
  root.style.setProperty('--primary', shades.primary)
  root.style.setProperty('--primary-dark', shades.dark)
  root.style.setProperty('--primary-light', shades.light)
  root.style.setProperty('--primary-soft', shades.soft)
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || '#2563eb'
}

function saveTheme(hex) {
  localStorage.setItem(THEME_KEY, hex)
}

/* ── Color parsing for custom input ── */

function parseColor(input) {
  const trimmed = input.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed
  const rgbMatch = trimmed.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1])
    const g = parseInt(rgbMatch[2])
    const b = parseInt(rgbMatch[3])
    if (r <= 255 && g <= 255 && b <= 255) {
      const toHex = (c) => c.toString(16).padStart(2, '0')
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`
    }
  }
  return null
}

/* ── Sound system (Web Audio API) ── */

let audioCtx = null

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playTone(freq, duration, type = 'sine', volume = 0.15, delay = 0) {
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const now = ctx.currentTime + delay
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + duration)
}

function playSound(type) {
  const settings = loadSoundSettings()
  if (!settings[type]) return
  switch (type) {
    case 'add':
      playTone(523.25, 0.12, 'sine', 0.15)
      playTone(659.25, 0.15, 'sine', 0.15, 0.08)
      break
    case 'priority':
      playTone(800, 0.06, 'square', 0.08)
      break
    case 'delete':
      playTone(392, 0.1, 'triangle', 0.12)
      playTone(261.63, 0.15, 'triangle', 0.12, 0.06)
      break
    case 'clearDone':
      playTone(600, 0.08, 'sine', 0.12)
      playTone(900, 0.1, 'sine', 0.1, 0.05)
      break
    case 'clearAll':
      playTone(400, 0.1, 'sawtooth', 0.1)
      playTone(300, 0.1, 'sawtooth', 0.1, 0.08)
      playTone(150, 0.2, 'sawtooth', 0.1, 0.16)
      break
  }
}

function loadSoundSettings() {
  try {
    const raw = localStorage.getItem(SOUND_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { add: true, priority: true, delete: true, clearDone: true, clearAll: true }
}

function saveSoundSettings(settings) {
  localStorage.setItem(SOUND_KEY, JSON.stringify(settings))
}

/* ── Settings panel ── */

let settingsPanel = null
let settingsView = 'main'

function createSettingsPanel() {
  const panel = document.createElement('div')
  panel.className = 'settings-panel'
  panel.innerHTML = `
    <div class="settings-panel-header">
      <button class="settings-back-btn" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h2 class="settings-panel-title">设置</h2>
      <button class="settings-close-btn" aria-label="关闭">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="settings-panel-body" id="settings-body"></div>
  `
  document.body.appendChild(panel)

  panel.querySelector('.settings-close-btn').addEventListener('click', closeSettings)
  panel.querySelector('.settings-back-btn').addEventListener('click', () => {
    if (settingsView !== 'main') {
      settingsView = 'main'
      renderSettingsBody()
      updateBackButton()
    }
  })

  return panel
}

function updateBackButton() {
  const backBtn = settingsPanel.querySelector('.settings-back-btn')
  backBtn.style.visibility = settingsView === 'main' ? 'hidden' : 'visible'
  const title = settingsPanel.querySelector('.settings-panel-title')
  title.textContent = settingsView === 'main' ? '设置' : '音效'
}

function renderSettingsBody() {
  const body = settingsPanel.querySelector('#settings-body')
  if (settingsView === 'main') {
    body.innerHTML = renderMainSettings()
    bindMainSettings()
  } else if (settingsView === 'sound') {
    body.innerHTML = renderSoundSettings()
    bindSoundSettings()
  }
}

function renderMainSettings() {
  const currentTheme = loadTheme()
  const soundSettings = loadSoundSettings()
  const enabledCount = Object.values(soundSettings).filter(Boolean).length
  const totalCount = SOUND_TYPES.length

  return `
    <div class="settings-section">
      <h3 class="settings-section-title">主题颜色</h3>
      <div class="color-swatches">
        ${RAINBOW_COLORS.map((c) => `
          <button class="color-swatch${c.hex === currentTheme ? ' selected' : ''}" data-color="${c.hex}" title="${c.name}" style="--swatch-color:${c.hex}">
            ${c.hex === currentTheme ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </button>
        `).join('')}
      </div>
      <div class="custom-color-row">
        <label class="custom-color-label">自定义</label>
        <input type="color" class="custom-color-picker" id="custom-color-picker" value="${currentTheme}">
        <input type="text" class="custom-color-input" id="custom-color-input" placeholder="#2563eb 或 rgb(37,99,235)" value="${currentTheme}">
      </div>
    </div>

    <div class="settings-section">
      <h3 class="settings-section-title">音效</h3>
      <button class="settings-nav-row" data-nav="sound">
        <span class="settings-nav-label">音效设置</span>
        <span class="settings-nav-value">${enabledCount}/${totalCount} 项已开启</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  `
}

function bindMainSettings() {
  const body = settingsPanel.querySelector('#settings-body')

  body.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const hex = swatch.dataset.color
      saveTheme(hex)
      applyTheme(hex)
      renderSettingsBody()
    })
  })

  const colorPicker = body.querySelector('#custom-color-picker')
  const colorInput = body.querySelector('#custom-color-input')

  colorPicker.addEventListener('input', () => {
    const hex = colorPicker.value
    saveTheme(hex)
    applyTheme(hex)
    colorInput.value = hex
    body.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'))
  })

  colorInput.addEventListener('change', () => {
    const parsed = parseColor(colorInput.value)
    if (parsed) {
      saveTheme(parsed)
      applyTheme(parsed)
      colorPicker.value = parsed
      colorInput.value = parsed
      body.querySelectorAll('.color-swatch').forEach((s) => {
        s.classList.toggle('selected', s.dataset.color === parsed)
      })
    } else {
      colorInput.value = loadTheme()
    }
  })
}

function renderSoundSettings() {
  const settings = loadSoundSettings()
  return `
    <div class="settings-section">
      ${SOUND_TYPES.map((s) => `
        <div class="sound-toggle-row">
          <span class="sound-toggle-label">${s.label}</span>
          <label class="toggle-switch">
            <input type="checkbox" data-sound="${s.key}" ${settings[s.key] ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      `).join('')}
    </div>
  `
}

function bindSoundSettings() {
  const body = settingsPanel.querySelector('#settings-body')
  const settings = loadSoundSettings()

  body.querySelectorAll('input[data-sound]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      settings[checkbox.dataset.sound] = checkbox.checked
      saveSoundSettings(settings)
      if (checkbox.checked) {
        playSound(checkbox.dataset.sound)
      }
    })
  })
}

function openSettings() {
  if (!settingsPanel) settingsPanel = createSettingsPanel()
  settingsView = 'main'
  renderSettingsBody()
  updateBackButton()
  settingsPanel.classList.add('open')
}

function closeSettings() {
  if (settingsPanel) settingsPanel.classList.remove('open')
}

/* ── Todo app ── */

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
    <button class="settings-btn" aria-label="设置" title="设置">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>

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
  const settingsBtn = document.querySelector('.settings-btn')
  const form = document.querySelector('#todo-form')
  const input = document.querySelector('#todo-input')
  const prioritySelect = document.querySelector('#todo-priority')
  const list = document.querySelector('#todo-list')
  const modal = document.querySelector('#confirm-modal')

  settingsBtn.addEventListener('click', openSettings)

  prioritySelect.addEventListener('click', (e) => {
    const option = e.target.closest('[data-priority]')
    if (!option) return
    const prevValue = prioritySelect.dataset.value
    prioritySelect.dataset.value = option.dataset.priority
    prioritySelect.querySelectorAll('.priority-option').forEach((button) => button.classList.remove('selected'))
    option.classList.add('selected')
    if (prevValue !== option.dataset.priority) {
      playSound('priority')
    }
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) return
    const todos = loadTodos()
    todos.push({ id: Date.now(), text, done: false, priority: prioritySelect.dataset.value })
    saveTodos(todos)
    playSound('add')
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
      playSound('delete')
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
      playSound('clearDone')
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
      playSound('clearAll')
      modal.classList.remove('show')
      render()
    }
  })

  document.addEventListener('click', (e) => {
    if (settingsPanel && settingsPanel.classList.contains('open')) {
      const navRow = e.target.closest('[data-nav="sound"]')
      if (navRow) {
        settingsView = 'sound'
        renderSettingsBody()
        updateBackButton()
      }
    }
  })
}

applyTheme(loadTheme())
render()
