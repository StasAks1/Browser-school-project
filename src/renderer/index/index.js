// ==================== Элементы ====================
const form = document.getElementById('address-form')
const input = document.getElementById('address-input')
const btnBack = document.getElementById('btn-back')
const btnForward = document.getElementById('btn-forward')
const btnReload = document.getElementById('btn-reload')
const btnHome = document.getElementById('btn-home')
const btnStar = document.getElementById('btn-star')
const tabsContainer = document.getElementById('tabs')
const btnNewTab = document.getElementById('new-tab-btn')
const bookmarksContainer = document.getElementById('bookmarks')
const btnBookmarksManager = document.getElementById('btn-bookmarks-manager')

let tabsState = []
let bookmarksState = []
const renderedTabIds = new Set()
const closingTabIds = new Set()

// ==================== Адресная строка ====================
form.addEventListener('submit', (e) => {
  e.preventDefault()
  const value = input.value.trim()
  if (!value) return
  window.browserAPI.navigate(value)
  input.blur()
})

input.addEventListener('focus', () => input.select())

// ==================== Кнопки навигации ====================
btnBack.addEventListener('click', () => window.browserAPI.goBack())
btnForward.addEventListener('click', () => window.browserAPI.goForward())
btnReload.addEventListener('click', () => window.browserAPI.reload())
btnHome.addEventListener('click', () => window.browserAPI.goHome())

// ==================== Менеджер закладок ====================
btnBookmarksManager.addEventListener('click', () => {
  window.browserAPI.openBookmarksManager()
})

// ==================== Звёздочка — открывает popup-окно ====================
btnStar.addEventListener('click', async () => {
  const url = input.value.trim()
  if (!url) return

  // Проверяем, есть ли уже закладка
  let existing = bookmarksState.find((b) => b.url === url)

  // Если нет — добавляем
  if (!existing) {
    bookmarksState = await window.browserAPI.bookmarkCurrentPage()
    renderBookmarks()
    existing = bookmarksState.find((b) => b.url === url)
    updateStarState()
  }

  if (!existing) return

  // Открываем popup-окно
  const rect = btnStar.getBoundingClientRect()
  window.browserAPI.openBookmarkPopup({
    rect: {
      right: rect.right,
      bottom: rect.bottom,
    },
    bookmarkId: existing.id,
    title: existing.title,
    url: existing.url,
  })
})

// ==================== События от main ====================
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

window.browserAPI.onBookmarksUpdated((bookmarks) => {
  bookmarksState = bookmarks || []
  renderBookmarks()
  updateStarState()
})

// ==================== Хелперы ====================
function getInitial(title) {
  if (!title) return '•'
  const t = title.trim()
  return t ? t[0].toUpperCase() : '•'
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}

function updateStarState() {
  const url = input.value.trim()
  const isBookmarked = !!url && bookmarksState.some((b) => b.url === url)
  btnStar.classList.toggle('bookmarked', isBookmarked)
  btnStar.title = isBookmarked ? 'Редактировать закладку' : 'Добавить в закладки'
}

// ==================== Анимация закрытия вкладки ====================
function animateCloseTab(id) {
  if (closingTabIds.has(id)) return
  const tabEl = tabsContainer.querySelector(`.tab[data-tab-id="${id}"]`)
  if (!tabEl) {
    window.browserAPI.closeTab(id)
    return
  }
  closingTabIds.add(id)
  tabEl.classList.add('closing')
  setTimeout(() => {
    window.browserAPI.closeTab(id)
    closingTabIds.delete(id)
  }, 220)
}

// ==================== Рендер вкладок ====================
function renderTabs() {
  const newIds = new Set(tabsState.map((t) => t.id))
  const enteringIds = new Set()
  for (const id of newIds) {
    if (!renderedTabIds.has(id)) enteringIds.add(id)
  }

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
      </button>
    `

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
      if (e.button === 1) {
        e.preventDefault()
        animateCloseTab(tab.id)
      }
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

// ==================== Рендер закладок ====================
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
    <span class="bookmark-title">${escapeHtml(bm.title || bm.url)}</span>
  `

  el.addEventListener('click', (e) => {
    e.preventDefault()
    window.browserAPI.navigate(bm.url)
  })

  el.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
      e.preventDefault()
      window.browserAPI.openBookmarkInNewTab(bm.id)
    }
  })

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    window.browserAPI.showBookmarkMenu(bm.id)
  })

  return el
}

function renderBookmarks() {
  const currentIds = new Set(bookmarksState.map((b) => b.id))

  const existingEls = Array.from(bookmarksContainer.querySelectorAll('.bookmark-item'))
  for (const el of existingEls) {
    const id = el.dataset.bookmarkId
    if (!currentIds.has(id) && !el.classList.contains('closing')) {
      el.classList.add('closing')
      setTimeout(() => {
        el.remove()
        updateBookmarksBarVisibility()
      }, 220)
    }
  }

  for (const bm of bookmarksState) {
    const already = bookmarksContainer.querySelector(
      `.bookmark-item[data-bookmark-id="${bm.id}"]`
    )
    if (already) continue

    const el = createBookmarkElement(bm)
    el.classList.add('entering')
    bookmarksContainer.appendChild(el)

    el.getBoundingClientRect()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.remove('entering'))
    })
  }

  updateBookmarksBarVisibility()
}

function updateBookmarksBarVisibility() {
  const hasItems = bookmarksContainer.children.length > 0
  if (bookmarksState.length > 0 || hasItems) {
    document.body.classList.add('has-bookmarks')
  } else {
    document.body.classList.remove('has-bookmarks')
  }
}

// ==================== Кнопка «+» ====================
btnNewTab.addEventListener('click', () => window.browserAPI.createTab())

// ==================== Начальная загрузка ====================
window.browserAPI.getTabs().then((tabs) => {
  tabsState = tabs || []
  renderTabs()
})

window.browserAPI.getBookmarks().then((bookmarks) => {
  bookmarksState = bookmarks || []
  for (const bm of bookmarksState) {
    const el = createBookmarkElement(bm)
    bookmarksContainer.appendChild(el)
  }
  updateBookmarksBarVisibility()
  updateStarState()
})

// ==================== Горячие клавиши ====================
document.addEventListener('keydown', (e) => {
  const meta = e.metaKey || e.ctrlKey
  if (!meta) return

  if (e.key === 't') {
    e.preventDefault()
    window.browserAPI.createTab()
  }
  if (e.key === 'w') {
    e.preventDefault()
    const active = tabsState.find((t) => t.isActive)
    if (active) animateCloseTab(active.id)
  }
  if (e.key === 'l') {
    e.preventDefault()
    input.focus()
    input.select()
  }
  if (e.key === 'd') {
    e.preventDefault()
    btnStar.click()
  }
  if (e.key === 'o' && e.shiftKey) {
    e.preventDefault()
    window.browserAPI.openBookmarksManager()
  }
})