import { app, BrowserWindow, WebContentsView, ipcMain, net, Menu, clipboard, screen, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { debugLog, debugDevTools, debugTabEvent, debugStartupBanner, attachNetworkLogger } from './debug.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CHROME_HEIGHT_BASE = 80
const CHROME_HEIGHT_BOOKMARKS = 112
const CHROME_ANIM_DURATION = 280
const CHROME_ANIM_FRAME = 16

const INTERNAL_BOOKMARKS = 'internal://bookmarks'
const INTERNAL_HISTORY = 'internal://history'
const INTERNAL_SETTINGS = 'internal://settings'

const POPUP_WIDTH = 300
const POPUP_HEIGHT = 165
const PERMISSION_POPUP_WIDTH = 380
const PERMISSION_POPUP_HEIGHT = 240

const HISTORY_MAX_ENTRIES = 10000
const HISTORY_MAX_AGE_DAYS = 90
const HISTORY_DEDUPE_MS = 30 * 1000

const SUGGESTIONS_CACHE_TTL = 5 * 60 * 1000
const SUGGESTIONS_TIMEOUT = 3000

// ============ АКЦЕНТНЫЕ ЦВЕТА ============
const ACCENT_COLORS = {
  orange: { color: '#de5833', hover: '#c94a28', label: 'Оранжевый' },
  blue:   { color: '#3b82f6', hover: '#2563eb', label: 'Синий' },
  green:  { color: '#22c55e', hover: '#16a34a', label: 'Зелёный' },
  purple: { color: '#a855f7', hover: '#7e22ce', label: 'Фиолетовый' },
  pink:   { color: '#ec4899', hover: '#be185d', label: 'Розовый' },
  red:    { color: '#ef4444', hover: '#b91c1c', label: 'Красный' },
}
const ACCENT_DEFAULT = 'orange'

let mainWindow = null
let chromeView = null
let popupWindow = null
let tabs = []
let activeTabId = null
let nextTabId = 1
let bookmarksCache = []
let foldersCache = []
let historyCache = []
let settingsCache = { theme: 'dark', accent: ACCENT_DEFAULT }

let currentChromeHeight = CHROME_HEIGHT_BASE
let chromeAnimTimer = null
let isQuitting = false

// ============================================================
// ============ РАЗРЕШЕНИЯ ====================================
// ============================================================
const SAFE_PERMISSIONS = ['fullscreen', 'clipboard-sanitized-write']
const permissionDecisions = new Map()
let pendingPermission = null

function getPermissionLabel(permission) {
  const labels = {
    media: 'камере и микрофону', camera: 'камере', microphone: 'микрофону',
    geolocation: 'вашему местоположению', notifications: 'уведомлениям',
    midi: 'MIDI-устройствам', midiSysex: 'MIDI-устройствам',
    'clipboard-read': 'чтению буфера обмена',
    'clipboard-sanitized-write': 'записи в буфер обмена',
    fullscreen: 'полноэкранному режиму',
    pointerLock: 'захвату курсора мыши',
    hid: 'HID-устройствам', serial: 'последовательным портам', usb: 'USB-устройствам',
  }
  return labels[permission] || permission
}

function closePermissionPopup() {
  if (pendingPermission && pendingPermission.popupWindow) {
    const w = pendingPermission.popupWindow
    if (!w.isDestroyed()) { try { w.close() } catch (e) {} }
  }
  pendingPermission = null
}

async function requestPermissionDialog(permission, origin) {
  if (pendingPermission) {
    const prev = pendingPermission
    pendingPermission = null
    try { prev.resolve(false) } catch (e) {}
    if (prev.popupWindow && !prev.popupWindow.isDestroyed()) {
      try { prev.popupWindow.close() } catch (e) {}
    }
  }

  return new Promise((resolve) => {
    const popupWindow = new BrowserWindow({
      width: PERMISSION_POPUP_WIDTH, height: PERMISSION_POPUP_HEIGHT,
      frame: false, transparent: true, resizable: false,
      skipTaskbar: true, show: false, hasShadow: true, alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true, nodeIntegration: false, sandbox: false,
      }
    })

    popupWindow.webContents.on('dom-ready', () => {
      popupWindow.webContents.send('theme-changed', getResolvedTheme())
      popupWindow.webContents.send('accent-changed', getAccentData())
    })

    const payload = {
      origin: origin || 'Сайт', permission,
      label: getPermissionLabel(permission),
    }

    const url = getPermissionPopupUrl()
    if (url) popupWindow.loadURL(`${url}?${new URLSearchParams(payload).toString()}`)
    else popupWindow.loadFile(getPermissionPopupPath(), { query: payload })

    pendingPermission = { resolve, popupWindow }

    popupWindow.once('ready-to-show', () => {
      if (!mainWindow || mainWindow.isDestroyed()) { popupWindow.close(); return }
      const b = mainWindow.getContentBounds()
      popupWindow.setPosition(
        b.x + Math.round((b.width - PERMISSION_POPUP_WIDTH) / 2),
        b.y + 120
      )
      popupWindow.show()
      popupWindow.focus()
      popupWindow.webContents.send('theme-changed', getResolvedTheme())
      popupWindow.webContents.send('accent-changed', getAccentData())
    })

    popupWindow.on('closed', () => {
      if (pendingPermission && pendingPermission.popupWindow === popupWindow) {
        const { resolve: r } = pendingPermission
        pendingPermission = null
        r(false)
      }
    })
  })
}

