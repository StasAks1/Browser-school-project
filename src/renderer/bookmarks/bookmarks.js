const content = document.getElementById('content')
const searchInput = document.getElementById('search-input')

let allBookmarks = []
let query = ''

// ==================== Утилиты ====================
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}

function getInitial(title) {
  if (!title) return '•'
  const t = title.trim()
  return t ? t[0].toUpperCase() : '•'
}

function getDomain(url) {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return 'Другое'
  }
}

function getFaviconUrl(bm) {
  if (bm.favicon) return bm.favicon
  try {
    const domain = new URL(bm.url).hostname
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`
  } catch {
    return null
  }
}

// ==================== Фильтр ====================
function filterBookmarks(items) {
  if (!query) return items
  const q = query.toLowerCase().trim()
  return items.filter(
    (b) =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.url || '').toLowerCase().includes(q)
  )
}

// ==================== Группировка ====================
function groupByDomain(items) {
  const groups = new Map()
  for (const bm of items) {
    const domain = getDomain(bm.url)
    if (!groups.has(domain)) groups.set(domain, [])
    groups.get(domain).push(bm)
  }
  // Сортируем группы по алфавиту
  return Array.from(groups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], 'ru')
  )
}

// ==================== Рендер ====================
function render() {
  const filtered = filterBookmarks(allBookmarks)

  if (filtered.length === 0) {
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${query ? '🔍' : '⭐'}</div>
        <div class="empty-title">${query ? 'Ничего не найдено' : 'Пока нет закладок'}</div>
        <div class="empty-subtitle">
          ${query
            ? 'Попробуйте изменить поисковый запрос.'
            : 'Добавляйте страницы в закладки, нажимая на звёздочку в адресной строке.'}
        </div>
      </div>
    `
    return
  }

  const groups = groupByDomain(filtered)
  content.innerHTML = ''

  for (const [domain, items] of groups) {
    const groupEl = document.createElement('div')
    groupEl.className = 'group'

    const titleEl = document.createElement('div')
    titleEl.className = 'group-title'
    titleEl.innerHTML = `
      <span>${escapeHtml(domain)}</span>
      <span class="group-count">${items.length}</span>
    `
    groupEl.appendChild(titleEl)

    for (const bm of items) {
      const card = createCard(bm)
      groupEl.appendChild(card)
    }

    content.appendChild(groupEl)
  }
}

function createCard(bm) {
  const card = document.createElement('div')
  card.className = 'bookmark-card'
  card.dataset.id = bm.id

  const favicon = getFaviconUrl(bm)
  const initial = escapeHtml(getInitial(bm.title))

  const faviconHtml = favicon
    ? `<img src="${escapeHtml(favicon)}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='<span>${initial}</span>'">`
    : `<span>${initial}</span>`

  card.innerHTML = `
    <div class="card-favicon">${faviconHtml}</div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(bm.title || bm.url)}</div>
      <div class="card-url">${escapeHtml(bm.url)}</div>
    </div>
    <div class="card-actions">
      <button class="card-btn" data-action="open" title="Открыть в новой вкладке">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <path d="M15 3h6v6"/>
          <path d="M10 14L21 3"/>
        </svg>
      </button>
      <button class="card-btn" data-action="copy" title="Копировать ссылку">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
      <button class="card-btn danger" data-action="delete" title="Удалить">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `

  // Клик по карточке — открыть в текущей вкладке (заменит менеджер)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-btn')) return
    window.browserAPI.navigate(bm.url)
  })

  // Кнопки
  card.querySelectorAll('.card-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const action = btn.dataset.action
      if (action === 'open') {
        window.browserAPI.openBookmarkInNewTab(bm.id)
      } else if (action === 'copy') {
        try {
          await navigator.clipboard.writeText(bm.url)
          btn.style.color = '#4ade80'
          setTimeout(() => (btn.style.color = ''), 800)
        } catch (err) {
          console.error(err)
        }
      } else if (action === 'delete') {
        allBookmarks = await window.browserAPI.removeBookmark(bm.id)
        render()
      }
    })
  })

  return card
}

// ==================== Поиск ====================
searchInput.addEventListener('input', () => {
  query = searchInput.value
  render()
})

// ==================== Обновления из main ====================
window.browserAPI.onBookmarksUpdated((bookmarks) => {
  allBookmarks = bookmarks || []
  render()
})

// ==================== Загрузка ====================
window.browserAPI.getBookmarks().then((bookmarks) => {
  allBookmarks = bookmarks || []
  render()
})