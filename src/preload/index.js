const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('browserAPI', {
  // Навигация
  navigate: (input) => ipcRenderer.invoke('navigate', input),
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  reload: () => ipcRenderer.invoke('reload'),
  goHome: () => ipcRenderer.invoke('go-home'),

  // Поиск
  getSuggestions: (query) => ipcRenderer.invoke('get-suggestions', query),

  // Вкладки
  getTabs: () => ipcRenderer.invoke('get-tabs'),
  createTab: (url) => ipcRenderer.invoke('tab-create', url),
  closeTab: (id) => ipcRenderer.invoke('tab-close', id),
  switchTab: (id) => ipcRenderer.invoke('tab-switch', id),

  // Закладки
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  bookmarkCurrentPage: () => ipcRenderer.invoke('bookmark-current-page'),
  removeBookmark: (id) => ipcRenderer.invoke('remove-bookmark', id),
  renameBookmark: (id, newTitle) => ipcRenderer.invoke('rename-bookmark', id, newTitle),
  openBookmarkInNewTab: (id) => ipcRenderer.invoke('open-bookmark-in-new-tab', id),
  showBookmarkMenu: (id) => ipcRenderer.invoke('show-bookmark-menu', id),
  openBookmarksManager: () => ipcRenderer.invoke('open-bookmarks-manager'),
  clearAllBookmarks: () => ipcRenderer.invoke('clear-all-bookmarks'),
  getCurrentTabUrl: () => ipcRenderer.invoke('get-current-tab-url'),

  // Popup
  openBookmarkPopup: (payload) => ipcRenderer.invoke('open-bookmark-popup', payload),
  closeBookmarkPopup: () => ipcRenderer.invoke('close-bookmark-popup'),
  popupSave: (payload) => ipcRenderer.invoke('popup-save', payload),
  popupRemove: (payload) => ipcRenderer.invoke('popup-remove', payload),

  // События
  onPageUrl: (cb) => ipcRenderer.on('page-url', (_e, url) => cb(url)),
  onLoading: (cb) => ipcRenderer.on('page-loading', (_e, isLoading) => cb(isLoading)),
  onScrollState: (cb) => ipcRenderer.on('scroll-state', (_e, isScrolled) => cb(isScrolled)),
  onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_e, tabs) => cb(tabs)),
  onBookmarksUpdated: (cb) => ipcRenderer.on('bookmarks-updated', (_e, bm) => cb(bm)),
})

// --- Слежение за скроллом ---
let wasScrolled = false
function handleScroll() {
  const y =
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    window.scrollY ||
    0
  const isScrolled = y > 8
  if (isScrolled !== wasScrolled) {
    wasScrolled = isScrolled
    ipcRenderer.send('scroll-state', isScrolled)
  }
}

document.addEventListener('scroll', handleScroll, { capture: true, passive: true })
window.addEventListener('scroll', handleScroll, { passive: true })
window.addEventListener('DOMContentLoaded', handleScroll)