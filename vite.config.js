import { defineConfig } from 'vite'

// base: './' —— 打包产物用相对路径引用资源，
// 这样 Electron 内嵌服务、静态托管、甚至直接双击打开都能正常加载。
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
