import { app, BrowserWindow, WebContentsView, ipcMain, net, Menu, clipboard, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CHROME_HEIGHT_BASE = 80
const CHROME_HEIGHT_BOOKMARKS = 112
const CHROME_ANIM_DURATION = 280
const CHROME_ANIM_FRAME = 16

const INTERNAL_BOOKMARKS = 'internal://bookmarks'
const POPUP_WIDTH = 300
const POPUP_HEIGHT = 165

let mainWindow = null
let chromeView = null
let popupWindow = null
let tabs = []
let activeTabId = null
let nextTabId = 1
let bookmarksCache = []

let currentChromeHeight = CHROME_HEIGHT_BASE
let chromeAnimTimer = null

// ---------- Пути ----------
function getStartpagePath() {
  return path.join(__dirname, '../renderer/startpage/startpage.html')
}
function getStartpageUrl() {
  return process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}/startpage/startpage.html`
    : null
}
function getChromePath() {
  return path.join(__dirname, '../renderer/index/index.html')
}
function getChromeUrl() {
  return process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}/index/index.html`
    : null
}
function getBookmarksPagePath() {
  return path.join(__dirname, '../renderer/bookmarks/bookmarks.html')
}
function getBookmarksPageUrl() {
  return process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}/bookmarks/bookmarks.html`
    : null
}
function getPopupPath() {
  return path.join(__dirname, '../renderer/popup/popup.html')
}
function getPopupUrl() {
  return process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}/popup/popup.html`
    : null
}
function getBookmarksFile() {
  return path.join(app.getPath('userData'), 'bookmarks.json')
}

// ---------- Закладки ----------
function loadBookmarks() {
  try {
    const file = getBookmarksFile()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      bookmarksCache = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []
    } else {
      bookmarksCache = []
    }
  } catch (err) {
    console.error('Failed to load bookmarks:', err)
    bookmarksCache = []
  }
}

function saveBookmarks() {
  try {
    fs.writeFileSync(getBookmarksFile(), JSON.stringify(bookmarksCache, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save bookmarks:', err)
  }
}

function broadcastBookmarks() {
  if (chromeView && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send('bookmarks-updated', bookmarksCache)
  }
  for (const tab of tabs) {
    if (tab.isBookmarksManager && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('bookmarks-updated', bookmarksCache)
    }
  }
}

function getTargetChromeHeight() {
  return bookmarksCache.length > 0 ? CHROME_HEIGHT_BOOKMARKS : CHROME_HEIGHT_BASE
}

// ---------- Хелперы ----------
function getActiveTab() { return tabs.find(t => t.id === activeTabId) || null }
function getTab(id) { return tabs.find(t => t.id === id) || null }

function isStartpageUrl(url) {
  if (!url) return true
  return url.includes('startpage.html')
}
function isBookmarksPageUrl(url) {
  if (!url) return false
  return url.includes('bookmarks/bookmarks.html')
}
function isInternalUrl(url) {
  return isStartpageUrl(url) || isBookmarksPageUrl(url)
}

function serializeTabs() {
  return tabs.map(t => ({
    id: t.id,
    title: t.title || 'Новая вкладка',
    url: t.url || '',
    favicon: t.favicon || null,
    isLoading: !!t.isLoading,
    isActive: t.id === activeTabId,
  }))
}

function sendTabsUpdate() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  chromeView.webContents.send('tabs-updated', serializeTabs())
}

function sendActiveTabUrl() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  const active = getActiveTab()
  if (!active) return
  const url = active.view.webContents.getURL()
  chromeView.webContents.send('page-url', isInternalUrl(url) ? '' : url)
}

function sendLoadingState() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  const active = getActiveTab()
  chromeView.webContents.send('page-loading', active ? !!active.isLoading : false)
}

