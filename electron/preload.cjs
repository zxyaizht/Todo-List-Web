// 预加载脚本：把「写系统剪贴板」暴露给页面。
// 页面里的 navigator.clipboard 在 Electron 中可能因为权限/窗口未聚焦被拒，
// 走主进程的 clipboard 模块最稳。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('todoDesktop', {
  copyText: (text) => ipcRenderer.invoke('clipboard:write', String(text == null ? '' : text)),
})