function setupSecurity() {
  const ses = mainWindow.webContents.session

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (SAFE_PERMISSIONS.includes(permission)) { callback(true); return }

    if (permission === 'media') {
      const types = details?.mediaTypes || []
      if (!Array.isArray(types) || types.length === 0) { callback(false); return }
    }

    let origin = ''
    try {
      const src = details?.securityOrigin || details?.requestingUrl || webContents.getURL()
      origin = new URL(src).hostname
    } catch { origin = '' }

    const key = `${origin}:${permission}`
    if (permissionDecisions.has(key)) {
      callback(permissionDecisions.get(key))
      return
    }

    requestPermissionDialog(permission, origin).then((allowed) => {
      permissionDecisions.set(key, allowed)
      callback(allowed)
    })
  })

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (SAFE_PERMISSIONS.includes(permission)) return true
    if (permission === 'media') return true

    let origin = ''
    try { origin = new URL(requestingOrigin || webContents.getURL()).hostname } catch {}

    const key = `${origin}:${permission}`
    if (permissionDecisions.has(key)) return permissionDecisions.get(key)
    return false
  })

  ses.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'data:' && details.resourceType === 'mainFrame') {
        callback({ cancel: true }); return
      }
    } catch {}
    callback({})
  })

  attachNetworkLogger(ses)
}

function attachTabSecurityHandlers(tab) {
  const wc = tab.view.webContents

  wc.setWindowOpenHandler(({ url }) => {
    debugTabEvent(tab.id, 'window.open', url)
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') createTab(url)
    } catch {}
    return { action: 'deny' }
  })

  wc.on('will-navigate', (event, url) => {
    debugTabEvent(tab.id, 'will-navigate', url)
    if (isTrustedInternalUrl(url)) return
    let ok = false
    try {
      const p = new URL(url)
      if (['http:', 'https:', 'about:'].includes(p.protocol)) ok = true
    } catch {}
    if (!ok) event.preventDefault()
  })

  wc.on('will-redirect', (event, url) => {
    debugTabEvent(tab.id, 'will-redirect', url)
    if (isTrustedInternalUrl(url)) return
    try {
      const p = new URL(url)
      if (p.protocol === 'file:') event.preventDefault()
    } catch {}
  })

  wc.on('render-process-gone', (_e, details) => {
    debugLog('Security', `Render process вкладки ${tab.id} упал: ${details.reason}`)
  })
}

function isTrustedInternalUrl(url) {
  if (!url) return false
  return (
    url.includes('startpage.html') ||
    url.includes('bookmarks/bookmarks.html') ||
    url.includes('history/history.html') ||
    url.includes('settings/settings.html') ||
    url.includes('index/index.html') ||
    url.includes('popup/popup.html') ||
    url.includes('permission/permission.html')
  )
}

// ============================================================
// ============ ПУТИ ==========================================
// ============================================================
function getStartpagePath() { return path.join(__dirname, '../renderer/startpage/startpage.html') }
function getStartpageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/startpage/startpage.html` : null
}
function getChromePath() { return path.join(__dirname, '../renderer/index/index.html') }
function getChromeUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/index/index.html` : null
}
function getBookmarksPagePath() { return path.join(__dirname, '../renderer/bookmarks/bookmarks.html') }
function getBookmarksPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/bookmarks/bookmarks.html` : null
}
function getHistoryPagePath() { return path.join(__dirname, '../renderer/history/history.html') }
function getHistoryPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/history/history.html` : null
}
function getSettingsPagePath() { return path.join(__dirname, '../renderer/settings/settings.html') }
function getSettingsPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/settings/settings.html` : null
}
function getPopupPath() { return path.join(__dirname, '../renderer/popup/popup.html') }
function getPopupUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/popup/popup.html` : null
}
function getPermissionPopupPath() { return path.join(__dirname, '../renderer/permission/permission.html') }
function getPermissionPopupUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/permission/permission.html` : null
}
function getBookmarksFile() { return path.join(app.getPath('userData'), 'bookmarks.json') }
function getHistoryFile() { return path.join(app.getPath('userData'), 'history.json') }
function getSettingsFile() { return path.join(app.getPath('userData'), 'settings.json') }

// ============================================================
// ============ НАСТРОЙКИ / ТЕМА / АКЦЕНТ =====================
// ============================================================
function loadSettings() {
  try {
    const file = getSettingsFile()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      const data = JSON.parse(raw)
      settingsCache = {
        theme: ['light', 'dark', 'system'].includes(data.theme) ? data.theme : 'dark',
        accent: ACCENT_COLORS[data.accent] ? data.accent : ACCENT_DEFAULT,
      }
    } else {
      settingsCache = { theme: 'dark', accent: ACCENT_DEFAULT }
      saveSettings()
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
    settingsCache = { theme: 'dark', accent: ACCENT_DEFAULT }
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(getSettingsFile(), JSON.stringify(settingsCache, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save settings:', err)
  }
}

function getResolvedTheme() {
  if (settingsCache.theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
  return settingsCache.theme === 'light' ? 'light' : 'dark'
}

function getBackgroundColor() {
  return getResolvedTheme() === 'light' ? '#f5f5f7' : '#1a1a1a'
}

function getAccentData() {
  const name = settingsCache.accent || ACCENT_DEFAULT
  const data = ACCENT_COLORS[name] || ACCENT_COLORS[ACCENT_DEFAULT]
  return { name, color: data.color, hover: data.hover }
}

function getAccentOptions() {
  return Object.entries(ACCENT_COLORS).map(([name, data]) => ({
    name, color: data.color, hover: data.hover, label: data.label,
  }))
}

function applyBackgroundColors() {
  const color = getBackgroundColor()

  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(color)
  if (chromeView && !chromeView.webContents.isDestroyed()) chromeView.setBackgroundColor(color)
  for (const tab of tabs) {
    if (tab.view && !tab.view.webContents.isDestroyed()) tab.view.setBackgroundColor(color)
  }
}

function broadcastTheme() {
  const theme = getResolvedTheme()

  if (chromeView && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send('theme-changed', theme)
  }
  for (const tab of tabs) {
    if (tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('theme-changed', theme)
    }
  }
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('theme-changed', theme)
  }
  if (pendingPermission && pendingPermission.popupWindow && !pendingPermission.popupWindow.isDestroyed()) {
    pendingPermission.popupWindow.webContents.send('theme-changed', theme)
  }

  applyBackgroundColors()

  debugLog('Theme', `Разослано: ${theme} (настройка: ${settingsCache.theme})`)
}

function broadcastAccent() {
  const data = getAccentData()

  if (chromeView && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send('accent-changed', data)
  }
  for (const tab of tabs) {
    if (tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('accent-changed', data)
    }
  }
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('accent-changed', data)
  }
  if (pendingPermission && pendingPermission.popupWindow && !pendingPermission.popupWindow.isDestroyed()) {
    pendingPermission.popupWindow.webContents.send('accent-changed', data)
  }

  debugLog('Accent', `Разослан: ${data.name} (${data.color})`)
}

// ============================================================
// ============ ИСТОРИЯ =======================================
// ============================================================
function loadHistory() {
  try {
    const file = getHistoryFile()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      historyCache = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []
    } else {
      historyCache = []
    }
    cleanupOldHistory()
  } catch (err) {
    console.error('Failed to load history:', err)
    historyCache = []
  }
}

function saveHistory() {
  try {
    fs.writeFileSync(getHistoryFile(), JSON.stringify(historyCache), 'utf-8')
  } catch (err) {
    console.error('Failed to save history:', err)
  }
}

function cleanupOldHistory() {
  const cutoff = Date.now() - HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  const before = historyCache.length
  historyCache = historyCache.filter((e) => e.visitedAt >= cutoff)

  if (historyCache.length > HISTORY_MAX_ENTRIES) {
    historyCache = historyCache.slice(-HISTORY_MAX_ENTRIES)
  }

  if (historyCache.length !== before) saveHistory()
}

function addToHistory(url, title) {
  if (!url) return
  if (
    isTrustedInternalUrl(url) ||
    url.startsWith('file:') ||
    url.startsWith('data:') ||
    url.startsWith('about:') ||
    url.startsWith('devtools:')
  ) return

  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return
  } catch { return }

  const now = Date.now()

  const last = historyCache[historyCache.length - 1]
  if (last && last.url === url && (now - last.visitedAt) < HISTORY_DEDUPE_MS) {
    last.visitedAt = now
    if (title) last.title = title
    saveHistory()
    return
  }

  historyCache.push({
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    title: title || url,
    visitedAt: now,
  })

  if (historyCache.length > HISTORY_MAX_ENTRIES) {
    historyCache = historyCache.slice(-HISTORY_MAX_ENTRIES)
  }

  saveHistory()
  broadcastHistory()
}

function broadcastHistory() {
  if (chromeView && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send('history-updated')
  }
  for (const tab of tabs) {
    if (tab.isHistoryManager && tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('history-updated')
    }
  }
}

// ============================================================
// ============ БИБЛИОТЕКА (закладки + папки) =================
// ============================================================
function loadBookmarks() {
  try {
    const file = getBookmarksFile()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      const data = JSON.parse(raw)

      if (Array.isArray(data)) {
        bookmarksCache = data.map((b) => ({ ...b, folderId: null }))
        foldersCache = []
        saveBookmarks()
      } else if (data && typeof data === 'object') {
        bookmarksCache = Array.isArray(data.bookmarks) ? data.bookmarks : []
        foldersCache = Array.isArray(data.folders) ? data.folders : []
        bookmarksCache = bookmarksCache.map((b) => ({ ...b, folderId: b.folderId || null }))
      } else {
        bookmarksCache = []
        foldersCache = []
      }
    } else {
      bookmarksCache = []
      foldersCache = []
    }
  } catch (err) {
    console.error('Failed to load bookmarks:', err)
    bookmarksCache = []
    foldersCache = []
  }
}

function saveBookmarks() {
  try {
    fs.writeFileSync(
      getBookmarksFile(),
      JSON.stringify({ bookmarks: bookmarksCache, folders: foldersCache }, null, 2),
      'utf-8'
    )
  } catch (err) {
    console.error('Failed to save bookmarks:', err)
  }
}

function serializeLibrary() {
  return { bookmarks: bookmarksCache, folders: foldersCache }
}

function broadcastLibrary() {
  const payload = serializeLibrary()
  if (chromeView && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send('library-updated', payload)
  }
  for (const tab of tabs) {
    if (tab.isBookmarksManager && tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('library-updated', payload)
    }
  }
}

function getTargetChromeHeight() {
  return bookmarksCache.length > 0 ? CHROME_HEIGHT_BOOKMARKS : CHROME_HEIGHT_BASE
}

// ============================================================
// ============ ХЕЛПЕРЫ =======================================
// ============================================================
function getActiveTab() { return tabs.find(t => t.id === activeTabId) || null }
function getTab(id) { return tabs.find(t => t.id === id) || null }

function isStartpageUrl(url) { if (!url) return true; return url.includes('startpage.html') }
function isBookmarksPageUrl(url) { if (!url) return false; return url.includes('bookmarks/bookmarks.html') }
function isHistoryPageUrl(url) { if (!url) return false; return url.includes('history/history.html') }
function isSettingsPageUrl(url) { if (!url) return false; return url.includes('settings/settings.html') }
function isInternalUrl(url) {
  return isStartpageUrl(url) || isBookmarksPageUrl(url) || isHistoryPageUrl(url) || isSettingsPageUrl(url)
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
  if (!active || !active.view) return
  const url = active.view.webContents.getURL()
  chromeView.webContents.send('page-url', isInternalUrl(url) ? '' : url)
}

function sendLoadingState() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  const active = getActiveTab()
  chromeView.webContents.send('page-loading', active ? !!active.isLoading : false)
}

// ============================================================
// ============ LAYOUT ========================================
// ============================================================
function applyLayout(chromeHeight) {
  if (!mainWindow || !chromeView) return
  const [width, height] = mainWindow.getContentSize()

  chromeView.setBounds({
    x: 0, y: 0, width,
    height: Math.max(0, Math.min(chromeHeight, height)),
  })

  for (const tab of tabs) {
    if (!tab.view) continue
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

function layoutViews() { applyLayout(currentChromeHeight) }

function animateChromeHeight(targetHeight) {
  if (chromeAnimTimer) { clearTimeout(chromeAnimTimer); chromeAnimTimer = null }
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
    if (t < 1) { chromeAnimTimer = setTimeout(step, CHROME_ANIM_FRAME) }
    else {
      currentChromeHeight = targetHeight
      applyLayout(currentChromeHeight)
      chromeAnimTimer = null
    }
  }
  chromeAnimTimer = setTimeout(step, CHROME_ANIM_FRAME)
}

function updateChromeHeightForBookmarks() {
  const target = getTargetChromeHeight()
  if (Math.abs(target - currentChromeHeight) > 0.5) animateChromeHeight(target)
  else layoutViews()
}

// ============================================================
// ============ URL-УТИЛИТЫ ===================================
// ============================================================
function isUrlLike(input) {
  if (!input) return false
  if (input === INTERNAL_BOOKMARKS || input === INTERNAL_HISTORY || input === INTERNAL_SETTINGS) return true
  if (/\s/.test(input)) return false
  if (/^https?:\/\//i.test(input)) return true
  if (/^localhost(:\d+)?(\/|$)/.test(input)) return true
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(input)) return true
  return false
}

function normalizeToUrl(input) {
  const trimmed = input.trim()
  if (trimmed === INTERNAL_BOOKMARKS || trimmed === INTERNAL_HISTORY || trimmed === INTERNAL_SETTINGS) return trimmed
  if (isUrlLike(trimmed)) {
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return 'https://' + trimmed
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`
}

// ============================================================
// ============ ВКЛАДКИ =======================================
// ============================================================
function createTab(url) {
  const id = nextTabId++

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  const tab = {
    id, view,
    title: 'Новая вкладка', url: '', favicon: null, isLoading: false,
    isBookmarksManager: false,
    isHistoryManager: false,
    isSettingsPage: false,
  }

  if (url === INTERNAL_BOOKMARKS) { tab.isBookmarksManager = true; tab.title = 'Закладки' }
  if (url === INTERNAL_HISTORY) { tab.isHistoryManager = true; tab.title = 'История' }
  if (url === INTERNAL_SETTINGS) { tab.isSettingsPage = true; tab.title = 'Настройки' }

  tabs.push(tab)
  mainWindow.contentView.addChildView(view)

  // Фон до отрисовки — убирает мигание
  view.setBackgroundColor(getBackgroundColor())

  attachTabSecurityHandlers(tab)

  const wc = view.webContents

  wc.on('did-start-loading', () => {
    tab.isLoading = true
    if (tab.id === activeTabId) sendLoadingState()
    sendTabsUpdate()
  })

  wc.on('page-title-updated', (_e, title) => {
    const currentUrl = wc.getURL()
    const isBM = isBookmarksPageUrl(currentUrl)
    const isH = isHistoryPageUrl(currentUrl)
    const isS = isSettingsPageUrl(currentUrl)
    tab.isBookmarksManager = isBM
    tab.isHistoryManager = isH
    tab.isSettingsPage = isS
    tab.title = isBM ? 'Закладки' : (isH ? 'История' : (isS ? 'Настройки' : title))
    sendTabsUpdate()
  })

  wc.on('page-favicon-updated', (_e, favicons) => {
    const currentUrl = wc.getURL()
    if (isBookmarksPageUrl(currentUrl) || isHistoryPageUrl(currentUrl) || isSettingsPageUrl(currentUrl)) {
      tab.favicon = null
    } else {
      tab.favicon = Array.isArray(favicons) && favicons.length ? favicons[0] : null
    }
    sendTabsUpdate()
  })

  wc.on('did-stop-loading', () => {
    tab.isLoading = false
    if (tab.id === activeTabId) { sendLoadingState(); sendActiveTabUrl() }
    sendTabsUpdate()
  })

  // Отправляем тему и акцент, когда DOM готов
  wc.on('dom-ready', () => {
    wc.send('theme-changed', getResolvedTheme())
    wc.send('accent-changed', getAccentData())
  })

  wc.on('did-navigate', (_e, navUrl) => {
    tab.url = navUrl
    const isBM = isBookmarksPageUrl(navUrl)
    const isH = isHistoryPageUrl(navUrl)
    const isS = isSettingsPageUrl(navUrl)
    tab.isBookmarksManager = isBM
    tab.isHistoryManager = isH
    tab.isSettingsPage = isS

    if (isBM) { tab.title = 'Закладки'; tab.favicon = null }
    else if (isH) { tab.title = 'История'; tab.favicon = null }
    else if (isS) { tab.title = 'Настройки'; tab.favicon = null }
    else {
      const t = wc.getTitle()
      if (t) tab.title = t
      tab.favicon = null
      addToHistory(navUrl, t)
    }

    if (tab.id === activeTabId) sendActiveTabUrl()
    sendTabsUpdate()
  })

  wc.on('did-navigate-in-page', (_e, navUrl) => {
    tab.url = navUrl
    const isBM = isBookmarksPageUrl(navUrl)
    const isH = isHistoryPageUrl(navUrl)
    const isS = isSettingsPageUrl(navUrl)
    tab.isBookmarksManager = isBM
    tab.isHistoryManager = isH
    tab.isSettingsPage = isS
    if (isBM) tab.title = 'Закладки'
    if (isH) tab.title = 'История'
    if (isS) tab.title = 'Настройки'
    if (tab.id === activeTabId) sendActiveTabUrl()
    sendTabsUpdate()
  })

  loadTabContent(tab, url)

  activeTabId = id
  layoutViews()
  sendTabsUpdate()
  sendActiveTabUrl()
  sendLoadingState()

  debugLog('Tab', `Создана вкладка #${id}`, url || '(startpage)')
  debugDevTools(wc, `Tab #${id}`)

  return tab
}

