const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('browserAPI', {
  navigate: (input) => ipcRenderer.invoke('navigate', input),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  reload: () => ipcRenderer.invoke('reload'),
  goHome: () => ipcRenderer.invoke('go-home'),

  getSuggestions: (query) => ipcRenderer.invoke('get-suggestions', query),

  getTabs: () => ipcRenderer.invoke('get-tabs'),
  createTab: (url) => ipcRenderer.invoke('tab-create', url),
  createPrivateTab: () => ipcRenderer.invoke('tab-create-private'),
  closeAllPrivateTabs: () => ipcRenderer.invoke('close-all-private-tabs'),
  closeTab: (id) => ipcRenderer.invoke('tab-close', id),
  switchTab: (id) => ipcRenderer.invoke('tab-switch', id),
  restoreClosedTab: () => ipcRenderer.invoke('tab-restore-closed'),
  duplicateTab: (id) => ipcRenderer.invoke('tab-duplicate', id),
  showTabMenu: (id) => ipcRenderer.invoke('show-tab-menu', id),

  getSecurityState: () => ipcRenderer.invoke('get-security-state'),

  findInPage: (text, options) => ipcRenderer.invoke('find-in-page', text, options || {}),
  stopFindInPage: () => ipcRenderer.invoke('stop-find-in-page'),
  onFindResult: (cb) => ipcRenderer.on('find-result', (_e, result) => cb(result)),
  onOpenFindBar: (cb) => ipcRenderer.on('open-find-bar', () => cb()),

  // Reader
  toggleReaderMode: () => ipcRenderer.invoke('reader-toggle'),
  exitReaderMode: () => ipcRenderer.invoke('reader-exit'),
  getReaderContent: () => ipcRenderer.invoke('reader-get-content'),

  // PDF
  openPdfViewer: (filePath) => ipcRenderer.invoke('open-pdf-viewer', filePath),
  getPdfMeta: () => ipcRenderer.invoke('get-pdf-meta'),
  getPdfData: () => ipcRenderer.invoke('get-pdf-data'),

  warningGoBack: () => ipcRenderer.invoke('warning-go-back'),
  warningProceed: (url) => ipcRenderer.invoke('warning-proceed', url),

  errorRetry: () => ipcRenderer.invoke('error-retry'),
  errorGoBack: () => ipcRenderer.invoke('error-go-back'),
  errorGoHome: () => ipcRenderer.invoke('error-go-home'),
  errorProceedAnyway: (url) => ipcRenderer.invoke('error-proceed-anyway', url),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  getToolbarSettings: () => ipcRenderer.invoke('get-toolbar-settings'),
  setToolbarSettings: (visible) => ipcRenderer.invoke('set-toolbar-settings', visible),
  onToolbarSettingsChanged: (cb) => ipcRenderer.on('toolbar-settings-changed', (_e, data) => cb(data)),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  getAccent: () => ipcRenderer.invoke('get-accent'),
  getAccentOptions: () => ipcRenderer.invoke('get-accent-options'),
  setAccent: (name) => ipcRenderer.invoke('set-accent', name),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  openSettingsPage: () => ipcRenderer.invoke('open-settings-page'),

  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  setDownloadsPath: () => ipcRenderer.invoke('set-downloads-path'),
  resetDownloadsPath: () => ipcRenderer.invoke('reset-downloads-path'),
  setAskWhereToSave: (value) => ipcRenderer.invoke('set-ask-where-to-save', value),
  openDownloadedFile: (id) => ipcRenderer.invoke('open-downloaded-file', id),
  showDownloadedInFolder: (id) => ipcRenderer.invoke('show-downloaded-in-folder', id),
  removeDownloadEntry: (id) => ipcRenderer.invoke('remove-download-entry', id),
  clearDownloadsList: () => ipcRenderer.invoke('clear-downloads-list'),
  deleteDownloadedFile: (id) => ipcRenderer.invoke('delete-downloaded-file', id),
  openDownloadsPage: () => ipcRenderer.invoke('open-downloads-page'),

  getLibrary: () => ipcRenderer.invoke('get-library'),
  bookmarkCurrentPage: () => ipcRenderer.invoke('bookmark-current-page'),
  removeBookmark: (id) => ipcRenderer.invoke('remove-bookmark', id),
  renameBookmark: (id, newTitle) => ipcRenderer.invoke('rename-bookmark', id, newTitle),
  updateBookmark: (payload) => ipcRenderer.invoke('update-bookmark', payload),
  moveBookmark: (payload) => ipcRenderer.invoke('move-bookmark', payload),
  openBookmarkInNewTab: (id) => ipcRenderer.invoke('open-bookmark-in-new-tab', id),
  showBookmarkMenu: (id) => ipcRenderer.invoke('show-bookmark-menu', id),
  showFolderMenu: (id) => ipcRenderer.invoke('show-folder-menu', id),
  openBookmarksManager: () => ipcRenderer.invoke('open-bookmarks-manager'),
  openHistoryManager: () => ipcRenderer.invoke('open-history-manager'),
  clearAllBookmarks: () => ipcRenderer.invoke('clear-all-bookmarks'),
  getCurrentTabUrl: () => ipcRenderer.invoke('get-current-tab-url'),

  createFolder: (name) => ipcRenderer.invoke('create-folder', name),
  renameFolder: (payload) => ipcRenderer.invoke('rename-folder', payload),
  deleteFolder: (id) => ipcRenderer.invoke('delete-folder', id),

  openBookmarkPopup: (payload) => ipcRenderer.invoke('open-bookmark-popup', payload),
  closeBookmarkPopup: () => ipcRenderer.invoke('close-bookmark-popup'),
  popupSave: (payload) => ipcRenderer.invoke('popup-save', payload),
  popupRemove: (payload) => ipcRenderer.invoke('popup-remove', payload),

  getHistory: () => ipcRenderer.invoke('get-history'),
  removeHistoryEntry: (id) => ipcRenderer.invoke('remove-history-entry', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  openUrlFromHistory: (id) => ipcRenderer.invoke('open-url-from-history', id),
  openUrlInNewTab: (url) => ipcRenderer.invoke('open-url-in-new-tab', url),

  getCookies: () => ipcRenderer.invoke('get-cookies'),
  removeCookie: (payload) => ipcRenderer.invoke('remove-cookie', payload),
  removeCookiesByDomain: (domain) => ipcRenderer.invoke('remove-cookies-by-domain', domain),
  clearAllCookies: () => ipcRenderer.invoke('clear-all-cookies'),
  clearSiteData: () => ipcRenderer.invoke('clear-site-data'),
  openCookiesPage: () => ipcRenderer.invoke('open-cookies-page'),
  setCookie: (payload) => ipcRenderer.invoke('set-cookie', payload),
  updateCookie: (payload) => ipcRenderer.invoke('update-cookie', payload),

  getSessionSetting: () => ipcRenderer.invoke('get-session-setting'),
  setSessionSetting: (value) => ipcRenderer.invoke('set-session-setting', value),
  clearSession: () => ipcRenderer.invoke('clear-session'),

  // ============ Трекеры и реклама ============
  getTrackerSetting: () => ipcRenderer.invoke('get-tracker-setting'),
  setTrackerSetting: (value) => ipcRenderer.invoke('set-tracker-setting', value),
  getTrackerStats: () => ipcRenderer.invoke('get-tracker-stats'),
  resetTrackerStats: () => ipcRenderer.invoke('reset-tracker-stats'),

  exportBookmarks: () => ipcRenderer.invoke('export-bookmarks'),
  importBookmarks: () => ipcRenderer.invoke('import-bookmarks'),

  permissionRespond: (allowed) => ipcRenderer.invoke('permission-respond', allowed),

  onPageUrl: (cb) => ipcRenderer.on('page-url', (_e, url) => cb(url)),
  onLoading: (cb) => ipcRenderer.on('page-loading', (_e, isLoading) => cb(isLoading)),
  onScrollState: (cb) => ipcRenderer.on('scroll-state', (_e, isScrolled) => cb(isScrolled)),
  onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_e, tabs) => cb(tabs)),
  onLibraryUpdated: (cb) => ipcRenderer.on('library-updated', (_e, payload) => cb(payload)),
  onHistoryUpdated: (cb) => ipcRenderer.on('history-updated', () => cb()),
  onThemeChanged: (cb) => ipcRenderer.on('theme-changed', (_e, theme) => cb(theme)),
  onAccentChanged: (cb) => ipcRenderer.on('accent-changed', (_e, data) => cb(data)),
  onDownloadsUpdated: (cb) => ipcRenderer.on('downloads-updated', (_e, list) => cb(list)),
  onDownloadActiveCount: (cb) => ipcRenderer.on('download-active-count', (_e, count) => cb(count)),
  onSecurityState: (cb) => ipcRenderer.on('security-state', (_e, state) => cb(state)),
  onTabCloseRequest: (cb) => ipcRenderer.on('tab-close-request', (_e, id) => cb(id)),

  onShortcutCloseTab: (cb) => ipcRenderer.on('shortcut-close-tab', () => cb()),
  onShortcutFocusAddress: (cb) => ipcRenderer.on('shortcut-focus-address', () => cb()),
  onShortcutBookmark: (cb) => ipcRenderer.on('shortcut-bookmark', () => cb()),

  onStatusBarUrl: (cb) => ipcRenderer.on('statusbar-url', (_e, url) => cb(url)),
})

