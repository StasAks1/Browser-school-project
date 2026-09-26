import { app, BrowserWindow, WebContentsView, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow = null
let searchView = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Автоматически растягиваем web-view при изменении размера окна
  mainWindow.on('resize', () => {
    if (searchView) {
      const [width, height] = mainWindow.getContentSize()
      searchView.setBounds({ x: 0, y: 0, width, height })
    }
  })
}

function openSearch(query) {
  if (!searchView) {
    searchView = new WebContentsView()
    mainWindow.contentView.addChildView(searchView)

    // Escape возвращает на домашнюю страницу
    searchView.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        closeSearch()
      }
    })
  }

  const [width, height] = mainWindow.getContentSize()
  searchView.setBounds({ x: 0, y: 0, width, height })

  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
  searchView.webContents.loadURL(url)
}

function closeSearch() {
  if (searchView) {
    mainWindow.contentView.removeChildView(searchView)
    searchView.webContents.close()
    searchView = null
  }
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.on('search', (_event, query) => openSearch(query))
  ipcMain.on('go-home', () => closeSearch())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})