/* 小程序静态校验
 * 这里跑不了真实的微信小程序，所以把能自动检查的都查一遍：
 *   1. 所有 JSON 能解析
 *   2. app.json 里声明的页面，四件套文件齐全
 *   3. 各页面 JS 里的 require 路径都存在；都调用了 Page({...})
 *   4. WXML 里绑定的处理函数，在对应页面的 JS 里确实定义了
 *   5. 音效 wav 文件都在
 * 运行： node miniprogram/test/validate.js */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const OUT = (process.env.TEMP || '.') + '/miniprogram-validate.txt'
const lines = []
let pass = 0
let fail = 0

function ok(label) { pass++; lines.push('PASS | ' + label) }
function bad(label, detail) { fail++; lines.push('FAIL | ' + label + (detail ? ' -> ' + detail : '')) }
function check(label, condition, detail) { condition ? ok(label) : bad(label, detail) }

const read = (p) => fs.readFileSync(p, 'utf8')
const exists = (p) => fs.existsSync(p)

lines.push('=== 小程序静态校验 ===')

/* 1. JSON 全部可解析 */
function walk(dir, out) {
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name)
    if (name === 'node_modules') return
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(full)
  })
  return out
}
const allFiles = walk(ROOT, [])
const jsonFiles = allFiles.filter((f) => f.endsWith('.json'))
jsonFiles.forEach((f) => {
  try {
    JSON.parse(read(f))
    ok('JSON 可解析：' + path.relative(ROOT, f))
  } catch (e) {
    bad('JSON 可解析：' + path.relative(ROOT, f), e.message)
  }
})

/* 2. 页面四件套 */
const appJson = JSON.parse(read(path.join(ROOT, 'app.json')))
check('app.json 声明了页面', Array.isArray(appJson.pages) && appJson.pages.length > 0)
check('app.json 指向 sitemap', appJson.sitemapLocation === 'sitemap.json')
// 按需注入：开启后只注入当前页面所需的代码（开发者工具「代码质量」会检查这一项）
check('已开启组件按需注入', appJson.lazyCodeLoading === 'requiredComponents', 'app.json 需要 lazyCodeLoading: requiredComponents')
check('sitemap.json 存在', exists(path.join(ROOT, 'sitemap.json')))
check('app.js 存在', exists(path.join(ROOT, 'app.js')))
check('app.wxss 存在', exists(path.join(ROOT, 'app.wxss')))
check('project.config.json 存在', exists(path.join(ROOT, 'project.config.json')))

appJson.pages.forEach((p) => {
  const base = path.join(ROOT, p)
  check('页面存在：' + p + '.js', exists(base + '.js'))
  check('页面存在：' + p + '.wxml', exists(base + '.wxml'))
  check('页面存在：' + p + '.json', exists(base + '.json'))
  check('页面存在：' + p + '.wxss', exists(base + '.wxss'))
  // 按需注入要求：用到自定义组件必须在页面的 usingComponents 里声明（本项目只用内置组件）
  try {
    const pageJson = JSON.parse(read(base + '.json'))
    check('页面声明了 usingComponents：' + p, !!pageJson.usingComponents && typeof pageJson.usingComponents === 'object')
    const used = read(base + '.wxml').match(/<([a-z][a-z0-9]*-[a-z0-9-]+)/g) || []
    // 带连字符的**内置组件**（page-meta / cover-view / scroll-view …）不算自定义组件
    const BUILTIN = ['wx-', 'scroll-', 'swiper-', 'movable-', 'cover-', 'picker-', 'rich-', 'func-', 'page-meta', 'match-media', 'root-portal', 'share-element', 'keyboard-accessory', 'voip-room', 'page-container']
    const custom = used.map((t) => t.slice(1)).filter((t) => !BUILTIN.some((p2) => t.startsWith(p2) || t === p2))
    check('没有用到未声明的自定义组件：' + p, custom.every((t) => !!pageJson.usingComponents[t]), custom.join(', '))
  } catch (e) {
    bad('读取页面 json：' + p, e.message)
  }
})

/* 3. require 路径 + Page() */
const jsFiles = allFiles.filter((f) => f.endsWith('.js') && !f.includes(path.sep + 'test' + path.sep))
jsFiles.forEach((f) => {
  const src = read(f)
  const rel = path.relative(ROOT, f)
  const reqs = src.match(/require\(['"]([^'"]+)['"]\)/g) || []
  reqs.forEach((r) => {
    const target = r.match(/require\(['"]([^'"]+)['"]\)/)[1]
    if (target.startsWith('.')) {
      let resolved = path.resolve(path.dirname(f), target)
      if (!exists(resolved) && !exists(resolved + '.js')) {
        bad('require 可解析：' + rel + ' -> ' + target)
      } else {
        ok('require 可解析：' + rel + ' -> ' + target)
      }
    }
  })
})

