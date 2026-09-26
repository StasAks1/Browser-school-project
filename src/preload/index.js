const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('browserAPI', {
  navigate: (input) => ipcRenderer.invoke('navigate', input),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  reload: () => ipcRenderer.invoke('reload'),
  goHome: () => ipcRenderer.invoke('go-home'),

  getSuggestions: (query) => ipcRenderer.invoke('get-suggestions', query),

  getTabs: () => ipcRenderer.invoke('get-tabs'),
  createTab: (url) => ipcRenderer.invoke('tab-create', url),
  closeTab: (id) => ipcRenderer.invoke('tab-close', id),
  switchTab: (id) => ipcRenderer.invoke('tab-switch', id),

  // Настройки / Тема / Акцент
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  getAccent: () => ipcRenderer.invoke('get-accent'),
  getAccentOptions: () => ipcRenderer.invoke('get-accent-options'),
  setAccent: (name) => ipcRenderer.invoke('set-accent', name),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  openSettingsPage: () => ipcRenderer.invoke('open-settings-page'),

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

  permissionRespond: (allowed) => ipcRenderer.invoke('permission-respond', allowed),

  onPageUrl: (cb) => ipcRenderer.on('page-url', (_e, url) => cb(url)),
  onLoading: (cb) => ipcRenderer.on('page-loading', (_e, isLoading) => cb(isLoading)),
  onScrollState: (cb) => ipcRenderer.on('scroll-state', (_e, isScrolled) => cb(isScrolled)),
  onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_e, tabs) => cb(tabs)),
  onLibraryUpdated: (cb) => ipcRenderer.on('library-updated', (_e, payload) => cb(payload)),
  onHistoryUpdated: (cb) => ipcRenderer.on('history-updated', () => cb()),
  onThemeChanged: (cb) => ipcRenderer.on('theme-changed', (_e, theme) => cb(theme)),
  onAccentChanged: (cb) => ipcRenderer.on('accent-changed', (_e, data) => cb(data)),
})

// ============ Сохраняем тему в localStorage для anti-flicker ============
ipcRenderer.on('theme-changed', (_e, theme) => {
  try {
    localStorage.setItem('browser-resolved-theme', theme === 'light' ? 'light' : 'dark')
  } catch (e) {}
})

// ============ Слежение за скроллом ============
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