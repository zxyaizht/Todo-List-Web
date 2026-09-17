import './style.css'

const STORAGE_KEY = 'todo-list-items'
const HISTORY_KEY = 'todo-history-items'
const THEME_KEY = 'todo-theme-color'
const SOUND_KEY = 'todo-sound-settings'
const PRIORITY_KEY = 'todo-priority'
const COLORS_KEY = 'todo-custom-colors'
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
  // +1e-6 抵消浮点误差（如 hsl(210,100%,50%) 的 g 会算成 127.49999…，应当进位为 128）
  const toHex = (c) => Math.round(c * 255 + 1e-6).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function deriveShades(hex) {
  const { h, s, l } = hexToHsl(hex)
  return {
    primary: hex,
    dark: hslToHex(h, s, Math.max(l - 12, 15)),
    light: hslToHex(h, Math.min(s + 5, 100), 88),
    soft: hslToHex(h, Math.min(s + 3, 100), 95),
    // 待办清单背景用的两档浅色主题渐变
    appBg: hslToHex(h, Math.min(s + 6, 100), 96),
    appBg2: hslToHex(h, Math.min(s + 12, 100), 89),
  }
}

function hexToRgbTriplet(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ].join(', ')
}

function applyTheme(hex) {
  const root = document.documentElement
  const shades = deriveShades(hex)
  root.style.setProperty('--primary', shades.primary)
  root.style.setProperty('--primary-rgb', hexToRgbTriplet(shades.primary))
  root.style.setProperty('--primary-dark', shades.dark)
  root.style.setProperty('--primary-light', shades.light)
  root.style.setProperty('--primary-soft', shades.soft)
  root.style.setProperty('--app-bg', shades.appBg)
  root.style.setProperty('--app-bg-2', shades.appBg2)
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || '#2563eb'
}

function saveTheme(hex) {
  localStorage.setItem(THEME_KEY, hex)
}

/* ── 自定义颜色记录（最近用过的自定义色，LIFO，去重） ── */

const MAX_CUSTOM_COLORS = 8

function loadCustomColors() {
  try {
    const raw = localStorage.getItem(COLORS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)) : []
  } catch {
    return []
  }
}

function rememberCustomColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return
  const list = loadCustomColors().filter((c) => c.toLowerCase() !== hex.toLowerCase())
  list.unshift(hex.toLowerCase())
  if (list.length > MAX_CUSTOM_COLORS) list.length = MAX_CUSTOM_COLORS
  localStorage.setItem(COLORS_KEY, JSON.stringify(list))
}

/* ── 自定义颜色的删除 ──
 * 与任务共用同一个回收站（todo-history-items）：删掉的颜色以 kind: 'color' 的形式进去，
 * 在历史记录窗口里显示成色块，点「恢复」放回自定义色列表。 */

// 删除自定义色 → 进统一的回收站（任务历史记录），与任务共用一套恢复逻辑
function deleteCustomColor(hex) {
  const target = String(hex).toLowerCase()
  const remaining = loadCustomColors().filter((c) => c.toLowerCase() !== target)
  localStorage.setItem(COLORS_KEY, JSON.stringify(remaining))
  pushToHistory([{ id: `color-${Date.now()}`, text: target, done: false, priority: 'medium', kind: 'color' }])
}

// 从回收站恢复自定义色
function restoreCustomColor(hex) {
  const target = String(hex).toLowerCase()
  const list = loadCustomColors().filter((c) => c.toLowerCase() !== target)
  list.unshift(target)
  if (list.length > MAX_CUSTOM_COLORS) list.length = MAX_CUSTOM_COLORS
  localStorage.setItem(COLORS_KEY, JSON.stringify(list))
}

