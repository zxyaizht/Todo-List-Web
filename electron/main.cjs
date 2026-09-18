const { app, BrowserWindow } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

/* 说明：这里不起 file:// 而是起一个本地静态服务再加载。
 * 原因：Chromium 对 file:// 页面的 localStorage 支持不可靠，
 * 而本应用的数据全存在 localStorage —— 走 http://127.0.0.1 才能保证数据正常读写。 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
}

// 开发环境从项目根运行，打包后 dist 在 app.asar 里，两种情况下 ../dist 都成立
function distDir() {
  return path.join(__dirname, '..', 'dist')
}

function startServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0])
      const target = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
      const filePath = path.join(root, target)

      // 防目录穿越
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end('Forbidden')
        return
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // 找不到就回退到 index.html（本项目是单页应用）
          fs.readFile(path.join(root, 'index.html'), (err2, fallback) => {
            if (err2) {
              res.writeHead(404).end('Not found')
              return
            }
            res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(fallback)
          })
          return
        }
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': type }).end(data)
      })
    })

    server.on('error', reject)
    // 端口传 0 = 由系统分配空闲端口，避免和其他程序冲突
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function createWindow() {
  const server = await startServer(distDir())
  const { port } = server.address()

  const win = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 420,
    minHeight: 520,
    title: '我的待办清单',
    autoHideMenuBar: true, // 隐藏菜单栏，看起来更像独立应用
    backgroundColor: '#f8fafc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  win.setMenuBarVisibility(false)
  win.on('closed', () => {
    server.close()
  })

  await win.loadURL(`http://127.0.0.1:${port}/`)
}

app.whenReady().then(createWindow).catch((err) => {
  console.error('启动失败：', err)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
