const searchInput = document.getElementById('search-input')
const sidebarNav = document.getElementById('sidebar-nav')
const content = document.getElementById('content')
const btnNewFolder = document.getElementById('btn-new-folder')
const btnImport = document.getElementById('btn-import')
const btnExport = document.getElementById('btn-export')
const toastEl = document.getElementById('toast')

const editModal = document.getElementById('edit-modal')
const editForm = document.getElementById('edit-form')
const editTitle = document.getElementById('edit-title')
const editUrl = document.getElementById('edit-url')
const editCancel = document.getElementById('edit-cancel')

const folderModal = document.getElementById('folder-modal')
const folderModalTitle = document.getElementById('folder-modal-title')
const folderForm = document.getElementById('folder-form')
const folderName = document.getElementById('folder-name')
const folderCancel = document.getElementById('folder-cancel')
const folderSubmit = document.getElementById('folder-submit')

const moveModal = document.getElementById('move-modal')
const moveList = document.getElementById('move-list')
const moveCancel = document.getElementById('move-cancel')

let library = { bookmarks: [], folders: [] }
let selectedId = 'all'
let query = ''
let editingBookmarkId = null
let editingFolderId = null
let movingBookmarkId = null

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
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

function getFaviconUrl(bm) {
  if (bm.favicon) return bm.favicon
  const domain = getDomain(bm.url)
  if (!domain) return null
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`
}

// ============ Toast ============
let toastTimer = null
function showToast(message) {
  toastEl.textContent = message
  toastEl.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2800)
}

const ICON_ALL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
const ICON_FOLDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`
const ICON_INBOX = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`
const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`
const ICON_MOVE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M12 11v6M9 14l3 3 3-3"/></svg>`
const ICON_DELETE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
const ICON_MORE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`

function renderSidebar() {
  const bookmarks = library.bookmarks || []
  const folders = library.folders || []
  const allCount = bookmarks.length
  const noFolderCount = bookmarks.filter(b => !b.folderId).length

  let html = `
    <div class="sidebar-item${selectedId === 'all' ? ' active' : ''}" data-id="all">
      <div class="sidebar-item-icon">${ICON_ALL}</div>
      <span class="sidebar-item-name">Все закладки</span>
      <span class="sidebar-item-count">${allCount}</span>
    </div>
    <div class="sidebar-item${selectedId === 'none' ? ' active' : ''}" data-id="none">
      <div class="sidebar-item-icon">${ICON_INBOX}</div>
      <span class="sidebar-item-name">Без папки</span>
      <span class="sidebar-item-count">${noFolderCount}</span>
    </div>
    <div style="height:8px;"></div>
  `

  for (const f of folders) {
    const count = bookmarks.filter(b => b.folderId === f.id).length
    html += `
      <div class="sidebar-item${selectedId === f.id ? ' active' : ''}" data-id="${escapeHtml(f.id)}">
        <div class="sidebar-item-icon">${ICON_FOLDER}</div>
        <span class="sidebar-item-name">${escapeHtml(f.name)}</span>
        <span class="sidebar-item-count">${count}</span>
        <button class="sidebar-item-menu-btn" data-folder-menu="${escapeHtml(f.id)}" title="Действия">
          ${ICON_MORE}
        </button>
      </div>
    `
  }

  sidebarNav.innerHTML = html

  sidebarNav.querySelectorAll('.sidebar-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.sidebar-item-menu-btn')) return
      selectedId = el.dataset.id
      renderSidebar()
      renderContent()
    })
  })

  sidebarNav.querySelectorAll('[data-folder-menu]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      openFolderActions(btn.dataset.folderMenu, e.clientX, e.clientY)
    })
  })
}

function getVisibleBookmarks() {
  const bookmarks = library.bookmarks || []
  let items = bookmarks
  if (selectedId === 'none') items = bookmarks.filter(b => !b.folderId)
  else if (selectedId !== 'all') items = bookmarks.filter(b => b.folderId === selectedId)

  if (query) {
    const q = query.toLowerCase().trim()
    items = items.filter(b =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.url || '').toLowerCase().includes(q)
    )
  }
  return [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

function getContentTitle() {
  if (selectedId === 'all') return 'Все закладки'
  if (selectedId === 'none') return 'Без папки'
  const f = (library.folders || []).find(x => x.id === selectedId)
  return f ? f.name : 'Закладки'
}

function renderContent() {
  const items = getVisibleBookmarks()
  const title = getContentTitle()

  if (items.length === 0) {
    const isEmpty = (library.bookmarks || []).length === 0
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">${query ? '🔍' : (isEmpty ? '⭐' : '📂')}</div>
        <div class="empty-title">${
          query ? 'Ничего не найдено' :
          (isEmpty ? 'Пока нет закладок' : 'Здесь пусто')
        }</div>
        <div class="empty-subtitle">${
          query ? 'Попробуйте изменить поисковый запрос.' :
          (isEmpty ? 'Добавляйте страницы в закладки, нажимая на звёздочку в адресной строке. Или импортируйте HTML-файл из другого браузера.' :
          'Перетащите закладки в эту папку или создайте их заново.')
        }</div>
      </div>`
    return
  }

  content.innerHTML = `
    <div class="content-header">
      <div class="content-title">${escapeHtml(title)}</div>
      <div class="content-count">${items.length}</div>
    </div>
    <div id="cards-container"></div>
  `

  const container = document.getElementById('cards-container')
  for (const bm of items) container.appendChild(createCard(bm))
}

