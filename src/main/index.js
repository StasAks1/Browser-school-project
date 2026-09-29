import { app, BrowserWindow, WebContentsView, ipcMain, net, Menu, clipboard, screen, nativeTheme, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { debugLog, debugDevTools, debugTabEvent, debugStartupBanner, attachNetworkLogger } from './debug.js'
import { matchShortcut } from './shortcuts.js'
import { saveSession, loadSession, clearSession, isRestorableUrl } from './session.js'
import { generateBookmarksHTML, parseBookmarksHTML } from './bookmarks-io.js'
import { isPopupRequest, buildPopupWindowOptions, attachPopupHandlers } from './popup.js'
import { setupApplicationMenu } from './menu.js'
import { showTabContextMenu } from './context-menu.js'
import { getPrivateSession, clearPrivateData, PRIVATE_BG_COLOR } from './private.js'
import { extractArticle } from './reader.js'
import { attachTrackerBlocker, getStats as getTrackerStats, resetStats as resetTrackerStats, getCategories as getTrackerCategories } from './tracker-blocker.js'
import { installExtensionFromStore, removeExtensionFromSession, listInstalledExtensions, loadInstalledExtensions } from './extension-installer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.commandLine.appendSwitch('disable-features', 'HttpsFirstModeV2,HttpsUpgrades,HttpsFirstBalancedModeAutoEnable')
// Ограничение размера дискового кэша Chromium — 100 МБ.
app.commandLine.appendSwitch('disk-cache-size', String(100 * 1024 * 1024))
// Защита от WebRTC IP leak — используем только публичный сетевой интерфейс.
app.commandLine.appendSwitch('webrtc-ip-handling-policy', 'default_public_interface_only')

const CHROME_HEIGHT_BASE = 80
const CHROME_HEIGHT_BOOKMARKS = 112
const OMNIBOX_DROPDOWN_MAX = 340
const CHROME_ANIM_DURATION = 280
const CHROME_ANIM_FRAME = 16

const STATUSBAR_HEIGHT = 26
const STATUSBAR_PADDING = 8
const STATUSBAR_MAX_WIDTH = 520

const INTERNAL_BOOKMARKS = 'internal://bookmarks'
const INTERNAL_HISTORY = 'internal://history'
const INTERNAL_SETTINGS = 'internal://settings'
const INTERNAL_DOWNLOADS = 'internal://downloads'
const INTERNAL_COOKIES = 'internal://cookies'
const INTERNAL_READER = 'internal://reader'
const INTERNAL_PDF = 'internal://pdf'
const INTERNAL_EXTENSIONS = 'internal://extensions'

const POPUP_WIDTH = 300
const POPUP_HEIGHT = 165
const PERMISSION_POPUP_WIDTH = 380
const PERMISSION_POPUP_HEIGHT = 240

const HISTORY_MAX_ENTRIES = 10000
const HISTORY_MAX_AGE_DAYS = 90
const HISTORY_DEDUPE_MS = 30 * 1000

const DOWNLOADS_MAX_ENTRIES = 1000
const CLOSED_TABS_MAX = 25
const MAX_LOADED_TABS = 10

const SUGGESTIONS_CACHE_TTL = 5 * 60 * 1000
const SUGGESTIONS_TIMEOUT = 3000

const ACCENT_COLORS = {
  orange: { color: '#de5833', hover: '#c94a28', label: 'Оранжевый' },
  blue:   { color: '#3b82f6', hover: '#2563eb', label: 'Синий' },
  green:  { color: '#22c55e', hover: '#16a34a', label: 'Зелёный' },
  purple: { color: '#a855f7', hover: '#7e22ce', label: 'Фиолетовый' },
  pink:   { color: '#ec4899', hover: '#be185d', label: 'Розовый' },
  red:    { color: '#ef4444', hover: '#b91c1c', label: 'Красный' },
}
const ACCENT_DEFAULT = 'orange'

const ALL_TOOLBAR_BUTTONS = ['reader', 'find', 'downloads', 'history', 'reload', 'home']

// ID категорий блокировки трекеров (порядок = порядок в UI)
const TRACKER_CATEGORY_IDS = ['ads', 'analytics', 'social', 'marketing', 'fingerprint', 'cryptominers']

// Белый список CSS-переменных для кастомной темы
const THEME_VAR_WHITELIST = new Set([
  '--bg', '--bg-elevated', '--bg-hover', '--bg-active',
  '--bg-tab-active', '--bg-sidebar', '--bg-card',
  '--text', '--text-muted',
  '--accent', '--accent-hover',
  '--border', '--danger', '--star',
])

const COLOR_VALUE_RE = /^(#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i

let mainWindow = null
let chromeView = null
let statusBarView = null
let popupWindow = null
let tabs = []
let activeTabId = null
let nextTabId = 1
let bookmarksCache = []
let foldersCache = []
let historyCache = []
let downloadsCache = []
let settingsCache = {
  theme: 'dark',
  accent: ACCENT_DEFAULT,
  downloadPath: '',
  askWhereToSave: false,
  restoreSession: true,
  blockTrackers: true,
  blockAdUrls: true,
  trackerCategories: {
    analytics: true,
    ads: true,
    social: true,
    fingerprint: true,
    cryptominers: true,
    marketing: true,
  },
  toolbarButtons: [...ALL_TOOLBAR_BUTTONS],
  httpsOnly: false,
  homepage: 'startpage',
  customTheme: null,
}

const activeDownloads = new Map()
const closedTabsStack = []
let closedTabIdCounter = 1

let currentMenuActions = null
let currentMenuOptions = null

const allowedInsecureHosts = new Set()
const allowedBadCertHosts = new Set()

const pdfDataStore = new Map()
const tabTrackerCounts = new Map()

let currentChromeHeight = CHROME_HEIGHT_BASE
let omniboxOpen = false
let omniboxHeight = 0
let chromeAnimTimer = null
let isQuitting = false
let isQuitHandled = false

const SESSION_SAVE_DEBOUNCE = 500
let sessionSaveTimer = null
let pendingSessionToRestore = null

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
      popupWindow.webContents.send('custom-theme-changed', settingsCache.customTheme || null)
    })

    const payload = { origin: origin || 'Сайт', permission, label: getPermissionLabel(permission) }

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
      popupWindow.webContents.send('custom-theme-changed', settingsCache.customTheme || null)
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

// ============================================================
// ============ ЗАГРУЗКИ ======================================
// ============================================================
function getDefaultDownloadPath() {
  if (settingsCache.downloadPath) return settingsCache.downloadPath
  return app.getPath('downloads')
}

function handleWillDownload(event, item, webContents) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filename = item.getFilename()
  const url = item.getURL()

  let savePath
  if (settingsCache.askWhereToSave) {
    const result = dialog.showSaveDialogSync(mainWindow, {
      defaultPath: path.join(getDefaultDownloadPath(), filename),
      title: 'Сохранить файл',
    })
    if (!result) { item.cancel(); return }
    savePath = result
  } else {
    savePath = path.join(getDefaultDownloadPath(), filename)
  }

  item.setSavePath(savePath)

  const entry = {
    id, filename, url, savePath,
    totalBytes: item.getTotalBytes(),
    receivedBytes: 0,
    state: 'progressing',
    startedAt: Date.now(),
    completedAt: null,
  }

  downloadsCache.unshift(entry)
  if (downloadsCache.length > DOWNLOADS_MAX_ENTRIES) {
    downloadsCache = downloadsCache.slice(0, DOWNLOADS_MAX_ENTRIES)
  }
  saveDownloads()
  broadcastDownloads()
  broadcastDownloadActiveCount()

  activeDownloads.set(id, item)

  item.on('updated', (_e, state) => {
    const e = downloadsCache.find(d => d.id === id)
    if (!e) return
    e.receivedBytes = item.getReceivedBytes()
    e.totalBytes = item.getTotalBytes()
    if (state === 'interrupted') e.state = 'interrupted'
    else if (state === 'progressing') e.state = item.isPaused() ? 'paused' : 'progressing'
    broadcastDownloads()
  })

  item.once('done', (_e, state) => {
    const e = downloadsCache.find(d => d.id === id)
    if (e) {
      e.completedAt = Date.now()
      e.receivedBytes = item.getReceivedBytes()
      e.totalBytes = item.getTotalBytes()
      if (state === 'completed') e.state = 'completed'
      else if (state === 'cancelled') e.state = 'cancelled'
      else e.state = 'interrupted'
      const actualPath = item.getSavePath()
      if (actualPath) e.savePath = actualPath
    }
    activeDownloads.delete(id)
    saveDownloads()
    broadcastDownloads()
    broadcastDownloadActiveCount()
  })
}

function attachDownloadHandlerToSession(ses) {
  if (!ses || ses._willDownloadAttached) return
  ses._willDownloadAttached = true
  ses.on('will-download', handleWillDownload)
}

// ============================================================
// ============ БЕЗОПАСНОСТЬ ==================================
// ============================================================
function handleTrackerBlocked({ webContentsId }) {
  if (typeof webContentsId !== 'number') return

  const prev = tabTrackerCounts.get(webContentsId) || 0
  const next = prev + 1
  tabTrackerCounts.set(webContentsId, next)

  const active = getActiveTab()
  if (
    active &&
    !active.isUnloaded &&
    active.view &&
    !active.view.webContents.isDestroyed() &&
    active.view.webContents.id === webContentsId
  ) {
    if (chromeView && !chromeView.webContents.isDestroyed()) {
      chromeView.webContents.send('tracker-count', next)
    }
  }
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
    if (permissionDecisions.has(key)) { callback(permissionDecisions.get(key)); return }
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

  attachNetworkLogger(ses)
  attachDownloadHandlerToSession(ses)

  // ============ Защита от data: в mainFrame ============
  ses.webRequest.onBeforeRequest({ urls: ['data:*'] }, (details, callback) => {
    if (details.resourceType === 'mainFrame') {
      debugLog('Security', 'Заблокирована навигация на data: в mainFrame')
      callback({ cancel: true })
      return
    }
    callback({})
  })

  // ============ Referrer Policy: обрезаем до origin ============
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders }
    if (headers.Referer) {
      try {
        const u = new URL(headers.Referer)
        headers.Referer = u.origin + '/'
      } catch {
        delete headers.Referer
      }
    }
    callback({ requestHeaders: headers })
  })

  // Блокировка трекеров и рекламы (обычная сессия)
  attachTrackerBlocker(ses, {
    isEnabled: () => !!settingsCache.blockTrackers,
    isCategoryEnabled: (catId) => isTrackerCategoryEnabled(catId),
    isAdUrlBlockEnabled: () => !!settingsCache.blockAdUrls,
  }, handleTrackerBlocked)
}

function attachTabSecurityHandlers(tab) {
  const wc = tab.view.webContents
  attachDownloadHandlerToSession(wc.session)

  wc.setWindowOpenHandler((details) => {
    const { url } = details
    debugTabEvent(tab.id, 'window.open', url)

    let parsed = null
    try { parsed = new URL(url) } catch {}
    if (!parsed) return { action: 'deny' }

    if (parsed.protocol === 'about:' && parsed.pathname === 'blank') {
      if (isPopupRequest(details)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: buildPopupWindowOptions(details, mainWindow),
        }
      }
      return { action: 'deny' }
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      if (['mailto:', 'tel:'].includes(parsed.protocol)) {
        try { shell.openExternal(url) } catch (e) {}
      }
      return { action: 'deny' }
    }

    if (isPopupRequest(details)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: buildPopupWindowOptions(details, mainWindow),
      }
    }

    createTab(url)
    return { action: 'deny' }
  })

  wc.on('did-create-window', (popupWin) => {
    attachPopupHandlers(popupWin, createTab)
  })

  wc.on('will-navigate', (event, url) => {
    debugTabEvent(tab.id, 'will-navigate', url)
    if (isTrustedInternalUrl(url)) return

    let parsed = null
    try { parsed = new URL(url) } catch {}

    if (!parsed) { event.preventDefault(); return }

    if (parsed.protocol === 'https:' || parsed.protocol === 'about:') return

    if (parsed.protocol === 'http:') {
      if (settingsCache.httpsOnly) {
        event.preventDefault()
        loadWarningPage(tab, url)
        return
      }
      if (allowedInsecureHosts.has(parsed.hostname)) return
      event.preventDefault()
      loadWarningPage(tab, url)
      return
    }

    event.preventDefault()
  })

  wc.on('will-redirect', (event, url) => {
    debugTabEvent(tab.id, 'will-redirect', url)
    if (isTrustedInternalUrl(url)) return

    let parsed = null
    try { parsed = new URL(url) } catch {}

    if (parsed && parsed.protocol === 'http:') {
      if (settingsCache.httpsOnly || !allowedInsecureHosts.has(parsed.hostname)) {
        event.preventDefault()
        loadWarningPage(tab, url)
        return
      }
    }

    if (parsed && parsed.protocol === 'file:') {
      event.preventDefault()
    }
  })

  wc.on('render-process-gone', (_e, details) => {
    debugLog('Security', `Render process вкладки ${tab.id} упал: ${details.reason}`)
  })

  wc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    if (errorCode === -3 || errorCode === -1) return
    if (isTrustedInternalUrl(validatedURL) || isTrustedInternalUrl(wc.getURL())) return
    if (wc.getURL().includes('warning.html')) return

    debugLog('Tab', `did-fail-load #${tab.id}: ${errorCode} ${errorDescription} (${validatedURL})`)
    loadErrorPage(tab, validatedURL, errorCode, errorDescription)
  })
}

function isTrustedInternalUrl(url) {
  if (!url) return false
  return (
    url.includes('startpage.html') ||
    url.includes('bookmarks/bookmarks.html') ||
    url.includes('history/history.html') ||
    url.includes('settings/settings.html') ||
    url.includes('downloads/downloads.html') ||
    url.includes('cookies/cookies.html') ||
    url.includes('reader/reader.html') ||
    url.includes('pdf/pdf.html') ||
    url.includes('extensions/extensions.html') ||
    url.includes('statusbar/statusbar.html') ||
    url.includes('error/error.html') ||
    url.includes('warning/warning.html') ||
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
function getDownloadsPagePath() { return path.join(__dirname, '../renderer/downloads/downloads.html') }
function getDownloadsPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/downloads/downloads.html` : null
}
function getCookiesPagePath() { return path.join(__dirname, '../renderer/cookies/cookies.html') }
function getCookiesPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/cookies/cookies.html` : null
}
function getReaderPagePath() { return path.join(__dirname, '../renderer/reader/reader.html') }
function getReaderPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/reader/reader.html` : null
}
function getPdfPagePath() { return path.join(__dirname, '../renderer/pdf/pdf.html') }
function getPdfPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/pdf/pdf.html` : null
}
function getExtensionsPagePath() { return path.join(__dirname, '../renderer/extensions/extensions.html') }
function getExtensionsPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/extensions/extensions.html` : null
}
function getStatusBarPath() { return path.join(__dirname, '../renderer/statusbar/statusbar.html') }
function getStatusBarUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/statusbar/statusbar.html` : null
}
function getErrorPagePath() { return path.join(__dirname, '../renderer/error/error.html') }
function getErrorPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/error/error.html` : null
}
function getWarningPagePath() { return path.join(__dirname, '../renderer/warning/warning.html') }
function getWarningPageUrl() {
  return process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}/warning/warning.html` : null
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
function getDownloadsFile() { return path.join(app.getPath('userData'), 'downloads.json') }

// ============================================================
// ============ НАСТРОЙКИ =====================================
// ============================================================
function normalizeToolbarButtons(arr) {
  if (!Array.isArray(arr)) return [...ALL_TOOLBAR_BUTTONS]
  const valid = arr.filter((id, i) =>
    typeof id === 'string' &&
    ALL_TOOLBAR_BUTTONS.includes(id) &&
    arr.indexOf(id) === i
  )
  return valid
}

function normalizeHomepage(value) {
  if (value === 'about:blank') return 'about:blank'
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
  return 'startpage'
}

function isValidColor(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (v.length > 64) return false
  if (/url\s*\(|expression\s*\(|javascript:|@import|<\/?script/i.test(v)) return false
  return COLOR_VALUE_RE.test(v)
}

function normalizeTrackerCategories(value) {
  const out = {}
  for (const id of TRACKER_CATEGORY_IDS) {
    out[id] = (value && typeof value === 'object' && value[id] === false) ? false : true
  }
  return out
}

function isTrackerCategoryEnabled(catId) {
  if (!catId) return true
  return settingsCache.trackerCategories?.[catId] !== false
}


function normalizeCustomTheme(value) {
  if (!value || typeof value !== 'object') return null
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 50) : 'Моя тема'
  if (!value.vars || typeof value.vars !== 'object') return null

  const cleanVars = {}
  for (const [key, val] of Object.entries(value.vars)) {
    if (!THEME_VAR_WHITELIST.has(key)) continue
    if (!isValidColor(val)) continue
    cleanVars[key] = String(val).trim()
  }

  if (Object.keys(cleanVars).length === 0) return null
  return { name, vars: cleanVars }
}

function loadSettings() {
  try {
    const file = getSettingsFile()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      const data = JSON.parse(raw)
      settingsCache = {
        theme: ['light', 'dark', 'system'].includes(data.theme) ? data.theme : 'dark',
        accent: ACCENT_COLORS[data.accent] ? data.accent : ACCENT_DEFAULT,
        downloadPath: typeof data.downloadPath === 'string' ? data.downloadPath : '',
        askWhereToSave: !!data.askWhereToSave,
        restoreSession: data.restoreSession !== false,
        blockTrackers: data.blockTrackers !== false,
        blockAdUrls: data.blockAdUrls !== false,
        trackerCategories: normalizeTrackerCategories(data.trackerCategories),
        toolbarButtons: normalizeToolbarButtons(data.toolbarButtons),
        httpsOnly: !!data.httpsOnly,
        homepage: normalizeHomepage(data.homepage),
        customTheme: normalizeCustomTheme(data.customTheme),
      }
    } else {
      settingsCache = {
        theme: 'dark',
        accent: ACCENT_DEFAULT,
        downloadPath: '',
        askWhereToSave: false,
        restoreSession: true,
        blockTrackers: true,
        blockAdUrls: true,
        trackerCategories: {
          analytics: true,
          ads: true,
          social: true,
          fingerprint: true,
          cryptominers: true,
          marketing: true,
        },
        toolbarButtons: [...ALL_TOOLBAR_BUTTONS],
        httpsOnly: false,
        homepage: 'startpage',
        customTheme: null,
      }
      saveSettings()
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
    settingsCache = {
      theme: 'dark',
      accent: ACCENT_DEFAULT,
      downloadPath: '',
      askWhereToSave: false,
      restoreSession: true,
      blockTrackers: true,
      blockAdUrls: true,
      trackerCategories: {
        analytics: true,
        ads: true,
        social: true,
        fingerprint: true,
        cryptominers: true,
        marketing: true,
      },
      toolbarButtons: [...ALL_TOOLBAR_BUTTONS],
      httpsOnly: false,
      homepage: 'startpage',
      customTheme: null,
    }
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
    if (tab.isUnloaded) continue
    if (tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.setBackgroundColor(tab.isPrivate ? PRIVATE_BG_COLOR : color)
    }
  }
}

function updateTitleBarOverlay() {
  if (process.platform !== 'win32') return
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (typeof mainWindow.setTitleBarOverlay !== 'function') return
  try {
    const themeColor = getBackgroundColor()
    const symbolColor = getResolvedTheme() === 'light' ? '#1a1a1a' : '#f0f0f0'
    mainWindow.setTitleBarOverlay({
      color: themeColor,
      symbolColor,
      height: 44,
    })
  } catch (e) {
    debugLog('Window', `Не удалось обновить titleBarOverlay: ${e.message}`)
  }
}

function broadcastTheme() {
  const theme = getResolvedTheme()
  if (chromeView && !chromeView.webContents.isDestroyed()) chromeView.webContents.send('theme-changed', theme)
  for (const tab of tabs) {
    if (tab.isUnloaded) continue
    if (tab.view && !tab.view.webContents.isDestroyed()) tab.view.webContents.send('theme-changed', theme)
  }
  if (statusBarView && !statusBarView.webContents.isDestroyed()) statusBarView.webContents.send('theme-changed', theme)
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.webContents.send('theme-changed', theme)
  if (pendingPermission && pendingPermission.popupWindow && !pendingPermission.popupWindow.isDestroyed()) {
    pendingPermission.popupWindow.webContents.send('theme-changed', theme)
  }
  applyBackgroundColors()
  updateTitleBarOverlay()
}

function broadcastAccent() {
  const data = getAccentData()
  if (chromeView && !chromeView.webContents.isDestroyed()) chromeView.webContents.send('accent-changed', data)
  for (const tab of tabs) {
    if (tab.isUnloaded) continue
    if (tab.view && !tab.view.webContents.isDestroyed()) tab.view.webContents.send('accent-changed', data)
  }
  if (statusBarView && !statusBarView.webContents.isDestroyed()) statusBarView.webContents.send('accent-changed', data)
  if (popupWindow && !popupWindow.isDestroyed()) popupWindow.webContents.send('accent-changed', data)
  if (pendingPermission && pendingPermission.popupWindow && !pendingPermission.popupWindow.isDestroyed()) {
    pendingPermission.popupWindow.webContents.send('accent-changed', data)
  }
}

function broadcastToolbarSettings() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  chromeView.webContents.send('toolbar-settings-changed', {
    visible: settingsCache.toolbarButtons,
  })
}

function broadcastCustomTheme() {
  const payload = settingsCache.customTheme || null
  if (chromeView && !chromeView.webContents.isDestroyed()) {
    chromeView.webContents.send('custom-theme-changed', payload)
  }
  for (const tab of tabs) {
    if (tab.isUnloaded) continue
    if (tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('custom-theme-changed', payload)
    }
  }
  if (statusBarView && !statusBarView.webContents.isDestroyed()) {
    statusBarView.webContents.send('custom-theme-changed', payload)
  }
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('custom-theme-changed', payload)
  }
  if (pendingPermission && pendingPermission.popupWindow && !pendingPermission.popupWindow.isDestroyed()) {
    pendingPermission.popupWindow.webContents.send('custom-theme-changed', payload)
  }
}

// ============================================================
// ============ СОСТОЯНИЕ СОЕДИНЕНИЯ ==========================
// ============================================================
function getSecurityState(url) {
  if (!url || url === 'about:blank') return 'unknown'
  if (isTrustedInternalUrl(url)) return 'internal'
  if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('devtools:')) return 'internal'
  try {
    const u = new URL(url)
    if (u.protocol === 'https:') return 'secure'
    if (u.protocol === 'http:') return 'insecure'
  } catch {}
  return 'unknown'
}

function broadcastSecurityState() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  const active = getActiveTab()
  const url = getTabUrl(active)
  chromeView.webContents.send('security-state', getSecurityState(url))
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
    url.startsWith('file:') || url.startsWith('data:') ||
    url.startsWith('about:') || url.startsWith('devtools:')
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
    url, title: title || url, visitedAt: now,
  })
  if (historyCache.length > HISTORY_MAX_ENTRIES) {
    historyCache = historyCache.slice(-HISTORY_MAX_ENTRIES)
  }
  saveHistory()
  broadcastHistory()
}

function broadcastHistory() {
  if (chromeView && !chromeView.webContents.isDestroyed()) chromeView.webContents.send('history-updated')
  for (const tab of tabs) {
    if (tab.isHistoryManager && tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('history-updated')
    }
  }
}

// ============================================================
// ============ ЗАГРУЗКИ: ФАЙЛ ================================
// ============================================================
function loadDownloads() {
  try {
    const file = getDownloadsFile()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      downloadsCache = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []
    } else {
      downloadsCache = []
    }
  } catch (err) {
    console.error('Failed to load downloads:', err)
    downloadsCache = []
  }
}

function saveDownloads() {
  try {
    fs.writeFileSync(getDownloadsFile(), JSON.stringify(downloadsCache, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save downloads:', err)
  }
}

function broadcastDownloads() {
  const payload = downloadsCache.slice()
  if (chromeView && !chromeView.webContents.isDestroyed()) chromeView.webContents.send('downloads-updated', payload)
  for (const tab of tabs) {
    if (tab.isDownloadsManager && tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('downloads-updated', payload)
    }
  }
}

function broadcastDownloadActiveCount() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  const activeCount = downloadsCache.filter(d => d.state === 'progressing' || d.state === 'paused').length
  chromeView.webContents.send('download-active-count', activeCount)
}

// ============================================================
// ============ БИБЛИОТЕКА ====================================
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
  if (chromeView && !chromeView.webContents.isDestroyed()) chromeView.webContents.send('library-updated', payload)
  for (const tab of tabs) {
    if (tab.isBookmarksManager && tab.view && !tab.view.webContents.isDestroyed()) {
      tab.view.webContents.send('library-updated', payload)
    }
  }
}

function getTargetChromeHeight() {
  return bookmarksCache.length > 0 ? CHROME_HEIGHT_BOOKMARKS : CHROME_HEIGHT_BASE
}

function getEffectiveChromeHeight() {
  const base = getTargetChromeHeight()
  return omniboxOpen ? base + omniboxHeight : base
}

function setOmniboxOpen(open, height) {
  const next = !!open
  const nextHeight = next
    ? Math.max(0, Math.min(Number(height) || 0, OMNIBOX_DROPDOWN_MAX))
    : 0

  if (next === omniboxOpen && nextHeight === omniboxHeight) return

  omniboxOpen = next
  omniboxHeight = nextHeight

  // Без анимации — иначе дёргается при каждом нажатии клавиши
  if (chromeAnimTimer) { clearTimeout(chromeAnimTimer); chromeAnimTimer = null }
  currentChromeHeight = getEffectiveChromeHeight()
  applyLayout(currentChromeHeight)
}

