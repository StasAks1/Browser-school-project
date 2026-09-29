const titleEl = document.getElementById('title')
const siteNameEl = document.getElementById('site-name')
const metaEl = document.getElementById('meta')
const bodyEl = document.getElementById('body')
const readingTimeEl = document.getElementById('reading-time')
const emptyEl = document.getElementById('empty')
const emptySubtitleEl = document.getElementById('empty-subtitle')
const btnBack = document.getElementById('btn-back')
const emptyBack = document.getElementById('empty-back')

// ============ Утилиты ============
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

function sanitizeArticleHtml(html) {
  const div = document.createElement('div')
  div.innerHTML = html

  // Удаляем опасные элементы
  div.querySelectorAll('script, iframe, object, embed, form, input, button, textarea, select, link, meta, style').forEach((el) => {
    el.remove()
  })

  // Удаляем обработчики событий и опасные атрибуты
  div.querySelectorAll('*').forEach((el) => {
    const attrs = Array.from(el.attributes || [])
    for (const attr of attrs) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
        continue
      }
      if (name === 'srcdoc' || name === 'formaction' || name === 'xlink:href') {
        el.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  })

  return div.innerHTML
}

function estimateReadingTime(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(words / 220))
  return minutes
}

// ============ Рендер ============
function renderArticle(article) {
  emptyEl.hidden = true
  document.querySelector('.reader-content').hidden = false

  titleEl.textContent = article.title || 'Без названия'

  if (article.siteName) {
    siteNameEl.textContent = article.siteName
  } else {
    siteNameEl.style.display = 'none'
  }

  // Мета: byline + длина
  const metaParts = []
  if (article.byline) {
    const strong = document.createElement('strong')
    strong.textContent = article.byline
    metaParts.push(strong.outerHTML)
  }
  if (article.length) {
    metaParts.push(`${article.length.toLocaleString('ru-RU')} символов`)
  }

  if (metaParts.length) {
    metaEl.innerHTML = metaParts.join('<span class="meta-dot"></span>')
  } else {
    metaEl.style.display = 'none'
  }

  // Тело
  bodyEl.innerHTML = sanitizeArticleHtml(article.content || '')

  // Время чтения
  const minutes = estimateReadingTime(article.textContent || bodyEl.textContent)
  readingTimeEl.textContent = `Время чтения: около ${minutes} мин.`

  // Скролл наверх
  window.scrollTo(0, 0)
}

function renderEmpty(message) {
  emptyEl.hidden = false
  document.querySelector('.reader-content').hidden = true
  emptySubtitleEl.textContent = message || 'Не удалось извлечь содержимое страницы.'
}

// ============ Кнопки ============
btnBack.addEventListener('click', () => {
  window.browserAPI.exitReaderMode()
})

emptyBack.addEventListener('click', () => {
  window.browserAPI.exitReaderMode()
})

// ============ Управление шрифтом ============
const fontSizeButtons = document.querySelectorAll('.font-btn')

function applyFontSize(size) {
  const allowed = ['small', 'medium', 'large', 'xlarge']
  const value = allowed.includes(size) ? size : 'medium'
  document.documentElement.dataset.fontSize = value
  try { localStorage.setItem('reader:font-size', value) } catch (e) {}
  fontSizeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.size === value)
  })
}

fontSizeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    applyFontSize(btn.dataset.size)
  })
})

// Инициализация активной кнопки
applyFontSize(document.documentElement.dataset.fontSize || 'medium')

// ============ Загрузка статьи ============
async function loadArticle() {
  try {
    const article = await window.browserAPI.getReaderContent()
    if (!article) {
      renderEmpty('Не удалось получить содержимое статьи.')
      return
    }
    renderArticle(article)
  } catch (err) {
    console.error('[reader]', err)
    renderEmpty('Ошибка при загрузке статьи.')
  }
}

loadArticle()

/* эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго */