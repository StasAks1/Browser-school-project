// ========== Поисковая строка ==========
const form = document.getElementById('search-form')
const input = document.getElementById('search-input')
const suggestionsBox = document.getElementById('suggestions')

let debounceTimer = null
let currentSuggestions = []
let selectedIndex = -1

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

input.addEventListener('input', () => {
  const query = input.value.trim()
  clearTimeout(debounceTimer)
  if (query.length < 2) { hideSuggestions(); return }
  debounceTimer = setTimeout(async () => {
    try {
      const items = await window.browserAPI.getSuggestions(query)
      currentSuggestions = items
      renderSuggestions(items)
    } catch (err) { console.error(err) }
  }, 250)
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

suggestionsBox.addEventListener('click', (e) => {
  const el = e.target.closest('.suggestion')
  if (!el) return
  input.value = currentSuggestions[Number(el.dataset.index)]
  hideSuggestions()
  form.requestSubmit()
})

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

// ========== Ярлыки ==========
const STORAGE_KEY = 'browser-project:shortcuts'

const shortcutsContainer = document.getElementById('shortcuts')
const modal = document.getElementById('add-modal')
const addForm = document.getElementById('add-form')
const addTitle = document.getElementById('add-title')
const addUrl = document.getElementById('add-url')
const addCancel = document.getElementById('add-cancel')
const modalTitle = document.getElementById('modal-title')
const modalSubmit = document.getElementById('modal-submit')

let editingIndex = -1 // -1 = добавление, >=0 = редактирование
let activeDropdown = null // текущее открытое выпадающее меню

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
  } catch {
    return null
  }
}

function getFaviconUrl(url) {
  const domain = getDomain(url)
  if (!domain) return null
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`
}

// SVG иконка трёх точек
const DOTS_ICON = `
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="2"/>
    <circle cx="12" cy="12" r="2"/>
    <circle cx="12" cy="19" r="2"/>
  </svg>
`

// SVG иконки меню
const EDIT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
`

const DELETE_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    <line x1="10" y1="11" x2="10" y2="17"/>
    <line x1="14" y1="11" x2="14" y2="17"/>
  </svg>
`

function renderShortcuts() {
  const items = loadShortcuts()
  shortcutsContainer.innerHTML = ''

  items.forEach((item, index) => {
    const tile = document.createElement('div')
    tile.className = 'shortcut'
    tile.title = item.url
    tile.dataset.index = String(index)

    const favicon = getFaviconUrl(item.url)
    const initial = (item.title[0] || '?').toUpperCase()

    tile.innerHTML = `
      <button class="tile-menu-btn" data-menu-btn title="Действия">${DOTS_ICON}</button>
      <div class="shortcut-icon">
        ${favicon
          ? `<img src="${favicon}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${escapeHtml(initial)}'">`
          : escapeHtml(initial)}
      </div>
      <span class="shortcut-title">${escapeHtml(item.title)}</span>
    `

    // Переход по клику на плитку (кроме кнопки меню)
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.tile-menu-btn')) return
      if (activeDropdown) return
      window.browserAPI.navigate(item.url)
    })

    // Клик по кнопке с тремя точками
    const menuBtn = tile.querySelector('.tile-menu-btn')
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()

      // Если это меню уже открыто — закрываем
      if (activeDropdown && activeDropdown.dataset.tileIndex === String(index)) {
        closeDropdown()
        return
      }

      openDropdown(menuBtn, index)
    })

    shortcutsContainer.appendChild(tile)
  })

  // Плитка «+»
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

// ========== Выпадающее меню ==========
function openDropdown(anchorEl, index) {
  closeDropdown()

  const menu = document.createElement('div')
  menu.className = 'tile-dropdown'
  menu.dataset.tileIndex = String(index)

  menu.innerHTML = `
    <button class="tile-dropdown-item" data-action="edit">
      ${EDIT_ICON}
      <span>Редактировать</span>
    </button>
    <div class="tile-dropdown-separator"></div>
    <button class="tile-dropdown-item danger" data-action="delete">
      ${DELETE_ICON}
      <span>Удалить</span>
    </button>
  `

  document.body.appendChild(menu)
  activeDropdown = menu

  // Позиционируем меню под кнопкой
  const rect = anchorEl.getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()
  const padding = 8

  let left = rect.right - menuRect.width
  let top = rect.bottom + 4

  // Если выходит за правый край — прижимаем к правому
  if (left + menuRect.width + padding > window.innerWidth) {
    left = window.innerWidth - menuRect.width - padding
  }
  if (left < padding) left = padding

  // Если выходит за нижний край — открываем вверх
  if (top + menuRect.height + padding > window.innerHeight) {
    top = rect.top - menuRect.height - 4
  }

  menu.style.left = `${left}px`
  menu.style.top = `${top}px`

  // Помечаем кнопку как активную
  anchorEl.classList.add('active')

  // Обработчик клика по пункту меню
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.tile-dropdown-item')
    if (!btn) return
    const action = btn.dataset.action
    const targetIndex = Number(menu.dataset.tileIndex)

    closeDropdown()

    if (action === 'edit') {
      openModal('edit', targetIndex)
    } else if (action === 'delete') {
      const items = loadShortcuts()
      if (!items[targetIndex]) return
      items.splice(targetIndex, 1)
      saveShortcuts(items)
      renderShortcuts()
    }
  })
}

function closeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove()
    activeDropdown = null
  }
  // Снимаем активный класс со всех кнопок
  document.querySelectorAll('.tile-menu-btn.active').forEach((el) => {
    el.classList.remove('active')
  })
}

// Закрываем меню при клике вне
document.addEventListener('click', (e) => {
  if (activeDropdown && !e.target.closest('.tile-dropdown') && !e.target.closest('.tile-menu-btn')) {
    closeDropdown()
  }
})

// Закрываем по Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeDropdown) {
    closeDropdown()
  }
})

// Закрываем при скролле/ресайзе
window.addEventListener('scroll', closeDropdown, { passive: true })
window.addEventListener('resize', closeDropdown)
window.addEventListener('blur', closeDropdown)

// ========== Модальное окно ==========
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

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal()
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('visible')) closeModal()
})

addForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const title = addTitle.value.trim()
  let url = addUrl.value.trim()
  if (!title || !url) return

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
  }

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

// Первичный рендер
renderShortcuts()