function makeBookmarkId(prefix) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${prefix}`
}

// ============================================================
// ============ ХЕЛПЕРЫ =======================================
// ============================================================
function getActiveTab() { return tabs.find(t => t.id === activeTabId) || null }
function getTab(id) { return tabs.find(t => t.id === id) || null }

function getTabUrl(tab) {
  if (!tab) return ''
  if (tab.isUnloaded) return tab.savedUrl || ''
  if (!tab.view || tab.view.webContents.isDestroyed()) return tab.url || ''
  try { return tab.view.webContents.getURL() || tab.url || '' } catch { return tab.url || '' }
}

function getTabTitle(tab) {
  if (!tab) return ''
  if (tab.isUnloaded) return tab.savedTitle || tab.savedUrl || ''
  if (!tab.view || tab.view.webContents.isDestroyed()) return tab.title || ''
  try { return tab.view.webContents.getTitle() || tab.title || '' } catch { return tab.title || '' }
}

function parseInternalSection(url) {
  if (!url || typeof url !== 'string') return ''
  const idx = url.indexOf('?')
  if (idx === -1) return ''
  try {
    const params = new URLSearchParams(url.slice(idx + 1))
    return params.get('section') || ''
  } catch { return '' }
}

function isStartpageUrl(url) { if (!url) return true; return url.includes('startpage.html') }
function isBookmarksPageUrl(url) { if (!url) return false; return url.includes('bookmarks/bookmarks.html') }
function isHistoryPageUrl(url) { if (!url) return false; return url.includes('history/history.html') }
function isSettingsPageUrl(url) { if (!url) return false; return url.includes('settings/settings.html') }
function isDownloadsPageUrl(url) { if (!url) return false; return url.includes('downloads/downloads.html') }
function isCookiesPageUrl(url) { if (!url) return false; return url.includes('cookies/cookies.html') }
function isReaderPageUrl(url) { if (!url) return false; return url.includes('reader/reader.html') }
function isPdfPageUrl(url) { if (!url) return false; return url.includes('pdf/pdf.html') }
function isExtensionsPageUrl(url) { if (!url) return false; return url.includes('extensions/extensions.html') }
function isErrorPageUrl(url) { if (!url) return false; return url.includes('error/error.html') }
function isWarningPageUrl(url) { if (!url) return false; return url.includes('warning/warning.html') }
function isInternalUrl(url) {
  return isStartpageUrl(url) || isBookmarksPageUrl(url) || isHistoryPageUrl(url) ||
         isSettingsPageUrl(url) || isDownloadsPageUrl(url) || isCookiesPageUrl(url) ||
         isReaderPageUrl(url) || isPdfPageUrl(url) || isExtensionsPageUrl(url) ||
         isErrorPageUrl(url) || isWarningPageUrl(url)
}

function serializeTabs() {
  return tabs.map(t => ({
    id: t.id,
    title: t.isUnloaded ? (t.savedTitle || 'Новая вкладка') : (t.title || 'Новая вкладка'),
    url: t.isUnloaded ? (t.savedUrl || '') : (t.url || ''),
    favicon: t.isUnloaded ? (t.savedFavicon || null) : (t.favicon || null),
    isLoading: t.isUnloaded ? false : !!t.isLoading,
    isActive: t.id === activeTabId,
    isUnloaded: !!t.isUnloaded,
    isPrivate: !!t.isPrivate,
    isReader: !!t.isReaderMode,
    canRead: tabCanRead(t),
  }))
}

function tabCanRead(tab) {
  if (!tab) return false
  if (tab.isReaderMode) return true
  if (tab.isUnloaded) return false
  if (!tab.view || tab.view.webContents.isDestroyed()) return false
  const url = getTabUrl(tab)
  if (!url) return false
  if (isInternalUrl(url)) return false
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false
  return true
}

function sendTabsUpdate() {
  scheduleSessionSave()
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  chromeView.webContents.send('tabs-updated', serializeTabs())
}

function sendActiveTabUrl() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  const active = getActiveTab()
  if (!active) return

  let url = ''
  if (active.isUnloaded) {
    url = active.savedUrl || ''
  } else if (active.view && !active.view.webContents.isDestroyed()) {
    try { url = active.view.webContents.getURL() || '' } catch {}
    if (!url) url = active.savedUrl || active.url || ''
  } else {
    url = active.savedUrl || active.url || ''
  }

  chromeView.webContents.send('page-url', isInternalUrl(url) ? '' : url)
}

function sendLoadingState() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return
  const active = getActiveTab()
  const isLoading = active && !active.isUnloaded ? !!active.isLoading : false
  chromeView.webContents.send('page-loading', isLoading)
}

// ============================================================
// ============ SESSION RESTORE ===============================
// ============================================================
function getRestorableTabsWithActive() {
  const list = []
  let activeIdx = -1
  for (const tab of tabs) {
    if (tab.isPrivate) continue
    const url = getTabUrl(tab)
    if (!isRestorableUrl(url)) continue
    if (tab.id === activeTabId) activeIdx = list.length
    list.push({
      url,
      title: getTabTitle(tab) || url,
      favicon: tab.isUnloaded ? (tab.savedFavicon || null) : (tab.favicon || null),
    })
  }
  return { tabs: list, activeIndex: activeIdx >= 0 ? activeIdx : 0 }
}

function doSaveSessionNow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (tabs.length === 0) {
    clearSession()
    return
  }

  const { tabs: restorable, activeIndex } = getRestorableTabsWithActive()
  if (restorable.length === 0) {
    clearSession()
    return
  }

  saveSession({ tabs: restorable, activeIndex })
}

function scheduleSessionSave() {
  if (!settingsCache.restoreSession) return
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer)
  sessionSaveTimer = setTimeout(() => {
    sessionSaveTimer = null
    doSaveSessionNow()
  }, SESSION_SAVE_DEBOUNCE)
}

function flushSessionSave() {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer)
    sessionSaveTimer = null
  }
  if (settingsCache.restoreSession) {
    doSaveSessionNow()
  } else {
    clearSession()
  }
}

function restoreSessionIntoTabs() {
  if (!pendingSessionToRestore) {
    createTab()
    return
  }

  const s = pendingSessionToRestore
  pendingSessionToRestore = null

  if (!s.tabs || s.tabs.length === 0) {
    createTab()
    return
  }

  const createdIds = []
  for (const t of s.tabs) {
    const tab = createTab(t.url)
    if (tab) createdIds.push(tab.id)
  }

  if (createdIds.length === 0) {
    createTab()
    return
  }

  const targetIdx = Math.min(Math.max(0, s.activeIndex), createdIds.length - 1)
  switchTab(createdIds[targetIdx])
  enforceTabLimit()
  debugLog('Session', `Восстановлено вкладок: ${createdIds.length}, активна #${targetIdx + 1}`)
}

// ============================================================
// ============ READER MODE ===================================
// ============================================================
async function toggleReaderMode() {
  const tab = getActiveTab()
  if (!tab) return { ok: false, error: 'Нет активной вкладки' }

  if (tab.isReaderMode) {
    exitReaderMode(tab)
    return { ok: true, exited: true }
  }

  if (tab.isUnloaded) recreateTab(tab)
  if (!tab.view || tab.view.webContents.isDestroyed()) {
    return { ok: false, error: 'Вкладка не загружена' }
  }

  const wc = tab.view.webContents
  let url = ''
  try { url = wc.getURL() } catch {}

  if (!url) return { ok: false, error: 'Не удалось определить URL' }
  if (isInternalUrl(url)) return { ok: false, error: 'Недоступно на внутренних страницах' }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { ok: false, error: 'Режим чтения работает только на веб-страницах' }
  }

  const currentTitle = getTabTitle(tab)

  const result = await extractArticle(wc)
  if (!result.ok) return result

  tab.isReaderMode = true
  tab.readerOriginalUrl = url
  tab.readerOriginalTitle = currentTitle || url
  tab.readerData = result.article
  tab.title = result.article.title || currentTitle || 'Режим чтения'
  tab.favicon = null

  loadReaderPage(tab)
  sendTabsUpdate()
  sendActiveTabUrl()
  broadcastSecurityState()

  return { ok: true, entered: true }
}

function exitReaderMode(tab) {
  if (!tab) tab = getActiveTab()
  if (!tab || !tab.isReaderMode) return

  const url = tab.readerOriginalUrl || ''
  const title = tab.readerOriginalTitle || ''

  tab.isReaderMode = false
  tab.readerData = null
  tab.readerOriginalUrl = ''
  tab.readerOriginalTitle = ''

  if (url) {
    if (!tab.view || tab.view.webContents.isDestroyed()) recreateTab(tab)
    tab.title = title || url
    tab.view.webContents.loadURL(url)
  } else {
    goHomeInActiveTab()
  }
}

function loadReaderPage(tab) {
  if (!tab || !tab.view || tab.view.webContents.isDestroyed()) return
  const u = getReaderPageUrl()
  if (u) tab.view.webContents.loadURL(u)
  else tab.view.webContents.loadFile(getReaderPagePath())
}

// ============================================================
// ============ PDF VIEWER ====================================
// ============================================================
function openPdfViewer(filePath) {
  if (!filePath) return null

  const tab = createTab(INTERNAL_PDF)
  if (!tab) return null

  pdfDataStore.set(tab.id, { path: filePath, data: null })
  debugLog('PDF', `Открыт PDF-viewer: ${filePath} (вкладка #${tab.id})`)
  return tab
}

function handleDropFiles(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return

  const filePath = paths[0]
  if (!filePath) return

  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.pdf') {
    openPdfViewer(filePath)
    return
  }

  shell.openPath(filePath).catch((err) => {
    debugLog('Drop', `Не удалось открыть ${filePath}: ${err.message}`)
  })
}

// ============================================================
// ============ STATUS BAR ====================================
// ============================================================
function createStatusBar() {
  statusBarView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      transparent: true,
    },
  })
  statusBarView.setBackgroundColor('#00000000')
  statusBarView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  mainWindow.contentView.addChildView(statusBarView)

  const u = getStatusBarUrl()
  if (u) statusBarView.webContents.loadURL(u)
  else statusBarView.webContents.loadFile(getStatusBarPath())

  statusBarView.webContents.on('dom-ready', () => {
    statusBarView.webContents.send('theme-changed', getResolvedTheme())
    statusBarView.webContents.send('accent-changed', getAccentData())
    statusBarView.webContents.send('custom-theme-changed', settingsCache.customTheme || null)
  })

  statusBarView.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (isMainFrame) {
      debugLog('StatusBar', `did-fail-load: ${code} ${desc} (${url})`)
    }
  })
}

function layoutStatusBar(visible) {
  if (!statusBarView || statusBarView.webContents.isDestroyed()) return
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (!visible) {
    statusBarView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return
  }

  const [width, height] = mainWindow.getContentSize()
  const w = Math.min(STATUSBAR_MAX_WIDTH, width - STATUSBAR_PADDING * 2)
  statusBarView.setBounds({
    x: STATUSBAR_PADDING,
    y: height - STATUSBAR_HEIGHT - STATUSBAR_PADDING,
    width: w,
    height: STATUSBAR_HEIGHT,
  })
}

function updateStatusBar(url) {
  if (!statusBarView || statusBarView.webContents.isDestroyed()) return
  const clean = typeof url === 'string' ? url.trim() : ''
  if (clean) {
    statusBarView.webContents.send('statusbar-url', clean)
    layoutStatusBar(true)
  } else {
    layoutStatusBar(false)
  }
}

function hideStatusBar() {
  updateStatusBar('')
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
    if (tab.isUnloaded) continue
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
  const target = getEffectiveChromeHeight()
  if (Math.abs(target - currentChromeHeight) > 0.5) animateChromeHeight(target)
  else layoutViews()
}

// ============================================================
// ============ URL-УТИЛИТЫ ===================================
// ============================================================
function isUrlLike(input) {
  if (!input) return false
  if (
    input === INTERNAL_BOOKMARKS ||
    input === INTERNAL_HISTORY ||
    input === INTERNAL_SETTINGS ||
    input === INTERNAL_DOWNLOADS ||
    input === INTERNAL_COOKIES ||
    input === INTERNAL_PDF ||
    input === INTERNAL_EXTENSIONS ||
    input.startsWith(INTERNAL_SETTINGS + '?')
  ) return true
  if (/\s/.test(input)) return false
  if (/^https?:\/\//i.test(input)) return true
  if (/^localhost(:\d+)?(\/|$)/.test(input)) return true
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(input)) return true
  return false
}