function createCard(bm) {
  const card = document.createElement('div')
  card.className = 'bookmark-card'
  card.dataset.id = bm.id

  const favicon = getFaviconUrl(bm)
  const initial = escapeHtml(getInitial(bm.title || bm.url))
  const faviconHtml = favicon
    ? `<img src="${escapeHtml(favicon)}" onerror="this.style.display='none';this.parentElement.innerHTML='<span>${initial}</span>'">`
    : `<span>${initial}</span>`

  let folderBadge = ''
  if (selectedId === 'all' && bm.folderId) {
    const folder = (library.folders || []).find(f => f.id === bm.folderId)
    if (folder) folderBadge = `<span class="card-folder-badge">${escapeHtml(folder.name)}</span>`
  }

  card.innerHTML = `
    <div class="card-favicon">${faviconHtml}</div>
    <div class="card-body">
      <div class="card-title">${escapeHtml(bm.title || bm.url)}${folderBadge}</div>
      <div class="card-url">${escapeHtml(bm.url)}</div>
    </div>
    <div class="card-actions">
      <button class="card-btn" data-action="edit" title="Редактировать">${ICON_EDIT}</button>
      <button class="card-btn" data-action="move" title="Переместить в папку">${ICON_MOVE}</button>
      <button class="card-btn danger" data-action="delete" title="Удалить">${ICON_DELETE}</button>
    </div>
  `

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-btn')) return
    window.browserAPI.navigate(bm.url)
  })

  card.addEventListener('auxclick', (e) => {
    if (e.button === 1) { e.preventDefault(); window.browserAPI.openBookmarkInNewTab(bm.id) }
  })

  card.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
    e.stopPropagation(); openEditModal(bm.id)
  })
  card.querySelector('[data-action="move"]').addEventListener('click', (e) => {
    e.stopPropagation(); openMoveModal(bm.id)
  })
  card.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
    e.stopPropagation()
    await window.browserAPI.removeBookmark(bm.id)
  })

  return card
}

function openEditModal(id) {
  const bm = (library.bookmarks || []).find(b => b.id === id)
  if (!bm) return
  editingBookmarkId = id
  editTitle.value = bm.title || ''
  editUrl.value = bm.url || ''
  editModal.classList.add('visible')
  setTimeout(() => { editTitle.focus(); editTitle.select() }, 30)
}

function closeEditModal() {
  editModal.classList.remove('visible')
  editingBookmarkId = null
}

editCancel.addEventListener('click', closeEditModal)
editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal() })

editForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!editingBookmarkId) return
  await window.browserAPI.updateBookmark({
    id: editingBookmarkId,
    title: editTitle.value,
    url: editUrl.value,
  })
  closeEditModal()
})

function openFolderCreateModal() {
  editingFolderId = null
  folderModalTitle.textContent = 'Новая папка'
  folderSubmit.textContent = 'Создать'
  folderName.value = ''
  folderModal.classList.add('visible')
  setTimeout(() => folderName.focus(), 30)
}

function openFolderRenameModal(id, currentName) {
  editingFolderId = id
  folderModalTitle.textContent = 'Переименовать папку'
  folderSubmit.textContent = 'Сохранить'
  folderName.value = currentName || ''
  folderModal.classList.add('visible')
  setTimeout(() => { folderName.focus(); folderName.select() }, 30)
}

function closeFolderModal() {
  folderModal.classList.remove('visible')
  editingFolderId = null
}

folderCancel.addEventListener('click', closeFolderModal)
folderModal.addEventListener('click', (e) => { if (e.target === folderModal) closeFolderModal() })

folderForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = folderName.value.trim()
  if (!name) return
  if (editingFolderId) await window.browserAPI.renameFolder({ id: editingFolderId, name })
  else await window.browserAPI.createFolder(name)
  closeFolderModal()
})

