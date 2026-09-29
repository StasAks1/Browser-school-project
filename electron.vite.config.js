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
          settings: resolve(__dirname, 'src/renderer/settings/settings.html'),
          downloads: resolve(__dirname, 'src/renderer/downloads/downloads.html'),
          cookies: resolve(__dirname, 'src/renderer/cookies/cookies.html'),
          reader: resolve(__dirname, 'src/renderer/reader/reader.html'),
          statusbar: resolve(__dirname, 'src/renderer/statusbar/statusbar.html'),
          error: resolve(__dirname, 'src/renderer/error/error.html'),
          warning: resolve(__dirname, 'src/renderer/warning/warning.html'),
          popup: resolve(__dirname, 'src/renderer/popup/popup.html'),
          permission: resolve(__dirname, 'src/renderer/permission/permission.html'),
          pdf: resolve(__dirname, 'src/renderer/pdf/pdf.html'),
          extensions: resolve(__dirname, 'src/renderer/extensions/extensions.html')
        }
      }
    }
  }
})