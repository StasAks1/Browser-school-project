const content = document.getElementById('content')
const searchInput = document.getElementById('search-input')
const btnClearAll = document.getElementById('btn-clear-all')
const statsEl = document.getElementById('stats')

const confirmModal = document.getElementById('confirm-modal')
const confirmTitle = document.getElementById('confirm-title')
const confirmText = document.getElementById('confirm-text')
const confirmCancel = document.getElementById('confirm-cancel')
const confirmOk = document.getElementById('confirm-ok')

let allCookies = []
let query = ''
let confirmResolve = null

const ICON_CHEVRON = `<svg class="domain-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
const ICON_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
const ICON_TRASH_SMALL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function formatExpires(ts) {
  if (!ts) return 'сессия'
  const d = new Date(ts * 1000)
  const now = Date.now()
  const diff = d.getTime() - now
  if (diff < 0) return 'истёк'
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  if (days > 365) return `${Math.floor(days / 365)} г.`
  if (days > 30) return `${Math.floor(days / 30)} мес.`
  if (days > 0) return `${days} дн.`
  const hours = Math.floor(diff / (60 * 60 * 1000))
  if (hours > 0) return `${hours} ч.`
  return `${Math.floor(diff / (60 * 1000))} мин.`
}

function getSameSiteLabel(sameSite) {
  switch (sameSite) {
    case 'no_restriction': return 'None'
    case 'lax': return 'Lax'
    case 'strict': return 'Strict'
    default: return '—'
  }
}

function renderStats() {
  const total = allCookies.length
  const domains = new Set(allCookies.map(c => c.domain)).size
  const session = allCookies.filter(c => c.session).length

  statsEl.innerHTML = `
    <div class="stat">
      <div class="stat-value">${total}</div>
      <div class="stat-label">Всего cookie</div>
    </div>
    <div class="stat">
      <div class="stat-value">${domains}</div>
      <div class="stat-label">Доменов</div>
    </div>
    <div class="stat">
      <div class="stat-value">${session}</div>
      <div class="stat-label">Сессионных</div>
    </div>
  `
}

function getFilteredCookies() {
  if (!query) return allCookies
  const q = query.toLowerCase().trim()
  return allCookies.filter(c =>
    (c.domain || '').toLowerCase().includes(q) ||
    (c.name || '').toLowerCase().includes(q)
  )
}

function groupByDomain(items) {
  const map = new Map()
  for (const c of items) {
    if (!map.has(c.domain)) map.set(c.domain, [])
    map.get(c.domain).push(c)
  }
  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
}

function render() {
  renderStats()

  const filtered = getFilteredCookies()

  if (filtered.length === 0) {
    const isEmpty = allCookies.length === 0
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${query ? '🔍' : '🍪'}</div>
        <div class="empty-title">${query ? 'Ничего не найдено' : (isEmpty ? 'Cookie нет' : 'Список пуст')}</div>
        <div class="empty-subtitle">${
          query
            ? 'Попробуйте изменить поисковый запрос.'
            : 'Здесь появятся cookie, которые сайты сохранили на вашем устройстве.'
        }</div>
      </div>`
    return
  }

  const groups = groupByDomain(filtered)
  content.innerHTML = ''

  for (const [domain, items] of groups) {
    content.appendChild(createDomainGroup(domain, items))
  }
}

function createDomainGroup(domain, items) {
  const el = document.createElement('div')
  el.className = 'domain-group'
  el.dataset.domain = domain

  const header = document.createElement('div')
  header.className = 'domain-header'
  header.innerHTML = `
    ${ICON_CHEVRON}
    <span class="domain-name">${escapeHtml(domain)}</span>
    <span class="domain-count">${items.length}</span>
    <button class="domain-delete" title="Удалить все cookie для этого домена">
      ${ICON_TRASH}
    </button>
  `
  el.appendChild(header)

  const list = document.createElement('div')
  list.className = 'domain-list'
  for (const c of items) list.appendChild(createCookieItem(c))
  el.appendChild(list)

  header.addEventListener('click', (e) => {
    if (e.target.closest('.domain-delete')) return
    el.classList.toggle('expanded')
  })

  header.querySelector('.domain-delete').addEventListener('click', async (e) => {
    e.stopPropagation()
    const ok = await confirmAction(
      'Удалить cookie домена?',
      `Все cookie для «${domain}» (${items.length} шт.) будут удалены. Это может разлогинить вас на этом сайте.`
    )
    if (!ok) return
    await window.browserAPI.removeCookiesByDomain(domain)
    await reloadCookies()
  })

  return el
}

function createCookieItem(cookie) {
  const el = document.createElement('div')
  el.className = 'cookie-item'

  const secureBadge = cookie.secure
    ? `<span class="badge badge-secure">Secure</span>`
    : `<span class="badge badge-http">HTTP</span>`
  const httpOnlyBadge = cookie.httpOnly ? `<span class="badge badge-flag">HttpOnly</span>` : ''
  const sessionBadge = cookie.session ? `<span class="badge badge-session">Session</span>` : ''
  const expiresText = formatExpires(cookie.expirationDate)
  const sameSiteLabel = getSameSiteLabel(cookie.sameSite)

  el.innerHTML = `
    <div class="cookie-body">
      <div class="cookie-name">${escapeHtml(cookie.name)}</div>
      <div class="cookie-meta">
        ${secureBadge}
        ${httpOnlyBadge}
        ${sessionBadge}
        <span>${escapeHtml(cookie.path || '/')}</span>
        <span>·</span>
        <span>SameSite: ${escapeHtml(sameSiteLabel)}</span>
        <span>·</span>
        <span>${escapeHtml(expiresText)}</span>
      </div>
      <div class="cookie-value">${escapeHtml(cookie.value || '(пусто)')}</div>
    </div>
    <div class="cookie-actions">
      <button class="item-btn" data-action="reveal" title="Показать/скрыть значение">${ICON_EYE}</button>
      <button class="item-btn danger" data-action="delete" title="Удалить cookie">${ICON_TRASH_SMALL}</button>
    </div>
  `

  el.querySelector('[data-action="reveal"]').addEventListener('click', (e) => {
    e.stopPropagation()
    el.classList.toggle('revealed')
  })

  el.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
    e.stopPropagation()
    await window.browserAPI.removeCookie({
      domain: cookie.domain,
      path: cookie.path,
      name: cookie.name,
      secure: cookie.secure,
    })
    await reloadCookies()
  })

  return el
}

function confirmAction(title, text) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title
    confirmText.textContent = text
    confirmModal.classList.add('visible')
    confirmResolve = resolve
  })
}

function closeConfirm(result) {
  confirmModal.classList.remove('visible')
  if (confirmResolve) {
    const r = confirmResolve
    confirmResolve = null
    r(result)
  }
}

confirmCancel.addEventListener('click', () => closeConfirm(false))
confirmOk.addEventListener('click', () => closeConfirm(true))
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirm(false) })

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && confirmModal.classList.contains('visible')) closeConfirm(false)
})

async function reloadCookies() {
  allCookies = await window.browserAPI.getCookies() || []
  render()
}

searchInput.addEventListener('input', () => {
  query = searchInput.value
  render()
})

btnClearAll.addEventListener('click', async () => {
  if (allCookies.length === 0) return
  const ok = await confirmAction(
    'Удалить все cookie?',
    `Все cookie (${allCookies.length} шт.) будут удалены со всех сайтов. Вы выйдете из всех аккаунтов.`
  )
  if (!ok) return
  await window.browserAPI.clearAllCookies()
  await reloadCookies()
})

reloadCookies()

// Тема и акцент: см. shared/theme.js