function openMoveModal(bookmarkId) {
  const bm = (library.bookmarks || []).find(b => b.id === bookmarkId)
  if (!bm) return
  movingBookmarkId = bookmarkId

  const folders = library.folders || []
  let html = `
    <div class="move-item${!bm.folderId ? ' selected' : ''}" data-folder="">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 12h-6l-2 3h-4l-2-3H2"/>
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
      </svg>
      <span class="move-item-name">Без папки</span>
    </div>
  `
  for (const f of folders) {
    html += `
      <div class="move-item${bm.folderId === f.id ? ' selected' : ''}" data-folder="${escapeHtml(f.id)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
        </svg>
        <span class="move-item-name">${escapeHtml(f.name)}</span>
      </div>
    `
  }

  moveList.innerHTML = html
  moveList.querySelectorAll('.move-item').forEach(el => {
    el.addEventListener('click', async () => {
      const folderId = el.dataset.folder || null
      await window.browserAPI.moveBookmark({ id: movingBookmarkId, folderId })
      closeMoveModal()
    })
  })
  moveModal.classList.add('visible')
}

function closeMoveModal() {
  moveModal.classList.remove('visible')
  movingBookmarkId = null
}

moveCancel.addEventListener('click', closeMoveModal)
moveModal.addEventListener('click', (e) => { if (e.target === moveModal) closeMoveModal() })

function openFolderActions(folderId, x, y) {
  closeFolderActions()
  const folder = (library.folders || []).find(f => f.id === folderId)
  if (!folder) return

  const menu = document.createElement('div')
  menu.className = 'folder-actions-menu'
  menu.innerHTML = `
    <button data-action="rename">Переименовать</button>
    <div class="separator"></div>
    <button data-action="delete" class="danger">Удалить</button>
  `
  menu.style.position = 'fixed'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  menu.style.zIndex = '2000'
  document.body.appendChild(menu)

  const rect = menu.getBoundingClientRect()
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`
  if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`

  menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
    closeFolderActions()
    openFolderRenameModal(folderId, folder.name)
  })
  menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    closeFolderActions()
    if (!confirm(`Удалить папку «${folder.name}»? Закладки из неё будут перемещены в «Без папки».`)) return
    await window.browserAPI.deleteFolder(folderId)
    if (selectedId === folderId) selectedId = 'all'
  })

  setTimeout(() => document.addEventListener('mousedown', outsideFolderActions), 0)
}

function closeFolderActions() {
  document.querySelectorAll('.folder-actions-menu').forEach(el => el.remove())
  document.removeEventListener('mousedown', outsideFolderActions)
}

function outsideFolderActions(e) {
  if (!e.target.closest('.folder-actions-menu')) closeFolderActions()
}

btnNewFolder.addEventListener('click', () => openFolderCreateModal())

searchInput.addEventListener('input', () => {
  query = searchInput.value
  renderContent()
})

// ============ Импорт/экспорт ============
btnExport.addEventListener('click', async () => {
  btnExport.disabled = true
  try {
    const res = await window.browserAPI.exportBookmarks()
    if (res.ok) {
      showToast(`Экспортировано: ${res.count} закладок`)
    } else if (res.canceled) {
      // отменено
    } else {
      showToast(res.error || 'Не удалось экспортировать')
    }
  } catch (err) {
    showToast('Ошибка экспорта')
  } finally {
    btnExport.disabled = false
  }
})

btnImport.addEventListener('click', async () => {
  btnImport.disabled = true
  try {
    const res = await window.browserAPI.importBookmarks()
    if (res.ok) {
      const parts = []
      if (res.imported.bookmarks > 0) parts.push(`${res.imported.bookmarks} закладок`)
      if (res.imported.folders > 0) parts.push(`${res.imported.folders} папок`)
      let msg = parts.length ? `Импортировано: ${parts.join(', ')}` : 'Ничего не импортировано'
      if (res.skipped > 0) msg += ` (пропущено ${res.skipped} дубликатов)`
      showToast(msg)
    } else if (res.canceled) {
      // отменено
    } else {
      showToast(res.error || 'Не удалось импортировать')
    }
  } catch (err) {
    showToast('Ошибка импорта')
  } finally {
    btnImport.disabled = false
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (editModal.classList.contains('visible')) closeEditModal()
    if (folderModal.classList.contains('visible')) closeFolderModal()
    if (moveModal.classList.contains('visible')) closeMoveModal()
    closeFolderActions()
  }
})

window.browserAPI.onLibraryUpdated((payload) => {
  library = payload || { bookmarks: [], folders: [] }
  renderSidebar()
  renderContent()
})

window.browserAPI.getLibrary().then((data) => {
  library = data || { bookmarks: [], folders: [] }
  renderSidebar()
  renderContent()
})

// Тема и акцент: см. shared/theme.js