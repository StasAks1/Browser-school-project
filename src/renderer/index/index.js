const form = document.getElementById('address-form')
const input = document.getElementById('address-input')
const btnBack = document.getElementById('btn-back')
const btnForward = document.getElementById('btn-forward')
const btnReload = document.getElementById('btn-reload')
const btnHome = document.getElementById('btn-home')
const btnHistory = document.getElementById('btn-history')
const btnSettings = document.getElementById('btn-settings')
const btnStar = document.getElementById('btn-star')
const tabsContainer = document.getElementById('tabs')
const btnNewTab = document.getElementById('new-tab-btn')
const bookmarksContainer = document.getElementById('bookmarks')
const btnBookmarksManager = document.getElementById('btn-bookmarks-manager')

let tabsState = []
let library = { bookmarks: [], folders: [] }
const renderedTabIds = new Set()
const closingTabIds = new Set()

// ============ Тема и акцент ============
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
}

function applyAccent(data) {
  if (!data) return
  document.documentElement.style.setProperty('--accent', data.color)
  document.documentElement.style.setProperty('--accent-hover', data.hover)
}

window.browserAPI.onThemeChanged((theme) => applyTheme(theme))
window.browserAPI.onAccentChanged((data) => applyAccent(data))
window.browserAPI.getTheme().then((theme) => applyTheme(theme))
window.browserAPI.getAccent().then((data) => applyAccent(data))

// ============ Адресная строка ============
form.addEventListener('submit', (e) => {
  e.preventDefault()
  const value = input.value.trim()
  if (!value) return
  window.browserAPI.navigate(value)
  input.blur()
})
input.addEventListener('focus', () => input.select())

btnBack.addEventListener('click', () => window.browserAPI.goBack())
btnForward.addEventListener('click', () => window.browserAPI.goForward())
btnReload.addEventListener('click', () => window.browserAPI.reload())
btnHome.addEventListener('click', () => window.browserAPI.goHome())
btnHistory.addEventListener('click', () => window.browserAPI.openHistoryManager())
btnSettings.addEventListener('click', () => window.browserAPI.openSettingsPage())
btnBookmarksManager.addEventListener('click', () => window.browserAPI.openBookmarksManager())

btnStar.addEventListener('click', async () => {
  const url = input.value.trim()
  if (!url) return

  let existing = library.bookmarks.find((b) => b.url === url)
  if (!existing) {
    library = await window.browserAPI.bookmarkCurrentPage()
    renderBookmarks()
    existing = library.bookmarks.find((b) => b.url === url)
    updateStarState()
  }
  if (!existing) return

  const rect = btnStar.getBoundingClientRect()
  window.browserAPI.openBookmarkPopup({
    rect: { right: rect.right, bottom: rect.bottom },
    bookmarkId: existing.id,
    title: existing.title,
    url: existing.url,
  })
})

window.browserAPI.onPageUrl((url) => {
  input.value = url || ''
  updateStarState()
})

window.browserAPI.onLoading((isLoading) => {
  document.body.classList.toggle('loading', isLoading)
})

window.browserAPI.onScrollState((isScrolled) => {
  document.body.classList.toggle('scrolled', isScrolled)
})

window.browserAPI.onTabsUpdated((tabs) => {
  tabsState = tabs || []
  renderTabs()
})

window.browserAPI.onLibraryUpdated((payload) => {
  library = payload || { bookmarks: [], folders: [] }
  renderBookmarks()
  updateStarState()
})

function getInitial(title) {
  if (!title) return '•'
  const t = title.trim()
  return t ? t[0].toUpperCase() : '•'
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

function updateStarState() {
  const url = input.value.trim()
  const isBookmarked = !!url && library.bookmarks.some((b) => b.url === url)
  btnStar.classList.toggle('bookmarked', isBookmarked)
  btnStar.title = isBookmarked ? 'Редактировать закладку' : 'Добавить в закладки'
}

function animateCloseTab(id) {
  if (closingTabIds.has(id)) return
  const tabEl = tabsContainer.querySelector(`.tab[data-tab-id="${id}"]`)
  if (!tabEl) { window.browserAPI.closeTab(id); return }
  closingTabIds.add(id)
  tabEl.classList.add('closing')
  setTimeout(() => {
    window.browserAPI.closeTab(id)
    closingTabIds.delete(id)
  }, 220)
}

function renderTabs() {
  const newIds = new Set(tabsState.map((t) => t.id))
  const enteringIds = new Set()
  for (const id of newIds) if (!renderedTabIds.has(id)) enteringIds.add(id)

  tabsContainer.innerHTML = ''

  for (const tab of tabsState) {
    const el = document.createElement('div')
    el.className = 'tab' + (tab.isActive ? ' active' : '')
    el.dataset.tabId = String(tab.id)
    el.title = tab.title || ''

    const faviconHtml = tab.favicon
      ? `<img src="${escapeHtml(tab.favicon)}" onerror="this.style.display='none';this.parentElement.innerHTML='<span>${escapeHtml(getInitial(tab.title))}</span>'">`
      : `<span>${escapeHtml(getInitial(tab.title))}</span>`

    el.innerHTML = `
      <div class="tab-favicon">${faviconHtml}</div>
      <span class="tab-title">${escapeHtml(tab.title || 'Новая вкладка')}</span>
      <button class="tab-close" data-close="${tab.id}" title="Закрыть вкладку">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>`

    if (enteringIds.has(tab.id)) el.classList.add('entering')

    el.addEventListener('click', (e) => {
      if (e.target.closest('.tab-close')) return
      if (tab.isActive) return
      if (closingTabIds.has(tab.id)) return
      window.browserAPI.switchTab(tab.id)
    })

    el.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation()
      animateCloseTab(tab.id)
    })

    el.addEventListener('auxclick', (e) => {
      if (e.button === 1) { e.preventDefault(); animateCloseTab(tab.id) }
    })

    tabsContainer.appendChild(el)

    if (enteringIds.has(tab.id)) {
      el.getBoundingClientRect()
      requestAnimationFrame(() => el.classList.remove('entering'))
    }
  }

  renderedTabIds.clear()
  for (const id of newIds) renderedTabIds.add(id)
}