// 复制文本：优先用剪贴板 API，非安全上下文下回退到临时 textarea
async function copyText(text) {
  try {
    if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
      await window.navigator.clipboard.writeText(text)
      return true
    }
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/* ── Color parsing for custom input ──
 * 越宽容越好，统一返回 #rrggbb，无法识别返回 null。支持：
 *   #ff8800 / ff8800（省 #） / abc（3 位） / ff8800cc（8 位，忽略透明度）
 *   rgb(255, 0, 0) / rgba(255,0,0,.5) / 255,0,0 / 255，0，0（中文逗号）/ 255 0 0（括号可省）
 *   hsl(210, 100%, 50%) / 常用英文颜色名（red、blue…） */

const NAMED_COLORS = {
  red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e',
  blue: '#2563eb', purple: '#8b5cf6', cyan: '#06b6d4', pink: '#ec4899',
  black: '#000000', white: '#ffffff', gray: '#6b7280', grey: '#6b7280',
  silver: '#cbd5e1', gold: '#f59e0b', brown: '#92400e', navy: '#1e3a8a',
  teal: '#14b8a6', indigo: '#6366f1', lime: '#84cc16', sky: '#0ea5e9',
  maroon: '#7f1d1d', olive: '#808000', coral: '#f87171', violet: '#8b5cf6',
}

function parseColor(input) {
  const s = String(input).trim().toLowerCase()
  if (!s) return null

  // 英文颜色名
  if (NAMED_COLORS[s]) return NAMED_COLORS[s]

  // 十六进制：# 可省，3 位自动展开，8 位（带透明度）取前 6 位
  const hexBody = s.startsWith('#') ? s.slice(1) : s
  if (/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(hexBody)) {
    const full =
      hexBody.length === 3
        ? hexBody
            .split('')
            .map((c) => c + c)
            .join('')
        : hexBody
    return `#${full}`
  }
  if (/^[0-9a-f]{8}$/.test(hexBody)) return `#${hexBody.slice(0, 6)}`

  const nums = (s.match(/\d{1,3}(?:\.\d+)?/g) || []).map(Number)

  // hsl(210, 100%, 50%)，括号同样可省
  if (s.includes('hsl') && nums.length >= 3) {
    const [h, sat, light] = nums
    if (h >= 0 && h <= 360 && sat >= 0 && sat <= 100 && light >= 0 && light <= 100) {
      return hslToHex(h, sat, light)
    }
    return null
  }

  // rgb / rgba：取前三个 0-255 的数字，括号、中英文逗号、空格都不影响
  if (nums.length >= 3) {
    const rgb = nums.slice(0, 3)
    if (rgb.every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
      const toHex = (c) => Math.round(c).toString(16).padStart(2, '0')
      return `#${rgb.map(toHex).join('')}`
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
      updateSettingsHeader()
    }
  })

  return panel
}

function isAllSoundOn() {
  const settings = loadSoundSettings()
  return SOUND_TYPES.every((s) => settings[s.key])
}