function loadTabContent(tab, url) {
  const wc = tab.view.webContents

  if (url === INTERNAL_BOOKMARKS) {
    const u = getBookmarksPageUrl()
    if (u) wc.loadURL(u); else wc.loadFile(getBookmarksPagePath())
    return
  }
  if (url === INTERNAL_HISTORY) {
    const u = getHistoryPageUrl()
    if (u) wc.loadURL(u); else wc.loadFile(getHistoryPagePath())
    return
  }
  if (url === INTERNAL_SETTINGS) {
    const u = getSettingsPageUrl()
    if (u) wc.loadURL(u); else wc.loadFile(getSettingsPagePath())
    return
  }
  if (url && url !== 'about:blank') { wc.loadURL(url); return }
  const sp = getStartpageUrl()
  if (sp) wc.loadURL(sp); else wc.loadFile(getStartpagePath())
}

function closeTab(id) {
  debugLog('Tab', `Закрытие вкладки #${id}`)
  const idx = tabs.findIndex(t => t.id === id)
  if (idx === -1) return
  const tab = tabs[idx]
  try {
    mainWindow.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
  } catch (e) {}

  tabs.splice(idx, 1)

  // Закрытие последней вкладки — закрываем браузер
  if (tabs.length === 0) {
    activeTabId = null
    closeBookmarkPopup()
    closePermissionPopup()
    if (chromeAnimTimer) { clearTimeout(chromeAnimTimer); chromeAnimTimer = null }
    isQuitting = true
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
    app.quit()
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

// ============================================================
// ============ ДЕЙСТВИЯ НАД АКТИВНОЙ ВКЛАДКОЙ ================
// ============================================================
function navigateInActiveTab(input) {
  const tab = getActiveTab()
  if (!tab) return
  const url = normalizeToUrl(input)

  if (url === INTERNAL_BOOKMARKS) {
    const u = getBookmarksPageUrl()
    if (u) tab.view.webContents.loadURL(u); else tab.view.webContents.loadFile(getBookmarksPagePath())
    tab.isBookmarksManager = true; tab.title = 'Закладки'; tab.favicon = null
    sendTabsUpdate(); return
  }
  if (url === INTERNAL_HISTORY) {
    const u = getHistoryPageUrl()
    if (u) tab.view.webContents.loadURL(u); else tab.view.webContents.loadFile(getHistoryPagePath())
    tab.isHistoryManager = true; tab.title = 'История'; tab.favicon = null
    sendTabsUpdate(); return
  }
  if (url === INTERNAL_SETTINGS) {
    const u = getSettingsPageUrl()
    if (u) tab.view.webContents.loadURL(u); else tab.view.webContents.loadFile(getSettingsPagePath())
    tab.isSettingsPage = true; tab.title = 'Настройки'; tab.favicon = null
    sendTabsUpdate(); return
  }

  tab.isBookmarksManager = false
  tab.isHistoryManager = false
  tab.isSettingsPage = false
  tab.favicon = null
  sendTabsUpdate()

  tab.view.webContents.loadURL(url)
}

function goHomeInActiveTab() {
  const tab = getActiveTab()
  if (!tab) return
  tab.isBookmarksManager = false
  tab.isHistoryManager = false
  tab.isSettingsPage = false
  tab.favicon = null
  const sp = getStartpageUrl()
  if (sp) tab.view.webContents.loadURL(sp); else tab.view.webContents.loadFile(getStartpagePath())
  sendTabsUpdate()
}

function openBookmarksManager() { createTab(INTERNAL_BOOKMARKS) }
function openHistoryManager() { createTab(INTERNAL_HISTORY) }
function openSettingsPage() { createTab(INTERNAL_SETTINGS) }

// ============================================================
// ============ POPUP ЗАКЛАДКИ ================================
// ============================================================
function closeBookmarkPopup() {
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.close()
  popupWindow = null
}

function openBookmarkPopup({ rect, bookmarkId, title, url }) {
  closeBookmarkPopup()

  popupWindow = new BrowserWindow({
    width: POPUP_WIDTH, height: POPUP_HEIGHT,
    frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    }
  })

  const payload = {
    bookmarkId: String(bookmarkId || ''),
    title: String(title || ''),
    url: String(url || ''),
  }

  const u = getPopupUrl()
  if (u) popupWindow.loadURL(`${u}?${new URLSearchParams(payload).toString()}`)
  else popupWindow.loadFile(getPopupPath(), { query: payload })

  popupWindow.webContents.on('dom-ready', () => {
    popupWindow.webContents.send('theme-changed', getResolvedTheme())
    popupWindow.webContents.send('accent-changed', getAccentData())
  })

  popupWindow.once('ready-to-show', () => {
    const b = mainWindow.getContentBounds()
    let x = b.x + Math.round(rect.right) - POPUP_WIDTH + 12
    let y = b.y + Math.round(rect.bottom) + 8
    const display = screen.getDisplayMatching(b)
    const sb = display.workArea
    if (x + POPUP_WIDTH > sb.x + sb.width - 8) x = sb.x + sb.width - POPUP_WIDTH - 8
    if (x < sb.x + 8) x = sb.x + 8
    popupWindow.setPosition(x, y)
    popupWindow.show()
    popupWindow.focus()
    popupWindow.webContents.send('theme-changed', getResolvedTheme())
    popupWindow.webContents.send('accent-changed', getAccentData())
  })

  popupWindow.on('blur', () => closeBookmarkPopup())
  popupWindow.on('closed', () => { popupWindow = null })
}

// ============================================================
// ============ ОКНО ==========================================
// ============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 700, minHeight: 500,
    backgroundColor: getBackgroundColor(),
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      webSecurity: true, allowRunningInsecureContent: false,
    },
  })

  setupSecurity()

  chromeView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  })
  chromeView.setBackgroundColor(getBackgroundColor())
  mainWindow.contentView.addChildView(chromeView)

  const u = getChromeUrl()
  if (u) chromeView.webContents.loadURL(u); else chromeView.webContents.loadFile(getChromePath())

  chromeView.webContents.on('dom-ready', () => {
    chromeView.webContents.send('theme-changed', getResolvedTheme())
    chromeView.webContents.send('accent-changed', getAccentData())
  })

  createTab()

  currentChromeHeight = getTargetChromeHeight()
  applyLayout(currentChromeHeight)

  mainWindow.on('resize', layoutViews)
  mainWindow.on('closed', () => {
    closeBookmarkPopup()
    closePermissionPopup()
    if (chromeAnimTimer) { clearTimeout(chromeAnimTimer); chromeAnimTimer = null }
    mainWindow = null; chromeView = null; tabs = []; activeTabId = null
  })

  applyBackgroundColors()
}

// ============================================================
// ============ ПОДСКАЗКИ SEARCH (DuckDuckGo Autocomplete) ====
// ============================================================
const suggestionsCache = new Map()
let warmUpPromise = null

function warmUpSuggestions() {
  if (warmUpPromise) return warmUpPromise

  const url = 'https://duckduckgo.com/ac/?q=a&type=list&kl=ru-ru'
  debugLog('Suggestions', 'Прогрев соединения с DDG...')

  const t0 = Date.now()
  warmUpPromise = net.fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    },
  })
    .then((res) => {
      debugLog('Suggestions', `Прогрев завершён за ${Date.now() - t0}мс, статус ${res.status}`)
      return res
    })
    .catch((err) => {
      debugLog('Suggestions', `Прогрев не удался: ${err.message}`)
    })

  return warmUpPromise
}

async function fetchSuggestions(query) {
  const q = String(query || '').trim()
  if (q.length < 2) return []

  const cached = suggestionsCache.get(q)
  if (cached && (Date.now() - cached.ts) < SUGGESTIONS_CACHE_TTL) {
    debugLog('Suggestions', `Из кэша: "${q}" (${cached.items.length})`)
    return cached.items
  }

  const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list&kl=ru-ru`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SUGGESTIONS_TIMEOUT)

    const t0 = Date.now()
    const res = await net.fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
    })

    clearTimeout(timeout)
    const elapsed = Date.now() - t0

    if (!res.ok) {
      debugLog('Suggestions', `Статус ${res.status} для "${q}" (${elapsed}мс)`)
      return []
    }

    const data = await res.json()
    const items = extractSuggestions(data)

    suggestionsCache.set(q, { items, ts: Date.now() })
    if (suggestionsCache.size > 200) {
      const firstKey = suggestionsCache.keys().next().value
      suggestionsCache.delete(firstKey)
    }

    debugLog('Suggestions', `"${q}" → ${items.length} подсказок за ${elapsed}мс`)
    return items
  } catch (err) {
    if (err.name === 'AbortError') debugLog('Suggestions', `Таймаут для "${q}"`)
    else debugLog('Suggestions', `Ошибка: ${err.message}`)
    return []
  }
}

function extractSuggestions(data) {
  if (!data) return []
  if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
    return data[1].filter((x) => typeof x === 'string' && x.trim())
  }
  if (Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === 'object') {
    return data
      .map((x) => (typeof x === 'object' && x !== null ? x.phrase || x.value || x.text : null))
      .filter((x) => typeof x === 'string' && x.trim())
  }
  if (Array.isArray(data) && data.every((x) => typeof x === 'string')) {
    return data.filter((x) => x.trim())
  }
  if (data && Array.isArray(data.suggestions)) {
    return data.suggestions
      .map((x) => (typeof x === 'string' ? x : x?.phrase))
      .filter((x) => typeof x === 'string' && x.trim())
  }
  return []
}

// ============================================================
// ============ IPC ===========================================
// ============================================================
app.whenReady().then(() => {
  debugStartupBanner()

  loadSettings()
  loadBookmarks()
  loadHistory()
  createWindow()

  warmUpSuggestions()

  nativeTheme.on('updated', () => {
    if (settingsCache.theme === 'system') {
      debugLog('Theme', `Системная тема обновлена → ${getResolvedTheme()}`)
      broadcastTheme()
    }
  })

  ipcMain.handle('get-tabs', () => serializeTabs())
  ipcMain.handle('tab-create', (_e, url) => createTab(url))
  ipcMain.handle('tab-close', (_e, id) => closeTab(id))
  ipcMain.handle('tab-switch', (_e, id) => switchTab(id))
  ipcMain.handle('navigate', (_e, input) => navigateInActiveTab(input))

  ipcMain.handle('go-back', () => {
    const wc = getActiveTab()?.view?.webContents
    if (wc?.canGoBack()) wc.goBack()
  })
  ipcMain.handle('go-forward', () => {
    const wc = getActiveTab()?.view?.webContents
    if (wc?.canGoForward()) wc.goForward()
  })
  ipcMain.handle('reload', () => getActiveTab()?.view?.webContents.reload())
  ipcMain.handle('go-home', () => goHomeInActiveTab())

  ipcMain.handle('get-current-tab-url', () => {
    const active = getActiveTab()
    if (!active) return ''
    const url = active.view.webContents.getURL()
    return isInternalUrl(url) ? '' : url
  })

  ipcMain.on('scroll-state', (_e, isScrolled) => {
    if (!chromeView) return
    chromeView.webContents.send('scroll-state', !!isScrolled)
  })

  ipcMain.handle('permission-respond', (_e, allowed) => {
    if (pendingPermission) {
      const { resolve, popupWindow: w } = pendingPermission
      pendingPermission = null
      resolve(!!allowed)
      if (w && !w.isDestroyed()) { try { w.close() } catch (e) {} }
    }
  })

  // ============ Настройки / Тема / Акцент ============
  ipcMain.handle('get-settings', () => ({
    ...settingsCache,
    resolvedTheme: getResolvedTheme(),
  }))

  ipcMain.handle('get-theme', () => getResolvedTheme())

  ipcMain.handle('set-theme', (_e, theme) => {
    if (!['light', 'dark', 'system'].includes(theme)) return settingsCache
    settingsCache.theme = theme
    saveSettings()
    broadcastTheme()
    return { ...settingsCache, resolvedTheme: getResolvedTheme() }
  })

  ipcMain.handle('get-accent', () => getAccentData())
  ipcMain.handle('get-accent-options', () => getAccentOptions())

  ipcMain.handle('set-accent', (_e, name) => {
    if (!ACCENT_COLORS[name]) return getAccentData()
    settingsCache.accent = name
    saveSettings()
    broadcastAccent()
    return getAccentData()
  })

  ipcMain.handle('get-app-info', () => ({
    name: 'Browser Project',
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
  }))

  // ============ Библиотека ============
  ipcMain.handle('get-library', () => serializeLibrary())

  ipcMain.handle('bookmark-current-page', () => {
    const active = getActiveTab()
    if (!active) return serializeLibrary()
    const url = active.view.webContents.getURL()
    if (!url || isInternalUrl(url)) return serializeLibrary()

    const idx = bookmarksCache.findIndex(b => b.url === url)
    if (idx >= 0) bookmarksCache.splice(idx, 1)
    else {
      const title = active.view.webContents.getTitle() || url
      bookmarksCache.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title, url, favicon: active.favicon || null,
        createdAt: Date.now(), folderId: null,
      })
    }

    saveBookmarks()
    updateChromeHeightForBookmarks()
    broadcastLibrary()
    return serializeLibrary()
  })

  ipcMain.handle('remove-bookmark', (_e, id) => {
    const idx = bookmarksCache.findIndex(b => b.id === id)
    if (idx < 0) return serializeLibrary()
    bookmarksCache.splice(idx, 1)
    saveBookmarks()
    updateChromeHeightForBookmarks()
    broadcastLibrary()
    return serializeLibrary()
  })

  ipcMain.handle('rename-bookmark', (_e, id, newTitle) => {
    const bm = bookmarksCache.find(b => b.id === id)
    if (!bm) return serializeLibrary()
    bm.title = String(newTitle || '').trim() || bm.url
    saveBookmarks()
    broadcastLibrary()
    return serializeLibrary()
  })

  ipcMain.handle('update-bookmark', (_e, payload) => {
    const { id, title, url } = payload || {}
    const bm = bookmarksCache.find(b => b.id === id)
    if (!bm) return serializeLibrary()
    if (typeof title === 'string') bm.title = title.trim() || bm.url
    if (typeof url === 'string') {
      let u = url.trim()
      if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u
      if (u) bm.url = u
    }
    saveBookmarks()
    broadcastLibrary()
    return serializeLibrary()
  })

  ipcMain.handle('move-bookmark', (_e, payload) => {
    const { id, folderId } = payload || {}
    const bm = bookmarksCache.find(b => b.id === id)
    if (!bm) return serializeLibrary()
    let target = folderId || null
    if (target && !foldersCache.find(f => f.id === target)) target = null
    bm.folderId = target
    saveBookmarks()
    broadcastLibrary()
    return serializeLibrary()
  })

  ipcMain.handle('open-bookmark-in-new-tab', (_e, id) => {
    const bm = bookmarksCache.find(b => b.id === id)
    if (!bm) return
    createTab(bm.url)
  })

  ipcMain.handle('open-bookmarks-manager', () => openBookmarksManager())
  ipcMain.handle('open-history-manager', () => openHistoryManager())
  ipcMain.handle('open-settings-page', () => openSettingsPage())

  ipcMain.handle('clear-all-bookmarks', () => {
    bookmarksCache = []
    foldersCache = []
    saveBookmarks()
    updateChromeHeightForBookmarks()
    broadcastLibrary()
    return serializeLibrary()
  })

  ipcMain.handle('show-bookmark-menu', (_e, id) => {
    const bm = bookmarksCache.find(b => b.id === id)
    if (!bm) return
    const menu = Menu.buildFromTemplate([
      { label: 'Открыть в новой вкладке', click: () => createTab(bm.url) },
      { label: 'Копировать ссылку', click: () => clipboard.writeText(bm.url) },
      { type: 'separator' },
      { label: 'Удалить', click: () => {
        const idx = bookmarksCache.findIndex(b => b.id === id)
        if (idx >= 0) {
          bookmarksCache.splice(idx, 1)
          saveBookmarks()
          updateChromeHeightForBookmarks()
          broadcastLibrary()
        }
      }},
    ])
    menu.popup({ window: mainWindow })
  })

  ipcMain.handle('show-folder-menu', (_e, folderId) => {
    const folder = foldersCache.find(f => f.id === folderId)
    if (!folder) return
    const items = bookmarksCache.filter(b => b.folderId === folderId)
    const template = items.length === 0
      ? [{ label: 'Папка пуста', enabled: false }]
      : items.map(b => ({
          label: (b.title || b.url).slice(0, 60),
          click: () => createTab(b.url),
        }))
    Menu.buildFromTemplate(template).popup({ window: mainWindow })
  })

  ipcMain.handle('open-bookmark-popup', (_e, payload) => openBookmarkPopup(payload))
  ipcMain.handle('close-bookmark-popup', () => closeBookmarkPopup())

  ipcMain.handle('popup-save', (_e, { bookmarkId, title }) => {
    if (bookmarkId) {
      const bm = bookmarksCache.find(b => b.id === bookmarkId)
      if (bm) { bm.title = String(title || '').trim() || bm.url; saveBookmarks(); broadcastLibrary() }
    }
    closeBookmarkPopup()
    return serializeLibrary()
  })

  ipcMain.handle('popup-remove', (_e, { bookmarkId }) => {
    if (bookmarkId) {
      const idx = bookmarksCache.findIndex(b => b.id === bookmarkId)
      if (idx >= 0) {
        bookmarksCache.splice(idx, 1)
        saveBookmarks()
        updateChromeHeightForBookmarks()
        broadcastLibrary()
      }
    }
    closeBookmarkPopup()
    return serializeLibrary()
  })

  // ============ Папки ============
  ipcMain.handle('create-folder', (_e, name) => {
    const trimmed = String(name || '').trim()
    if (!trimmed) return serializeLibrary()
    foldersCache.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      createdAt: Date.now(),
    })
    saveBookmarks()
    broadcastLibrary()
    return serializeLibrary()
  })

  ipcMain.handle('rename-folder', (_e, payload) => {
    const { id, name } = payload || {}
    const f = foldersCache.find(x => x.id === id)
    if (!f) return serializeLibrary()
    const trimmed = String(name || '').trim()
    if (trimmed) f.name = trimmed
    saveBookmarks()
    broadcastLibrary()
    return serializeLibrary()
  })

  ipcMain.handle('delete-folder', (_e, id) => {
    const idx = foldersCache.findIndex(x => x.id === id)
    if (idx < 0) return serializeLibrary()
    foldersCache.splice(idx, 1)
    bookmarksCache = bookmarksCache.map(b =>
      b.folderId === id ? { ...b, folderId: null } : b
    )
    saveBookmarks()
    broadcastLibrary()
    return serializeLibrary()
  })

  // ============ История ============
  ipcMain.handle('get-history', () => historyCache)
  ipcMain.handle('remove-history-entry', (_e, id) => {
    const idx = historyCache.findIndex(h => h.id === id)
    if (idx >= 0) { historyCache.splice(idx, 1); saveHistory(); broadcastHistory() }
    return historyCache
  })
  ipcMain.handle('clear-history', () => {
    historyCache = []
    saveHistory()
    broadcastHistory()
    return historyCache
  })
  ipcMain.handle('open-url-from-history', (_e, id) => {
    const entry = historyCache.find(h => h.id === id)
    if (!entry) return
    navigateInActiveTab(entry.url)
  })
  ipcMain.handle('open-url-in-new-tab', (_e, url) => {
    if (url) createTab(url)
  })

  // ============ Подсказки ============
  ipcMain.handle('get-suggestions', async (_e, query) => {
    debugLog('Suggestions', `Запрос: "${query}"`)
    const items = await fetchSuggestions(query)
    return items
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})