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
    const custom = used.map((t) => t.slice(1)).filter((t) => !['wx-', 'scroll-', 'swiper-', 'movable-', 'cover-', 'picker-', 'rich-', 'func-'].some((p2) => t.startsWith(p2)))
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
 * 输入英文时，键盘上方的候选词条会"打一个字母闪一下"；textarea 没有这个问题 */
const indexWxmlInput = read(path.join(ROOT, 'pages', 'index', 'index.wxml'))
const historyWxmlInput = read(path.join(ROOT, 'pages', 'history', 'history.wxml'))
const settingsWxmlInput = read(path.join(ROOT, 'pages', 'settings', 'settings.wxml'))
const isTextarea = (src, cls) => new RegExp('<textarea[\\s\\S]*?class="' + cls + '"').test(src)
// 注释里会提到 <input>，先去掉注释再判断有没有真的用 input
const stripComments = (s) => String(s).replace(/<!--[\s\S]*?-->/g, '')
check('任务名输入用 textarea（避开 input 的输入法闪烁）', isTextarea(indexWxmlInput, 'form-input'))
check('任务名输入保持单行高度（auto-height）', /class="form-input"[\s\S]*?auto-height="\{\{true\}\}"/.test(indexWxmlInput))
check('任务名输入仍是「完成」键提交', /class="form-input"[\s\S]*?confirm-type="done"/.test(indexWxmlInput))
check('三个页面的输入框都换成 textarea 了', !/<input\b/.test(stripComments(indexWxmlInput))
  && !/<input\b/.test(stripComments(historyWxmlInput))
  && !/<input\b/.test(stripComments(settingsWxmlInput)))
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
// 只取弹窗那个 textarea 标签本身（[^>]* 保证不会跨到别的标签上）
const dialogInputs = [indexWxmlInput, historyWxmlInput, settingsWxmlInput]
  .map((s) => (s.match(/<textarea[^>]*class="page-dialog-input"[^>]*>/) || [''])[0])
check('三个页面的弹窗都有输入框', dialogInputs.every((t) => t !== ''))
check('弹窗输入框带 fixed（原生组件在 fixed 区域里要显式声明）', dialogInputs.every((t) => t.includes('fixed="{{true}}"')))
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

/* 「完成所有」在全完成后变成「取消所有」 */
check('按钮文案由 completeAllLabel 决定', /class="action-btn complete" bindtap="completeAll">\{\{completeAllLabel\}\}/.test(indexWxmlInput))
check('文案里有两个分支', indexJs.includes('✅ 完成所有 (${incomplete})') && indexJs.includes("'↩️ 取消所有'"))
check('按"有没有未完成"决定方向', bodyOf(indexJs, 'completeAll').includes('const target = todos.some((t) => !t.done)'))
check('一次性把所有任务设成目标状态', bodyOf(indexJs, 'completeAll').includes('t.done = target'))
check('已经是目标状态时不白记一步撤回', bodyOf(indexJs, 'completeAll').includes('return'))
/* 计数必须是全量：否则筛了优先级会出现"按钮说取消所有、却把别的优先级也取消了" */
check('主列表计数用全部任务（不随优先级筛选变化）', indexJs.includes('const completed = todos.filter((t) => t.done).length'))
check('回收站计数也用全部记录', historyJs.includes('const completed = history.filter((t) => t.done).length'))

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
check('箭头在排序与优先级筛选之间', (() => {
  const a = indexWxmlInput.indexOf('class="sort-btn"')
  const b = indexWxmlInput.indexOf('class="undo-group"')
  const c = indexWxmlInput.indexOf('class="priority-filter"')
  return a !== -1 && b !== -1 && c !== -1 && a < b && b < c
})())
check('两个箭头都能点且有可访问名', /bindtap="undoAction"[^>]*aria-label="撤回"/.test(indexWxmlInput) && /bindtap="redoAction"[^>]*aria-label="取消撤回"/.test(indexWxmlInput))
check('箭头是实心主题色（与「添加」按钮同色）', /\.undo-btn\s*\{[\s\S]*?background:\s*var\(--primary\)/.test(appWxssInput))
check('不可用时置灰', /\.undo-btn\.disabled\s*\{[\s\S]*?opacity:/.test(appWxssInput))
check('清空全部后撤回箭头仍然可见（工具栏不跟着消失）', /wx:if="\{\{total > 0 \|\| canUndo \|\| canRedo\}\}"/.test(indexWxmlInput))
check('列表空时工具栏只剩箭头并居中', /class="list-toolbar \{\{total > 0 \? '' : 'solo'\}\}"/.test(indexWxmlInput) && /\.list-toolbar\.solo\s*\{[\s\S]*?justify-content:\s*center/.test(appWxssInput))
check('工具行窄屏可换行（不挤压）', /\.list-toolbar\s*\{[\s\S]*?flex-wrap:\s*wrap/.test(appWxssInput))
/* 每个"改数据"的操作都要先记一步 */
;[
  ['index', ipage => read(path.join(ROOT, 'pages', 'index', 'index.js')), ['addTodo', 'toggleTodo', 'deleteTodo', 'editTodo', 'completeAll', 'clearDone', 'clearIncomplete', 'clearAll', 'completeClear']],
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

/* 界面调整：齿轮在右上角、历史记录与优先级同行、操作按钮文字换行 */
const indexWxmlUi = read(path.join(ROOT, 'pages', 'index', 'index.wxml'))
const appWxssUi = read(path.join(ROOT, 'app.wxss'))
const indexWxssUi = read(path.join(ROOT, 'pages', 'index', 'index.wxss'))
check('设置已改为右上角齿轮', /class="settings-gear"/.test(indexWxmlUi) && /\.settings-gear\s*\{/.test(indexWxssUi))
check('齿轮仍绑定 goSettings', /class="settings-gear"[^>]*bindtap="goSettings"/.test(indexWxmlUi))
check('齿轮定位在页面内容区（导航栏下方，避开胶囊）', /\.settings-gear\s*\{[\s\S]*?margin-top:/.test(indexWxssUi))
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
check('清空已完成要确认：index.clearDone', bodyOf(indexJs, 'clearDone').includes('showModal'))
check('清空未完成要确认：index.clearIncomplete', bodyOf(indexJs, 'clearIncomplete').includes('showModal'))
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
  posIn(indexWxmlInput, 'class="pagination"') > posIn(indexWxmlInput, 'class="list"')
  && posIn(indexWxmlInput, 'class="pagination"') < posIn(indexWxmlInput, 'bindtap="clearAll"'))
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
check('排序用 showActionSheet（原生选择器）', indexJs.includes('showActionSheet'))
check('复制用 wx.setClipboardData', read(path.join(ROOT, 'pages', 'settings', 'settings.js')).includes('setClipboardData'))
check('存储用 wx.setStorageSync（不是 localStorage）', read(path.join(ROOT, 'utils', 'storage.js')).includes('wx.setStorageSync') && !read(path.join(ROOT, 'utils', 'storage.js')).includes('localStorage'))

lines.push('')
lines.push(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