// ---------- Layout ----------
function applyLayout(chromeHeight) {
  if (!mainWindow || !chromeView) return
  const [width, height] = mainWindow.getContentSize()

  chromeView.setBounds({
    x: 0, y: 0, width,
    height: Math.max(0, Math.min(chromeHeight, height)),
  })

  for (const tab of tabs) {
    if (tab.id === activeTabId) {
      tab.view.setBounds({
        x: 0, y: chromeHeight, width,
        height: Math.max(0, height - chromeHeight),
      })
    } else {
      tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
  }
}

function layoutViews() {
  applyLayout(currentChromeHeight)
}

function animateChromeHeight(targetHeight) {
  if (chromeAnimTimer) {
    clearTimeout(chromeAnimTimer)
    chromeAnimTimer = null
  }
  const startHeight = currentChromeHeight
  const delta = targetHeight - startHeight
  if (Math.abs(delta) < 0.5) {
    currentChromeHeight = targetHeight
    applyLayout(currentChromeHeight)
    return
  }
  const startTime = Date.now()
  function step() {
    const elapsed = Date.now() - startTime
    const t = Math.min(1, elapsed / CHROME_ANIM_DURATION)
    const eased = 1 - Math.pow(1 - t, 3)
    currentChromeHeight = startHeight + delta * eased
    applyLayout(currentChromeHeight)
    if (t < 1) {
      chromeAnimTimer = setTimeout(step, CHROME_ANIM_FRAME)
    } else {
      currentChromeHeight = targetHeight
      applyLayout(currentChromeHeight)
      chromeAnimTimer = null
    }
  }
  chromeAnimTimer = setTimeout(step, CHROME_ANIM_FRAME)
}

function updateChromeHeightForBookmarks() {
  const target = getTargetChromeHeight()
  if (Math.abs(target - currentChromeHeight) > 0.5) {
    animateChromeHeight(target)
  } else {
    layoutViews()
  }
}

// ---------- URL-утилиты ----------
function isUrlLike(input) {
  if (!input) return false
  if (input === INTERNAL_BOOKMARKS) return true
  if (/\s/.test(input)) return false
  if (/^https?:\/\//i.test(input)) return true
  if (/^localhost(:\d+)?(\/|$)/.test(input)) return true
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(input)) return true
  return false
}

function normalizeToUrl(input) {
  const trimmed = input.trim()
  if (trimmed === INTERNAL_BOOKMARKS) return INTERNAL_BOOKMARKS
  if (isUrlLike(trimmed)) {
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return 'https://' + trimmed
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`
}

// ---------- Вкладки ----------
function createTab(url) {
  const id = nextTabId++

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const tab = {
    id,
    view,
    title: 'Новая вкладка',
    url: '',
    favicon: null,
    isLoading: false,
    isBookmarksManager: false,
  }

  // Если открываем менеджер сразу — фиксируем флаг
  if (url === INTERNAL_BOOKMARKS) {
    tab.isBookmarksManager = true
    tab.title = 'Закладки'
  }

  tabs.push(tab)
  mainWindow.contentView.addChildView(view)

  const wc = view.webContents

  // ---------- Обновление title ----------
  // Всегда смотрим на актуальный URL, а не на флаг:
  // если сейчас загружена страница менеджера — держим «Закладки»,
  // иначе берём настоящий title.
  wc.on('page-title-updated', (_e, title) => {
    const currentUrl = wc.getURL()
    const isManager = isBookmarksPageUrl(currentUrl)
    tab.isBookmarksManager = isManager
    tab.title = isManager ? 'Закладки' : title
    sendTabsUpdate()
  })

  // ---------- Обновление favicon ----------
  wc.on('page-favicon-updated', (_e, favicons) => {
    const currentUrl = wc.getURL()
    if (isBookmarksPageUrl(currentUrl)) {
      tab.favicon = null
    } else {
      tab.favicon = Array.isArray(favicons) && favicons.length ? favicons[0] : null
    }
    sendTabsUpdate()
  })

  wc.on('did-start-loading', () => {
    tab.isLoading = true
    if (tab.id === activeTabId) sendLoadingState()
    sendTabsUpdate()
  })

  wc.on('did-stop-loading', () => {
    tab.isLoading = false
    if (tab.id === activeTabId) {
      sendLoadingState()
      sendActiveTabUrl()
    }
    sendTabsUpdate()
  })

  // ---------- Навигация: обновляем флаг и title по URL ----------
  wc.on('did-navigate', (_e, navUrl) => {
    tab.url = navUrl
    const isManager = isBookmarksPageUrl(navUrl)
    tab.isBookmarksManager = isManager

    if (isManager) {
      tab.title = 'Закладки'
      tab.favicon = null
    } else {
      // Сбрасываем title/favicon — сейчас придут новые события от страницы
      const currentTitle = wc.getTitle()
      if (currentTitle) tab.title = currentTitle
      // favicon придёт своим событием page-favicon-updated
      tab.favicon = null
    }

    if (tab.id === activeTabId) sendActiveTabUrl()
    sendTabsUpdate()
  })

  wc.on('did-navigate-in-page', (_e, navUrl) => {
    tab.url = navUrl
    const isManager = isBookmarksPageUrl(navUrl)
    tab.isBookmarksManager = isManager
    if (isManager) tab.title = 'Закладки'
    if (tab.id === activeTabId) sendActiveTabUrl()
    sendTabsUpdate()
  })

  loadTabContent(tab, url)

  activeTabId = id
  layoutViews()
  sendTabsUpdate()
  sendActiveTabUrl()
  sendLoadingState()

  return tab
}

function loadTabContent(tab, url) {
  const wc = tab.view.webContents

  if (url === INTERNAL_BOOKMARKS) {
    const pageUrl = getBookmarksPageUrl()
    if (pageUrl) wc.loadURL(pageUrl)
    else wc.loadFile(getBookmarksPagePath())
    return
  }

  if (url && url !== 'about:blank') {
    wc.loadURL(url)
    return
  }

  const spUrl = getStartpageUrl()
  if (spUrl) wc.loadURL(spUrl)
  else wc.loadFile(getStartpagePath())
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id)
  if (idx === -1) return
  const tab = tabs[idx]
  try {
    mainWindow.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
  } catch (e) {}

  tabs.splice(idx, 1)

  if (tabs.length === 0) {
    createTab()
    return
  }

  if (activeTabId === id) {
    const newIdx = Math.min(idx, tabs.length - 1)
    activeTabId = tabs[newIdx].id
  }

  layoutViews()
  sendTabsUpdate()
  sendActiveTabUrl()
  sendLoadingState()
}

function switchTab(id) {
  if (!getTab(id)) return
  if (activeTabId === id) return
  activeTabId = id
  layoutViews()
  sendTabsUpdate()
  sendActiveTabUrl()
  sendLoadingState()
}

// ---------- Действия над активной вкладкой ----------
function navigateInActiveTab(input) {
  const tab = getActiveTab()
  if (!tab) return
  const url = normalizeToUrl(input)

  if (url === INTERNAL_BOOKMARKS) {
    const pageUrl = getBookmarksPageUrl()
    if (pageUrl) tab.view.webContents.loadURL(pageUrl)
    else tab.view.webContents.loadFile(getBookmarksPagePath())
    tab.isBookmarksManager = true
    tab.title = 'Закладки'
    tab.favicon = null
    sendTabsUpdate()
    return
  }

  // Уходим на обычный URL — сбрасываем «менеджерский» флаг заранее,
  // чтобы tab list не показывал «Закладки» пока идёт навигация.
  tab.isBookmarksManager = false
  tab.favicon = null
  sendTabsUpdate()

  tab.view.webContents.loadURL(url)
}

function goHomeInActiveTab() {
  const tab = getActiveTab()
  if (!tab) return
  tab.isBookmarksManager = false
  tab.favicon = null
  const spUrl = getStartpageUrl()
  if (spUrl) tab.view.webContents.loadURL(spUrl)
  else tab.view.webContents.loadFile(getStartpagePath())
  sendTabsUpdate()
}

function openBookmarksManager() {
  createTab(INTERNAL_BOOKMARKS)
}

// ---------- Popup window для закладки ----------
function closePopupWindow() {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.close()
  }
  popupWindow = null
}

function openBookmarkPopup({ rect, bookmarkId, title, url }) {
  closePopupWindow()

  popupWindow = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  })

  const payload = {
    bookmarkId: String(bookmarkId || ''),
    title: String(title || ''),
    url: String(url || ''),
  }

  const popupUrl = getPopupUrl()
  if (popupUrl) {
    const qs = new URLSearchParams(payload).toString()
    popupWindow.loadURL(`${popupUrl}?${qs}`)
  } else {
    popupWindow.loadFile(getPopupPath(), { query: payload })
  }

  popupWindow.once('ready-to-show', () => {
    const contentBounds = mainWindow.getContentBounds()
    let popupX = contentBounds.x + Math.round(rect.right) - POPUP_WIDTH + 12
    let popupY = contentBounds.y + Math.round(rect.bottom) + 8

    const display = screen.getDisplayMatching(contentBounds)
    const screenBounds = display.workArea

    if (popupX + POPUP_WIDTH > screenBounds.x + screenBounds.width - 8) {
      popupX = screenBounds.x + screenBounds.width - POPUP_WIDTH - 8
    }
    if (popupX < screenBounds.x + 8) popupX = screenBounds.x + 8

    popupWindow.setPosition(popupX, popupY)
    popupWindow.show()
    popupWindow.focus()
  })

  popupWindow.on('blur', () => {
    closePopupWindow()
  })

  popupWindow.on('closed', () => {
    popupWindow = null
  })
}

// ---------- Окно ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  chromeView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  mainWindow.contentView.addChildView(chromeView)

  const chromeUrl = getChromeUrl()
  if (chromeUrl) chromeView.webContents.loadURL(chromeUrl)
  else chromeView.webContents.loadFile(getChromePath())

  createTab()

  currentChromeHeight = getTargetChromeHeight()
  applyLayout(currentChromeHeight)

  mainWindow.on('resize', layoutViews)
  mainWindow.on('closed', () => {
    closePopupWindow()
    if (chromeAnimTimer) {
      clearTimeout(chromeAnimTimer)
      chromeAnimTimer = null
    }
    mainWindow = null
    chromeView = null
    tabs = []
    activeTabId = null
  })
}

// ---------- IPC ----------
app.whenReady().then(() => {
  loadBookmarks()
  createWindow()

  ipcMain.handle('get-tabs', () => serializeTabs())
  ipcMain.handle('tab-create', (_e, url) => createTab(url))
  ipcMain.handle('tab-close', (_e, id) => closeTab(id))
  ipcMain.handle('tab-switch', (_e, id) => switchTab(id))
  ipcMain.handle('navigate', (_e, input) => navigateInActiveTab(input))

  ipcMain.handle('go-back', () => {
    const wc = getActiveTab()?.view.webContents
    if (wc?.canGoBack()) wc.goBack()
  })
  ipcMain.handle('go-forward', () => {
    const wc = getActiveTab()?.view.webContents
    if (wc?.canGoForward()) wc.goForward()
  })
  ipcMain.handle('reload', () => getActiveTab()?.view.webContents.reload())
  ipcMain.handle('go-home', () => goHomeInActiveTab())

  ipcMain.on('scroll-state', (_e, isScrolled) => {
    if (!chromeView) return
    chromeView.webContents.send('scroll-state', !!isScrolled)
  })

  // ============ Закладки ============
  ipcMain.handle('get-bookmarks', () => bookmarksCache)

  ipcMain.handle('bookmark-current-page', () => {
    const active = getActiveTab()
    if (!active) return bookmarksCache

    const url = active.view.webContents.getURL()
    if (!url || isInternalUrl(url)) return bookmarksCache

    const idx = bookmarksCache.findIndex(b => b.url === url)
    if (idx >= 0) {
      bookmarksCache.splice(idx, 1)
    } else {
      const title = active.view.webContents.getTitle() || url
      bookmarksCache.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        url,
        favicon: active.favicon || null,
        createdAt: Date.now(),
      })
    }

    saveBookmarks()
    updateChromeHeightForBookmarks()
    broadcastBookmarks()
    return bookmarksCache
  })

  ipcMain.handle('remove-bookmark', (_e, id) => {
    const idx = bookmarksCache.findIndex(b => b.id === id)
    if (idx < 0) return bookmarksCache
    bookmarksCache.splice(idx, 1)
    saveBookmarks()
    updateChromeHeightForBookmarks()
    broadcastBookmarks()
    return bookmarksCache
  })

  ipcMain.handle('rename-bookmark', (_e, id, newTitle) => {
    const bm = bookmarksCache.find(b => b.id === id)
    if (!bm) return bookmarksCache
    bm.title = String(newTitle || '').trim() || bm.url
    saveBookmarks()
    broadcastBookmarks()
    return bookmarksCache
  })

  ipcMain.handle('get-current-tab-url', () => {
    const active = getActiveTab()
    if (!active) return ''
    const url = active.view.webContents.getURL()
    return isInternalUrl(url) ? '' : url
  })

  ipcMain.handle('open-bookmark-in-new-tab', (_e, id) => {
    const bm = bookmarksCache.find(b => b.id === id)
    if (!bm) return
    createTab(bm.url)
  })

  ipcMain.handle('open-bookmarks-manager', () => {
    openBookmarksManager()
  })

  ipcMain.handle('clear-all-bookmarks', () => {
    bookmarksCache = []
    saveBookmarks()
    updateChromeHeightForBookmarks()
    broadcastBookmarks()
    return bookmarksCache
  })

  ipcMain.handle('show-bookmark-menu', (_e, id) => {
    const bm = bookmarksCache.find(b => b.id === id)
    if (!bm) return

    const menu = Menu.buildFromTemplate([
      { label: 'Открыть в новой вкладке', click: () => createTab(bm.url) },
      { label: 'Копировать ссылку', click: () => clipboard.writeText(bm.url) },
      { type: 'separator' },
      {
        label: 'Удалить',
        click: () => {
          const idx = bookmarksCache.findIndex(b => b.id === id)
          if (idx >= 0) {
            bookmarksCache.splice(idx, 1)
            saveBookmarks()
            updateChromeHeightForBookmarks()
            broadcastBookmarks()
          }
        },
      },
    ])

    menu.popup({ window: mainWindow })
  })

  // ============ Popup закладки ============
  ipcMain.handle('open-bookmark-popup', (_e, payload) => {
    openBookmarkPopup(payload)
  })

  ipcMain.handle('close-bookmark-popup', () => {
    closePopupWindow()
  })

  ipcMain.handle('popup-save', (_e, { bookmarkId, title, url }) => {
    if (bookmarkId) {
      const bm = bookmarksCache.find(b => b.id === bookmarkId)
      if (bm) {
        bm.title = String(title || '').trim() || bm.url
        saveBookmarks()
        broadcastBookmarks()
      }
    } else if (url) {
      const exists = bookmarksCache.find(b => b.url === url)
      if (!exists) {
        bookmarksCache.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: String(title || '').trim() || url,
          url,
          favicon: null,
          createdAt: Date.now(),
        })
        saveBookmarks()
        updateChromeHeightForBookmarks()
        broadcastBookmarks()
      }
    }
    closePopupWindow()
    return bookmarksCache
  })

  ipcMain.handle('popup-remove', (_e, { bookmarkId }) => {
    if (bookmarkId) {
      const idx = bookmarksCache.findIndex(b => b.id === bookmarkId)
      if (idx >= 0) {
        bookmarksCache.splice(idx, 1)
        saveBookmarks()
        updateChromeHeightForBookmarks()
        broadcastBookmarks()
      }
    }
    closePopupWindow()
    return bookmarksCache
  })

  ipcMain.handle('get-suggestions', async (_e, query) => {
    if (!query || query.trim().length < 2) return []
    try {
      const res = await net.fetch(
        `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
          },
        }
      )
      const data = await res.json()
      return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []
    } catch (err) {
      console.error('Suggestions error:', err)
      return []
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})