// ============ Панель закладок ============
const FOLDER_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
  </svg>`

function createFolderPill(folder) {
  const el = document.createElement('div')
  el.className = 'bookmark-item bookmark-folder'
  el.dataset.folderId = folder.id
  el.title = folder.name

  el.innerHTML = `
    <div class="bookmark-favicon folder-icon">${FOLDER_ICON_SVG}</div>
    <span class="bookmark-title">${escapeHtml(folder.name)}</span>`

  el.addEventListener('click', (e) => {
    e.preventDefault()
    window.browserAPI.showFolderMenu(folder.id)
  })

  return el
}

function createBookmarkElement(bm) {
  const el = document.createElement('div')
  el.className = 'bookmark-item'
  el.title = bm.url
  el.dataset.bookmarkId = bm.id

  const faviconHtml = bm.favicon
    ? `<img src="${escapeHtml(bm.favicon)}" onerror="this.style.display='none';this.parentElement.innerHTML='<span>${escapeHtml(getInitial(bm.title))}</span>'">`
    : `<span>${escapeHtml(getInitial(bm.title))}</span>`

  el.innerHTML = `
    <div class="bookmark-favicon">${faviconHtml}</div>
    <span class="bookmark-title">${escapeHtml(bm.title || bm.url)}</span>`

  el.addEventListener('click', (e) => {
    e.preventDefault()
    window.browserAPI.navigate(bm.url)
  })

  el.addEventListener('auxclick', (e) => {
    if (e.button === 1) { e.preventDefault(); window.browserAPI.openBookmarkInNewTab(bm.id) }
  })

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    window.browserAPI.showBookmarkMenu(bm.id)
  })

  return el
}

function updateBookmarkElement(el, bm) {
  const titleEl = el.querySelector('.bookmark-title')
  const newTitle = bm.title || bm.url
  if (titleEl && titleEl.textContent !== newTitle) titleEl.textContent = newTitle
  el.title = bm.url
}

function renderBookmarks() {
  const bookmarks = library.bookmarks || []
  const folders = library.folders || []

  const rootBookmarks = bookmarks.filter(b => !b.folderId)
  const currentFolderIds = new Set(folders.map(f => f.id))
  const currentBookmarkIds = new Set(rootBookmarks.map(b => b.id))

  for (const el of Array.from(bookmarksContainer.querySelectorAll('.bookmark-folder'))) {
    if (!currentFolderIds.has(el.dataset.folderId)) {
      el.classList.add('closing')
      setTimeout(() => { el.remove(); updateBookmarksBarVisibility() }, 220)
    }
  }

  for (const el of Array.from(bookmarksContainer.querySelectorAll('.bookmark-item:not(.bookmark-folder)'))) {
    const id = el.dataset.bookmarkId
    if (!currentBookmarkIds.has(id) && !el.classList.contains('closing')) {
      el.classList.add('closing')
      setTimeout(() => { el.remove(); updateBookmarksBarVisibility() }, 220)
    }
  }

  for (const folder of folders) {
    let el = bookmarksContainer.querySelector(`.bookmark-folder[data-folder-id="${folder.id}"]`)
    if (!el) {
      el = createFolderPill(folder)
      el.classList.add('entering')
      bookmarksContainer.appendChild(el)
      el.getBoundingClientRect()
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')))
    } else {
      const titleEl = el.querySelector('.bookmark-title')
      if (titleEl && titleEl.textContent !== folder.name) titleEl.textContent = folder.name
      el.title = folder.name
    }
  }

  for (const bm of rootBookmarks) {
    let el = bookmarksContainer.querySelector(`.bookmark-item:not(.bookmark-folder)[data-bookmark-id="${bm.id}"]`)
    if (el) {
      updateBookmarkElement(el, bm)
      continue
    }
    el = createBookmarkElement(bm)
    el.classList.add('entering')
    bookmarksContainer.appendChild(el)
    el.getBoundingClientRect()
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('entering')))
  }

  updateBookmarksBarVisibility()
}

function updateBookmarksBarVisibility() {
  const hasItems = bookmarksContainer.children.length > 0
  const hasContent = (library.bookmarks?.length || 0) > 0 || (library.folders?.length || 0) > 0
  if (hasContent || hasItems) document.body.classList.add('has-bookmarks')
  else document.body.classList.remove('has-bookmarks')
}

btnNewTab.addEventListener('click', () => window.browserAPI.createTab())

window.browserAPI.getTabs().then((tabs) => {
  tabsState = tabs || []
  renderTabs()
})

window.browserAPI.getLibrary().then((data) => {
  library = data || { bookmarks: [], folders: [] }
  renderBookmarks()
  updateStarState()
})

document.addEventListener('keydown', (e) => {
  const meta = e.metaKey || e.ctrlKey
  if (!meta) return

  if (e.key === 't') { e.preventDefault(); window.browserAPI.createTab() }
  if (e.key === 'w') {
    e.preventDefault()
    const active = tabsState.find((t) => t.isActive)
    if (active) animateCloseTab(active.id)
  }
  if (e.key === 'l') { e.preventDefault(); input.focus(); input.select() }
  if (e.key === 'd') { e.preventDefault(); btnStar.click() }
  if (e.key === 'y') { e.preventDefault(); window.browserAPI.openHistoryManager() }
  if (e.key === ',') { e.preventDefault(); window.browserAPI.openSettingsPage() }
  if (e.key === 'o' && e.shiftKey) { e.preventDefault(); window.browserAPI.openBookmarksManager() }
})