function normalizeToUrl(input) {
  const trimmed = input.trim()
  if (
    trimmed === INTERNAL_BOOKMARKS ||
    trimmed === INTERNAL_HISTORY ||
    trimmed === INTERNAL_SETTINGS ||
    trimmed === INTERNAL_DOWNLOADS ||
    trimmed === INTERNAL_COOKIES ||
    trimmed === INTERNAL_PDF ||
    trimmed === INTERNAL_EXTENSIONS ||
    trimmed.startsWith(INTERNAL_SETTINGS + '?')
  ) return trimmed
  if (isUrlLike(trimmed)) {
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return 'https://' + trimmed
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`
}

// ============================================================
// ============ WARNING / ERROR ===============================
// ============================================================
function loadWarningPage(tab, targetUrl) {
  const params = new URLSearchParams({
    url: targetUrl,
    httpsOnly: settingsCache.httpsOnly ? '1' : '0',
  })
  const pageUrl = getWarningPageUrl()

  if (pageUrl) {
    tab.view.webContents.loadURL(`${pageUrl}?${params.toString()}`)
  } else {
    tab.view.webContents.loadFile(getWarningPagePath(), {
      query: { url: targetUrl, httpsOnly: settingsCache.httpsOnly ? '1' : '0' },
    })
  }

  tab.isWarningPage = true
  tab.isErrorPage = false
  tab.warningUrl = targetUrl
  tab.title = 'Соединение не защищено'
  tab.favicon = null
  sendTabsUpdate()
  broadcastSecurityState()
}

function loadErrorPage(tab, failedUrl, errorCode, errorDesc) {
  const params = new URLSearchParams({
    url: failedUrl || '',
    code: String(errorCode || ''),
    desc: errorDesc || '',
  })

  const pageUrl = getErrorPageUrl()
  if (pageUrl) {
    tab.view.webContents.loadURL(`${pageUrl}?${params.toString()}`)
  } else {
    tab.view.webContents.loadFile(getErrorPagePath(), {
      query: { url: failedUrl || '', code: String(errorCode || ''), desc: errorDesc || '' },
    })
  }

  tab.isErrorPage = true
  tab.isWarningPage = false
  tab.errorUrl = failedUrl
  tab.title = 'Не удалось открыть страницу'
  tab.favicon = null
  sendTabsUpdate()
  broadcastSecurityState()
}

// ============================================================
// ============ СЛУШАТЕЛИ ВКЛАДКИ =============================
// ============================================================
function attachTabListeners(tab) {
  const wc = tab.view.webContents

  wc.on('did-start-loading', () => {
    tab.isLoading = true
    if (tab.id === activeTabId) {
      sendLoadingState()
      hideStatusBar()
    }
    sendTabsUpdate()
  })

  wc.on('page-title-updated', (_e, title) => {
    const currentUrl = wc.getURL()
    const isBM = isBookmarksPageUrl(currentUrl)
    const isH = isHistoryPageUrl(currentUrl)
    const isS = isSettingsPageUrl(currentUrl)
    const isD = isDownloadsPageUrl(currentUrl)
    const isC = isCookiesPageUrl(currentUrl)
    const isR = isReaderPageUrl(currentUrl)
    const isP = isPdfPageUrl(currentUrl)
    const isE = isErrorPageUrl(currentUrl)
    const isW = isWarningPageUrl(currentUrl)
    tab.isBookmarksManager = isBM
    tab.isHistoryManager = isH
    tab.isSettingsPage = isS
    tab.isDownloadsManager = isD
    tab.isCookiesManager = isC
    tab.isErrorPage = isE
    tab.isWarningPage = isW

    if (isBM) tab.title = 'Закладки'
    else if (isH) tab.title = 'История'
    else if (isS) tab.title = 'Настройки'
    else if (isD) tab.title = 'Загрузки'
    else if (isC) tab.title = 'Cookie'
    else if (isR) tab.title = 'Режим чтения'
    else if (isP) tab.title = 'PDF'
    else if (isE) tab.title = 'Не удалось открыть страницу'
    else if (isW) tab.title = 'Соединение не защищено'
    else tab.title = title

    sendTabsUpdate()
  })

  wc.on('page-favicon-updated', (_e, favicons) => {
    const currentUrl = wc.getURL()
    if (isInternalUrl(currentUrl)) {
      tab.favicon = null
    } else {
      tab.favicon = Array.isArray(favicons) && favicons.length ? favicons[0] : null
    }
    sendTabsUpdate()
  })

  wc.on('did-stop-loading', () => {
    tab.isLoading = false
    if (tab.id === activeTabId) {
      sendLoadingState()
      sendActiveTabUrl()
      broadcastSecurityState()
    }
    sendTabsUpdate()
  })

  wc.on('dom-ready', () => {
    wc.send('theme-changed', getResolvedTheme())
    wc.send('accent-changed', getAccentData())
    wc.send('custom-theme-changed', settingsCache.customTheme || null)
  })

  wc.on('found-in-page', (_e, result) => {
    if (tab.id !== activeTabId) return
    if (!chromeView || chromeView.webContents.isDestroyed()) return
    chromeView.webContents.send('find-result', {
      matches: result.matches || 0,
      activeMatch: result.activeMatchOrdinal || 0,
    })
  })

  attachShortcuts(wc)

  wc.on('context-menu', (_e, params) => {
    showTabContextMenu({
      params,
      wc,
      actions: { createTab },
    })
  })

  wc.on('update-target-url', (_e, targetUrl) => {
    if (tab.id !== activeTabId) return
    updateStatusBar(targetUrl)
  })

  wc.on('did-navigate', (_e, navUrl) => {
    tab.url = navUrl
    try {
      tabTrackerCounts.set(wc.id, 0)
      if (tab.id === activeTabId && chromeView && !chromeView.webContents.isDestroyed()) {
        chromeView.webContents.send('tracker-count', 0)
      }
    } catch (e) {}
    if (tab.id === activeTabId) hideStatusBar()

    if (tab.isReaderMode && !isReaderPageUrl(navUrl)) {
      tab.isReaderMode = false
      tab.readerData = null
      tab.readerOriginalUrl = ''
      tab.readerOriginalTitle = ''
    }

    const isBM = isBookmarksPageUrl(navUrl)
    const isH = isHistoryPageUrl(navUrl)
    const isS = isSettingsPageUrl(navUrl)
    const isD = isDownloadsPageUrl(navUrl)
    const isC = isCookiesPageUrl(navUrl)
    const isR = isReaderPageUrl(navUrl)
    const isP = isPdfPageUrl(navUrl)
    const isE = isErrorPageUrl(navUrl)
    const isW = isWarningPageUrl(navUrl)
    tab.isBookmarksManager = isBM
    tab.isHistoryManager = isH
    tab.isSettingsPage = isS
    tab.isDownloadsManager = isD
    tab.isCookiesManager = isC
    tab.isErrorPage = isE
    tab.isWarningPage = isW

    if (isBM) { tab.title = 'Закладки'; tab.favicon = null }
    else if (isH) { tab.title = 'История'; tab.favicon = null }
    else if (isS) { tab.title = 'Настройки'; tab.favicon = null }
    else if (isD) { tab.title = 'Загрузки'; tab.favicon = null }
    else if (isC) { tab.title = 'Cookie'; tab.favicon = null }
    else if (isR) { tab.title = 'Режим чтения'; tab.favicon = null }
    else if (isP) { tab.title = 'PDF'; tab.favicon = null }
    else if (isE) { tab.title = 'Не удалось открыть страницу'; tab.favicon = null }
    else if (isW) { tab.title = 'Соединение не защищено'; tab.favicon = null }
    else {
      const t = wc.getTitle()
      if (t) tab.title = t
      tab.favicon = null
      if (!tab.isPrivate) {
        addToHistory(navUrl, t)
      }
    }

    if (tab.id === activeTabId) {
      sendActiveTabUrl()
      broadcastSecurityState()
    }
    sendTabsUpdate()
  })

  wc.on('did-navigate-in-page', (_e, navUrl) => {
    tab.url = navUrl
    if (tab.id === activeTabId) {
      hideStatusBar()
      sendActiveTabUrl()
      broadcastSecurityState()
    }
    sendTabsUpdate()
  })
}

// ============================================================
// ============ LRU: ВЫГРУЗКА ВКЛАДОК =========================
// ============================================================
function unloadTab(tab) {
  if (!tab) return
  if (tab.isUnloaded) return
  if (tab.id === activeTabId) return
  if (tab.isLoading) return
  if (!tab.view) return

  try { tab.savedUrl = tab.view.webContents.getURL() || tab.url || '' } catch { tab.savedUrl = tab.url || '' }
  try { tab.savedTitle = tab.view.webContents.getTitle() || tab.title || '' } catch { tab.savedTitle = tab.title || '' }
  tab.savedFavicon = tab.favicon || null
  tab.isUnloaded = true
  tab.isLoading = false
  tab.title = tab.savedTitle || tab.savedUrl
  tab.url = tab.savedUrl

  try { tabTrackerCounts.delete(tab.view.webContents.id) } catch (e) {}
  try { mainWindow.contentView.removeChildView(tab.view) } catch (e) {}
  try { tab.view.webContents.close() } catch (e) {}
  tab.view = null

  sendTabsUpdate()
  debugLog('Tab', `Выгружена вкладка #${tab.id} (${tab.savedUrl})`)
}

function recreateTab(tab) {
  if (!tab) return
  if (!tab.isUnloaded) return

  const viewPrefs = {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
  }
  if (tab.isPrivate) {
    const privateSession = getPrivateSession()
    attachTrackerBlocker(privateSession, {
      isEnabled: () => !!settingsCache.blockTrackers,
      isCategoryEnabled: (catId) => isTrackerCategoryEnabled(catId),
      isAdUrlBlockEnabled: () => !!settingsCache.blockAdUrls,
    }, handleTrackerBlocked)
    attachDownloadHandlerToSession(privateSession)
    viewPrefs.session = privateSession
  }

  const view = new WebContentsView({ webPreferences: viewPrefs })
  try { view.webContents.setVisualZoomLevelLimits(1, 3) } catch (e) {}

  tab.view = view
  mainWindow.contentView.addChildView(view)
  view.setBackgroundColor(tab.isPrivate ? PRIVATE_BG_COLOR : getBackgroundColor())

  try { tabTrackerCounts.set(view.webContents.id, 0) } catch (e) {}

  attachTabSecurityHandlers(tab)
  attachTabListeners(tab)

  tab.isUnloaded = false
  tab.isLoading = true

  const url = tab.savedUrl || tab.url || ''
  loadTabContent(tab, url)

  debugLog('Tab', `Восстановлена вкладка #${tab.id} (${url})`)
}

function enforceTabLimit() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  const loaded = tabs.filter(t => !t.isUnloaded && t.view)
  if (loaded.length <= MAX_LOADED_TABS) return

  const candidates = loaded.filter(t => {
    if (t.id === activeTabId) return false
    if (t.isLoading) return false
    let url = ''
    try { url = t.view.webContents.getURL() } catch {}
    if (isInternalUrl(url)) return false
    return true
  })

  if (candidates.length === 0) return

  candidates.sort((a, b) => (a.lastActiveAt || 0) - (b.lastActiveAt || 0))

  const needToUnload = loaded.length - MAX_LOADED_TABS
  for (let i = 0; i < needToUnload && i < candidates.length; i++) {
    unloadTab(candidates[i])
  }
}

// ============================================================
// ============ ВКЛАДКИ =======================================
// ============================================================
function createTab(url, options = {}) {
  const isPrivate = !!options.private
  const id = nextTabId++

  const viewPrefs = {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
  }
  if (isPrivate) {
    const privateSession = getPrivateSession()
    attachTrackerBlocker(privateSession, {
      isEnabled: () => !!settingsCache.blockTrackers,
      isCategoryEnabled: (catId) => isTrackerCategoryEnabled(catId),
      isAdUrlBlockEnabled: () => !!settingsCache.blockAdUrls,
    }, handleTrackerBlocked)
    attachDownloadHandlerToSession(privateSession)
    viewPrefs.session = privateSession
  }

  const view = new WebContentsView({ webPreferences: viewPrefs })
  try { view.webContents.setVisualZoomLevelLimits(1, 3) } catch (e) {}

  const tab = {
    id, view,
    title: isPrivate ? 'Приватная вкладка' : 'Новая вкладка',
    url: '', favicon: null, isLoading: false,
    isBookmarksManager: false,
    isHistoryManager: false,
    isSettingsPage: false,
    isDownloadsManager: false,
    isCookiesManager: false,
    isErrorPage: false,
    isWarningPage: false,
    errorUrl: '',
    warningUrl: '',
    isUnloaded: false,
    savedUrl: '',
    savedTitle: '',
    savedFavicon: null,
    lastActiveAt: Date.now(),
    isPrivate,
    isReaderMode: false,
    readerData: null,
    readerOriginalUrl: '',
    readerOriginalTitle: '',
  }

  if (url === INTERNAL_BOOKMARKS) { tab.isBookmarksManager = true; tab.title = 'Закладки' }
  if (url === INTERNAL_HISTORY) { tab.isHistoryManager = true; tab.title = 'История' }
  if (url === INTERNAL_SETTINGS || (url && url.startsWith(INTERNAL_SETTINGS + '?'))) { tab.isSettingsPage = true; tab.title = 'Настройки' }
  if (url === INTERNAL_DOWNLOADS) { tab.isDownloadsManager = true; tab.title = 'Загрузки' }
  if (url === INTERNAL_COOKIES) { tab.isCookiesManager = true; tab.title = 'Cookie' }
  if (url === INTERNAL_PDF) { tab.title = 'PDF' }

  try { tabTrackerCounts.set(view.webContents.id, 0) } catch (e) {}

  tabs.push(tab)
  mainWindow.contentView.addChildView(view)
  view.setBackgroundColor(isPrivate ? PRIVATE_BG_COLOR : getBackgroundColor())
  attachTabSecurityHandlers(tab)
  attachTabListeners(tab)

  loadTabContent(tab, url)

  activeTabId = id
  tab.lastActiveAt = Date.now()
  layoutViews()
  sendTabsUpdate()
  sendActiveTabUrl()
  sendLoadingState()
  broadcastSecurityState()
  enforceTabLimit()

  return tab
}

function loadTabContent(tab, url) {
  if (!tab.view) return
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
  if (url === INTERNAL_SETTINGS || (url && url.startsWith(INTERNAL_SETTINGS + '?'))) {
    const u = getSettingsPageUrl()
    const section = parseInternalSection(url)
    if (u) {
      wc.loadURL(section ? `${u}?section=${encodeURIComponent(section)}` : u)
    } else {
      const opts = section ? { query: { section } } : undefined
      wc.loadFile(getSettingsPagePath(), opts)
    }
    return
  }
  if (url === INTERNAL_DOWNLOADS) {
    const u = getDownloadsPageUrl()
    if (u) wc.loadURL(u); else wc.loadFile(getDownloadsPagePath())
    return
  }
  if (url === INTERNAL_COOKIES) {
    const u = getCookiesPageUrl()
    if (u) wc.loadURL(u); else wc.loadFile(getCookiesPagePath())
    return
  }
  if (url === INTERNAL_READER) {
    const u = getReaderPageUrl()
    if (u) wc.loadURL(u); else wc.loadFile(getReaderPagePath())
    return
  }
  if (url === INTERNAL_PDF || (url && url.startsWith(INTERNAL_PDF + '?'))) {
    const u = getPdfPageUrl()
    if (u) wc.loadURL(u); else wc.loadFile(getPdfPagePath())
    return
  }
  if (url === INTERNAL_EXTENSIONS) {
    const u = getExtensionsPageUrl()
    if (u) wc.loadURL(u); else wc.loadFile(getExtensionsPagePath())
    return
  }
  if (url && url !== 'about:blank') {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:') {
        if (settingsCache.httpsOnly || !allowedInsecureHosts.has(parsed.hostname)) {
          loadWarningPage(tab, url)
          return
        }
      }
    } catch {}
    wc.loadURL(url)
    return
  }
  const sp = getStartpageUrl()
  if (sp) wc.loadURL(sp); else wc.loadFile(getStartpagePath())
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id)
  if (idx === -1) return
  const tab = tabs[idx]

  pdfDataStore.delete(id)

  try {
    if (tab.view && !tab.view.webContents.isDestroyed()) {
      tabTrackerCounts.delete(tab.view.webContents.id)
    }
  } catch (e) {}

  try {
    const url = getTabUrl(tab)
    const title = getTabTitle(tab)
    if (
      !tab.isPrivate &&
      url &&
      !isInternalUrl(url) &&
      !url.startsWith('file:') &&
      !url.startsWith('data:') &&
      !url.startsWith('about:')
    ) {
      closedTabsStack.push({
        id: closedTabIdCounter++,
        url,
        title: title || url,
        favicon: tab.isUnloaded ? (tab.savedFavicon || null) : (tab.favicon || null),
        closedAt: Date.now(),
      })
      if (closedTabsStack.length > CLOSED_TABS_MAX) closedTabsStack.shift()
      refreshMenu()
    }
  } catch (e) {}

  if (tab.view) {
    try {
      mainWindow.contentView.removeChildView(tab.view)
      tab.view.webContents.close()
    } catch (e) {}
  }

  tabs.splice(idx, 1)
  hideStatusBar()

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
    tabs[newIdx].lastActiveAt = Date.now()
  }

  layoutViews()
  sendTabsUpdate()
  sendActiveTabUrl()
  sendLoadingState()
  broadcastSecurityState()
}

