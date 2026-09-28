const content = document.getElementById('content')
const searchInput = document.getElementById('search-input')
const btnClearAll = document.getElementById('btn-clear-all')
const btnExport = document.getElementById('btn-export')
const toastEl = document.getElementById('toast')

let toastTimer = null
function showToast(msg) {
  toastEl.textContent = msg
  toastEl.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2800)
}

let allHistory = []
let query = ''

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function getInitial(title) {
  if (!title) return '•'
  const t = title.trim()
  return t ? t[0].toUpperCase() : '•'
}

function getDomain(url) {
  try { return new URL(url).hostname } catch { return '' }
}

function getFaviconUrl(entry) {
  const domain = getDomain(entry.url)
  if (!domain) return null
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`
}

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function getDateKey(ts) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'

  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function filterHistory(items) {
  if (!query) return items
  const q = query.toLowerCase().trim()
  return items.filter(
    (h) => (h.title || '').toLowerCase().includes(q) || (h.url || '').toLowerCase().includes(q)
  )
}

function groupByDate(items) {
  const groups = new Map()
  const sorted = [...items].sort((a, b) => b.visitedAt - a.visitedAt)
  for (const h of sorted) {
    const key = getDateKey(h.visitedAt)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(h)
  }
  return Array.from(groups.entries())
}

function render() {
  const filtered = filterHistory(allHistory)

  if (filtered.length === 0) {
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${query ? '🔍' : '🕐'}</div>
        <div class="empty-title">${query ? 'Ничего не найдено' : 'История пуста'}</div>
        <div class="empty-subtitle">${
          query
            ? 'Попробуйте изменить поисковый запрос.'
            : 'Посещённые страницы будут появляться здесь автоматически. История хранится только на вашем устройстве.'
        }</div>
      </div>`
    return
  }

  const groups = groupByDate(filtered)
  content.innerHTML = ''

  for (const [dateLabel, items] of groups) {
    const groupEl = document.createElement('div')
    groupEl.className = 'date-group'

    const title = document.createElement('div')
    title.className = 'date-title'
    title.innerHTML = `<span>${escapeHtml(dateLabel)}</span><span class="date-count">${items.length}</span>`
    groupEl.appendChild(title)

    for (const entry of items) groupEl.appendChild(createItem(entry))
    content.appendChild(groupEl)
  }
}

function createItem(entry) {
  const el = document.createElement('div')
  el.className = 'history-item'
  el.dataset.id = entry.id

  const favicon = getFaviconUrl(entry)
  const initial = escapeHtml(getInitial(entry.title || entry.url))
  const faviconHtml = favicon
    ? `<img src="${escapeHtml(favicon)}" onerror="this.style.display='none';this.parentElement.innerHTML='<span>${initial}</span>'">`
    : `<span>${initial}</span>`

  el.innerHTML = `
    <div class="item-favicon">${faviconHtml}</div>
    <div class="item-body">
      <div class="item-title">${escapeHtml(entry.title || entry.url)}</div>
      <div class="item-url">${escapeHtml(entry.url)}</div>
    </div>
    <span class="item-time">${formatTime(entry.visitedAt)}</span>
    <div class="item-actions">
      <button class="item-btn" data-action="delete" title="Удалить из истории">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>`

  el.addEventListener('click', (e) => {
    if (e.target.closest('.item-btn')) return
    window.browserAPI.openUrlFromHistory(entry.id)
  })

  el.addEventListener('auxclick', (e) => {
    if (e.button === 1) { e.preventDefault(); window.browserAPI.openUrlInNewTab(entry.url) }
  })

  el.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
    e.stopPropagation()
    allHistory = await window.browserAPI.removeHistoryEntry(entry.id)
    render()
  })

  return el
}

searchInput.addEventListener('input', () => {
  query = searchInput.value
  render()
})

btnClearAll.addEventListener('click', async () => {
  if (!allHistory.length) return
  if (!confirm('Очистить всю историю? Это действие нельзя отменить.')) return
  allHistory = await window.browserAPI.clearHistory()
  render()
})

window.browserAPI.onHistoryUpdated(async () => {
  allHistory = await window.browserAPI.getHistory()
  render()
})

btnExport.addEventListener('click', () => {
  if (!allHistory.length) {
    showToast('История пуста')
    return
  }
  window.browserAPI.showHistoryExportMenu()
})

window.browserAPI.onHistoryExportResult((res) => {
  if (res && res.ok) {
    showToast(`Экспортировано: ${res.count} записей`)
  } else if (res && !res.canceled) {
    showToast(res.error || 'Не удалось экспортировать')
  }
})

// Первичная загрузка истории (без неё страница открывалась пустой до первого события history-updated)
window.browserAPI.getHistory().then((list) => {
  allHistory = list || []
  render()
})

// Тема и акцент: см. shared/theme.js