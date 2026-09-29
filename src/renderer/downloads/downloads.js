const content = document.getElementById('content')
const searchInput = document.getElementById('search-input')
const btnClearAll = document.getElementById('btn-clear-all')

let allDownloads = []
let query = ''

// ============ Иконки по типу файла ============
const ICON_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`
const ICON_IMAGE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`
const ICON_VIDEO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`
const ICON_AUDIO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
const ICON_ARCHIVE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>`
const ICON_PDF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3z"/><path d="M15 13v4"/></svg>`
const ICON_DOC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/></svg>`
const ICON_CODE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`
const ICON_APP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`

const ICON_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>`
const ICON_FOLDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`
const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
const ICON_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`

function getFileType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) return 'audio'
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return 'archive'
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx', 'txt', 'rtf', 'odt', 'pages'].includes(ext)) return 'doc'
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'sh'].includes(ext)) return 'code'
  if (['dmg', 'app', 'exe', 'msi', 'deb', 'rpm', 'appimage'].includes(ext)) return 'app'
  return 'file'
}

function getFileIcon(type) {
  switch (type) {
    case 'image': return ICON_IMAGE
    case 'video': return ICON_VIDEO
    case 'audio': return ICON_AUDIO
    case 'archive': return ICON_ARCHIVE
    case 'pdf': return ICON_PDF
    case 'doc': return ICON_DOC
    case 'code': return ICON_CODE
    case 'app': return ICON_APP
    default: return ICON_FILE
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '—'
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  let i = 0
  let value = bytes
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
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

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function getStatusText(entry) {
  switch (entry.state) {
    case 'progressing': {
      if (entry.totalBytes > 0) {
        const percent = Math.round((entry.receivedBytes / entry.totalBytes) * 100)
        return `${percent}% · ${formatBytes(entry.receivedBytes)} из ${formatBytes(entry.totalBytes)}`
      }
      return formatBytes(entry.receivedBytes)
    }
    case 'paused': return 'Приостановлено'
    case 'completed': return formatBytes(entry.totalBytes || entry.receivedBytes)
    case 'cancelled': return 'Отменено'
    case 'interrupted': return 'Ошибка'
    default: return ''
  }
}

function filterDownloads(items) {
  if (!query) return items
  const q = query.toLowerCase().trim()
  return items.filter(d =>
    (d.filename || '').toLowerCase().includes(q) ||
    (d.url || '').toLowerCase().includes(q)
  )
}

function groupByDate(items) {
  const groups = new Map()
  const sorted = [...items].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
  for (const d of sorted) {
    const key = getDateKey(d.startedAt || Date.now())
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(d)
  }
  return Array.from(groups.entries())
}

function render() {
  const filtered = filterDownloads(allDownloads)

  if (filtered.length === 0) {
    const isEmpty = allDownloads.length === 0
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${query ? '🔍' : '📥'}</div>
        <div class="empty-title">${query ? 'Ничего не найдено' : (isEmpty ? 'Загрузок пока нет' : 'Список пуст')}</div>
        <div class="empty-subtitle">${
          query
            ? 'Попробуйте изменить поисковый запрос.'
            : 'Файлы, которые вы скачиваете из браузера, будут появляться здесь.'
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
  el.className = `download-item state-${entry.state}`
  el.dataset.id = entry.id

  const type = getFileType(entry.filename || '')
  const icon = getFileIcon(type)
  const status = getStatusText(entry)
  const domain = getDomain(entry.url)

  let percent = 0
  if (entry.state === 'progressing' && entry.totalBytes > 0) {
    percent = Math.min(100, Math.round((entry.receivedBytes / entry.totalBytes) * 100))
  } else if (entry.state === 'completed') {
    percent = 100
  }

  let actionsHtml = ''
  if (entry.state === 'completed') {
    actionsHtml = `
      <button class="item-btn" data-action="open" title="Открыть файл">${ICON_OPEN}</button>
      <button class="item-btn" data-action="folder" title="Показать в папке">${ICON_FOLDER}</button>
      <button class="item-btn danger" data-action="delete" title="Удалить файл">${ICON_TRASH}</button>
    `
  } else if (entry.state === 'progressing' || entry.state === 'paused') {
    actionsHtml = `
      <button class="item-btn" data-action="copy" title="Копировать ссылку">${ICON_COPY}</button>
      <button class="item-btn danger" data-action="cancel" title="Отменить загрузку">${ICON_X}</button>
    `
  } else {
    actionsHtml = `
      <button class="item-btn" data-action="copy" title="Копировать ссылку">${ICON_COPY}</button>
      <button class="item-btn danger" data-action="remove" title="Удалить из списка">${ICON_X}</button>
    `
  }

  el.innerHTML = `
    <div class="download-icon type-${type}">${icon}</div>
    <div class="download-body">
      <div class="download-name" title="${escapeHtml(entry.filename)}">${escapeHtml(entry.filename)}</div>
      <div class="download-meta">
        <span>${formatTime(entry.startedAt)}</span>
        ${domain ? `<span class="meta-dot"></span><span>${escapeHtml(domain)}</span>` : ''}
      </div>
      ${entry.state === 'progressing' ? `
        <div class="download-progress">
          <div class="download-progress-fill" style="width: ${percent}%"></div>
        </div>
      ` : ''}
    </div>
    <div class="download-status">${escapeHtml(status)}</div>
    <div class="download-actions">${actionsHtml}</div>
  `

  el.querySelectorAll('.item-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const action = btn.dataset.action

      if (action === 'open') {
        const res = await window.browserAPI.openDownloadedFile(entry.id)
        if (!res.ok) showToast(res.error || 'Не удалось открыть файл')
      } else if (action === 'folder') {
        const res = await window.browserAPI.showDownloadedInFolder(entry.id)
        if (!res.ok) showToast(res.error || 'Не удалось открыть папку')
      } else if (action === 'delete') {
        if (!confirm(`Удалить файл «${entry.filename}» с диска? Это действие нельзя отменить.`)) return
        const res = await window.browserAPI.deleteDownloadedFile(entry.id)
        if (res.ok) showToast('Файл удалён')
        else showToast(res.error || 'Не удалось удалить файл')
      } else if (action === 'cancel') {
        await window.browserAPI.removeDownloadEntry(entry.id)
      } else if (action === 'remove') {
        await window.browserAPI.removeDownloadEntry(entry.id)
      } else if (action === 'copy') {
        try {
          await navigator.clipboard.writeText(entry.url)
          showToast('Ссылка скопирована')
        } catch (err) {
          showToast('Не удалось скопировать')
        }
      }
    })
  })

  return el
}

let toastTimeout = null
function showToast(message) {
  let toast = document.querySelector('.toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.className = 'toast'
    document.body.appendChild(toast)
  }
  toast.textContent = message
  toast.classList.add('visible')

  clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => {
    toast.classList.remove('visible')
  }, 2000)
}

searchInput.addEventListener('input', () => {
  query = searchInput.value
  render()
})

btnClearAll.addEventListener('click', async () => {
  const completed = allDownloads.filter(d => d.state !== 'progressing' && d.state !== 'paused')
  if (completed.length === 0) {
    showToast('Нечего очищать')
    return
  }
  if (!confirm('Очистить список завершённых загрузок? Активные загрузки останутся.')) return
  await window.browserAPI.clearDownloadsList()
  showToast('Список очищен')
})

window.browserAPI.onDownloadsUpdated((list) => {
  allDownloads = list || []
  render()
})

window.browserAPI.getDownloads().then((list) => {
  allDownloads = list || []
  render()
})

// Тема и акцент: см. shared/theme.js
//эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго