import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index/index.html'),
          startpage: resolve(__dirname, 'src/renderer/startpage/startpage.html'),
          bookmarks: resolve(__dirname, 'src/renderer/bookmarks/bookmarks.html'),
          history: resolve(__dirname, 'src/renderer/history/history.html'),
          popup: resolve(__dirname, 'src/renderer/popup/popup.html'),
          permission: resolve(__dirname, 'src/renderer/permission/permission.html'),
          settings: resolve(__dirname, 'src/renderer/settings/settings.html')
        }
      }
    }
  }
})