appJson.pages.forEach((p) => {
  const src = read(path.join(ROOT, p + '.js'))
  check('调用了 Page({...})：' + p, /Page\s*\(\s*\{/.test(src))
})

/* 4. WXML 绑定的事件处理函数必须在页面 JS 里定义 */
appJson.pages.forEach((p) => {
  const wxml = read(path.join(ROOT, p + '.wxml'))
  const js = read(path.join(ROOT, p + '.js'))
  const handlers = new Set()
  const re = /(?:bind|catch)([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g
  let m
  while ((m = re.exec(wxml)) !== null) handlers.add(m[2])
  handlers.forEach((h) => {
    const defined = new RegExp('(^|[^a-zA-Z0-9_])' + h + '\\s*(\\(|:)', 'm').test(js)
    check('事件处理函数已定义：' + p + ' -> ' + h, defined)
  })
})

/* 5. 音效：改为运行时合成，不再打包音频文件 */
const soundJs = read(path.join(ROOT, 'utils', 'sound.js'))
check('运行时合成模块 synth.js 存在', exists(path.join(ROOT, 'utils', 'synth.js')))
check('sound.js 引用 synth', /require\('\.\/synth'\)/.test(soundJs))
check('sound.js 不再引用打包音频', !/assets\/sounds/.test(soundJs))
check('已删除旧的音频资源目录', !exists(path.join(ROOT, 'assets', 'sounds')))
check('音高变化时会清理旧的合成文件', soundJs.includes('unlinkSync'))
check('合成为 5 个事件音效 + 钢琴音', (() => {
  const src = read(path.join(ROOT, 'utils', 'synth.js'))
  return ['add', 'priority', 'delete', 'clearDone', 'clearAll'].every((k) => new RegExp('\\b' + k + ':').test(src)) && /function pianoWav/.test(src)
})())

/* 6. 一些小检查 */
// wx:key="index" 是常见误用：它不是内置关键字，只有 item 真有 index 属性才对
appJson.pages.forEach((p) => {
  const wxml = read(path.join(ROOT, p + '.wxml'))
  const misuse = (wxml.match(/wx:key="index"/g) || []).length
  check('没有误用 wx:key="index"：' + p, misuse === 0, '出现 ' + misuse + ' 次')
})

const indexJs = read(path.join(ROOT, 'pages', 'index', 'index.js'))
const historyJs = read(path.join(ROOT, 'pages', 'history', 'history.js'))
const settingsJs = read(path.join(ROOT, 'pages', 'settings', 'settings.js'))

// 从源码里按大括号配对取出某个方法的函数体
function bodyOf(src, name) {
  const idx = src.indexOf(name + '(')
  if (idx === -1) return ''
  const start = src.indexOf('{', idx)
  if (start === -1) return ''
  let depth = 0
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') {
      depth--
      if (depth === 0) return src.slice(start, j + 1)
    }
  }
  return ''
}

/* 连续录入：加完任务光标要留在输入框，可以一直「打字 + 回车」（与网页版一致） */
const indexWxml = read(path.join(ROOT, 'pages', 'index', 'index.wxml'))
check('输入框回车提交', /bindconfirm="addTodo"/.test(indexWxml))
check('回车不收起键盘（confirm-hold）', /confirm-hold="\{\{true\}\}"/.test(indexWxml))
check('输入框受 focus 控制（加完可重新聚焦）', /focus="\{\{inputFocus\}\}"/.test(indexWxml))
check('输入框失焦有回调', /bindblur="onInputBlur"/.test(indexWxml))
check('页面定义了 onInputBlur', bodyOf(indexJs, 'onInputBlur') !== '')
check('页面定义了 keepInputFocus', bodyOf(indexJs, 'keepInputFocus') !== '')
check('输入时不逐字 setData（值暂存页面属性）', !bodyOf(indexJs, 'onInput').includes('setData'))
check('加完任务会重新聚焦输入框', bodyOf(indexJs, 'addTodo').includes('keepInputFocus'))
check('失焦回调把 inputFocus 置 false', bodyOf(indexJs, 'onInputBlur').includes('inputFocus'))

/* 预设色回填自定义输入框 */
check('点预设色会把色码填进自定义输入框', bodyOf(settingsJs, 'pickTheme').includes('customInput'))

/* 音效参数：音量 + 频率滑杆（颜色跟随主题） */
const settingsWxml = read(path.join(ROOT, 'pages', 'settings', 'settings.wxml'))
check('设置页有音量与频率两个滑杆', (settingsWxml.match(/<slider/g) || []).length === 2)
check('滑杆颜色用主题色', /activeColor="\{\{theme\}\}"/.test(settingsWxml) && /block-color="\{\{theme\}\}"/.test(settingsWxml))
check('滑杆绑定了 change 回调', /bindchange="onVolumeChange"/.test(settingsWxml) && /bindchange="onFreqChange"/.test(settingsWxml))
check('定义了 onVolumeChange', bodyOf(settingsJs, 'onVolumeChange') !== '')
check('定义了 onFreqChange', bodyOf(settingsJs, 'onFreqChange') !== '')
const storageJs = read(path.join(ROOT, 'utils', 'storage.js'))
check('音量/频率有默认值且做了范围校验', storageJs.includes('SOUND_DEFAULTS') && storageJs.includes('core.clampKey(stored.pianoKey)'))
const soundJsSrc = read(path.join(ROOT, 'utils', 'sound.js'))
const coreJsSrc = read(path.join(ROOT, 'utils', 'core.js'))
const appJsSrc = read(path.join(ROOT, 'app.js'))
check('播放时应用音量', soundJsSrc.includes('ctx.volume'))
check('播放走本地合成文件（边合成边播）', soundJsSrc.includes('writeFileSync') && soundJsSrc.includes('createInnerAudioContext'))
check('音量滑杆为 0~100 并显示百分比', /max="100"/.test(settingsWxml) && /\{\{soundVolume\}\}%/.test(settingsWxml))
check('频率滑杆为 0~87（钢琴 88 键全音域）', /max="87"/.test(settingsWxml) && /\{\{soundNote\}\}/.test(settingsWxml))
check('音量数值可点击输入', /bindtap="editVolume"/.test(settingsWxml) && bodyOf(settingsJs, 'editVolume') !== '')
check('频率数值可点击输入', /bindtap="editPitch"/.test(settingsWxml) && bodyOf(settingsJs, 'editPitch') !== '')
check('自定义输入后同样试听', bodyOf(settingsJs, 'editVolume').includes('preview') && bodyOf(settingsJs, 'editPitch').includes('preview'))
check('自定义输入能解析音名与 Hz', bodyOf(settingsJs, 'editPitch').includes('parsePitch'))
check('音量以 0~1 存储（volume）', storageJs.includes('merged.volume = Math.min') && soundJsSrc.includes('settings.volume'))
check('频率以琴键序号存储（pianoKey）并兼容旧字段', storageJs.includes('merged.pianoKey = core.clampKey') && storageJs.includes('core.freqToKey(130.8128'))
check('钢琴全音域换算在 core 里', coreJsSrc.includes('function keyToFreq') && coreJsSrc.includes('function keyNameOf') && coreJsSrc.includes('function parsePitch'))
check('两个滑杆松手都会试听', bodyOf(settingsJs, 'onVolumeChange').includes('preview') && bodyOf(settingsJs, 'onFreqChange').includes('preview'))
check('试听不受 5 个开关限制（preview 直接播）', /function preview\(/.test(soundJsSrc) && !bodyOf(soundJsSrc, 'preview').includes('settings['))
check('事件音效随音高移调（按 REF_FREQ 缩放）', read(path.join(ROOT, 'utils', 'synth.js')).includes('freq / REF_FREQ'))
check('启动时放宽音频可闻性（setInnerAudioOption）', appJsSrc.includes('setInnerAudioOption'))

/* 输入组件统一用 textarea：微信官方已知问题 —— 部分安卓输入法在 <input> 里
 * 输入英文时，键盘上方的候选词条会"打一个字母闪一下"；textarea 没有这个问题。
 * **唯一例外**：跳页弹窗那个输入框用 <input type="number"> —— 页码只可能是数字，
 * 只有 input 的 type 能把键盘切成数字键盘（textarea 没有 type），
 * 而纯数字键盘不涉及字母，上面那个闪烁问题不存在。 */
const indexWxmlInput = read(path.join(ROOT, 'pages', 'index', 'index.wxml'))
const historyWxmlInput = read(path.join(ROOT, 'pages', 'history', 'history.wxml'))
const settingsWxmlInput = read(path.join(ROOT, 'pages', 'settings', 'settings.wxml'))
const isTextarea = (src, cls) => new RegExp('<textarea[\\s\\S]*?class="' + cls + '"').test(src)
// 注释里会提到 <input>，先去掉注释再判断有没有真的用 input
const stripComments = (s) => String(s).replace(/<!--[\s\S]*?-->/g, '')
const countInputs = (src) => (stripComments(src).match(/<input\b/g) || []).length
check('任务名输入用 textarea（避开 input 的输入法闪烁）', isTextarea(indexWxmlInput, 'form-input'))
check('任务名输入保持单行高度（auto-height）', /class="form-input"[\s\S]*?auto-height="\{\{true\}\}"/.test(indexWxmlInput))
check('任务名输入仍是「完成」键提交', /class="form-input"[\s\S]*?confirm-type="done"/.test(indexWxmlInput))
check('除跳页弹窗外全用 textarea（每页只有那一个 input）',
  [indexWxmlInput, historyWxmlInput, settingsWxmlInput].every((s) => countInputs(s) === 1))
check('主列表搜索框也是 textarea', isTextarea(indexWxmlInput, 'search-input'))
check('历史记录搜索框也是 textarea', isTextarea(historyWxmlInput, 'search-input'))
check('色值输入也是 textarea', isTextarea(settingsWxmlInput, 'custom-input'))
// textarea 的 height 不生效，必须用 min-height 撑出单行高度
const appWxssInput = read(path.join(ROOT, 'app.wxss'))
check('textarea 用 min-height 撑高度', /\.form-input\s*\{[\s\S]*?min-height:/.test(appWxssInput)
  && /\.search-input\s*\{[\s\S]*?min-height:/.test(appWxssInput))
check('回车插换行时也能提交（onInput 兜底）', bodyOf(indexJs, 'onInput').includes('addTodo(null, true)'))
check('任务名会清掉换行', bodyOf(indexJs, 'addTodo').includes('\\n'))

/* 播放链路的两个真机 bug（声音时好时坏 / 每个频率都差不多） */
check('缓存文件名带音高（否则播放器按路径缓存旧音频）', /sfx-\$\{key\}-\$\{name\}\.wav/.test(soundJsSrc))
check('每次播放都新建播放实例（不复用做 stop→play）', /function playFile[\s\S]*?createInnerAudioContext/.test(soundJsSrc))
check('换音高后延迟清理旧文件（不掐断正在播的音）', soundJsSrc.includes('setTimeout') && soundJsSrc.includes('cleanStale'))
check('播放出错会自动重播一次', soundJsSrc.includes('onError') && soundJsSrc.includes('retried'))
check('缓存文件被系统清掉后会重合成', soundJsSrc.includes('fileExists'))
check('合成带限（谐波不越过奈奎斯特）', read(path.join(ROOT, 'utils', 'synth.js')).includes('harmonicCount'))

/* 点太快会"音爆"：三个来源都要治（详见 utils/sound.js 文件头注释 3） */
check('每个音效同时只留一个实例（连点不叠加 → 不削波）', soundJsSrc.includes('playing[name]') && soundJsSrc.includes('retire(prev)'))
check('被打断的实例先淡出再销毁（不是从波形半空中硬切）', soundJsSrc.includes('function fadeOut') && soundJsSrc.includes('function retire'))
check('多个音同时响时按 1/√n 留余量', soundJsSrc.includes('Math.sqrt(live.length)'))
check('增益只降不升（避免中途抬音量"噗"一声）', soundJsSrc.includes('target < c.__gain'))

/* 色值输入框：和任务名输入框一样，只有用户主动退出输入才失焦 */
check('色值输入框也保持键盘（hold-keyboard）', /class="custom-input"[\s\S]*?hold-keyboard="\{\{true\}\}"/.test(settingsWxmlInput))
check('色值输入框回车不收键盘（confirm-hold）', /class="custom-input"[\s\S]*?confirm-hold="\{\{true\}\}"/.test(settingsWxmlInput))
check('色值输入框受 focus 控制', /class="custom-input"[\s\S]*?focus="\{\{colorFocus\}\}"/.test(settingsWxmlInput))
check('色值输入框失焦有回调', /class="custom-input"[\s\S]*?bindblur="onCustomBlur"/.test(settingsWxmlInput))
check('定义了 onCustomBlur / keepColorFocus', bodyOf(settingsJs, 'onCustomBlur') !== '' && bodyOf(settingsJs, 'keepColorFocus') !== '')
check('应用色值后光标留在输入框', bodyOf(settingsJs, 'applyCustom').includes('keepColorFocus'))
check('认不出颜色时也不把用户踢出输入框', /showToast[\s\S]*?keepColorFocus/.test(bodyOf(settingsJs, 'applyCustom')))

/* 最近用色的分页（与主列表 / 历史记录同一套控件与规则） */
check('最近用色有分页控件（复用全局 .pagination）', /class="pagination"/.test(settingsWxmlInput)
  && /bindtap="prevColorPage"/.test(settingsWxmlInput)
  && /bindtap="nextColorPage"/.test(settingsWxmlInput))
check('分页显示「当前页 / 总页数」', /\{\{customPage\}\} \/ \{\{customTotalPages\}\}/.test(settingsWxmlInput))
check('只有一页时不显示分页控件', /wx:if="\{\{customTotalPages > 1\}\}"/.test(settingsWxmlInput))
check('每页 5 个（与主任务清单 PAGE_SIZE 一致）', settingsJs.includes('COLORS_PAGE_SIZE = 5'))
check('自定义色数量不限', storageJs.includes('MAX_CUSTOM_COLORS = Infinity'))
const settingsWxssInput = read(path.join(ROOT, 'pages', 'settings', 'settings.wxss'))
check('色块网格 5 列（与每页 5 个对齐，一页一行）', /\.saved-grid\s*\{[\s\S]*?repeat\(5, 1fr\)/.test(settingsWxssInput))
check('按页切片后才渲染', settingsJs.includes('colors.slice((page - 1) * COLORS_PAGE_SIZE, page * COLORS_PAGE_SIZE)'))
check('页码越界收敛到首/末页', settingsJs.includes('Math.min(Math.max(1, Number(p) || this.customPage), total)'))
check('删到不足一页时页码回收到末页', settingsJs.includes('Math.min(Math.max(1, this.customPage || 1), totalPages)'))
check('「全部删除」按总数判断（不是当前页长度）', settingsJs.includes('if (!this.data.customCount) return'))
check('新增颜色后跳到第 1 页（新颜色插在最前）', bodyOf(settingsJs, 'applyCustom').includes('this.customPage = 1'))
check('标题显示颜色总数', /\{\{customCount\}\}/.test(settingsWxmlInput))

/* 点页码 → 弹出跳页弹窗（三个页面共用 utils/pagedit.js，规则与网页版 startPageEdit 一致）
 * 弹窗是**自绘**的，因为两件事 showModal 都办不到（它只能传 title/content/showCancel/cancelText/
 * cancelColor/confirmText/confirmColor/editable/placeholderText，位置与键盘行为不受控）：
 *   1) 打开就自动聚焦 → 键盘马上弹出来，点一下就能改，少点一次；
 *   2) 用键盘高度把自己顶到键盘上方（固定定位的蒙层不会跟着平台"上推页面"动，
 *      所以还要把输入框的 adjust-position 关掉，免得重复位移）。 */
const pageditJs = read(path.join(ROOT, 'utils', 'pagedit.js'))
check('pagedit.js 导出五个入口', ['openPageDialog', 'inputPageDialog', 'onDialogKeyboard', 'closePageDialog', 'confirmPageDialog']
  .every((k) => new RegExp('\\n  ' + k + ',').test(pageditJs)))
// 注释里正解释"为什么不用 wx.showModal"，所以要先去掉注释再断言（否则注释会被当成代码）
const pageditCode = pageditJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
check('不再用 wx.showModal（位置与键盘行为都不受控）', !pageditCode.includes('showModal'))
check('键盘高度相同就忽略（官方 tip：这个事件会重复触发）', pageditJs.includes('page.data.pageKeyHeight === height'))
check('关弹窗时键盘高度复位', /closePageDialog\(page\)\s*\{[\s\S]*?pageKeyHeight: 0/.test(pageditJs))
check('解析规则只有一份（pagedit 复用 core.parsePageInput）', pageditJs.includes("require('./core')") && pageditJs.includes('core.parsePageInput'))
check('core 里定义了并导出 parsePageInput', coreJsSrc.includes('function parsePageInput') && coreJsSrc.includes('parsePageInput,'))
check('三个页面的页码都能点击编辑', [indexWxmlInput, historyWxmlInput, settingsWxmlInput]
  .every((s) => /class="page-indicator tappable" bindtap="editPage"/.test(s)))
check('可点页码的样式已定义（虚线 + 主题色）', /\.page-indicator\.tappable\s*\{[\s\S]*?dashed/.test(appWxssInput))
check('三个页面都有跳页弹窗', [indexWxmlInput, historyWxmlInput, settingsWxmlInput]
  .every((s) => /class="page-dialog"/.test(s) && /class="page-dialog-card"/.test(s)))
// 只取弹窗那个输入框标签本身（[^>]* 保证不会跨到别的标签上）
const dialogInputs = [indexWxmlInput, historyWxmlInput, settingsWxmlInput]
  .map((s) => (s.match(/<input[^>]*class="page-dialog-input"[^>]*>/) || [''])[0])
check('三个页面的弹窗都有输入框', dialogInputs.every((t) => t !== ''))
check('弹窗输入框是数字键盘（用户不用再切换输入法）', dialogInputs.every((t) => t.includes('type="number"')))
check('弹窗输入框打开就自动聚焦（少点一下，键盘立刻弹出来）',
  dialogInputs.every((t) => t.includes('auto-focus="{{true}}"') && t.includes('focus="{{true}}"') ))
check('关掉平台的上推页面（固定蒙层本来就动不了，开着会和自己的位移重复）', dialogInputs.every((t) => t.includes('adjust-position="{{false}}"')))
check('输入框上接了键盘高度监听（focus 与 keyboardheightchange 同一个 handler）',
  dialogInputs.every((t) => t.includes('bindkeyboardheightchange="onPageDialogKeyboard"') && t.includes('bindfocus="onPageDialogKeyboard"')))
check('弹窗输入框不带走键盘的 confirm-hold / hold-keyboard（确定后要跟着收起来）', dialogInputs.every((t) => !/hold-keyboard/.test(t) && !/confirm-hold/.test(t)))
check('弹窗有取消 / 确定两个按钮', [indexWxmlInput, historyWxmlInput, settingsWxmlInput]
  .every((s) => /bindtap="closePageDialog"/.test(s) && /bindtap="confirmPageDialog"/.test(s)))
// 蒙层用 padding-bottom 顶到键盘上方 + 过渡 → "跟着键盘平滑移动"
check('蒙层靠 pageKeyHeight 抬高自己', [indexWxmlInput, historyWxmlInput, settingsWxmlInput]
  .every((s) => /class="page-dialog" style="padding-bottom: \{\{pageKeyHeight\}\}px"/.test(s)))
check('抬高是带过渡的（平滑移动而不是硬跳）', /\.page-dialog\s*\{[\s\S]*?transition:\s*padding-bottom/.test(appWxssInput))
check('弹窗样式已定义（蒙层固定 + 主题色确定键）', /\.page-dialog\s*\{[\s\S]*?position:\s*fixed/.test(appWxssInput)
  && /\.page-dialog-btn\.primary\s*\{[\s\S]*?background:\s*var\(--primary\)/.test(appWxssInput))
;['index', 'history', 'settings'].forEach((p) => {
  const src = read(path.join(ROOT, 'pages', p, p + '.js'))
  check('页面引入 pagedit：' + p, /require\('\.\.\/\.\.\/utils\/pagedit'\)/.test(src))
  check('页面接了五个弹窗 handler：' + p, ['editPage', 'onPageDialogInput', 'onPageDialogKeyboard', 'closePageDialog', 'confirmPageDialog']
    .every((fn) => new RegExp(fn + '\\s*\\([\\s\\S]{0,90}?pagedit\\.').test(src)))
  check('页面 data 里有弹窗状态：' + p, /pageDialog:\s*false/.test(src) && /pageTotal:\s*1/.test(src) && /pageKeyHeight:\s*0/.test(src))
})
check('主列表跳页后套用新页码并刷新', /apply\(next\)[\s\S]{0,140}?view\.page = next[\s\S]{0,60}?this\.refresh\(\)/.test(indexJs))
check('回收站跳页后套用新页码并刷新', /apply\(next\)[\s\S]{0,140}?view\.page = next[\s\S]{0,60}?this\.refresh\(\)/.test(historyJs))
check('最近用色跳页后走统一跳页逻辑', /apply\(next\)[\s\S]{0,90}?gotoColorPage/.test(settingsJs))

/* 等级拆成两个维度（2026-10-01 用户要求）：轻重（圆形，存 priority）+ 缓急（沙漏，存 urgency）。
 * 两个都放在**任务名右边、日期左边** —— 一是成组好认，二是离左边的完成按钮远一点，
 * 点「完成」时不会误触到改等级（用户踩过这个）。
 * 注意：等级相关那几条样式（.badge-hit / .urgency-hit / .level-pick 等）已从 index.wxss
 * **挪到 app.wxss**（任务组子页面也要用同一套），所以这里把两个文件拼起来判 ——
 * 后面声明的 indexWxssUi 在这段断言**之后**，不能直接引用（TDZ，踩过好几次）。 */
const indexWxssBadge = read(path.join(ROOT, 'pages', 'index', 'index.wxss')) + appWxssInput
// 只在「普通任务」那一段里比顺序（任务组那行也在同一个循环里，会干扰全局 indexOf）
const taskRowPart = indexWxmlInput.slice(indexWxmlInput.indexOf('<!-- 普通任务 -->'))
check('任务行的顺序：完成按钮 → 名称 → 轻重圆 → 缓急沙漏 → 日期', (() => {
  const c = taskRowPart.indexOf('class="check ')
  const t = taskRowPart.indexOf('class="item-text')
  const w = taskRowPart.indexOf('class="badge-hit"')
  const u = taskRowPart.indexOf('class="urgency-hit"')
  const d = taskRowPart.indexOf('class="item-date"')
  return c !== -1 && t !== -1 && w !== -1 && u !== -1 && d !== -1 && c < t && t < w && w < u && u < d
})())
check('圆和沙漏都可点，且点哪个都开改等级弹窗', /class="badge-hit" data-id="\{\{item\.id\}\}" bindtap="openLevelDialog"/.test(indexWxmlInput)
  && /class="urgency-hit" data-id="\{\{item\.id\}\}" bindtap="openLevelDialog"/.test(indexWxmlInput))
check('轻重圆里显示档位文字', /\{\{item\.weightLabel\}\}/.test(indexWxmlInput))
check('沙漏只靠颜色表达等级（里面没有文字）', /class="urgency-icon urgency-\{\{item\.urgency\}\}"><\/view>/.test(indexWxmlInput))
check('沙漏用 CSS 画（emoji 改不了颜色）', /\.urgency-icon::before/.test(appWxssInput) && /border-top:\s*16rpx solid currentColor/.test(appWxssInput))
check('沙漏是拟物画法：上下木板比玻璃宽 + 上半半透明', /\.urgency-icon\s*\{[\s\S]*?border-top:\s*5rpx solid currentColor[\s\S]*?border-radius:\s*3rpx/.test(appWxssInput)
  && /\.urgency-icon::before\s*\{[\s\S]*?opacity:\s*0\.55/.test(appWxssInput))
check('沙漏四档颜色都定义了（无=固定灰）', ['none', 'low', 'medium', 'high'].every((lv) => new RegExp('\\.urgency-icon\\.urgency-' + lv + '\\s*\\{').test(appWxssInput)))
check('回收站里等级位置与主列表一致（都在名称右边，圆在沙漏左边）', (() => {
  const t = historyWxmlInput.indexOf('class="item-text')
  const w = historyWxmlInput.indexOf('class="badge priority-')
  const u = historyWxmlInput.indexOf('class="urgency-icon urgency-')
  return t !== -1 && w !== -1 && u !== -1 && t < w && w < u
})())
check('点按区域放大到 68rpx 且视觉不位移', /\.badge-hit\s*\{[\s\S]*?padding:\s*12rpx;[\s\S]*?margin:\s*-12rpx;/.test(indexWxssBadge))
check('沙漏的点按区域也放大了', /\.urgency-hit\s*\{[\s\S]*?padding:\s*12rpx;[\s\S]*?margin:\s*-12rpx;/.test(indexWxssBadge))
// 等级相关按钮不做"按下变淡"的反馈（用户要求：换档时图标颜色直接切）
check('等级按钮不做按下变淡', !/hover-class="badge-hit-hover"/.test(indexWxmlInput) && !/\.badge-hit-hover\s*\{/.test(indexWxssBadge))
check('下拉菜单项用底色做反馈（不涉及图标颜色）', /hover-class="menu-item-hover"/.test(indexWxmlInput) && /\.menu-item-hover\s*\{[\s\S]*?background:/.test(appWxssInput))
// 弹窗：一个弹窗两行（轻重 / 缓急），沿用 .priority-option 胶囊
check('弹窗是两行（轻重 / 缓急）', /\{\{levelDialog\}\}[\s\S]*?level-dialog-row[\s\S]*?>轻重<[\s\S]*?level-dialog-row[\s\S]*?>缓急</.test(indexWxmlInput))
check('弹窗复用「新建任务」那套胶囊', /class="priority-option priority-\{\{item\}\} \{\{levelPick\.priority === item \? 'selected' : ''\}\}"/.test(indexWxmlInput)
  && /class="priority-option priority-\{\{item\}\} \{\{levelPick\.urgency === item \? 'selected' : ''\}\}"/.test(indexWxmlInput))
check('两行各自列出全部档位（含「无」）', (indexWxmlInput.match(/wx:for="\{\{levelOrder\}\}"/g) || []).length === 2
  && /weightLabels\[item\]/.test(indexWxmlInput) && /urgencyLabels\[item\]/.test(indexWxmlInput))
check('弹窗有标题与取消 / 确定', /class="page-dialog-title">修改等级/.test(indexWxmlInput)
  && /bindtap="closeLevelDialog"/.test(indexWxmlInput) && /bindtap="confirmLevelDialog"/.test(indexWxmlInput))
check('弹窗状态放在 data 里', /levelDialog:\s*false/.test(indexJs) && /levelPick:\s*\{\s*priority:/.test(indexJs))
check('打开时把这条任务的两个等级都拷进弹窗', /openLevelDialog\(e\)[\s\S]{0,400}?priority: core\.normalizeLevel\(todo\.priority\)[\s\S]{0,120}?urgency: core\.normalizeLevel\(todo\.urgency\)/.test(indexJs))
check('两行共用一个 pickLevel，用 data-kind 区分', /pickLevel\(e\)[\s\S]{0,220}?dataset\.kind/.test(indexJs) && /data-kind="priority"/.test(indexWxmlInput) && /data-kind="urgency"/.test(indexWxmlInput))
check('两个等级都没变就不动数据', /confirmLevelDialog\(\)[\s\S]{0,520}?todo\.priority === pick\.priority && todo\.urgency === pick\.urgency\)\)\s*return/.test(indexJs))
check('确定后刷新列表', bodyOf(indexJs, 'confirmLevelDialog').includes('this.refresh()'))
// 改完不能让"新建任务"的默认档位跟着变（那是另外两个状态）
check('改等级不碰新建任务的默认档位', !/selectedWeight/.test(bodyOf(indexJs, 'confirmLevelDialog')) && !/selectedUrgency/.test(bodyOf(indexJs, 'confirmLevelDialog')) && !/savePriority|saveUrgency/.test(bodyOf(indexJs, 'confirmLevelDialog')))
check('关弹窗会清掉目标 id', bodyOf(indexJs, 'closeLevelDialog').includes('levelTargetId = null'))
// 新建任务那行：不再列胶囊，改成两个循环按钮
check('新建行只留两个等级按钮（不再列高中低）', /class="level-pick" bindtap="cycleWeight"/.test(indexWxmlInput) && /class="level-pick" bindtap="cycleUrgency"/.test(indexWxmlInput)
  && !/bindtap="pickPriority"/.test(indexWxmlInput))
check('两个按钮默认都是「无」（灰色）', /priority:\s*'none'/.test(indexJs) && /urgency:\s*'none'/.test(indexJs) && /weightLabel:\s*'无'/.test(indexJs))
check('点一下切一级：无 → 轻 → 中 → 重', /cycleWeight\(\)[\s\S]{0,200}?core\.nextLevel\(selectedWeight\)/.test(indexJs)
  && /cycleUrgency\(\)[\s\S]{0,200}?core\.nextLevel\(selectedUrgency\)/.test(indexJs))
check('切完会记住这次选择（跨启动保留）', /cycleWeight\(\)[\s\S]{0,240}?store\.savePriority/.test(indexJs) && /cycleUrgency\(\)[\s\S]{0,240}?store\.saveUrgency/.test(indexJs))
check('两个按钮也放大了点按区域', /\.level-pick\s*\{[\s\S]*?margin:\s*-12rpx;/.test(indexWxssBadge))
// 工具栏：两个维度各一行筛选
// 工具栏：排序 / 轻重 / 缓急 三个"路径筛选式"下拉，同一行；点开是卡片列表 + 箭头旋转
check('工具栏是三个下拉同一行（排序 / 轻重 / 缓急）', (indexWxmlInput.match(/class="menu-wrap"/g) || []).length === 3
  && /bindtap="toggleMenu"[\s\S]{0,200}?data-menu="sort"/.test(indexWxmlInput)
  && /data-menu="weight"/.test(indexWxmlInput) && /data-menu="urgency"/.test(indexWxmlInput))
check('三个下拉在同一行容器里', /class="toolbar-menus"/.test(indexWxmlInput) && /\.toolbar-menus\s*\{[\s\S]*?display:\s*flex/.test(appWxssInput))
check('下拉列出来的是选项列表（带颜色圆点与当前项打勾）', /class="menu-pop"/.test(indexWxmlInput)
  && /class="menu-dot priority-\{\{item\}\}"/.test(indexWxmlInput) && /class="menu-check"/.test(indexWxmlInput))
check('箭头有旋转动画', /\.menu-caret\s*\{[\s\S]*?transition:\s*transform/.test(appWxssInput)
  && /\.menu-btn\.open \.menu-caret\s*\{[\s\S]*?rotate\(180deg\)/.test(appWxssInput))
check('点别处能收起（透明蒙层）', /class="menu-mask" catchtap="closeMenu"/.test(indexWxmlInput) && /class="menu-mask" catchtap="closeMenu"/.test(historyWxmlInput))
check('蒙层在下、下拉卡片在上、按钮还能点（z-index 关系）', /\.menu-mask\s*\{[\s\S]*?z-index:\s*90/.test(appWxssInput)
  && /\.menu-pop\s*\{[\s\S]*?z-index:\s*91/.test(appWxssInput)
  && /\.menu-btn\s*\{[\s\S]*?z-index:\s*92/.test(appWxssInput))
// 用 [^}]* 把匹配限制在这条规则内（[\\s\\S]*? 会一路吃到后面的规则里去，第一次就误判了）
check('menu-wrap 不能设 z-index（否则下拉会被蒙层盖住）', !/\.menu-wrap\s*\{[^}]*z-index/.test(appWxssInput))
check('两个等级筛选共用一个 handler，用 data-menu 区分', /pickLevelFilter\(e\)[\s\S]{0,300}?dataset\.menu/.test(indexJs)
  && /pickLevelFilter\(e\)[\s\S]{0,300}?dataset\.menu/.test(historyJs))
check('筛选切换后回到第 1 页', /pickLevelFilter\(e\)[\s\S]{0,700}?view\.page = 1/.test(indexJs) && /pickLevelFilter\(e\)[\s\S]{0,700}?view\.page = 1/.test(historyJs))
// 只截取 SORT_ORDER 数组本身来数（别在整份源码里数，SORT_LABELS/SORT_SHORT 里也有同样的 key）
const sortOrderBody = (/const SORT_ORDER = \[([\s\S]*?)\]/.exec(coreJsSrc) || ['', ''])[1]
// 注释里正解释"为什么不用 showActionSheet"，所以要先剥掉注释再断言
const stripBothComments = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
check('排序也走自绘下拉（showActionSheet 最多 6 项，不够 8 个选项用）',
  !stripBothComments(indexJs).includes('showActionSheet') && !stripBothComments(historyJs).includes('showActionSheet'))
check('排序清单 8 项且含缓急两向', (sortOrderBody.match(/'/g) || []).length / 2 === 8
  && sortOrderBody.includes("'urgency-desc'") && sortOrderBody.includes("'urgency-asc'"))
check('两个筛选各自有自己的状态', /priorityFilter === item/.test(indexWxmlInput) && /urgencyFilter === item/.test(indexWxmlInput)
  && /priorityFilter:\s*view\.priority/.test(indexJs) && /urgencyFilter:\s*view\.urgency/.test(indexJs))
check('筛选含「无」这一档', /LEVEL_FILTER_ORDER = \['all', 'none', 'low', 'medium', 'high'\]/.test(coreJsSrc))
check('「无」是固定灰色（不跟主题色）', /--priority-none:\s*#[0-9a-fA-F]{6}/.test(appWxssInput)
  && /\.badge\.priority-none\s*\{[\s\S]*?var\(--priority-none\)/.test(appWxssInput)
  && /\.item\.priority-none\s*\{[\s\S]*?var\(--priority-none\)/.test(appWxssInput))
// 排序按「轻重」算，「无」排最后
check('排序按轻重、无排在最后', /const rankOf = \(t\) => LEVEL_RANK\[normalizeLevel\(t\.priority\)\]/.test(coreJsSrc)
  && /LEVEL_RANK = \{ none: 0/.test(coreJsSrc))

/* 「完成所有」在全完成后变成「取消所有」 */
check('按钮文案由 completeAllLabel 决定', /class="action-btn complete" bindtap="completeAll">\{\{completeAllLabel\}\}/.test(indexWxmlInput))
check('文案里有两个分支', indexJs.includes('✅ 完成所有 (${incomplete})') && indexJs.includes("'↩️ 取消所有'"))
check('按"有没有未完成"决定方向', bodyOf(indexJs, 'completeAll').includes('const target = mine.some((t) => !t.done)'))
check('一次性把所有任务设成目标状态', bodyOf(indexJs, 'completeAll').includes('t.done = target'))
check('已经是目标状态时不白记一步撤回', bodyOf(indexJs, 'completeAll').includes('return'))
/* 计数必须是全量：否则筛了优先级会出现"按钮说取消所有、却把别的优先级也取消了" */
/* 计数跟随等级筛选（2026-10-01 用户要求：筛了轻重/缓急后，按钮上的数字要跟着变），
 * 而且**动作必须用同一个范围**执行，否则就成了"按钮写着 3 个、点下去清掉 10 个"。 */
const countScopeOf = (src) => /countByLevelScope\([a-zA-Z]+, view\.priority, view\.urgency\)/.test(src)
check('主列表计数跟随等级筛选', countScopeOf(indexJs))
check('回收站计数跟随等级筛选', countScopeOf(historyJs))
check('组内页面计数跟随等级筛选', countScopeOf(read(path.join(ROOT, 'pages', 'group', 'group.js'))))
check('主列表的完成所有/取消所有也收在同一范围', /completeAll\(\)[\s\S]{0,400}?core\.getFilteredItems\(todos, 'all', view\.priority, view\.urgency\)/.test(indexJs))
check('主列表的清空已完成/未完成也收在同一范围', /clearByDone\(isDone\)[\s\S]{0,600}?core\.getFilteredItems\(todos, 'all', view\.priority, view\.urgency\)/.test(indexJs)
  && /clearByDone\(isDone\)[\s\S]{0,1200}?hasLevelScope\(view\.priority, view\.urgency\)/.test(indexJs))
check('组内的清空也收在同一范围', /clearByDone\(isDone\)[\s\S]{0,700}?core\.getFilteredItems\(/.test(read(path.join(ROOT, 'pages', 'group', 'group.js'))))
check('回收站的恢复已完成/未完成跟随范围（全部那两个保持全局）',
  /restoreDone\(\)\s*\{\s*this\.restoreByFilter\(this\.scoped\(/.test(historyJs)
  && /restoreAll\(\)\s*\{\s*this\.restoreByFilter\(\(\) => true\)/.test(historyJs))
check('回收站的清空已完成/未完成跟随范围（全部清空保持全局）',
  /clearDone\(\)\s*\{\s*this\.purgeByFilter\(this\.scoped\(/.test(historyJs)
  && /clearAll\(\)\s*\{\s*this\.purgeByFilter\(\(\) => true/.test(historyJs))
check('有色范围时确认提示会写明"当前筛选范围内"', indexJs.includes("const prefix = scoped ? '当前筛选范围内' : ''") && historyJs.includes('只清当前筛选范围内的记录'))
check('计数范围不含完成状态筛选与搜索（core 注释里写死了）', coreJsSrc.includes('不**包含完成状态筛选') && coreJsSrc.includes('countByLevelScope'))

/* 撤回 / 取消撤回 */
const undoJs = read(path.join(ROOT, 'utils', 'undo.js'))
check('undo.js 存在并导出四个入口', ['push', 'undo', 'redo', 'canUndo', 'canRedo'].every((k) => new RegExp('\\n  ' + k + ',').test(undoJs)))
check('快照包含任务 / 回收站 / 自定义色', undoJs.includes('store.loadTodos()') && undoJs.includes('store.loadHistory()') && undoJs.includes('store.loadCustomColors()'))
check('撤回栈有深度上限', /MAX_DEPTH = \d+/.test(undoJs) && undoJs.includes('undoStack.shift()'))
check('新操作会清空重做栈', undoJs.includes('redoStack = []'))
check('storage 提供自定义色整体写回（撤回要整表还原）', storageJs.includes('function saveCustomColors'))
check('撤回写回时也还原自定义色', undoJs.includes('store.saveCustomColors'))
check('主列表引入 undo', /require\('\.\.\/\.\.\/utils\/undo'\)/.test(indexJs))
check('撤回后能立即反映到箭头状态', indexJs.includes('canUndo: undo.canUndo()') && indexJs.includes('canRedo: undo.canRedo()'))
check('定义了 undoAction / redoAction', bodyOf(indexJs, 'undoAction').includes('undo.undo()') && bodyOf(indexJs, 'redoAction').includes('undo.redo()'))
// 注意：afterTimeTravel 在定义之前就被 this.afterTimeTravel('add') 调用过，
// bodyOf 取的是"第一次出现"后面的函数体，会取错 → 这里用带参数的函数头锚定
check('撤回后切回「全部」并回到第 1 页', /afterTimeTravel\(soundKey\)\s*\{[\s\S]*?view\.filter = 'all'[\s\S]*?view\.page = 1/.test(indexJs))
check('三个下拉在左、撤回箭头在右（同一行）', (() => {
  const menus = indexWxmlInput.indexOf('class="toolbar-menus"')
  const undo = indexWxmlInput.indexOf('class="undo-group"')
  return menus !== -1 && undo !== -1 && menus < undo
})())
check('两个箭头都能点且有可访问名', /bindtap="undoAction"[^>]*aria-label="撤回"/.test(indexWxmlInput) && /bindtap="redoAction"[^>]*aria-label="取消撤回"/.test(indexWxmlInput))
check('箭头是实心主题色（与「添加」按钮同色）', /\.undo-btn\s*\{[\s\S]*?background:\s*var\(--primary\)/.test(appWxssInput))
check('不可用时置灰', /\.undo-btn\.disabled\s*\{[\s\S]*?opacity:/.test(appWxssInput))
check('清空全部后撤回箭头仍然可见（工具栏不跟着消失）', /wx:if="\{\{total > 0 \|\| canUndo \|\| canRedo\}\}"/.test(indexWxmlInput))
check('列表空时工具栏只剩箭头并居中', /class="list-toolbar \{\{total > 0 \? '' : 'solo'\}\}"/.test(indexWxmlInput) && /\.list-toolbar\.solo\s*\{[\s\S]*?justify-content:\s*center/.test(appWxssInput))
check('工具行窄屏可换行（不挤压）', /\.list-toolbar\s*\{[\s\S]*?flex-wrap:\s*wrap/.test(appWxssInput))
/* 每个"改数据"的操作都要先记一步 */
;[
  ['index', ipage => read(path.join(ROOT, 'pages', 'index', 'index.js')), ['addTodo', 'toggleTodo', 'deleteTodo', 'editTodo', 'completeAll', 'clearAll', 'completeClear', 'confirmLevelDialog']],
  // 注意：clearByDone 在定义之前就被 clearDone / clearIncomplete 调用过，
  // bodyOf 会取错函数体（它取的是"第一次出现"之后的第一对花括号）→ 单独用带参数的精确正则判
  ['history', () => historyJs, ['restoreOne', 'purgeOne', 'restoreByFilter', 'purgeByFilter']],
  ['settings', () => settingsJs, ['applyCustom', 'removeColor', 'clearAllColors']],
].forEach(([page, getSrc, fns]) => {
  const src = getSrc()
  fns.forEach((fn) => {
    check('改动前先记撤回：' + page + '.' + fn, bodyOf(src, fn).includes('undo.push()'))
  })
})

/* 选优先级时不该收起键盘 */
check('输入框保持键盘（hold-keyboard）', /hold-keyboard="\{\{true\}\}"/.test(indexWxml))

/* 界面调整：顶部标题栏去掉、齿轮挪到优先级左边、操作按钮文字换行 */
const indexWxmlUi = read(path.join(ROOT, 'pages', 'index', 'index.wxml'))
const appWxssUi = read(path.join(ROOT, 'app.wxss'))
const indexWxssUi = read(path.join(ROOT, 'pages', 'index', 'index.wxss'))
check('设置齿轮存在且已样式化', /class="settings-gear"/.test(indexWxmlUi) && /\.settings-gear\s*\{/.test(indexWxssUi))
check('齿轮仍绑定 goSettings', /class="settings-gear"[^>]*bindtap="goSettings"/.test(indexWxmlUi))
check('主页面顶部标题 / 副标题已移除', !/header-title/.test(indexWxmlUi) && !/header-sub/.test(indexWxmlUi))
check('主页面不再有 .header 块', !/class="header"/.test(indexWxmlUi))
check('index.wxss 里清掉了废弃的 .header / .header-main', !/^\.header\s*\{/m.test(indexWxssUi) && !/^\.header-main\s*\{/m.test(indexWxssUi))
check('齿轮排在两个等级按钮左边（顺序：齿轮 → 轻重圆 → 缓急沙漏 → 历史记录）', (() => {
  const g = indexWxmlUi.indexOf('class="settings-gear"')
  const w = indexWxmlUi.indexOf('class="level-pick" bindtap="cycleWeight"')
  const u = indexWxmlUi.indexOf('class="level-pick" bindtap="cycleUrgency"')
  const h = indexWxmlUi.indexOf('class="history-btn"')
  return g !== -1 && w !== -1 && u !== -1 && h !== -1 && g < w && w < u && u < h
})())
check('齿轮与等级按钮同组（space-between 下仍紧挨着）', /class="priority-row-left"/.test(indexWxmlUi) && /\.priority-row-left\s*\{/.test(appWxssInput))
check('优先级行窄屏可换行（齿轮+胶囊+历史记录一行放不下时）', /\.priority-row\s*\{[\s\S]*?flex-wrap:\s*wrap/.test(appWxssInput))
check('历史记录与优先级同一行', /class="priority-row"/.test(indexWxmlUi) && /class="history-btn"/.test(indexWxmlUi))
check('旧的 topbar 已移除', !/topbar/.test(indexWxmlUi) && !/topbar/.test(indexWxssUi))
check('操作按钮文字允许换行', /\.action-btn\s*\{[\s\S]*?white-space:\s*normal/.test(appWxssUi))
check('操作按钮不再裁掉文字', !/\.action-btn\s*\{[\s\S]*?overflow:\s*hidden/.test(appWxssUi))

/* 音效响度已拉满 */
check('合成做了归一化（响度拉满）', read(path.join(ROOT, 'utils', 'synth.js')).includes('SOUND_PEAK'))

/* 交互约定（与网页版一致）：
 * 单个删除立即执行、不弹确认框（回收站就是后悔药）；
 * 批量 / 清空类操作必须二次确认，避免一次误删一片。 */
check('单个删除不弹确认框：index.deleteTodo', !bodyOf(indexJs, 'deleteTodo').includes('showModal'))
check('单条彻底删除不弹确认框：history.purgeOne', !bodyOf(historyJs, 'purgeOne').includes('showModal'))
check('删除单个颜色不弹确认框：settings.removeColor', !bodyOf(settingsJs, 'removeColor').includes('showModal'))
check('清空已完成/未完成要确认、且改动前先记撤回：index.clearByDone',
  /clearByDone\(isDone\)\s*\{[\s\S]{0,1400}?undo\.push\(\)/.test(indexJs)
  && /clearByDone\(isDone\)\s*\{[\s\S]{0,900}?showModal/.test(indexJs))
check('清空未完成走同一个 handler（用 isDone 区分）', /clearIncomplete\(\)\s*\{\s*this\.clearByDone\(false\)/.test(indexJs))
check('清空全部要确认：index.clearAll', bodyOf(indexJs, 'clearAll').includes('showModal'))
check('完成所有并清空要确认：index.completeClear', bodyOf(indexJs, 'completeClear').includes('showModal'))
check('回收站批量清空的确认框在 purgeByFilter 里：history.purgeByFilter', bodyOf(historyJs, 'purgeByFilter').includes('showModal'))
check('回收站批量清空走统一确认：history.clearAll', /purgeByFilter\(/.test(bodyOf(historyJs, 'clearAll')))
check('回收站清空已完成走统一确认：history.clearDone', /purgeByFilter\(/.test(bodyOf(historyJs, 'clearDone')))
check('回收站批量恢复不弹确认框：history.restoreAll', !bodyOf(historyJs, 'restoreAll').includes('showModal'))
check('主列表有 8 个操作入口（清空/完成类函数齐全）', ['clearAll', 'completeClear', 'clearDone', 'clearIncomplete', 'completeAll'].every((k) => indexJs.includes(k + '(')))

/* 回收站（历史记录页）操作行：用户要求 9 个按钮、三行各 3 个，
   第二行顺序为「恢复全部 → 恢复已完成 → 恢复未完成」，并去掉「完成所有并清空」
   注意 split 用的是 '<view class="action-row'（不带收尾引号），
   因为挪到清单下方的行多带一个 action-row-bottom 类名。 */
const historyRows = historyWxmlInput.split('<view class="action-row').slice(1)
const rowHandlers = (chunk) => (chunk.match(/<view class="action-btn[^>]*?bindtap="([a-zA-Z]+)"/g) || [])
  .map((tag) => /bindtap="([a-zA-Z]+)"/.exec(tag)[1])
const historyRowHandlers = historyRows.map(rowHandlers)
check('回收站操作行是三行', historyRowHandlers.length, 3)
check('回收站每行 3 个按钮（共 9 个）', historyRowHandlers.map((r) => r.length).join(','), '3,3,3')
check('第一行仍是筛选任务的 3 个按钮（不动）', historyRowHandlers[0].join(','), 'setFilter,setFilter,setFilter')
check('第二行顺序：恢复全部 → 恢复已完成 → 恢复未完成', historyRowHandlers[1].join(','), 'restoreAll,restoreDone,restoreIncomplete')
check('第三行顺序：全部清空 → 清空已完成 → 清空未完成', historyRowHandlers[2].join(','), 'clearAll,clearDone,clearIncomplete')
check('回收站不再有「完成所有并清空」按钮', !/completeClear/.test(historyWxmlInput))
// 注释里会提到被删掉的函数名，先去掉行注释再断言（否则"注释提到"会被当成"代码还有"）
const stripJsComments = (s) => String(s).replace(/\/\/[^\n]*/g, '')
check('历史页不再有 completeClear 函数（去掉了死代码）', !stripJsComments(historyJs).includes('completeClear'))
check('主列表的「完成所有并清空」不受影响', /bindtap="completeClear"/.test(indexWxmlInput) && indexJs.includes('completeClear('))

/* 布局：清空/恢复类按钮与任务清单上下对调（用户要求），排序、优先级筛选、页码都不动 */
const posIn = (src, needle) => src.indexOf(needle)
check('主列表：筛选+完成所有仍在清单上方', posIn(indexWxmlInput, 'bindtap="completeAll"') < posIn(indexWxmlInput, 'class="list"'))
check('主列表：排序与优先级筛选仍在最上方', posIn(indexWxmlInput, 'class="list-toolbar"') < posIn(indexWxmlInput, 'class="list"'))
check('主列表：清空类 4 个挪到清单下方', posIn(indexWxmlInput, 'bindtap="clearAll"') > posIn(indexWxmlInput, 'class="list"'))
check('主列表：页码仍紧跟在清单之后（在清空之前）',
  posIn(indexWxmlInput, 'class="pagination ') > posIn(indexWxmlInput, 'class="list"')
  && posIn(indexWxmlInput, 'class="pagination ') < posIn(indexWxmlInput, 'bindtap="clearAll"'))
check('主列表：挪下去的操作行有分隔间距', /class="action-row action-row-bottom"/.test(indexWxmlInput))
check('回收站：筛选行仍在清单上方', posIn(historyWxmlInput, 'bindtap="setFilter"') < posIn(historyWxmlInput, 'class="list"'))
check('回收站：恢复+清空 6 个挪到清单下方',
  posIn(historyWxmlInput, 'bindtap="restoreAll"') > posIn(historyWxmlInput, 'class="list"')
  && posIn(historyWxmlInput, 'bindtap="clearAll"') > posIn(historyWxmlInput, 'class="list"'))
check('回收站：页码仍在清单与恢复行之间',
  posIn(historyWxmlInput, 'class="pagination"') > posIn(historyWxmlInput, 'class="list"')
  && posIn(historyWxmlInput, 'class="pagination"') < posIn(historyWxmlInput, 'bindtap="restoreAll"'))
check('挪到下方的操作行有间距样式', /\.action-row-bottom\s*\{[\s\S]*?margin-top:/.test(appWxssInput))

/* 导航栏（含刘海/状态栏）必须跟随主题：wx.setNavigationBarColor 只作用于当前页面，
   所以每个页面 onShow 与 onReady 都要重新同步一次 */
const appJs = read(path.join(ROOT, 'app.js'))
check('app.js 提供 syncNavigationBar', /syncNavigationBar\s*\(\s*\)\s*\{/.test(appJs))
check('syncNavigationBar 会重设导航栏颜色', /setNavigationBarColor/.test(appJs) && /syncNavigationBar[\s\S]*?applyTheme/.test(appJs))
;['index', 'history', 'settings'].forEach((p) => {
  const src = read(path.join(ROOT, 'pages', p, p + '.js'))
  check('页面 onShow 里同步导航栏：' + p, /onShow\s*\(\s*\)\s*\{[\s\S]*?syncNavigationBar/.test(src))
  check('页面 onReady 里再同步一次导航栏：' + p, /onReady\s*\(\s*\)\s*\{[\s\S]*?syncNavigationBar/.test(src))
})
check('复制用 wx.setClipboardData', read(path.join(ROOT, 'pages', 'settings', 'settings.js')).includes('setClipboardData'))
/* 剪贴板是隐私接口：用户没同意隐私协议时会失败（错误码 103/104），要给出可操作的提示，
 * 不能只说"复制失败"。 */
check('复制失败时区分"没同意隐私协议"和普通失败',
  /copyCode\(e\)[\s\S]{0,700}?errno === 103 \|\| err\.errno === 104/.test(settingsJs)
  && settingsJs.includes('请先同意隐私协议'))
check('存储用 wx.setStorageSync（不是 localStorage）', read(path.join(ROOT, 'utils', 'storage.js')).includes('wx.setStorageSync') && !read(path.join(ROOT, 'utils', 'storage.js')).includes('localStorage'))

/* ── 任务组：合并 / 批量合并 / 组内子页面（2026-10-01） ── */

// 数据层
check('storage 有任务组的读写/合并/解散/查询',
  ['loadGroups', 'saveGroups', 'addTasksToGroup', 'createGroup', 'dissolveGroup', 'loadGroupTodos', 'findGroup']
    .every((fn) => new RegExp('function ' + fn + '\\(').test(storageJs)))
check('撤销快照包含任务组（合并会同时改组和任务的 groupId）',
  undoJs.includes('groups: store.loadGroups()') && undoJs.includes('store.saveGroups'))
check('core 有默认组名与列表行合成',
  ['nextGroupName', 'buildListRows', 'getListPage'].every((fn) => coreJsSrc.includes('function ' + fn + '(')))

// 主列表：任务组行
check('任务组行最左边是勾选框（点它完成/取消完成组内全部）',
  /class="check \{\{item\.allDone \? 'checked' : ''\}\}" data-id="\{\{item\.id\}\}" bindtap="toggleGroupAll"/.test(indexWxmlInput))
check('组勾选框的状态按"组内是否都完成"算', coreJsSrc.includes('allDone: count > 0 && doneCount === count') && indexJs.includes('allDone: !!row.allDone'))
check('一键完成组内全部：按"有没有未完成"决定方向、只动本组、先记撤回',
  /toggleGroupAll\(e\)[\s\S]{0,700}?const target = mine\.some\(\(t\) => !t\.done\)/.test(indexJs)
  && /toggleGroupAll\(e\)[\s\S]{0,900}?undo\.push\(\)/.test(indexJs))
check('点组名是改名（不是进组）', /class="item-text group-name"[^>]*bindtap="renameGroup"/.test(indexWxmlInput)
  && /renameGroup\(e\)[\s\S]{0,900}?store\.saveGroups/.test(indexJs))
check('箭头在组名右边、任务数左边，点它才进组', (() => {
  const n = indexWxmlInput.indexOf('class="item-text group-name"')
  const a = indexWxmlInput.indexOf('class="group-arrow"')
  const c = indexWxmlInput.indexOf('class="group-count"')
  const del = indexWxmlInput.indexOf('bindtap="removeGroup"')
  return n !== -1 && a !== -1 && c !== -1 && del !== -1 && n < a && a < c && c < del
})())
check('任务组行显示任务数', /\{\{item\.count\}\} 项/.test(indexWxmlInput))
check('设置页顶部标题栏也已移除', !/header-title/.test(settingsWxmlInput) && !/header-sub/.test(settingsWxmlInput) && !/class="header"/.test(settingsWxmlInput))
check('进组的箭头点按区域也放大了', /\.group-arrow\s*\{[\s\S]*?padding:\s*12rpx;[\s\S]*?margin:\s*-12rpx;/.test(appWxssInput))
// 这里用本地 read（groupJs 声明在文件更后面，直接引用会 TDZ —— 踩过）
check('组内页面会在组名被改后同步标题',
  /refresh\(\)\s*\{[\s\S]{0,600}?setNavigationBarTitle/.test(read(path.join(ROOT, 'pages', 'group', 'group.js'))))
check('任务组行右侧有删除（解散）', /class="item-op del" data-id="\{\{item\.id\}\}" bindtap="removeGroup"/.test(indexWxmlInput))
check('主列表用 core.getListPage 合成「组 + 任务」的行', indexJs.includes('core.getListPage(groups, todos, view)'))
check('混排的 wx:key 带前缀（防组/任务 id 撞车）',
  /wx:key="key"/.test(indexWxmlInput) && indexJs.includes("key: 'g-' + row.group.id") && indexJs.includes("key: 't-' + t.id"))
check('解散任务组要二次确认', /removeGroup\(e\)[\s\S]{0,700}?wx\.showModal/.test(indexJs))
check('解散时组内任务一起进回收站（用户选择）', /removeGroup\(e\)[\s\S]{0,1100}?store\.pushToHistory\(members\)/.test(indexJs))

// 批量合并
check('合并按钮在分页行最左（上一页左边）', (() => {
  const m = indexWxmlInput.indexOf('class="merge-btn')
  const p = indexWxmlInput.indexOf('class="pagination-pages"')
  const prev = indexWxmlInput.indexOf('bindtap="prevPage"')
  return m !== -1 && p !== -1 && prev !== -1 && m < p && p < prev
})())
check('分页行在 total>0 就渲染（只有一页时也点得到合并）',
  /wx:if="\{\{total > 0\}\}" class="pagination pagination-merge"/.test(indexWxmlInput))
check('合并模式下按钮变「完成」并带已选数量',
  /class="merge-btn \{\{mergeMode \? 'done' : ''\}\}" bindtap="mergeAction"/.test(indexWxmlInput)
  && /mergeMode \? '完成'/.test(indexWxmlInput) && /pickedCount/.test(indexWxmlInput))
check('合并模式最右出现「取消」', /wx:if="\{\{mergeMode\}\}" class="merge-btn cancel" bindtap="cancelMerge"/.test(indexWxmlInput))
check('勾选框在合并模式下只做选择、不动完成状态',
  /onCheckTap\(e\)[\s\S]{0,300}?if \(!this\.data\.mergeMode\) return this\.toggleTodo\(e\)/.test(indexJs))
check('取消合并会恢复筛选 / 搜索 / 页码', /cancelMerge\(\)[\s\S]{0,900}?view\.page = before\.page/.test(indexJs))
check('合并按钮比清空类更深（实心主题色，仍跟随主题）',
  /\.merge-btn\s*\{[\s\S]*?background:\s*var\(--primary\)/.test(appWxssInput)
  && /\.merge-btn\.cancel\s*\{[\s\S]*?background:\s*var\(--primary-soft\)/.test(appWxssInput))
check('至少选两个才能合并', indexJs.includes('至少选两个任务才能合并'))

// 命名弹窗
check('命名弹窗打开即自动聚焦（直接弹输入法）', /\{\{groupDialog\}\}[\s\S]{0,800}?auto-focus="\{\{true\}\}"/.test(indexWxmlInput))
check('命名输入框背景与「今天要做什么」一致（同一个变量）',
  /\.page-dialog-input\s*\{[\s\S]*?background:\s*var\(--primary-soft\)/.test(appWxssInput)
  && /\.form-input\s*\{[\s\S]*?background:\s*var\(--primary-soft\)/.test(appWxssInput))
check('placeholder 写「直接确认默认为任务组N」',
  indexJs.includes('直接确认默认为${fallback}') && /placeholder="\{\{groupPlaceholder\}\}"/.test(indexWxmlInput))
check('默认名用 core.nextGroupName 实时算',
  /openGroupDialog\(taskIds\)[\s\S]{0,500}?core\.nextGroupName\(store\.loadGroups\(\)\)/.test(indexJs))
check('直接确定就用默认名', /const name = typed \|\| core\.nextGroupName\(store\.loadGroups\(\)\)/.test(indexJs))
check('确定后建组、记撤回、退出合并模式',
  /confirmGroupDialog\(\)[\s\S]{0,1000}?undo\.push\(\)[\s\S]{0,200}?store\.createGroup\(name, ids\)/.test(indexJs)
  && /confirmGroupDialog\(\)[\s\S]{0,1400}?mergeMode: false/.test(indexJs))

// 拖动合并
check('任务行接了长按 / 拖动 / 松手三个事件',
  /bindlongpress="onItemLongPress"[\s\S]{0,200}?bindtouchmove="onItemTouchMove"[\s\S]{0,200}?bindtouchend="onItemTouchEnd"/.test(indexWxmlInput))
check('拖动时禁止页面滚动（page-meta）',
  /<page-meta page-style="\{\{dragging \? 'overflow: hidden;' : ''\}\}"><\/page-meta>/.test(indexWxmlInput))
check('拖动有跟随手指的浮标与落点高亮',
  /\{\{dragging\}\}" class="drag-ghost"/.test(indexWxmlInput) && /\.item\.drag-over\s*\{/.test(appWxssInput))
check('落在任务组上 = 直接加入该组', /onItemTouchEnd\(\)[\s\S]{0,1000}?store\.addTasksToGroup\(group\.id, \[dragId\]\)/.test(indexJs))
check('落在另一个任务上 = 建新组并弹命名', /onItemTouchEnd\(\)[\s\S]{0,1500}?openGroupDialog\(\[String\(dragId\), String\(over\.id\)\]\)/.test(indexJs))
check('拖完短暂屏蔽行点击（防误触发改名 / 完成）',
  /onItemTouchEnd\(\)[\s\S]{0,700}?suppressTapUntil = Date\.now\(\) \+ 300/.test(indexJs) && /tapBlocked\(\)/.test(indexJs))
check('任务组本身不能被拖', /onItemLongPress\(e\)[\s\S]{0,400}?row\.kind === 'group'\) return/.test(indexJs))
check('拖动时定时重量元素位置（页面万一滚了也不跑偏）',
  /onItemLongPress\(e\)[\s\S]{0,1200}?setInterval\(/.test(indexJs) && /measureRows\(\)/.test(indexJs))

// 组内子页面
const groupJs = read(path.join(ROOT, 'pages', 'group', 'group.js'))
const groupWxml = read(path.join(ROOT, 'pages', 'group', 'group.wxml'))
check('组内页面输入框文案是「还要做什么」', /placeholder="还要做什么？"/.test(groupWxml))
check('组内页面没有齿轮与历史记录', !/goSettings/.test(groupWxml) && !/goHistory/.test(groupWxml))
check('组内页面标题 = 任务组名', groupJs.includes('wx.setNavigationBarTitle({ title: group.name })'))
check('组不存在时提示并退回', /findGroup\(id\)[\s\S]{0,500}?navigateBack/.test(groupJs))
check('新任务带 groupId 落进本组', /groupId: this\.groupId/.test(groupJs))
check('组内增删改都写回整份清单（不能冲掉其它任务）',
  groupJs.includes('store.saveTodos(todos.filter((t) => !ids[String(t.id)]))') && /store\.loadTodos\(\)/.test(groupJs))
check('组内没有清空全部 / 完成所有并清空 / 合并',
  !/clearAll\(/.test(groupWxml) && !/completeClear/.test(groupWxml) && !/mergeAction/.test(groupWxml))
check('组内页面也同步导航栏主题', /onShow\s*\(\s*\)\s*\{[\s\S]{0,120}?syncNavigationBar/.test(groupJs))

lines.push('')
lines.push(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
