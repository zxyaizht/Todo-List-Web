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

/* 5. 音效文件 */
const soundJs = read(path.join(ROOT, 'utils', 'sound.js'))
const soundPaths = soundJs.match(/'\/assets\/sounds\/[^']+'/g) || []
check('sound.js 里引用了音效文件', soundPaths.length === 5, '实际 ' + soundPaths.length + ' 个')
soundPaths.forEach((s) => {
  const rel = s.replace(/'/g, '').replace(/^\//, '')
  check('音效文件存在：' + rel, exists(path.join(ROOT, rel)))
})

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
check('音量/频率有默认值且做了范围校验', storageJs.includes('SOUND_DEFAULTS') && storageJs.includes('merged.frequency = Math.min'))
const soundJsSrc = read(path.join(ROOT, 'utils', 'sound.js'))
check('播放时应用音量', soundJsSrc.includes('ctx.volume'))
check('播放时按频率换算播放倍率', soundJsSrc.includes('ctx.playbackRate'))

/* 选优先级时不该收起键盘 */
check('输入框保持键盘（hold-keyboard）', /hold-keyboard="\{\{true\}\}"/.test(indexWxml))

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
check('排序用 showActionSheet（原生选择器）', indexJs.includes('showActionSheet'))
check('复制用 wx.setClipboardData', read(path.join(ROOT, 'pages', 'settings', 'settings.js')).includes('setClipboardData'))
check('存储用 wx.setStorageSync（不是 localStorage）', read(path.join(ROOT, 'utils', 'storage.js')).includes('wx.setStorageSync') && !read(path.join(ROOT, 'utils', 'storage.js')).includes('localStorage'))

lines.push('')
lines.push(`通过 ${pass} 项，失败 ${fail} 项`)
fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8')
process.exit(fail === 0 ? 0 : 1)