function switchTab(id) {
  const tab = getTab(id)
  if (!tab) return
  if (activeTabId === id) return

  if (tab.isUnloaded) {
    recreateTab(tab)
  }

  activeTabId = id
  tab.lastActiveAt = Date.now()
  hideStatusBar()

  try {
    const c = tab.view && !tab.view.webContents.isDestroyed()
      ? (tabTrackerCounts.get(tab.view.webContents.id) || 0)
      : 0
    if (chromeView && !chromeView.webContents.isDestroyed()) {
      chromeView.webContents.send('tracker-count', c)
    }
  } catch (e) {}

  layoutViews()
  sendTabsUpdate()
  sendActiveTabUrl()
  sendLoadingState()
  broadcastSecurityState()
  scheduleSessionSave()
}

function restoreClosedTab() {
  if (closedTabsStack.length === 0) return
  const entry = closedTabsStack.pop()
  if (!entry || !entry.url) return
  createTab(entry.url)
  refreshMenu()
}

function restoreClosedById(id) {
  const idx = closedTabsStack.findIndex(t => t.id === id)
  if (idx === -1) return
  const entry = closedTabsStack.splice(idx, 1)[0]
  if (!entry || !entry.url) return
  createTab(entry.url)
  refreshMenu()
}

function getRecentlyClosed() {
  return [...closedTabsStack].reverse()
}

function refreshMenu() {
  if (!currentMenuActions) return
  try {
    setupApplicationMenu(currentMenuActions, currentMenuOptions || { appName: 'Malina Browser' })
  } catch (err) {
    debugLog('Menu', `Ошибка пересборки меню: ${err.message}`)
  }
}

function duplicateTab(id) {
  const tab = getTab(id)
  if (!tab) return
  const url = getTabUrl(tab)
  if (!url) return
  createTab(url)
}

function reorderTabs(payload) {
  const { sourceId, targetId, position } = payload || {}
  if (!sourceId || !targetId) return { ok: false }

  const sourceIdx = tabs.findIndex(t => t.id === sourceId)
  if (sourceIdx === -1) return { ok: false }
  if (sourceId === targetId) return { ok: false }

  const [moved] = tabs.splice(sourceIdx, 1)

  const targetIdx = tabs.findIndex(t => t.id === targetId)
  if (targetIdx === -1) {
    tabs.splice(sourceIdx, 0, moved)
    return { ok: false }
  }

  const insertIdx = position === 'after' ? targetIdx + 1 : targetIdx
  tabs.splice(insertIdx, 0, moved)

  sendTabsUpdate()
  debugLog('Tab', `Перестановка: #${sourceId} ${position} #${targetId}`)
  return { ok: true }
}

// ============================================================
// ============ НАВИГАЦИЯ В АКТИВНОЙ ВКЛАДКЕ =================
// ============================================================
function navigateInActiveTab(input) {
  const tab = getActiveTab()
  if (!tab) return
  if (tab.isUnloaded) recreateTab(tab)

  const url = normalizeToUrl(input)

  if (url === INTERNAL_BOOKMARKS) {
    const u = getBookmarksPageUrl()
    if (u) tab.view.webContents.loadURL(u); else tab.view.webContents.loadFile(getBookmarksPagePath())
    return
  }
  if (url === INTERNAL_HISTORY) {
    const u = getHistoryPageUrl()
    if (u) tab.view.webContents.loadURL(u); else tab.view.webContents.loadFile(getHistoryPagePath())
    return
  }
  if (url === INTERNAL_SETTINGS || (url && url.startsWith(INTERNAL_SETTINGS + '?'))) {
    const u = getSettingsPageUrl()
    const section = parseInternalSection(url)
    if (u) {
      tab.view.webContents.loadURL(section ? `${u}?section=${encodeURIComponent(section)}` : u)
    } else {
      const opts = section ? { query: { section } } : undefined
      tab.view.webContents.loadFile(getSettingsPagePath(), opts)
    }
    return
  }
  if (url === INTERNAL_DOWNLOADS) {
    const u = getDownloadsPageUrl()
    if (u) tab.view.webContents.loadURL(u); else tab.view.webContents.loadFile(getDownloadsPagePath())
    return
  }
  if (url === INTERNAL_COOKIES) {
    const u = getCookiesPageUrl()
    if (u) tab.view.webContents.loadURL(u); else tab.view.webContents.loadFile(getCookiesPagePath())
    return
  }
  if (url === INTERNAL_PDF || (url && url.startsWith(INTERNAL_PDF + '?'))) {
    const u = getPdfPageUrl()
    if (u) tab.view.webContents.loadURL(u); else tab.view.webContents.loadFile(getPdfPagePath())
    return
  }
  if (url === INTERNAL_EXTENSIONS) {
    const u = getExtensionsPageUrl()
    if (u) tab.view.webContents.loadURL(u); else tab.view.webContents.loadFile(getExtensionsPagePath())
    return
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:') {
      if (settingsCache.httpsOnly || !allowedInsecureHosts.has(parsed.hostname)) {
        loadWarningPage(tab, url)
        return
      }
    }
  } catch {}

  tab.isBookmarksManager = false
  tab.isHistoryManager = false
  tab.isSettingsPage = false
  tab.isDownloadsManager = false
  tab.isCookiesManager = false
  tab.isErrorPage = false
  tab.isWarningPage = false
  tab.favicon = null
  sendTabsUpdate()

  tab.view.webContents.loadURL(url)
}

function goHomeInActiveTab() {
  const tab = getActiveTab()
  if (!tab) return
  if (tab.isUnloaded) recreateTab(tab)
  tab.isBookmarksManager = false
  tab.isHistoryManager = false
  tab.isSettingsPage = false
  tab.isDownloadsManager = false
  tab.isCookiesManager = false
  tab.isErrorPage = false
  tab.isWarningPage = false
  tab.favicon = null

  const home = settingsCache.homepage || 'startpage'

  if (home === 'about:blank') {
    tab.view.webContents.loadURL('about:blank')
  } else if (home === 'startpage') {
    const sp = getStartpageUrl()
    if (sp) tab.view.webContents.loadURL(sp); else tab.view.webContents.loadFile(getStartpagePath())
  } else {
    try {
      const parsed = new URL(home)
      if (parsed.protocol === 'http:') {
        if (settingsCache.httpsOnly || !allowedInsecureHosts.has(parsed.hostname)) {
          loadWarningPage(tab, home)
          sendTabsUpdate()
          return
        }
      }
    } catch {}
    tab.view.webContents.loadURL(home)
  }

  sendTabsUpdate()
}

function openBookmarksManager() { createTab(INTERNAL_BOOKMARKS) }
function openHistoryManager() { createTab(INTERNAL_HISTORY) }
function openSettingsPage(section) {
  if (section && typeof section === 'string') {
    createTab(INTERNAL_SETTINGS + '?section=' + encodeURIComponent(section))
    return
  }
  createTab(INTERNAL_SETTINGS)
}
function openDownloadsPage() { createTab(INTERNAL_DOWNLOADS) }
function openCookiesPage() { createTab(INTERNAL_COOKIES) }

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
    popupWindow.webContents.send('custom-theme-changed', settingsCache.customTheme || null)
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
    popupWindow.webContents.send('custom-theme-changed', settingsCache.customTheme || null)
  })

  popupWindow.on('blur', () => closeBookmarkPopup())
  popupWindow.on('closed', () => { popupWindow = null })
}

// ============================================================
// ============ ОКНО ==========================================
// ============================================================
function createWindow() {
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'

  // ============ Расширения ============
  // Загружаем ранее установленные расширения в фоне,
  // чтобы не блокировать создание окна и регистрацию IPC
  const extensionsDir = path.join(app.getPath('userData'), 'Extensions')
  loadInstalledExtensions(extensionsDir).catch((err) => {
    debugLog('Extensions', `Ошибка автозагрузки: ${err.message}`)
  })

  const themeColor = getBackgroundColor()
  const symbolColor = getResolvedTheme() === 'light' ? '#1a1a1a' : '#f0f0f0'

  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 700, minHeight: 500,
    backgroundColor: themeColor,
    ...(isMac ? {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 16, y: 14 },
    } : {}),
    ...(isWin ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: themeColor,
        symbolColor,
        height: 44,
      },
    } : {}),
    ...(!isMac && !isWin ? {
      titleBarStyle: 'default',
    } : {}),
    ...(!isMac ? {
      autoHideMenuBar: true,
    } : {}),
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
    chromeView.webContents.send('custom-theme-changed', settingsCache.customTheme || null)
    const activeCount = downloadsCache.filter(d => d.state === 'progressing' || d.state === 'paused').length
    chromeView.webContents.send('download-active-count', activeCount)
    broadcastSecurityState()
    broadcastToolbarSettings()

    try {
      const active = getActiveTab()
      const c = active && !active.isUnloaded && active.view && !active.view.webContents.isDestroyed()
        ? (tabTrackerCounts.get(active.view.webContents.id) || 0)
        : 0
      chromeView.webContents.send('tracker-count', c)
    } catch (e) {}
  })

  attachShortcuts(chromeView.webContents)

  restoreSessionIntoTabs()

  createStatusBar()

  currentChromeHeight = getEffectiveChromeHeight()
  applyLayout(currentChromeHeight)

  mainWindow.on('resize', () => {
    layoutViews()
    hideStatusBar()
  })
  mainWindow.on('closed', () => {
    closeBookmarkPopup()
    closePermissionPopup()
    if (chromeAnimTimer) { clearTimeout(chromeAnimTimer); chromeAnimTimer = null }
    mainWindow = null; chromeView = null; statusBarView = null; tabs = []; activeTabId = null
    pdfDataStore.clear()
    tabTrackerCounts.clear()
  })

  applyBackgroundColors()
}

// ============================================================
// ============ ГОРЯЧИЕ КЛАВИШИ ===============================
// ============================================================
function executeShortcut(command) {
  // Обработка switch-tab-N (Cmd+1..9)
  if (command.startsWith('switch-tab-')) {
    const n = parseInt(command.slice('switch-tab-'.length), 10)
    if (n >= 1 && n <= 9 && tabs[n - 1]) {
      switchTab(tabs[n - 1].id)
    }
    return
  }

  switch (command) {
    case 'new-tab':
      createTab()
      break

    case 'next-tab': {
      const idx = tabs.findIndex(t => t.id === activeTabId)
      if (idx >= 0 && tabs.length > 1) {
        switchTab(tabs[(idx + 1) % tabs.length].id)
      }
      break
    }

    case 'prev-tab': {
      const idx = tabs.findIndex(t => t.id === activeTabId)
      if (idx >= 0 && tabs.length > 1) {
        switchTab(tabs[(idx - 1 + tabs.length) % tabs.length].id)
      }
      break
    }

    case 'new-private-tab':
      createTab(undefined, { private: true })
      break

    case 'toggle-reader':
      toggleReaderMode()
      break

    case 'restore-tab':
      restoreClosedTab()
      break

    case 'close-tab':
      if (chromeView && !chromeView.webContents.isDestroyed()) {
        chromeView.webContents.send('shortcut-close-tab')
      }
      break

    case 'focus-address':
      if (chromeView && !chromeView.webContents.isDestroyed()) {
        chromeView.webContents.focus()
        chromeView.webContents.send('shortcut-focus-address')
      }
      break

    case 'bookmark-page':
      if (chromeView && !chromeView.webContents.isDestroyed()) {
        chromeView.webContents.send('shortcut-bookmark')
      }
      break

    case 'find-in-page':
      if (chromeView && !chromeView.webContents.isDestroyed()) {
        chromeView.webContents.send('open-find-bar')
      }
      break

    case 'open-downloads':
      openDownloadsPage()
      break

    case 'open-history':
      openHistoryManager()
      break

    case 'open-settings':
      openSettingsPage()
      break

    case 'open-bookmarks-manager':
      openBookmarksManager()
      break

    case 'reload': {
      const tab = getActiveTab()
      if (tab && tab.isUnloaded) recreateTab(tab)
      if (tab && tab.view) tab.view.webContents.reload()
      break
    }

    case 'force-reload': {
      const tab = getActiveTab()
      if (tab && tab.isUnloaded) recreateTab(tab)
      if (tab && tab.view) tab.view.webContents.reloadIgnoringCache()
      break
    }

    case 'go-back': {
      const tab = getActiveTab()
      if (tab && tab.isUnloaded) recreateTab(tab)
      const wc = getActiveTab()?.view?.webContents
      if (wc?.canGoBack()) wc.goBack()
      break
    }

    case 'go-forward': {
      const tab = getActiveTab()
      if (tab && tab.isUnloaded) recreateTab(tab)
      const wc = getActiveTab()?.view?.webContents
      if (wc?.canGoForward()) wc.goForward()
      break
    }

    case 'go-home':
      goHomeInActiveTab()
      break

    case 'zoom-in': {
      const tab = getActiveTab()
      if (tab && tab.isUnloaded) recreateTab(tab)
      if (tab && tab.view) {
        const wc = tab.view.webContents
        wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5))
      }
      break
    }

    case 'zoom-out': {
      const tab = getActiveTab()
      if (tab && tab.isUnloaded) recreateTab(tab)
      if (tab && tab.view) {
        const wc = tab.view.webContents
        wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5))
      }
      break
    }

    case 'zoom-reset': {
      const tab = getActiveTab()
      if (tab && tab.isUnloaded) recreateTab(tab)
      if (tab && tab.view) tab.view.webContents.setZoomLevel(0)
      break
    }

    case 'toggle-fullscreen':
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen())
      }
      break
  }
}