// 页头：返回按钮 与 标题（音效总开关已移到设置主页，与「音效」标题同行）
function updateSettingsHeader() {
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

// 记录下来的自定义色：圆形按钮 + 正下方的十六进制色码（右上角有复制按钮）
function renderCustomColorHistory(currentTheme) {
  const colors = loadCustomColors()
  if (!colors.length) return ''
  return `
      <div class="custom-color-history">
        ${colors
          .map(
            (hex) => `
          <div class="saved-color">
            <div class="swatch-wrap">
              <button class="saved-color-swatch${hex === currentTheme ? ' selected' : ''}" data-color="${hex}" title="应用该颜色" style="--swatch-color:${hex}">
                ${hex === currentTheme ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
              </button>
              <button type="button" class="swatch-remove" data-remove-color="${hex}" aria-label="删除该颜色" title="删除该颜色">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div class="saved-color-code" data-copy="${hex}" title="点击复制颜色码" role="button" tabindex="0" aria-label="复制颜色码 ${hex}">
              <span class="code-roll">
                <span class="code-line saved-color-hex">${hex}</span>
                <span class="code-line is-done">复制成功</span>
                <span class="code-line saved-color-hex">${hex}</span>
              </span>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </div>`
}

// 圆柱滚动：hex → 复制成功 → hex，两段位移都朝下，最后瞬间归位（第 1、3 行内容相同，看不出跳变）
function rollColorCode(block) {
  const roll = block && block.querySelector('.code-roll')
  if (!roll || block.dataset.rolling === '1') return
  block.dataset.rolling = '1'
  roll.style.transform = 'translateY(-33.3333%)'
  setTimeout(() => {
    roll.style.transform = 'translateY(-66.6666%)'
    setTimeout(() => {
      roll.style.transition = 'none'
      roll.style.transform = 'translateY(0)'
      void roll.offsetHeight // 强制重排，让归位不参与过渡
      roll.style.transition = ''
      block.dataset.rolling = ''
    }, 360)
  }, 1100)
}

function renderMainSettings() {
  const currentTheme = loadTheme()
  const soundSettings = loadSoundSettings()
  const enabledCount = Object.values(soundSettings).filter(Boolean).length
  const totalCount = SOUND_TYPES.length
  const soundSettingsOn = isAllSoundOn()

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
        <input type="text" class="custom-color-input" id="custom-color-input" placeholder="ff8800 / 255,0,0 / red" value="${currentTheme}">
      </div>
      ${renderCustomColorHistory(currentTheme)}
    </div>

    <div class="settings-section">
      <div class="settings-section-head">
        <h3 class="settings-section-title">音效</h3>
        <label class="toggle-switch sound-master-switch" title="一键开启 / 关闭全部音效">
          <input type="checkbox" id="sound-master-switch" ${soundSettingsOn ? 'checked' : ''} aria-label="全部音效">
          <span class="toggle-slider"></span>
        </label>
      </div>
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

  // 音效总开关：与 5 个独立音效同一种开关（.toggle-switch，滑动动画一致），全开 / 全关
  const masterSwitch = body.querySelector('#sound-master-switch')
  if (masterSwitch) {
    masterSwitch.addEventListener('change', () => {
      const next = {}
      SOUND_TYPES.forEach((s) => {
        next[s.key] = masterSwitch.checked
      })
      saveSoundSettings(next)
      renderSettingsBody()
      // 点击后播放 5 个子音效中的随机 1 种
      const rnd = SOUND_TYPES[Math.floor(Math.random() * SOUND_TYPES.length)].key
      playSound(rnd)
    })
  }

  // 自定义色：悬停圆形出现的 × 删除，删除后进回收站（历史记录）
  body.querySelectorAll('[data-remove-color]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteCustomColor(btn.dataset.removeColor)
      render() // 让主界面的「历史记录 (N)」计数同步
      if (historyPanel) renderHistory() // 历史窗口若开着，同步刷新
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

  // change 才是「选定完成」，用它记录自定义色，避免拖动过程中刷屏
  colorPicker.addEventListener('change', () => {
    const hex = colorPicker.value
    rememberCustomColor(hex)
    renderSettingsBody()
  })

  colorInput.addEventListener('change', () => {
    const parsed = parseColor(colorInput.value)
    if (parsed) {
      saveTheme(parsed)
      applyTheme(parsed)
      rememberCustomColor(parsed)
      colorPicker.value = parsed
      colorInput.value = parsed
      renderSettingsBody()
    } else {
      colorInput.value = loadTheme()
    }
  })

  // 记录里的自定义色：点击圆形按钮应用颜色
  body.querySelectorAll('.saved-color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const hex = swatch.dataset.color
      saveTheme(hex)
      applyTheme(hex)
      renderSettingsBody()
    })
  })

  // 色码块：点击整块即复制，成功后圆柱式向下滚动出「复制成功」再滚回色码
  body.querySelectorAll('.saved-color-code').forEach((block) => {
    const doCopy = async () => {
      const ok = await copyText(block.dataset.copy)
      // 失败也要有反馈，避免点了没反应（非安全上下文下剪贴板可能不可用）
      const line = block.querySelector('.code-line.is-done')
      if (line) line.textContent = ok ? '复制成功' : '复制失败'
      rollColorCode(block)
    }
    block.addEventListener('click', doCopy)
    block.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        doCopy()
      }
    })
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
  updateSettingsHeader()
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

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/* ── 视图上下文 ──
 * 主列表与历史记录共用同一套「搜索 + 筛选 + 五个按钮」逻辑，
 * 但各自的搜索词 / 筛选状态互不干扰，因此抽象成 view：
 *   view = { search, filter }
 * 数据读写则由 store 决定（主列表读写 todo-list-items，历史记录读写 todo-history-items）。 */

const mainView = { search: '', filter: 'all' }
const historyView = { search: '', filter: 'all' }

const EMPTY_MAIN = { icon: '🎉', title: '清单空空如也', desc: '添加第一个任务，开启高效一天吧！' }
const EMPTY_HISTORY = { icon: '🗑️', title: '回收站是空的', desc: '删除任务后，它们会先放到这里，可随时恢复' }

/* ── 列表筛选 ──
 * 展示顺序（左→右）：全部 / 已完成 / 未完成 */
const FILTER_ORDER = ['all', 'done', 'active']
const FILTER_LABELS = { done: '已完成', active: '未完成', all: '全部' }

function matchesFilter(todo, filter) {
  if (filter === 'done') return todo.done
  if (filter === 'active') return !todo.done
  return true
}

function getFilteredTodos(todos, filter) {
  return filter === 'all' ? todos.slice() : todos.filter((t) => matchesFilter(t, filter))
}

function filterButtonsHTML(view) {
  return FILTER_ORDER.map(
    (f) =>
      `<button type="button" class="btn-filter${view.filter === f ? ' active' : ''}" data-action="filter" data-filter="${f}" aria-pressed="${view.filter === f}">${FILTER_LABELS[f]}</button>`
  ).join('')
}

// 清空 + 筛选按钮行：列表顶部与底部各渲染一份（总-分-总），bottom=true 时去掉下边距、改为上边距
// 主列表（withRestore=false）：全部 / 已完成 / 未完成（筛选）｜ 清空已完成 / 清空未完成
// 历史记录（withRestore=true）：全部 / 已完成 / 未完成（筛选）｜ 恢复已完成 / 恢复未完成 / 恢复全部 ｜ 清空已完成 / 清空未完成 / 全部清空
// 清空按钮点击时都要二次确认；恢复按钮无需确认（无损操作）。
function clearActionsHTML(view, completed, total, bottom = false, withRestore = false) {
  if (total === 0) return ''
  const incomplete = total - completed
  return `
      <div class="todo-clear-actions${bottom ? ' bottom' : ''}">
        ${filterButtonsHTML(view)}
        ${withRestore ? restoreButtonsHTML(completed, incomplete) : ''}
        <button class="btn-clear-done" data-action="clear-done" ${completed === 0 ? 'disabled' : ''}>🗑️ 清空已完成${completed > 0 ? ` (${completed})` : ''}</button>
        <button class="btn-clear-incomplete" data-action="clear-incomplete" ${incomplete === 0 ? 'disabled' : ''}>🧹 清空未完成${incomplete > 0 ? ` (${incomplete})` : ''}</button>
        ${withRestore ? `<button class="btn-clear-all" data-action="clear-all" ${total === 0 ? 'disabled' : ''}>⚡ 全部清空</button>` : ''}
      </div>`
}

// 历史记录窗口里的「恢复」按钮组：把回收站里符合条件的条目放回原处（任务→待办，颜色→自定义色）
function restoreButtonsHTML(completed, incomplete) {
  return `
        <button class="btn-restore-done" data-action="restore-done" ${completed === 0 ? 'disabled' : ''}>♻️ 恢复已完成${completed > 0 ? ` (${completed})` : ''}</button>
        <button class="btn-restore-incomplete" data-action="restore-incomplete" ${incomplete === 0 ? 'disabled' : ''}>♻️ 恢复未完成${incomplete > 0 ? ` (${incomplete})` : ''}</button>
        <button class="btn-restore-all" data-action="restore-all">♻️ 恢复全部</button>`
}

/* ── 任务优先级 ──
 * 唯一数据源：只在用户手动点击优先级按钮时变更。
 * 不能从 DOM 读回（render() 会重建按钮），否则重渲染会把它重置成中。
 * 与主题色一致：写入 localStorage，跨刷新记住上次手选的值。 */
const PRIORITY_ORDER = ['high', 'medium', 'low']
const DEFAULT_PRIORITY = 'medium'

function loadPriority() {
  const raw = localStorage.getItem(PRIORITY_KEY)
  return PRIORITY_ORDER.includes(raw) ? raw : DEFAULT_PRIORITY
}

function savePriority(value) {
  localStorage.setItem(PRIORITY_KEY, value)
}

let selectedPriority = loadPriority()

function prioritySelectHTML() {
  return `
        <div class="priority-select" id="todo-priority" data-value="${selectedPriority}" role="group" aria-label="任务优先级">
          ${PRIORITY_ORDER.map(
            (p) => `<button type="button" class="priority-option priority-${p}${p === selectedPriority ? ' selected' : ''}" data-priority="${p}" aria-pressed="${p === selectedPriority}"><span class="priority-dot ${p}-dot"></span>${PRIORITY_LABELS[p]}</button>`
          ).join('')}
        </div>`
}

// 就地同步优先级按钮的选中态（不重渲染，避免影响输入框焦点）
function syncPriorityUI() {
  const select = document.querySelector('#todo-priority')
  if (!select) return
  select.dataset.value = selectedPriority
  select.querySelectorAll('.priority-option').forEach((button) => {
    const isActive = button.dataset.priority === selectedPriority
    button.classList.toggle('selected', isActive)
    button.setAttribute('aria-pressed', String(isActive))
  })
}

/**
 * 模糊匹配：先尝试连续子串匹配，不命中再退化为「顺序子序列」匹配。
 * 返回命中字符的下标（用于高亮），未命中返回 matched: false。
 */
function fuzzyMatch(text, rawQuery) {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return { matched: true, indices: null }
  const source = String(text).toLowerCase()

  const direct = source.indexOf(q)
  if (direct !== -1) {
    const indices = []
    for (let i = 0; i < q.length; i++) indices.push(direct + i)
    return { matched: true, indices }
  }

  const indices = []
  let cursor = 0
  for (const ch of q) {
    const found = source.indexOf(ch, cursor)
    if (found === -1) return { matched: false, indices: null }
    indices.push(found)
    cursor = found + 1
  }
  return { matched: true, indices }
}

function highlightText(text, indices) {
  if (!indices || !indices.length) return escapeHtml(text)
  const hits = new Set(indices)
  let html = ''
  let inMark = false
  let i = 0
  while (i < text.length) {
    const code = text.codePointAt(i)
    const size = code > 0xffff ? 2 : 1
    const isHit = hits.has(i)
    if (isHit && !inMark) {
      html += '<mark class="search-hl">'
      inMark = true
    } else if (!isHit && inMark) {
      html += '</mark>'
      inMark = false
    }
    html += escapeHtml(text.slice(i, i + size))
    i += size
  }
  if (inMark) html += '</mark>'
  return html
}

function getVisibleItems(todos, view) {
  const scoped = getFilteredTodos(todos, view.filter)
  const q = view.search.trim()
  if (!q) return scoped.map((todo) => ({ todo, indices: null }))
  const visible = []
  for (const todo of scoped) {
    const result = fuzzyMatch(todo.text, q)
    if (result.matched) visible.push({ todo, indices: result.indices })
  }
  return visible
}

function todoItemHTML(todo, indices) {
  const textHTML = indices && indices.length ? highlightText(todo.text, indices) : escapeHtml(todo.text)
  return `
          <li class="todo-item ${todo.done ? 'done' : ''} priority-${todo.priority}" data-id="${todo.id}">
            <span class="priority-badge priority-${todo.priority}">${PRIORITY_LABELS[todo.priority]}</span>
            <label class="checkbox-wrap">
              <input type="checkbox" ${todo.done ? 'checked' : ''} data-action="toggle" />
              <span class="checkmark"></span>
            </label>
            <span class="todo-text" data-action="edit">${textHTML}</span>
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
}

// 列表主体：主列表与历史记录共用，只是条目渲染器和空态不同
function listHTML(items, view, emptyState, itemRenderer) {
  if (items.length === 0) {
    return `
            <li class="empty-state">
              <div class="empty-icon">${emptyState.icon}</div>
              <p class="empty-title">${emptyState.title}</p>
              <p class="empty-desc">${emptyState.desc}</p>
            </li>`
  }

  const visible = getVisibleItems(items, view)

  if (visible.length === 0) {
    if (view.search.trim()) {
      return `
            <li class="empty-state">
              <div class="empty-icon">🔍</div>
              <p class="empty-title">没有找到匹配的任务</p>
              <p class="empty-desc">试试别的关键词，或清空搜索框看全部任务</p>
            </li>`
    }
    if (view.filter === 'done') {
      return `
            <li class="empty-state">
              <div class="empty-icon">📋</div>
              <p class="empty-title">还没有已完成的任务</p>
              <p class="empty-desc">完成任意任务后，它会出现在这里</p>
            </li>`
    }
    if (view.filter === 'active') {
      return `
            <li class="empty-state">
              <div class="empty-icon">🎉</div>
              <p class="empty-title">没有未完成的任务</p>
              <p class="empty-desc">所有任务都已清空，休息一下吧！</p>
            </li>`
    }
    return `
            <li class="empty-state">
              <div class="empty-icon">🔍</div>
              <p class="empty-title">没有找到匹配的任务</p>
              <p class="empty-desc">试试别的关键词，或清空搜索框看全部任务</p>
            </li>`
  }

  return visible.map(({ todo, indices }) => itemRenderer(todo, indices)).join('')
}

// 搜索框（主列表与历史记录共用）
function searchBoxHTML(view, id, placeholder) {
  return `
      <div class="todo-search${view.search ? ' has-value' : ''}">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="20" y1="20" x2="16.65" y2="16.65"/>
        </svg>
        <input
          id="${id}"
          type="text"
          placeholder="${placeholder}"
          autocomplete="off"
          aria-label="搜索"
          value="${escapeAttr(view.search)}"
        />
        <button type="button" class="btn-search-clear" aria-label="清空搜索">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`
}

function updateSearchHint(hintEl, matchCount, scopeCount, view) {
  if (!hintEl) return
  if (!view.search.trim() || scopeCount === 0) {
    hintEl.classList.remove('show', 'no-match')
    hintEl.innerHTML = ''
    return
  }
  const scopePrefix = view.filter === 'all' ? '' : '当前筛选范围内 '
  hintEl.classList.add('show')
  hintEl.classList.toggle('no-match', matchCount === 0)
  hintEl.innerHTML =
    matchCount > 0
      ? `${scopePrefix}找到 <strong>${matchCount}</strong> 项匹配（共 ${scopeCount} 项）`
      : `${scopePrefix}没有找到匹配的任务`
}

// 统一的「只换列表、不动搜索框」刷新
function renderListView(store, view) {
  const list = store.listEl()
  if (!list) return
  const items = store.read()
  list.innerHTML = listHTML(items, view, store.empty, store.itemRenderer)
  updateSearchHint(store.hintEl(), getVisibleItems(items, view).length, getFilteredTodos(items, view.filter).length, view)
}

function renderList() {
  renderListView(mainStore, mainView)
}

function render() {
  const app = document.querySelector('#app')

  // 保持搜索框的输入焦点与光标位置（重渲染后恢复）
  const activeEl = document.activeElement
  const wasSearchFocused = !!activeEl && activeEl.id === 'todo-search'
  const caretPos = wasSearchFocused ? activeEl.selectionStart : null

  const todos = loadTodos()
  const completed = todos.filter((t) => t.done).length
  const active = todos.length - completed
  const historyCount = loadHistory().length

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
        ${prioritySelectHTML()}
        <div class="stats-summary">
          <div class="stat">
            <span class="stat-dot done-dot"></span>
            <span class="stat-num">${completed}</span>
            <span class="stat-label">已完成</span>
          </div>
          <div class="stat">
            <span class="stat-dot active-dot"></span>
            <span class="stat-num">${active}</span>
            <span class="stat-label">未完成</span>
          </div>
        </div>
      </div>

      <div class="todo-tools">
        ${searchBoxHTML(mainView, 'todo-search', '搜索待办事项')}
        <button type="button" class="btn-history" id="btn-history" title="查看被删除的任务">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          历史记录${historyCount > 0 ? ` (${historyCount})` : ''}
        </button>
      </div>
      <p class="search-hint" id="search-hint"></p>

      ${clearActionsHTML(mainView, completed, todos.length)}

      <ul class="todo-list" id="todo-list">
        ${listHTML(todos, mainView, EMPTY_MAIN, todoItemHTML)}
      </ul>

      ${clearActionsHTML(mainView, completed, todos.length, true)}
    </div>

    <div class="modal-overlay" id="confirm-modal">
      <div class="modal">
        <div class="modal-icon">⚠️</div>
        <p class="modal-title" id="confirm-title">确认全部清空</p>
        <p class="modal-desc" id="confirm-desc">这将删除所有任务，包括未完成的任务。此操作不可撤销。</p>
        <div class="modal-actions">
          <button class="btn-cancel" data-action="cancel">取消</button>
          <button class="btn-confirm" data-action="confirm">确认清空</button>
        </div>
      </div>
    </div>
  `

  bindEvents()

  const searchEl = document.querySelector('#todo-search')
  if (searchEl) {
    searchEl.closest('.todo-search').classList.toggle('has-value', mainView.search.length > 0)
    updateSearchHint(
      document.querySelector('#search-hint'),
      getVisibleItems(todos, mainView).length,
      getFilteredTodos(todos, mainView.filter).length,
      mainView
    )
    if (wasSearchFocused) {
      searchEl.focus()
      if (caretPos != null) searchEl.setSelectionRange(caretPos, caretPos)
    }
  }
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
  document.querySelector('#btn-history').addEventListener('click', openHistory)

  // 搜索框 + 五个按钮：与主列表共用同一套绑定
  bindViewControls(document.querySelector('#app'), mainView, mainStore)

  // 点击优先级按钮时不让它抢走输入框焦点，保证「打字 → Enter → 打字」连贯
  prioritySelect.addEventListener('mousedown', (e) => {
    if (e.target.closest('[data-priority]')) e.preventDefault()
  })

  prioritySelect.addEventListener('click', (e) => {
    const option = e.target.closest('[data-priority]')
    if (!option) return
    const value = option.dataset.priority
    // 只有手动点击才变更优先级；重复点击同一项不处理
    if (value === selectedPriority) return
    selectedPriority = value
    savePriority(value)
    syncPriorityUI()
    playSound('priority')
  })

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) return
    const todos = loadTodos()
    // LIFO：新任务插入数组头部，渲染时自然显示在最上方
    todos.unshift({ id: Date.now(), text, done: false, priority: selectedPriority })
    saveTodos(todos)
    // 新任务一定是未完成，若当前正筛选「已完成」则看不到它，自动切回「全部」
    if (mainView.filter === 'done') mainView.filter = 'all'
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
      pushToHistory([todo])
      playSound('delete')
      render()
    } else if (action === 'edit') {
      startEdit(item, todo, todos)
    }
  })

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-action="cancel"]')) {
      pendingConfirm = null
      modal.classList.remove('show')
    } else if (e.target.closest('[data-action="confirm"]')) {
      const run = pendingConfirm
      pendingConfirm = null
      modal.classList.remove('show')
      if (run) run()
    }
  })
}

/* ── 通用确认框（主列表清空 / 历史记录清空共用） ── */

let pendingConfirm = null

function openConfirm(title, desc, onConfirm) {
  const modal = document.querySelector('#confirm-modal')
  if (!modal) return
  modal.querySelector('#confirm-title').textContent = title
  modal.querySelector('#confirm-desc').textContent = desc
  pendingConfirm = onConfirm
  modal.classList.add('show')
}

/* ── 视图控件绑定：搜索框 + 五个按钮（主列表与历史记录共用） ── */

function bindViewControls(root, view, store) {
  if (!root) return
  const searchInput = root.querySelector('.todo-search input')
  const searchWrap = searchInput ? searchInput.closest('.todo-search') : null

  if (searchInput) {
    const syncSearchState = () => {
      searchWrap.classList.toggle('has-value', searchInput.value.length > 0)
    }
    const applySearch = () => {
      view.search = searchInput.value
      syncSearchState()
      renderListView(store, view)
    }

    searchInput.addEventListener('input', applySearch)

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value) {
        e.preventDefault()
        searchInput.value = ''
        applySearch()
      }
    })

    searchWrap.querySelector('.btn-search-clear').addEventListener('click', () => {
      searchInput.value = ''
      view.search = ''
      syncSearchState()
      renderListView(store, view)
      searchInput.focus()
    })
  }

  // 筛选按钮：切换范围；点击时不抢走搜索框焦点（render 内部会自行还原）
  root.querySelectorAll('.btn-filter').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => e.preventDefault())
    btn.addEventListener('click', () => {
      const value = btn.dataset.filter
      if (value === view.filter) return
      view.filter = value
      store.render()
    })
  })

  // 列表上方与下方各有一组，必须全部绑定
  root.querySelectorAll('.btn-clear-done').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return
      const items = store.read()
      openConfirm(store.clearDoneTitle, store.clearDoneDesc, () => {
        pushToHistory(items.filter((t) => t.done), store)
        store.write(items.filter((t) => !t.done))
        playSound('clearDone')
        store.render()
      })
    })
  })

  root.querySelectorAll('.btn-clear-incomplete').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return
      const items = store.read()
      openConfirm(store.clearIncompleteTitle, store.clearIncompleteDesc, () => {
        pushToHistory(items.filter((t) => !t.done), store)
        store.write(items.filter((t) => t.done))
        playSound('clearAll')
        store.render()
      })
    })
  })

  root.querySelectorAll('.btn-clear-all').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return
      openConfirm(store.confirmTitle, store.confirmDesc, () => {
        pushToHistory(store.read(), store)
        store.write([])
        playSound('clearAll')
        store.render()
      })
    })
  })

  // 历史记录窗口里的「恢复」按钮组：把回收站里符合条件的条目放回原处（任务→待办，颜色→自定义色）
  const restoreItems = (items) => {
    items.forEach((rec) => {
      if (rec.kind === 'color') {
        restoreCustomColor(rec.text)
      } else {
        const todos = loadTodos()
        todos.unshift({ id: rec.id, text: rec.text, done: rec.done, priority: rec.priority })
        saveTodos(todos)
      }
    })
  }
  const restoreByFilter = (predicate) => {
    const history = loadHistory()
    const picked = history.filter(predicate)
    if (!picked.length) return
    restoreItems(picked)
    saveHistory(history.filter((t) => !predicate(t)))
    if (mainView.filter !== 'all') mainView.filter = 'all'
    playSound('add')
    store.render()
  }

  root.querySelectorAll('.btn-restore-done').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return
      restoreByFilter((t) => t.done)
    })
  })

  root.querySelectorAll('.btn-restore-incomplete').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return
      restoreByFilter((t) => !t.done)
    })
  })

  root.querySelectorAll('.btn-restore-all').forEach((btn) => {
    btn.addEventListener('click', () => {
      restoreByFilter(() => true)
    })
  })
}

/* ── 历史记录（回收站） ── */

const MAX_HISTORY = 200

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list)
      ? list.map((t) => ({ ...t, priority: t.priority || 'medium', done: Boolean(t.done) }))
      : []
  } catch {
    return []
  }
}

function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
}

// 只让「被删除」的任务进回收站；store 决定主列表/历史记录谁往里写
function pushToHistory(items, store) {
  if (!items || !items.length || (store && store.skipHistory)) return
  const history = loadHistory()
  const stamped = items.map((t) => ({
    id: t.id,
    text: t.text,
    done: Boolean(t.done),
    priority: t.priority || 'medium',
    kind: t.kind, // 'color' 表示被删除的自定义颜色
    deletedAt: Date.now(),
  }))
  history.unshift(...stamped)
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
  saveHistory(history)
}

function formatDeletedAt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return sameDay ? `今天 ${time}` : `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`
}

function historyItemHTML(item, indices) {
  if (item.kind === 'color') return colorHistoryItemHTML(item, indices)
  const textHTML = indices && indices.length ? highlightText(item.text, indices) : escapeHtml(item.text)
  return `
          <li class="todo-item history-item ${item.done ? 'done' : ''} priority-${item.priority}" data-id="${item.id}">
            <span class="priority-badge priority-${item.priority}">${PRIORITY_LABELS[item.priority]}</span>
            <span class="todo-text">${textHTML}</span>
            <span class="history-time">${formatDeletedAt(item.deletedAt)}</span>
            <button class="btn-restore" data-action="restore" aria-label="恢复任务" title="恢复到待办清单">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4"/>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>
            <button class="btn-delete" data-action="purge" aria-label="彻底删除" title="从历史记录中移除">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </li>
        `
}

// 回收站里的「自定义颜色」条目：显示色块而不是优先级徽章
function colorHistoryItemHTML(item, indices) {
  const textHTML = indices && indices.length ? highlightText(item.text, indices) : escapeHtml(item.text)
  return `
          <li class="todo-item history-item color-entry" data-id="${item.id}">
            <span class="history-swatch" style="--swatch-color:${escapeAttr(item.text)}"></span>
            <span class="todo-text">${textHTML}</span>
            <span class="history-kind">自定义色</span>
            <span class="history-time">${formatDeletedAt(item.deletedAt)}</span>
            <button class="btn-restore" data-action="restore" aria-label="恢复颜色" title="恢复到自定义颜色">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4"/>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>
            <button class="btn-delete" data-action="purge" aria-label="彻底删除" title="从历史记录中移除">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </li>
        `
}

let historyPanel = null

function createHistoryPanel() {
  const panel = document.createElement('div')
  panel.className = 'history-panel'
  panel.innerHTML = `
    <div class="history-dialog">
      <div class="history-panel-header">
        <h2 class="history-panel-title"><span class="title-icon">🗂️</span> 历史记录</h2>
        <button class="history-close-btn" aria-label="关闭">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="history-panel-body" id="history-body"></div>
    </div>
  `
  document.body.appendChild(panel)
  panel.querySelector('.history-close-btn').addEventListener('click', closeHistory)
  panel.addEventListener('click', (e) => {
    if (e.target === panel) closeHistory()
  })
  return panel
}

function renderHistory() {
  if (!historyPanel) historyPanel = createHistoryPanel()

  // 保持历史搜索框的焦点与光标
  const activeEl = document.activeElement
  const keepFocus = !!activeEl && activeEl.id === 'history-search'
  const caretPos = keepFocus ? activeEl.selectionStart : null

  const body = historyPanel.querySelector('#history-body')
  const items = loadHistory()
  const completed = items.filter((t) => t.done).length

  body.innerHTML = `
      ${searchBoxHTML(historyView, 'history-search', '搜索历史记录（实时模糊匹配）')}
      <p class="search-hint" id="history-hint"></p>
      ${clearActionsHTML(historyView, completed, items.length, false, true)}
      <ul class="todo-list history-list" id="history-list">
        ${listHTML(items, historyView, EMPTY_HISTORY, historyItemHTML)}
      </ul>
      ${clearActionsHTML(historyView, completed, items.length, true, true)}
  `

  bindViewControls(body, historyView, historyStore)
  updateSearchHint(
    body.querySelector('#history-hint'),
    getVisibleItems(items, historyView).length,
    getFilteredTodos(items, historyView.filter).length,
    historyView
  )

  body.querySelector('#history-list').addEventListener('click', (e) => {
    const item = e.target.closest('.history-item')
    if (!item) return
    const actionEl = e.target.closest('[data-action]')
    if (!actionEl) return
    const action = actionEl.dataset.action
    const id = item.dataset.id // 颜色的 id 是 color-xxx 字符串，统一按字符串比较
    const history = loadHistory()
    const record = history.find((t) => String(t.id) === id)
    if (!record) return

    if (action === 'restore') {
      if (record.kind === 'color') {
        restoreCustomColor(record.text)
      } else {
        const todos = loadTodos()
        todos.unshift({ id: record.id, text: record.text, done: record.done, priority: record.priority })
        saveTodos(todos)
        // 恢复后若在「已完成/未完成」筛选下看不见，自动切回「全部」
        if (!matchesFilter(record, mainView.filter)) mainView.filter = 'all'
      }
      saveHistory(history.filter((t) => String(t.id) !== id))
      playSound('add')
      render()
      renderHistory()
    } else if (action === 'purge') {
      saveHistory(history.filter((t) => String(t.id) !== id))
      playSound('delete')
      render()
      renderHistory()
    }
  })

  if (keepFocus) {
    const el = body.querySelector('#history-search')
    el.focus()
    if (caretPos != null) el.setSelectionRange(caretPos, caretPos)
  }
}

function openHistory() {
  if (!historyPanel) historyPanel = createHistoryPanel()
  renderHistory()
  historyPanel.classList.add('open')
}

function closeHistory() {
  if (historyPanel) historyPanel.classList.remove('open')
}

/* ── 两个视图的数据源 ── */

const mainStore = {
  read: loadTodos,
  write: saveTodos,
  render: () => render(),
  listEl: () => document.querySelector('#todo-list'),
  hintEl: () => document.querySelector('#search-hint'),
  empty: EMPTY_MAIN,
  itemRenderer: todoItemHTML,
  clearDoneTitle: '确认清空已完成',
  clearDoneDesc: '已完成的任务将被移入历史记录，可随时恢复。',
  clearIncompleteTitle: '确认清空未完成',
  clearIncompleteDesc: '未完成的任务将被移入历史记录，可随时恢复。',
  confirmTitle: '确认全部清空',
  confirmDesc: '所有任务（含未完成）将被移入历史记录，但原顺序不可恢复。',
}

const historyStore = {
  read: loadHistory,
  write: saveHistory,
  render: () => {
    render()
    renderHistory()
  },
  listEl: () => document.querySelector('#history-list'),
  hintEl: () => document.querySelector('#history-hint'),
  empty: EMPTY_HISTORY,
  itemRenderer: historyItemHTML,
  skipHistory: true, // 历史记录里的删除/清空不再回写回收站
  clearDoneTitle: '确认清空已完成',
  clearDoneDesc: '将从回收站永久删除已完成的记录，无法恢复。',
  clearIncompleteTitle: '确认清空未完成',
  clearIncompleteDesc: '将从回收站永久删除未完成的记录，无法恢复。',
  confirmTitle: '确认清空历史记录',
  confirmDesc: '这将永久删除回收站中的全部记录，无法恢复。',
}

applyTheme(loadTheme())

// 设置面板是常驻在 body 上的，监听只绑一次（放进 bindEvents() 会每次渲染都叠加一个）
document.addEventListener('click', (e) => {
  if (settingsPanel && settingsPanel.classList.contains('open')) {
    const navRow = e.target.closest('[data-nav="sound"]')
    if (navRow) {
      settingsView = 'sound'
      renderSettingsBody()
      updateSettingsHeader()
    }
  }
})

render()