ipcRenderer.on('theme-changed', (_e, theme) => {
  try {
    localStorage.setItem('browser-resolved-theme', theme === 'light' ? 'light' : 'dark')
  } catch (e) {}
})

let wasScrolled = false
function handleScroll() {
  const y = document.documentElement.scrollTop || document.body.scrollTop || window.scrollY || 0
  const isScrolled = y > 8
  if (isScrolled !== wasScrolled) {
    wasScrolled = isScrolled
    ipcRenderer.send('scroll-state', isScrolled)
  }
}
document.addEventListener('scroll', handleScroll, { capture: true, passive: true })
window.addEventListener('scroll', handleScroll, { passive: true })
window.addEventListener('DOMContentLoaded', handleScroll)

// ============================================================
// ============ DRAG & DROP ФАЙЛОВ В ОКНО ====================
// ============================================================
function collectPaths(e) {
  const paths = []
  try {
    const files = Array.from(e.dataTransfer?.files || [])
    for (const f of files) {
      let p = null
      // Electron 32+: File.path удалён, нужен webUtils.getPathForFile
      try {
        if (webUtils && typeof webUtils.getPathForFile === 'function') {
          p = webUtils.getPathForFile(f)
        }
      } catch (err) {}
      // Fallback для старых версий
      if (!p && f.path) p = f.path
      if (p) paths.push(p)
    }
  } catch (err) {}
  return paths
}

window.addEventListener('dragover', (e) => {
  const types = Array.from(e.dataTransfer?.types || [])
  if (!types.includes('Files')) return
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}, true)

window.addEventListener('drop', (e) => {
  const types = Array.from(e.dataTransfer?.types || [])
  if (!types.includes('Files')) return
  e.preventDefault()
  e.stopPropagation()

  const paths = collectPaths(e)
  if (!paths.length) return

  ipcRenderer.send('drop-files', paths)
}, true)