function attachShortcuts(wc) {
  if (!wc || wc.isDestroyed()) return
  wc.on('before-input-event', (event, input) => {
    const command = matchShortcut(input)
    if (!command) return
    event.preventDefault()
    executeShortcut(command)
  })
}

// ============================================================
// ============ ПОДСКАЗКИ SEARCH ==============================
// ============================================================
const suggestionsCache = new Map()
let warmUpPromise = null

function warmUpSuggestions() {
  if (warmUpPromise) return warmUpPromise
  const url = 'https://duckduckgo.com/ac/?q=a&type=list&kl=ru-ru'
  warmUpPromise = net.fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    },
  }).catch(() => {})
  return warmUpPromise
}

async function fetchSuggestions(query) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const cached = suggestionsCache.get(q)
  if (cached && (Date.now() - cached.ts) < SUGGESTIONS_CACHE_TTL) return cached.items

  const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list&kl=ru-ru`
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), SUGGESTIONS_TIMEOUT)
    const res = await net.fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
    })
    clearTimeout(timeout)
    if (!res.ok) return []
    const data = await res.json()
    const items = extractSuggestions(data)
    suggestionsCache.set(q, { items, ts: Date.now() })
    if (suggestionsCache.size > 200) {
      const firstKey = suggestionsCache.keys().next().value
      suggestionsCache.delete(firstKey)
    }
    return items
  } catch (err) {
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
// ============ COOKIES (IPC) =================================
// ============================================================
function getSessionForCookies() {
  if (!mainWindow || mainWindow.isDestroyed()) return null
  return mainWindow.webContents.session
}

function buildCookieUrl(cookie) {
  const protocol = cookie.secure ? 'https' : 'http'
  const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain
  const p = cookie.path && cookie.path.startsWith('/') ? cookie.path : '/'
  return `${protocol}://${cleanDomain}${p}`
}

