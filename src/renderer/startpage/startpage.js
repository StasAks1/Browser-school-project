// ============ Поисковая строка ============
const form = document.getElementById('search-form')
const input = document.getElementById('search-input')
const suggestionsBox = document.getElementById('suggestions')

let debounceTimer = null
let currentSuggestions = []
let selectedIndex = -1
let requestToken = 0

function hideSuggestions() {
  suggestionsBox.classList.remove('visible')
  suggestionsBox.innerHTML = ''
  currentSuggestions = []
  selectedIndex = -1
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function renderSuggestions(items) {
  if (!items.length) { hideSuggestions(); return }
  suggestionsBox.innerHTML = items
    .map((text, i) => `<div class="suggestion" data-index="${i}">${escapeHtml(text)}</div>`)
    .join('')
  suggestionsBox.classList.add('visible')
}

suggestionsBox.addEventListener('click', (e) => {
  const el = e.target.closest('.suggestion')
  if (!el) return
  input.value = currentSuggestions[Number(el.dataset.index)]
  hideSuggestions()
  form.requestSubmit()
})

input.addEventListener('input', () => {
  const query = input.value.trim()
  clearTimeout(debounceTimer)
  if (query.length < 2) { hideSuggestions(); return }

  debounceTimer = setTimeout(async () => {
    const token = ++requestToken
    try {
      const items = await window.browserAPI.getSuggestions(query)
      if (token !== requestToken) return
      currentSuggestions = items
      renderSuggestions(items)
    } catch (err) {
      console.error('[UI] Ошибка подсказок:', err)
    }
  }, 120)
})

input.addEventListener('keydown', (e) => {
  if (!currentSuggestions.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1)
    updateSelection()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex = Math.max(selectedIndex - 1, -1)
    updateSelection()
  } else if (e.key === 'Escape') {
    hideSuggestions()
  }
})

function updateSelection() {
  const items = suggestionsBox.querySelectorAll('.suggestion')
  items.forEach((el, i) => el.classList.toggle('selected', i === selectedIndex))
  if (selectedIndex >= 0) input.value = currentSuggestions[selectedIndex]
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  const query = input.value.trim()
  if (!query) return
  hideSuggestions()
  const url = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
  window.browserAPI.navigate(url)
})

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-form')) hideSuggestions()
})

// ============ Кнопка приватного режима ============
const btnPrivate = document.getElementById('btn-private')

btnPrivate.addEventListener('click', async () => {
  try {
    await window.browserAPI.createPrivateTab()
  } catch (err) {
    console.error('[UI] Не удалось открыть приватную вкладку:', err)
  }
})

// ============ Ярлыки пользователя ============
const STORAGE_KEY = 'browser-project:shortcuts'

const shortcutsContainer = document.getElementById('shortcuts')
const modal = document.getElementById('add-modal')
const addForm = document.getElementById('add-form')
const addTitle = document.getElementById('add-title')
const addUrl = document.getElementById('add-url')
const addCancel = document.getElementById('add-cancel')
const modalTitle = document.getElementById('modal-title')
const modalSubmit = document.getElementById('modal-submit')

let editingIndex = -1

function loadShortcuts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveShortcuts(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function getDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url)
    return u.hostname
  } catch { return null }
}

function getFaviconUrl(url) {
  const domain = getDomain(url)
  if (!domain) return null
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`
}

// ============ Drag & drop ярлыков ============
let dragSourceIndex = -1
let dragOverIndex = -1
let dragOverPosition = null // 'before' | 'after'

function clearDragIndicators() {
  shortcutsContainer.querySelectorAll('.shortcut').forEach((el) => {
    el.classList.remove('dragging', 'drag-over-left', 'drag-over-right')
  })
}

function renderShortcuts() {
  const items = loadShortcuts()
  shortcutsContainer.innerHTML = ''

  items.forEach((item, index) => {
    const tile = document.createElement('div')
    tile.className = 'shortcut'
    tile.title = item.url
    tile.dataset.index = String(index)
    tile.draggable = true

    const favicon = getFaviconUrl(item.url)
    const initial = (item.title[0] || '?').toUpperCase()

    tile.innerHTML = `
      <div class="shortcut-icon">
        ${favicon
          ? `<img src="${favicon}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${escapeHtml(initial)}'">`
          : escapeHtml(initial)}
      </div>
      <span class="shortcut-title">${escapeHtml(item.title)}</span>
    `

    tile.addEventListener('click', (e) => {
      // Cmd/Ctrl+клик — открыть в новой вкладке
      if (e.metaKey || e.ctrlKey) {
        window.browserAPI.createTab(item.url)
        return
      }
      window.browserAPI.navigate(item.url)
    })

    // Средняя кнопка мыши — открыть в новой вкладке
    tile.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault()
        window.browserAPI.createTab(item.url)
      }
    })

    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      openShortcutMenu(index, e.clientX, e.clientY)
    })

    // ============ Drag & drop ============
    tile.addEventListener('dragstart', (e) => {
      dragSourceIndex = index
      tile.classList.add('dragging')
      try {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
      } catch {}
    })

    tile.addEventListener('dragover', (e) => {
      if (dragSourceIndex < 0) return
      if (index === dragSourceIndex) return

      e.preventDefault()
      try { e.dataTransfer.dropEffect = 'move' } catch {}

      const rect = tile.getBoundingClientRect()
      const isAfter = e.clientX > rect.left + rect.width / 2

      shortcutsContainer.querySelectorAll('.shortcut').forEach((x) => {
        if (x !== tile) x.classList.remove('drag-over-left', 'drag-over-right')
      })

      tile.classList.toggle('drag-over-left', !isAfter)
      tile.classList.toggle('drag-over-right', isAfter)

      dragOverIndex = index
      dragOverPosition = isAfter ? 'after' : 'before'
    })

    tile.addEventListener('dragleave', (e) => {
      if (e.target !== tile) return
      tile.classList.remove('drag-over-left', 'drag-over-right')
    })

    tile.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()

      if (dragSourceIndex < 0 || dragOverIndex < 0) return
      if (dragSourceIndex === dragOverIndex) {
        clearDragIndicators()
        dragSourceIndex = -1
        dragOverIndex = -1
        return
      }

      const items = loadShortcuts()
      const [moved] = items.splice(dragSourceIndex, 1)
      let insertIdx = dragOverIndex
      if (dragSourceIndex < dragOverIndex) insertIdx--
      if (dragOverPosition === 'after') insertIdx++
      items.splice(insertIdx, 0, moved)

      saveShortcuts(items)
      renderShortcuts()

      dragSourceIndex = -1
      dragOverIndex = -1
      dragOverPosition = null
    })

    tile.addEventListener('dragend', () => {
      dragSourceIndex = -1
      dragOverIndex = -1
      dragOverPosition = null
      clearDragIndicators()
    })

    shortcutsContainer.appendChild(tile)
  })

  const addTile = document.createElement('div')
  addTile.className = 'shortcut add-tile'
  addTile.title = 'Добавить ярлык'
  addTile.innerHTML = `
    <div class="shortcut-icon">+</div>
    <span class="shortcut-title">Добавить</span>
  `
  addTile.addEventListener('click', () => openModal('add'))
  shortcutsContainer.appendChild(addTile)
}

// ============ Контекстное меню ярлыка ============
let contextTargetIndex = -1

function openShortcutMenu(index, x, y) {
  closeShortcutMenu()
  contextTargetIndex = index

  const menu = document.createElement('div')
  menu.className = 'shortcut-menu'
  menu.innerHTML = `
    <button data-action="edit">Редактировать</button>
    <div class="sep"></div>
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

  menu.querySelector('[data-action="edit"]').addEventListener('click', () => {
    closeShortcutMenu()
    openModal('edit', index)
  })

  menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
    closeShortcutMenu()
    const items = loadShortcuts()
    items.splice(index, 1)
    saveShortcuts(items)
    renderShortcuts()
  })

  setTimeout(() => document.addEventListener('mousedown', outsideShortcutMenu), 0)
}

function closeShortcutMenu() {
  document.querySelectorAll('.shortcut-menu').forEach(el => el.remove())
  document.removeEventListener('mousedown', outsideShortcutMenu)
}

function outsideShortcutMenu(e) {
  if (!e.target.closest('.shortcut-menu')) closeShortcutMenu()
}

// ============ Модалка ярлыка ============
function openModal(mode, index = -1) {
  editingIndex = mode === 'edit' ? index : -1

  if (mode === 'edit') {
    const items = loadShortcuts()
    const item = items[index]
    if (!item) return
    modalTitle.textContent = 'Редактировать ярлык'
    modalSubmit.textContent = 'Сохранить'
    addTitle.value = item.title
    addUrl.value = item.url
  } else {
    modalTitle.textContent = 'Новый ярлык'
    modalSubmit.textContent = 'Добавить'
    addTitle.value = ''
    addUrl.value = ''
  }

  modal.classList.add('visible')
  setTimeout(() => addTitle.focus(), 50)
}

function closeModal() {
  modal.classList.remove('visible')
  editingIndex = -1
}

addCancel.addEventListener('click', closeModal)
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('visible')) closeModal()
})

addForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const title = addTitle.value.trim()
  let url = addUrl.value.trim()
  if (!title || !url) return

  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  const items = loadShortcuts()
  if (editingIndex >= 0) {
    items[editingIndex] = { title, url }
  } else {
    items.push({ title, url })
  }

  saveShortcuts(items)
  renderShortcuts()
  closeModal()
})

// ============ Первичный рендер ============
renderShortcuts()