// ============================================================
// ============ IPC ===========================================
// ============================================================
app.whenReady().then(() => {
  debugStartupBanner()

  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    try {
      app.dock.setIcon(path.join(__dirname, '../../build/icon.png'))
    } catch (e) {
      debugLog('App', `Не удалось установить иконку: ${e.message}`)
    }
  }

  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    try {
      const parsed = new URL(url)
      if (allowedBadCertHosts.has(parsed.hostname)) {
        event.preventDefault()
        callback(true)
        debugLog('Security', `Разрешён недействительный сертификат для ${parsed.hostname}`)
        return
      }
    } catch {}
    callback(false)
  })

  clearPrivateData()

  const menuActions = {
    newTab: () => createTab(),
    newPrivateTab: () => createTab(undefined, { private: true }),
    closeAllPrivate: () => {
      const privateTabs = tabs.filter(t => t.isPrivate)
      for (const t of privateTabs) {
        closeTab(t.id)
      }
      if (tabs.length === 0) createTab()
      clearPrivateData()
    },
    closeTab: () => {
      const t = getActiveTab()
      if (t) closeTab(t.id)
    },
    restoreTab: () => restoreClosedTab(),
    duplicateTab: () => {
      const t = getActiveTab()
      if (t) duplicateTab(t.id)
    },
    savePageAs: async () => {
      const tab = getActiveTab()
      if (!tab || tab.isUnloaded || !tab.view) return
      const wc = tab.view.webContents
      const { dialog } = await import('electron')
      const path = await import('path')
      let title = 'page'
      try { title = wc.getTitle() || 'page' } catch {}
      const safe = String(title).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100) || 'page'
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Сохранить страницу',
        defaultPath: path.join(app.getPath('downloads'), safe + '.html'),
        filters: [
          { name: 'Веб-страница', extensions: ['html', 'htm'] },
          { name: 'Все файлы', extensions: ['*'] },
        ],
      })
      if (result.canceled || !result.filePath) return
      try { await wc.savePage(result.filePath, 'HTMLComplete') } catch (err) {
        dialog.showErrorBox('Ошибка', 'Не удалось сохранить: ' + err.message)
      }
    },
    print: () => {
      const tab = getActiveTab()
      if (tab && !tab.isUnloaded && tab.view) {
        try { tab.view.webContents.print() } catch (e) {}
      }
    },
    importBookmarks: async () => {
      openBookmarksManager()
    },
    exportBookmarks: async () => {
      openBookmarksManager()
    },
    toggleReader: () => toggleReaderMode(),

    findInPage: () => {
      if (chromeView && !chromeView.webContents.isDestroyed()) {
        chromeView.webContents.focus()
        chromeView.webContents.send('open-find-bar')
      }
    },
    focusAddress: () => {
      if (chromeView && !chromeView.webContents.isDestroyed()) {
        chromeView.webContents.focus()
        chromeView.webContents.send('shortcut-focus-address')
      }
    },
    bookmarkCurrent: () => {
      if (chromeView && !chromeView.webContents.isDestroyed()) {
        chromeView.webContents.send('shortcut-bookmark')
      }
    },

    reload: () => {
      const t = getActiveTab()
      if (t && t.isUnloaded) recreateTab(t)
      if (t && t.view) t.view.webContents.reload()
    },
    forceReload: () => {
      const t = getActiveTab()
      if (t && t.isUnloaded) recreateTab(t)
      if (t && t.view) t.view.webContents.reloadIgnoringCache()
    },
    goBack: () => {
      const t = getActiveTab()
      if (t && t.isUnloaded) recreateTab(t)
      const wc = getActiveTab()?.view?.webContents
      if (wc?.canGoBack()) wc.goBack()
    },
    goForward: () => {
      const t = getActiveTab()
      if (t && t.isUnloaded) recreateTab(t)
      const wc = getActiveTab()?.view?.webContents
      if (wc?.canGoForward()) wc.goForward()
    },
    goHome: () => goHomeInActiveTab(),
    zoomIn: () => {
      const t = getActiveTab()
      if (t && t.isUnloaded) recreateTab(t)
      if (t && t.view) {
        const wc = t.view.webContents
        wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5))
      }
    },
    zoomOut: () => {
      const t = getActiveTab()
      if (t && t.isUnloaded) recreateTab(t)
      if (t && t.view) {
        const wc = t.view.webContents
        wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5))
      }
    },
    zoomReset: () => {
      const t = getActiveTab()
      if (t && t.isUnloaded) recreateTab(t)
      if (t && t.view) t.view.webContents.setZoomLevel(0)
    },
    toggleFullscreen: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFullScreen(!mainWindow.isFullScreen())
      }
    },
    toggleDevTools: () => {
      const t = getActiveTab()
      if (t && t.isUnloaded) recreateTab(t)
      if (t && t.view) t.view.webContents.toggleDevTools()
    },
    toggleChromeDevTools: () => {
      if (chromeView && !chromeView.webContents.isDestroyed()) {
        chromeView.webContents.toggleDevTools()
      }
    },

    openHistory: () => openHistoryManager(),
    openDownloads: () => openDownloadsPage(),
    openBookmarks: () => openBookmarksManager(),
    openSettings: (section) => openSettingsPage(section),
    openCookies: () => openCookiesPage(),

    recentlyClosedItems: () => {
      const list = getRecentlyClosed()
      if (list.length === 0) {
        return [{ label: 'Пусто', enabled: false }]
      }
      const items = list.map((t) => ({
        label: (t.title || t.url).slice(0, 80),
        toolTip: t.url,
        click: () => restoreClosedById(t.id),
      }))
      items.push({ type: 'separator' })
      items.push({
        label: 'Очистить список',
        click: () => {
          closedTabsStack.length = 0
          refreshMenu()
        },
      })
      return items
    },
  }

  currentMenuActions = menuActions
  currentMenuOptions = { appName: 'Malina Browser' }
  setupApplicationMenu(menuActions, currentMenuOptions)

  loadSettings()
  loadBookmarks()
  loadHistory()
  loadDownloads()

  if (settingsCache.restoreSession) {
    pendingSessionToRestore = loadSession()
    if (pendingSessionToRestore) {
      debugLog('Session', `Найдена сессия: ${pendingSessionToRestore.tabs.length} вкл.`)
    }
  }

  createWindow()

  warmUpSuggestions()

  nativeTheme.on('updated', () => {
    if (settingsCache.theme === 'system') broadcastTheme()
  })

  ipcMain.handle('get-tabs', () => serializeTabs())
  ipcMain.handle('tab-create', (_e, url) => {
    const tab = createTab(url)
    return tab ? { id: tab.id } : null
  })
  ipcMain.handle('tab-create-private', () => {
    const tab = createTab(undefined, { private: true })
    return tab ? { id: tab.id } : null
  })
  ipcMain.handle('close-all-private-tabs', () => {
    const privateTabs = tabs.filter(t => t.isPrivate)
    for (const t of privateTabs) {
      closeTab(t.id)
    }
    if (tabs.length === 0) {
      createTab()
    }
    clearPrivateData()
    return { closed: privateTabs.length }
  })
  ipcMain.handle('tab-close', (_e, id) => closeTab(id))
  ipcMain.handle('tab-switch', (_e, id) => switchTab(id))
  ipcMain.handle('tab-restore-closed', () => restoreClosedTab())
  ipcMain.handle('tab-duplicate', (_e, id) => duplicateTab(id))
  ipcMain.handle('tabs-reorder', (_e, payload) => reorderTabs(payload))
  ipcMain.handle('navigate', (_e, input) => navigateInActiveTab(input))

  ipcMain.handle('reader-toggle', () => toggleReaderMode())
  ipcMain.handle('reader-exit', () => {
    const tab = getActiveTab()
    if (tab) exitReaderMode(tab)
    return { ok: true }
  })
  ipcMain.handle('reader-get-content', (event) => {
    const tab = tabs.find(t => t.view && !t.view.webContents.isDestroyed() && t.view.webContents === event.sender)
    if (!tab || !tab.readerData) return null
    return tab.readerData
  })

  ipcMain.handle('open-pdf-viewer', (_e, filePath) => {
    const tab = openPdfViewer(filePath)
    return tab ? { id: tab.id } : null
  })

  ipcMain.handle('get-pdf-meta', (event) => {
    const tab = tabs.find(t =>
      t.view && !t.view.webContents.isDestroyed() && t.view.webContents === event.sender
    )
    if (!tab) return null
    const entry = pdfDataStore.get(tab.id)
    if (!entry) return null
    return { path: entry.path, name: path.basename(entry.path) }
  })

  ipcMain.handle('get-pdf-data', async (event) => {
    const tab = tabs.find(t =>
      t.view && !t.view.webContents.isDestroyed() && t.view.webContents === event.sender
    )
    if (!tab) return null
    const entry = pdfDataStore.get(tab.id)
    if (!entry || !entry.path) return null

    if (entry.data) return entry.data

    try {
      const buf = await fs.promises.readFile(entry.path)
      const data = new Uint8Array(buf)
      entry.data = data
      return data
    } catch (err) {
      debugLog('PDF', `Ошибка чтения ${entry.path}: ${err.message}`)
      return null
    }
  })

  ipcMain.handle('go-back', () => {
    const tab = getActiveTab()
    if (tab && tab.isUnloaded) recreateTab(tab)
    const wc = getActiveTab()?.view?.webContents
    if (wc?.canGoBack()) wc.goBack()
  })
  ipcMain.handle('go-forward', () => {
    const tab = getActiveTab()
    if (tab && tab.isUnloaded) recreateTab(tab)
    const wc = getActiveTab()?.view?.webContents
    if (wc?.canGoForward()) wc.goForward()
  })
  ipcMain.handle('reload', () => {
    const tab = getActiveTab()
    if (tab && tab.isUnloaded) recreateTab(tab)
    if (tab && tab.view) tab.view.webContents.reload()
  })
  ipcMain.handle('go-home', () => goHomeInActiveTab())

  ipcMain.handle('get-current-tab-url', () => {
    const active = getActiveTab()
    if (!active) return ''
    const url = getTabUrl(active)
    return isInternalUrl(url) ? '' : url
  })

  ipcMain.handle('get-tracker-count', () => {
    const active = getActiveTab()
    if (!active || active.isUnloaded) return 0
    if (!active.view || active.view.webContents.isDestroyed()) return 0
    return tabTrackerCounts.get(active.view.webContents.id) || 0
  })

  ipcMain.handle('get-security-state', () => {
    const active = getActiveTab()
    const url = getTabUrl(active)
    return getSecurityState(url)
  })

  ipcMain.handle('show-tab-menu', (_e, tabId) => {
    const tab = getTab(tabId)
    if (!tab) return
    const idx = tabs.findIndex(t => t.id === tabId)
    const othersCount = tabs.length - 1
    const rightCount = tabs.length - idx - 1

    const menu = Menu.buildFromTemplate([
      {
        label: 'Дублировать вкладку',
        click: () => duplicateTab(tabId),
      },
      { type: 'separator' },
      {
        label: 'Закрыть вкладку',
        click: () => {
          if (chromeView && !chromeView.webContents.isDestroyed()) {
            chromeView.webContents.send('tab-close-request', tabId)
          }
        },
      },
      {
        label: othersCount > 0 ? `Закрыть другие вкладки (${othersCount})` : 'Закрыть другие вкладки',
        enabled: othersCount > 0,
        click: () => {
          if (activeTabId !== tabId) switchTab(tabId)
          const idsToClose = tabs.filter(t => t.id !== tabId).map(t => t.id)
          for (const id of idsToClose) closeTab(id)
        },
      },
      {
        label: rightCount > 0 ? `Закрыть вкладки справа (${rightCount})` : 'Закрыть вкладки справа',
        enabled: rightCount > 0,
        click: () => {
          const idsToClose = tabs.slice(idx + 1).map(t => t.id)
          for (const id of idsToClose) closeTab(id)
        },
      },
    ])
    menu.popup({ window: mainWindow })
  })
  ipcMain.handle('warning-go-back', () => {
    const wc = getActiveTab()?.view?.webContents
    if (wc?.canGoBack()) wc.goBack()
    else goHomeInActiveTab()
  })

  ipcMain.handle('warning-proceed', (_e, targetUrl) => {
    if (settingsCache.httpsOnly) {
      debugLog('Security', 'HTTPS-only: переход на HTTP отклонён')
      return
    }
    try {
      const parsed = new URL(targetUrl)
      if (parsed.protocol === 'http:') {
        allowedInsecureHosts.add(parsed.hostname)
      }
    } catch {}
    const tab = getActiveTab()
    if (tab) {
      tab.isWarningPage = false
      tab.view.webContents.loadURL(targetUrl)
    }
  })

  ipcMain.handle('error-retry', () => {
    const tab = getActiveTab()
    if (!tab || !tab.isErrorPage) return
    if (tab.errorUrl) {
      tab.isErrorPage = false
      tab.view.webContents.loadURL(tab.errorUrl)
    } else {
      tab.view.webContents.reload()
    }
  })
  ipcMain.handle('error-go-back', () => {
    const wc = getActiveTab()?.view?.webContents
    if (wc?.canGoBack()) wc.goBack()
    else goHomeInActiveTab()
  })
  ipcMain.handle('error-go-home', () => goHomeInActiveTab())

  ipcMain.handle('error-proceed-anyway', (_e, targetUrl) => {
    if (!targetUrl) return
    try {
      const parsed = new URL(targetUrl)
      allowedBadCertHosts.add(parsed.hostname)
      debugLog('Security', `Пользователь разрешил небезопасный сертификат: ${parsed.hostname}`)
    } catch {}
    const tab = getActiveTab()
    if (tab) {
      tab.isErrorPage = false
      tab.view.webContents.loadURL(targetUrl)
    }
  })

  ipcMain.handle('find-in-page', (_e, text, options = {}) => {
    const tab = getActiveTab()
    if (!tab || !tab.view) return
    if (!text) {
      tab.view.webContents.stopFindInPage('clearSelection')
      return
    }
    tab.view.webContents.findInPage(text, {
      forward: options.forward !== false,
      findNext: !!options.findNext,
      matchCase: false,
    })
  })

  ipcMain.handle('stop-find-in-page', () => {
    const tab = getActiveTab()
    if (!tab || !tab.view) return
    tab.view.webContents.stopFindInPage('clearSelection')
  })

  ipcMain.on('scroll-state', (_e, isScrolled) => {
    if (!chromeView) return
    chromeView.webContents.send('scroll-state', !!isScrolled)
  })

  ipcMain.on('omnibox-open', (_e, payload) => {
    setOmniboxOpen(payload?.open, payload?.height)
  })

  ipcMain.on('drop-files', (_e, paths) => {
    handleDropFiles(paths)
  })

  ipcMain.handle('permission-respond', (_e, allowed) => {
    if (pendingPermission) {
      const { resolve, popupWindow: w } = pendingPermission
      pendingPermission = null
      resolve(!!allowed)
      if (w && !w.isDestroyed()) { try { w.close() } catch (e) {} }
    }
  })

  ipcMain.handle('get-settings', () => ({
    ...settingsCache,
    resolvedTheme: getResolvedTheme(),
    resolvedDownloadPath: getDefaultDownloadPath(),
  }))
  ipcMain.handle('get-toolbar-settings', () => ({
    all: [...ALL_TOOLBAR_BUTTONS],
    visible: [...settingsCache.toolbarButtons],
  }))
  ipcMain.handle('set-toolbar-settings', (_e, visible) => {
    settingsCache.toolbarButtons = normalizeToolbarButtons(visible)
    saveSettings()
    broadcastToolbarSettings()
    return {
      all: [...ALL_TOOLBAR_BUTTONS],
      visible: [...settingsCache.toolbarButtons],
    }
  })
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
    name: 'Malina Browser',
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
  }))
  ipcMain.handle('get-platform', () => process.platform)

  ipcMain.handle('get-session-setting', () => ({
    restoreSession: !!settingsCache.restoreSession,
  }))
  ipcMain.handle('set-session-setting', (_e, value) => {
    settingsCache.restoreSession = !!value
    saveSettings()
    if (!settingsCache.restoreSession) {
      clearSession()
    }
    return { restoreSession: !!settingsCache.restoreSession }
  })
  ipcMain.handle('clear-session', () => {
    clearSession()
    return { ok: true }
  })

  ipcMain.handle('get-tracker-setting', () => ({
    enabled: !!settingsCache.blockTrackers,
    stats: getTrackerStats(),
    categories: getTrackerCategories(isTrackerCategoryEnabled),
  }))

  ipcMain.handle('get-tracker-categories', () => (
    getTrackerCategories(isTrackerCategoryEnabled)
  ))

  ipcMain.handle('set-tracker-category', (_e, payload) => {
    const { id, enabled } = payload || {}
    if (!id || !TRACKER_CATEGORY_IDS.includes(id)) {
      return { ok: false, error: 'Неизвестная категория' }
    }
    settingsCache.trackerCategories = {
      ...settingsCache.trackerCategories,
      [id]: !!enabled,
    }
    saveSettings()
    debugLog('Tracker', `Категория ${id}: ${enabled ? 'вкл' : 'выкл'}`)
    return {
      ok: true,
      categories: getTrackerCategories(isTrackerCategoryEnabled),
    }
  })
  ipcMain.handle('set-tracker-setting', (_e, value) => {
    settingsCache.blockTrackers = !!value
    saveSettings()
    if (!settingsCache.blockTrackers) {
      resetTrackerStats()
    }
    return {
      enabled: !!settingsCache.blockTrackers,
      stats: getTrackerStats(),
      categories: getTrackerCategories(isTrackerCategoryEnabled),
    }
  })
  ipcMain.handle('get-tracker-stats', () => getTrackerStats())
  ipcMain.handle('reset-tracker-stats', () => {
    resetTrackerStats()
    return getTrackerStats()
  })

  // ============ Блокировка рекламы по URL-паттернам ============
  ipcMain.handle('get-ad-url-block', () => !!settingsCache.blockAdUrls)
  ipcMain.handle('set-ad-url-block', (_e, value) => {
    settingsCache.blockAdUrls = !!value
    saveSettings()
    debugLog('Tracker', `URL-блокировка рекламы: ${settingsCache.blockAdUrls ? 'вкл' : 'выкл'}`)
    return !!settingsCache.blockAdUrls
  })

  // ============ HTTPS-only ============
  ipcMain.handle('get-https-only', () => !!settingsCache.httpsOnly)
  ipcMain.handle('set-https-only', (_e, value) => {
    settingsCache.httpsOnly = !!value
    saveSettings()
    return !!settingsCache.httpsOnly
  })

  // ============ Homepage ============
  ipcMain.handle('get-homepage', () => settingsCache.homepage || 'startpage')
  ipcMain.handle('set-homepage', (_e, value) => {
    settingsCache.homepage = normalizeHomepage(value)
    saveSettings()
    return settingsCache.homepage
  })

  // ============ Кастомная тема ============
  ipcMain.handle('get-custom-theme', () => settingsCache.customTheme || null)

  ipcMain.handle('import-theme', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Загрузить тему',
      filters: [{ name: 'JSON тема', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) {
      return { ok: false, canceled: true }
    }

    const filePath = result.filePaths[0]

    let raw
    try {
      raw = fs.readFileSync(filePath, 'utf-8')
    } catch (err) {
      return { ok: false, error: 'Не удалось прочитать файл: ' + err.message }
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return { ok: false, error: 'Некорректный JSON: ' + err.message }
    }

    const clean = normalizeCustomTheme(parsed)
    if (!clean) {
      return { ok: false, error: 'В файле нет подходящих переменных темы' }
    }

    settingsCache.customTheme = clean
    saveSettings()
    broadcastCustomTheme()
    debugLog('Theme', `Загружена тема "${clean.name}" (${Object.keys(clean.vars).length} переменных)`)

    return { ok: true, theme: clean }
  })

  ipcMain.handle('clear-custom-theme', () => {
    settingsCache.customTheme = null
    saveSettings()
    broadcastCustomTheme()
    return { ok: true }
  })

  ipcMain.handle('export-theme-example', async () => {
    const example = {
      name: 'Пример тёмно-синей темы',
      vars: {
        '--bg': '#0a1220',
        '--bg-elevated': '#152238',
        '--bg-hover': '#1a2a45',
        '--bg-active': '#213252',
        '--bg-tab-active': '#152238',
        '--text': '#e0e8f5',
        '--text-muted': '#8899b3',
        '--accent': '#3b82f6',
        '--accent-hover': '#2563eb',
        '--border': '#1e2f4a',
      },
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Сохранить пример темы',
      defaultPath: path.join(app.getPath('downloads'), 'theme-example.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true }
    }
    try {
      fs.writeFileSync(result.filePath, JSON.stringify(example, null, 2), 'utf-8')
      return { ok: true, path: result.filePath }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ============ Импорт/экспорт закладок ============
  ipcMain.handle('export-bookmarks', async () => {
    const total = bookmarksCache.length
    if (total === 0) {
      return { ok: false, error: 'Нет закладок для экспорта' }
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Экспорт закладок',
      defaultPath: path.join(app.getPath('downloads'), 'bookmarks.html'),
      filters: [
        { name: 'HTML', extensions: ['html', 'htm'] },
      ],
      properties: ['createDirectory'],
    })

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true }
    }

    try {
      const html = generateBookmarksHTML(bookmarksCache, foldersCache)
      fs.writeFileSync(result.filePath, html, 'utf-8')
      debugLog('Bookmarks', `Экспортировано ${total} закладок в ${result.filePath}`)
      return { ok: true, path: result.filePath, count: total }
    } catch (err) {
      debugLog('Bookmarks', `Ошибка экспорта: ${err.message}`)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('import-bookmarks', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Импорт закладок',
      filters: [
        { name: 'HTML', extensions: ['html', 'htm'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || !result.filePaths.length) {
      return { ok: false, canceled: true }
    }

    const filePath = result.filePaths[0]

    let raw
    try {
      raw = fs.readFileSync(filePath, 'utf-8')
    } catch (err) {
      return { ok: false, error: 'Не удалось прочитать файл: ' + err.message }
    }

    let parsed
    try {
      parsed = parseBookmarksHTML(raw)
    } catch (err) {
      return { ok: false, error: 'Не удалось разобрать файл: ' + err.message }
    }

    if (!parsed.bookmarks.length && !parsed.folders.length) {
      return { ok: false, error: 'В файле не найдено закладок' }
    }

    const existingUrls = new Set(bookmarksCache.map((b) => b.url))
    let skipped = 0

    const newFolders = []
    const folderIdMap = new Map()
    for (const f of parsed.folders) {
      const newId = makeBookmarkId('f')
      folderIdMap.set(f.id, newId)
      newFolders.push({
        id: newId,
        name: f.name,
        createdAt: f.createdAt || Date.now(),
      })
    }

    const newBookmarks = []
    for (const bm of parsed.bookmarks) {
      if (existingUrls.has(bm.url)) {
        skipped++
        continue
      }
      existingUrls.add(bm.url)
      newBookmarks.push({
        id: makeBookmarkId('b'),
        title: bm.title || bm.url,
        url: bm.url,
        favicon: bm.favicon || null,
        createdAt: bm.createdAt || Date.now(),
        folderId: bm.folderId ? (folderIdMap.get(bm.folderId) || null) : null,
      })
    }

    foldersCache.push(...newFolders)
    bookmarksCache.push(...newBookmarks)

    saveBookmarks()
    updateChromeHeightForBookmarks()
    broadcastLibrary()

    debugLog('Bookmarks', `Импортировано: ${newBookmarks.length} закладок, ${newFolders.length} папок, пропущено ${skipped} дубликатов`)

    return {
      ok: true,
      imported: {
        bookmarks: newBookmarks.length,
        folders: newFolders.length,
      },
      skipped,
    }
  })

  ipcMain.handle('get-downloads', () => downloadsCache.slice())
  ipcMain.handle('get-downloads-path', () => ({
    path: getDefaultDownloadPath(),
    askWhereToSave: !!settingsCache.askWhereToSave,
    isDefault: !settingsCache.downloadPath,
  }))
  ipcMain.handle('set-downloads-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите папку для загрузок',
      defaultPath: getDefaultDownloadPath(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths.length) {
      return { path: getDefaultDownloadPath(), askWhereToSave: !!settingsCache.askWhereToSave, isDefault: !settingsCache.downloadPath }
    }
    settingsCache.downloadPath = result.filePaths[0]
    saveSettings()
    return { path: getDefaultDownloadPath(), askWhereToSave: !!settingsCache.askWhereToSave, isDefault: false }
  })
  ipcMain.handle('reset-downloads-path', () => {
    settingsCache.downloadPath = ''
    saveSettings()
    return { path: getDefaultDownloadPath(), askWhereToSave: !!settingsCache.askWhereToSave, isDefault: true }
  })
  ipcMain.handle('set-ask-where-to-save', (_e, value) => {
    settingsCache.askWhereToSave = !!value
    saveSettings()
    return { path: getDefaultDownloadPath(), askWhereToSave: !!settingsCache.askWhereToSave, isDefault: !settingsCache.downloadPath }
  })
  ipcMain.handle('open-downloaded-file', async (_e, id) => {
    const entry = downloadsCache.find(d => d.id === id)
    if (!entry) return { ok: false, error: 'Запись не найдена' }
    if (!fs.existsSync(entry.savePath)) return { ok: false, error: 'Файл не найден на диске' }
    const err = await shell.openPath(entry.savePath)
    if (err) return { ok: false, error: err }
    return { ok: true }
  })
  ipcMain.handle('show-downloaded-in-folder', (_e, id) => {
    const entry = downloadsCache.find(d => d.id === id)
    if (!entry) return { ok: false, error: 'Запись не найдена' }
    if (!fs.existsSync(entry.savePath)) return { ok: false, error: 'Файл не найден на диске' }
    shell.showItemInFolder(entry.savePath)
    return { ok: true }
  })
  ipcMain.handle('remove-download-entry', (_e, id) => {
    const idx = downloadsCache.findIndex(d => d.id === id)
    if (idx < 0) return downloadsCache.slice()
    const item = activeDownloads.get(id)
    if (item) { try { item.cancel() } catch (e) {}; activeDownloads.delete(id) }
    downloadsCache.splice(idx, 1)
    saveDownloads()
    broadcastDownloads()
    broadcastDownloadActiveCount()
    return downloadsCache.slice()
  })
  ipcMain.handle('clear-downloads-list', () => {
    downloadsCache = downloadsCache.filter(d => d.state === 'progressing' || d.state === 'paused')
    saveDownloads()
    broadcastDownloads()
    broadcastDownloadActiveCount()
    return downloadsCache.slice()
  })
  ipcMain.handle('delete-downloaded-file', async (_e, id) => {
    const entry = downloadsCache.find(d => d.id === id)
    if (!entry) return { ok: false, error: 'Запись не найдена' }
    try {
      if (fs.existsSync(entry.savePath)) await shell.trashItem(entry.savePath)
    } catch (err) {
      return { ok: false, error: err.message }
    }
    const idx = downloadsCache.findIndex(d => d.id === id)
    if (idx >= 0) downloadsCache.splice(idx, 1)
    saveDownloads()
    broadcastDownloads()
    broadcastDownloadActiveCount()
    return { ok: true, downloads: downloadsCache.slice() }
  })

  ipcMain.handle('get-library', () => serializeLibrary())
  ipcMain.handle('bookmark-current-page', () => {
    const active = getActiveTab()
    if (!active) return serializeLibrary()
    const url = getTabUrl(active)
    if (!url || isInternalUrl(url)) return serializeLibrary()
    const idx = bookmarksCache.findIndex(b => b.url === url)
    if (idx >= 0) bookmarksCache.splice(idx, 1)
    else {
      const title = getTabTitle(active) || url
      bookmarksCache.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title, url, favicon: active.isUnloaded ? (active.savedFavicon || null) : (active.favicon || null),
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
  ipcMain.handle('remove-bookmarks', (_e, ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return serializeLibrary()
    const idSet = new Set(ids)
    const before = bookmarksCache.length
    bookmarksCache = bookmarksCache.filter(b => !idSet.has(b.id))
    if (bookmarksCache.length !== before) {
      saveBookmarks()
      updateChromeHeightForBookmarks()
      broadcastLibrary()
    }
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
  ipcMain.handle('move-bookmarks', (_e, payload) => {
    const { ids, folderId } = payload || {}
    if (!Array.isArray(ids) || ids.length === 0) return serializeLibrary()
    let target = folderId || null
    if (target && !foldersCache.find(f => f.id === target)) target = null
    const idSet = new Set(ids)
    let changed = false
    for (const bm of bookmarksCache) {
      if (idSet.has(bm.id) && bm.folderId !== target) {
        bm.folderId = target
        changed = true
      }
    }
    if (changed) {
      saveBookmarks()
      broadcastLibrary()
    }
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
  ipcMain.handle('open-downloads-page', () => openDownloadsPage())
  ipcMain.handle('open-cookies-page', () => openCookiesPage())
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

  // ============ Экспорт истории ============
  async function exportHistoryAs(format) {
    const ext = format === 'csv' ? 'csv' : 'json'
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Экспорт истории',
      defaultPath: path.join(app.getPath('downloads'), `history.${ext}`),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      properties: ['createDirectory'],
    })
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true }
    }

    try {
      let content = ''
      if (ext === 'json') {
        content = JSON.stringify(historyCache, null, 2)
      } else {
        const escapeCsv = (v) => {
          const s = String(v == null ? '' : v)
          if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
          return s
        }
        const rows = [['url', 'title', 'visitedAt', 'visitedAtISO']]
        for (const h of historyCache) {
          rows.push([
            h.url || '',
            h.title || '',
            String(h.visitedAt || ''),
            h.visitedAt ? new Date(h.visitedAt).toISOString() : '',
          ])
        }
        // UTF-8 BOM для Excel
        content = '\uFEFF' + rows.map(r => r.map(escapeCsv).join(',')).join('\r\n')
      }

      fs.writeFileSync(result.filePath, content, 'utf-8')
      debugLog('History', `Экспортировано ${historyCache.length} записей в ${result.filePath}`)
      return { ok: true, path: result.filePath, count: historyCache.length }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  }

  ipcMain.handle('show-history-export-menu', (event) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Экспорт в JSON', click: () => { exportHistoryAs('json').then((r) => {
        if (r.ok) {
          const wc = event.sender
          if (wc && !wc.isDestroyed()) wc.send('history-export-result', r)
        }
      })} },
      { label: 'Экспорт в CSV (Excel)', click: () => { exportHistoryAs('csv').then((r) => {
        if (r.ok) {
          const wc = event.sender
          if (wc && !wc.isDestroyed()) wc.send('history-export-result', r)
        }
      })} },
    ])
    const win = BrowserWindow.fromWebContents(event.sender)
    menu.popup({ window: win || mainWindow })
  })

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

  ipcMain.handle('get-cookies', async () => {
    const ses = getSessionForCookies()
    if (!ses) return []
    try {
      const cookies = await ses.cookies.get({})
      return cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        session: !!c.session,
        expirationDate: c.expirationDate || null,
        sameSite: c.sameSite || 'unspecified',
      }))
    } catch (err) {
      debugLog('Cookies', `Ошибка чтения: ${err.message}`)
      return []
    }
  })

  ipcMain.handle('remove-cookie', async (_e, payload) => {
    const ses = getSessionForCookies()
    if (!ses) return { ok: false, error: 'Сессия недоступна' }
    const { domain, path: cookiePath, name, secure } = payload || {}
    if (!domain || !name) return { ok: false, error: 'Не указан domain или name' }
    try {
      const url = buildCookieUrl({ domain, path: cookiePath, secure })
      await ses.cookies.remove(url, name)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('set-cookie', async (_e, payload) => {
    const ses = getSessionForCookies()
    if (!ses) return { ok: false, error: 'Сессия недоступна' }

    const { name, value, domain, path: cookiePath, secure, httpOnly, sameSite, expirationDate } = payload || {}
    if (!name || !domain) return { ok: false, error: 'Не указаны name или domain' }

    try {
      const url = buildCookieUrl({ domain, path: cookiePath, secure })
      const details = {
        url,
        name: String(name),
        value: String(value == null ? '' : value),
        domain: String(domain),
        path: cookiePath && cookiePath.startsWith('/') ? cookiePath : '/',
        secure: !!secure,
        httpOnly: !!httpOnly,
      }

      if (sameSite && ['no_restriction', 'lax', 'strict', 'unspecified'].includes(sameSite)) {
        details.sameSite = sameSite === 'unspecified' ? 'unspecified' : sameSite
      }

      if (expirationDate && Number.isFinite(Number(expirationDate))) {
        details.expirationDate = Number(expirationDate)
      }

      await ses.cookies.set(details)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('update-cookie', async (_e, payload) => {
    const ses = getSessionForCookies()
    if (!ses) return { ok: false, error: 'Сессия недоступна' }

    const { oldCookie, newValue } = payload || {}
    if (!oldCookie || !oldCookie.name || !oldCookie.domain) {
      return { ok: false, error: 'Некорректные данные cookie' }
    }

    try {
      const oldUrl = buildCookieUrl(oldCookie)

      await ses.cookies.remove(oldUrl, oldCookie.name)

      const details = {
        url: oldUrl,
        name: oldCookie.name,
        value: String(newValue == null ? '' : newValue),
        domain: oldCookie.domain,
        path: oldCookie.path && oldCookie.path.startsWith('/') ? oldCookie.path : '/',
        secure: !!oldCookie.secure,
        httpOnly: !!oldCookie.httpOnly,
      }

      if (oldCookie.sameSite && oldCookie.sameSite !== 'unspecified') {
        details.sameSite = oldCookie.sameSite
      }

      if (oldCookie.expirationDate && Number.isFinite(Number(oldCookie.expirationDate))) {
        details.expirationDate = Number(oldCookie.expirationDate)
      }

      await ses.cookies.set(details)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remove-cookies-by-domain', async (_e, domain) => {
    const ses = getSessionForCookies()
    if (!ses) return { ok: false, removed: 0 }
    if (!domain) return { ok: false, removed: 0 }
    try {
      const cookies = await ses.cookies.get({ domain })
      let removed = 0
      for (const c of cookies) {
        try {
          const url = buildCookieUrl(c)
          await ses.cookies.remove(url, c.name)
          removed++
        } catch {}
      }
      return { ok: true, removed }
    } catch (err) {
      return { ok: false, error: err.message, removed: 0 }
    }
  })

  ipcMain.handle('get-cache-size', async () => {
    const ses = getSessionForCookies()
    if (!ses) return { bytes: 0 }
    try {
      const bytes = await ses.getCacheSize()
      return { bytes: Number(bytes) || 0 }
    } catch (err) {
      debugLog('Cache', `Ошибка чтения размера кэша: ${err.message}`)
      return { bytes: 0 }
    }
  })

  ipcMain.handle('clear-cache', async () => {
    const ses = getSessionForCookies()
    if (!ses) return { ok: false, error: 'Сессия недоступна' }
    try {
      await ses.clearCache()
      debugLog('Cache', 'Кэш Chromium очищен')
      return { ok: true }
    } catch (err) {
      debugLog('Cache', `Ошибка очистки кэша: ${err.message}`)
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('clear-all-cookies', async () => {
    const ses = getSessionForCookies()
    if (!ses) return { ok: false, error: 'Сессия недоступна' }
    try {
      await ses.clearStorageData({ storages: ['cookies'] })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('clear-site-data', async () => {
    const ses = getSessionForCookies()
    if (!ses) return { ok: false, error: 'Сессия недоступна' }
    try {
      await ses.clearStorageData({
        storages: [
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'shadercache',
          'websql',
          'serviceworkers',
          'cachestorage',
        ],
      })
      await ses.clearCache()
      if (typeof ses.clearAuthCache === 'function') {
        await ses.clearAuthCache()
      }
      debugLog('Cookies', 'Очищены все данные сайтов (cookies + storage + cache)')
      return { ok: true }
    } catch (err) {
      debugLog('Cookies', `Ошибка очистки данных сайтов: ${err.message}`)
      return { ok: false, error: err.message }
    }
  })

  // ============ Поиск по закладкам и истории ============
  ipcMain.handle('search-everywhere', (_e, query) => {
    const q = String(query || '').toLowerCase().trim()
    if (q.length < 1) return []

    const results = []
    const seen = new Set()

    // Закладки — приоритет
    for (const b of bookmarksCache) {
      if (results.length >= 8) break
      if (!b.url || seen.has(b.url)) continue
      const t = (b.title || '').toLowerCase()
      const u = (b.url || '').toLowerCase()
      if (t.includes(q) || u.includes(q)) {
        seen.add(b.url)
        results.push({
          type: 'bookmark',
          title: b.title || b.url,
          url: b.url,
          favicon: b.favicon || null,
        })
      }
    }

    // История — по свежести
    if (results.length < 8) {
      const sorted = [...historyCache].sort((a, b) => (b.visitedAt || 0) - (a.visitedAt || 0))
      for (const h of sorted) {
        if (results.length >= 8) break
        if (!h.url || seen.has(h.url)) continue
        const t = (h.title || '').toLowerCase()
        const u = (h.url || '').toLowerCase()
        if (t.includes(q) || u.includes(q)) {
          seen.add(h.url)
          results.push({
            type: 'history',
            title: h.title || h.url,
            url: h.url,
          })
        }
      }
    }

    return results
  })

  ipcMain.handle('get-suggestions', (_e, query) => fetchSuggestions(query))

  // ============ Расширения Chrome ============
  ipcMain.handle('extensions-list', () => listInstalledExtensions())

  ipcMain.handle('extensions-install', async (_e, extensionId) => {
    const extensionsDir = path.join(app.getPath('userData'), 'Extensions')
    return await installExtensionFromStore(extensionId, extensionsDir)
  })

  ipcMain.handle('extensions-remove', async (_e, extensionId) => {
    if (!extensionId) return { ok: false, error: 'Не указан ID' }
    return await removeExtensionFromSession(extensionId)
  })

  ipcMain.handle('extensions-update', async () => {
    return { ok: true, message: 'Обновление не требуется для ручной установки' }
  })

})

// ============================================================
// ============ ЗАВЕРШЕНИЕ РАБОТЫ =============================
// ============================================================
app.on('before-quit', async (event) => {
  if (isQuitHandled) return

  event.preventDefault()
  isQuitHandled = true

  try {
    flushSessionSave()
    await clearPrivateData()
    debugLog('App', 'Приватные данные очищены при выходе')
  } catch (err) {
    console.error('[before-quit]', err)
  }

  app.quit()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})