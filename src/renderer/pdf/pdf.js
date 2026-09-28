import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// ============ DOM ============
const container = document.getElementById('container')
const sidebar = document.getElementById('sidebar')
const thumbsContainer = document.getElementById('thumbs')
const loadingEl = document.getElementById('loading')
const errorEl = document.getElementById('error')
const pageIndicator = document.getElementById('page-indicator')
const zoomIndicator = document.getElementById('zoom-indicator')

const btnPrev = document.getElementById('btn-prev')
const btnNext = document.getElementById('btn-next')
const btnZoomIn = document.getElementById('btn-zoom-in')
const btnZoomOut = document.getElementById('btn-zoom-out')
const btnZoomFit = document.getElementById('btn-zoom-fit')
const btnRotate = document.getElementById('btn-rotate')
const btnSidebar = document.getElementById('btn-sidebar')
const btnSearch = document.getElementById('btn-search')

const findbar = document.getElementById('findbar')
const findInput = document.getElementById('find-input')
const findCounter = document.getElementById('find-counter')
const findPrev = document.getElementById('find-prev')
const findNext = document.getElementById('find-next')
const findClose = document.getElementById('find-close')

// ============ State ============
let pdfDoc = null
let scale = 1.0
let rotation = 0            // 0 / 90 / 180 / 270
let currentPage = 1
let totalPages = 0
let userAdjustedZoom = false

// pageNum -> { element, rendered, renderTask, viewport, textLayerTask, textLayerElement }
const pageStates = new Map()
// pageNum -> { element, rendered, renderTask }  (для миниатюр)
const thumbStates = new Map()

let observer = null
let thumbObserver = null

// Прогресс по хэшу файла
let pdfMeta = { name: '', path: '' }
let progressKey = ''
let saveTimer = null
let initialScrollDone = false

// Поиск
let findState = {
  query: '',
  matches: [],          // [{ pageNum, spanEl }]
  currentIndex: -1,
}

// ============ Утилиты ============
function showError(msg) {
  loadingEl.hidden = true
  errorEl.textContent = msg
  errorEl.hidden = false
}

function updateIndicators() {
  pageIndicator.textContent = totalPages ? `${currentPage} / ${totalPages}` : '— / —'
  zoomIndicator.textContent = `${Math.round(scale * 100)}%`
  btnPrev.disabled = currentPage <= 1
  btnNext.disabled = currentPage >= totalPages
}

function formatHashKey(name, total) {
  return `pdf-progress:${name}::${total}`
}

function loadSavedProgress() {
  if (!progressKey) return 1
  try {
    const raw = localStorage.getItem(progressKey)
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) return n
  } catch (e) {}
  return 1
}

function saveProgress() {
  if (!progressKey) return
  try {
    localStorage.setItem(progressKey, String(currentPage))
  } catch (e) {}
}

function scheduleProgressSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveProgress()
  }, 400)
}

// ============ Viewport-хелпер с учётом rotation ============
function makeViewport(page, scaleVal) {
  return page.getViewport({ scale: scaleVal, rotation })
}

// ============ Рендер страницы ============
async function renderPage(pageNum) {
  const state = pageStates.get(pageNum)
  if (!state || state.rendered || state.renderTask) return

  state.element.classList.add('rendering')

  try {
    const page = await pdfDoc.getPage(pageNum)
    const viewport = makeViewport(page, scale)
    const dpr = window.devicePixelRatio || 1

    const canvas = document.createElement('canvas')
    canvas.className = 'pdf-canvas'
    const ctx = canvas.getContext('2d')
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    })
    state.renderTask = renderTask
    await renderTask.promise
    state.renderTask = null

    // Очищаем от старых детей
    state.element.innerHTML = ''
    state.element.appendChild(canvas)
    state.element.classList.remove('rendering')
    state.rendered = true
    state.viewport = viewport

    // Текстовый слой (для выделения + подсветки поиска)
    await renderTextLayerForPage(pageNum, page, viewport, state.element)
  } catch (err) {
    state.renderTask = null
    if (err?.name === 'RenderingCancelledException') {
      state.element.classList.remove('rendering')
      return
    }
    console.error(`[pdf] Ошибка рендера страницы ${pageNum}:`, err)
    state.element.classList.remove('rendering')
  }
}

// ============ Текстовый слой ============
async function renderTextLayerForPage(pageNum, page, viewport, containerEl) {
  const state = pageStates.get(pageNum)
  if (!state) return

  // Убираем старый слой, если был
  const old = state.element.querySelector('.text-layer')
  if (old) old.remove()

  const textLayerDiv = document.createElement('div')
  textLayerDiv.className = 'text-layer'
  // pdfjs использует эту переменную в CSS для позиционирования
  textLayerDiv.style.setProperty('--scale-factor', String(scale))
  containerEl.appendChild(textLayerDiv)

  try {
    const textContent = await page.getTextContent()

    if (typeof pdfjsLib.TextLayer === 'function') {
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      })
      await textLayer.render()
    } else if (typeof pdfjsLib.renderTextLayer === 'function') {
      await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      }).promise
    }

    state.textLayerElement = textLayerDiv

    // Восстанавливаем подсветку, если поиск был активен
    if (findState.query) {
      setTimeout(() => {
        applyHighlightToPage(pageNum)
        updateFindCounter()
      }, 0)
    }
  } catch (err) {
    // Не критично — работаем без выделения текста
    console.warn(`[pdf] Text layer ${pageNum} не удалось отрисовать:`, err)
  }
}

// ============ Рендер миниатюры ============
async function renderThumb(pageNum) {
  const st = thumbStates.get(pageNum)
  if (!st || st.rendered || st.renderTask) return

  try {
    const page = await pdfDoc.getPage(pageNum)
    const baseViewport = page.getViewport({ scale: 1, rotation })
    const targetWidth = 140
    const thumbScale = targetWidth / baseViewport.width
    const viewport = page.getViewport({ scale: thumbScale, rotation })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const task = page.render({
      canvasContext: ctx,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    })
    st.renderTask = task
    await task.promise
    st.renderTask = null

    // Убираем placeholder
    st.element.innerHTML = ''
    st.element.appendChild(canvas)

    // Номер страницы
    const num = document.createElement('div')
    num.className = 'pdf-thumb-num'
    num.textContent = String(pageNum)
    st.element.appendChild(num)

    st.rendered = true
  } catch (err) {
    st.renderTask = null
    if (err?.name !== 'RenderingCancelledException') {
      console.warn(`[pdf] Миниатюра ${pageNum}:`, err)
    }
  }
}

// ============ Инициализация миниатюр ============
async function setupThumbnails() {
  thumbsContainer.innerHTML = ''
  thumbStates.clear()

  if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null }

  for (let i = 1; i <= totalPages; i++) {
    const el = document.createElement('div')
    el.className = 'pdf-thumb'
    el.dataset.page = String(i)
    // Примерные пропорции первой страницы — чтобы скролл не прыгал
    let aspect = 1.414 // A4 portrait
    try {
      const p = await pdfDoc.getPage(i)
      const vp = p.getViewport({ scale: 1, rotation })
      aspect = vp.height / vp.width
    } catch {}
    const w = 140
    el.style.height = `${Math.round(w * aspect)}px`

    el.addEventListener('click', () => {
      scrollToPage(i)
    })

    thumbsContainer.appendChild(el)

    thumbStates.set(i, {
      element: el,
      rendered: false,
      renderTask: null,
    })
  }

  thumbObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const pageNum = Number(entry.target.dataset.page)
        if (pageNum) renderThumb(pageNum)
      }
    },
    { root: sidebar, rootMargin: '400px 0px', threshold: 0.01 }
  )

  for (const [, st] of thumbStates) thumbObserver.observe(st.element)

  updateActiveThumb(currentPage)
}

function updateActiveThumb(pageNum) {
  if (sidebar.hidden) return
  for (const [n, st] of thumbStates) {
    st.element.classList.toggle('active', n === pageNum)
  }
  // Скролл к активной, если она вне видимости
  const st = thumbStates.get(pageNum)
  if (st) {
    const sb = sidebar.getBoundingClientRect()
    const el = st.element.getBoundingClientRect()
    if (el.top < sb.top || el.bottom > sb.bottom) {
      st.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }
}

// ============ Lazy-загрузка страниц ============
function setupObserver() {
  if (observer) observer.disconnect()

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const pageNum = Number(entry.target.dataset.page)
        if (pageNum) renderPage(pageNum)
      }
    },
    { root: container, rootMargin: '400px 0px', threshold: 0.01 }
  )

  for (const [, st] of pageStates) observer.observe(st.element)
}

// ============ Создание плейсхолдеров страниц ============
async function createPagePlaceholders() {
  container.innerHTML = ''
  pageStates.clear()
  if (observer) { observer.disconnect(); observer = null }

  const sizes = []
  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await pdfDoc.getPage(i)
      const vp = makeViewport(page, scale)
      sizes.push({ num: i, width: vp.width, height: vp.height })
    } catch {
      sizes.push({ num: i, width: 600, height: 800 })
    }
  }

  for (const { num, width, height } of sizes) {
    const el = document.createElement('div')
    el.className = 'pdf-page'
    el.dataset.page = String(num)
    el.style.width = `${Math.floor(width)}px`
    el.style.height = `${Math.floor(height)}px`
    el.style.minHeight = `${Math.floor(height)}px`
    container.appendChild(el)
    pageStates.set(num, {
      element: el,
      rendered: false,
      renderTask: null,
      viewport: null,
      textLayerElement: null,
    })
  }

  setupObserver()
}

// ============ Загрузка PDF ============
async function loadPdf(data) {
  loadingEl.hidden = false
  errorEl.hidden = true

  try {
    const loadingTask = pdfjsLib.getDocument({ data })
    pdfDoc = await loadingTask.promise
    totalPages = pdfDoc.numPages
    currentPage = 1

    // Получаем мету (имя файла) и строим ключ прогресса
    try {
      const meta = await window.browserAPI.getPdfMeta()
      if (meta && meta.name) {
        pdfMeta = meta
        progressKey = formatHashKey(meta.name, totalPages)
      }
    } catch (e) {}

    // Восстанавливаем сохранённый прогресс
    const saved = loadSavedProgress()

    // Масштаб по ширине
    try {
      const firstPage = await pdfDoc.getPage(1)
      const baseViewport = firstPage.getViewport({ scale: 1, rotation })
      const availableWidth = container.clientWidth - 40
      scale = Math.max(0.25, Math.min(4, availableWidth / baseViewport.width))
      userAdjustedZoom = false
    } catch (e) {
      scale = 1.0
    }

    await createPagePlaceholders()
    updateIndicators()
    updateActiveThumb(saved)

    loadingEl.hidden = true

    // Рендерим первую страницу
    renderPage(1)

    // Навешиваем скролл
    container.addEventListener('scroll', onScroll, { passive: true })

    // Скролл к сохранённой странице после первого layout
    if (saved > 1) {
      setTimeout(() => {
        scrollToPage(saved, false)
        currentPage = saved
        updateIndicators()
        updateActiveThumb(saved)
        initialScrollDone = true
      }, 100)
    } else {
      initialScrollDone = true
    }
  } catch (err) {
    console.error('[pdf] Ошибка загрузки:', err)
    showError('Не удалось открыть PDF: ' + (err?.message || 'неизвестная ошибка'))
  }
}

function onScroll() {
  const containerRect = container.getBoundingClientRect()
  const centerY = containerRect.top + containerRect.height / 2

  let bestPage = 1
  let bestDist = Infinity
  for (const [pageNum, st] of pageStates) {
    const rect = st.element.getBoundingClientRect()
    const pageCenter = rect.top + rect.height / 2
    const dist = Math.abs(pageCenter - centerY)
    if (dist < bestDist) { bestDist = dist; bestPage = pageNum }
  }

  if (bestPage !== currentPage) {
    currentPage = bestPage
    updateIndicators()
    updateActiveThumb(bestPage)
    if (initialScrollDone) scheduleProgressSave()
  }
}

// ============ Навигация ============
function scrollToPage(pageNum, smooth = true) {
  const st = pageStates.get(pageNum)
  if (!st) return
  st.element.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
}

btnPrev.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--
    scrollToPage(currentPage)
    updateIndicators()
  }
})

btnNext.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++
    scrollToPage(currentPage)
    updateIndicators()
  }
})

// ============ Зум ============
async function reRenderAll() {
  // Отменяем все активные рендеры
  for (const state of pageStates.values()) {
    if (state.renderTask) { try { state.renderTask.cancel() } catch {} state.renderTask = null }
    state.rendered = false
    state.element.innerHTML = ''
  }
  // Миниатюры сбрасываем — они перерисуются сами при попадании в viewport
  for (const st of thumbStates.values()) {
    if (st.renderTask) { try { st.renderTask.cancel() } catch {} st.renderTask = null }
    st.rendered = false
    st.element.innerHTML = ''
  }

  // Пересчитываем размеры плейсхолдеров
  for (const [pageNum, state] of pageStates) {
    try {
      const page = await pdfDoc.getPage(pageNum)
      const vp = makeViewport(page, scale)
      state.element.style.width = `${Math.floor(vp.width)}px`
      state.element.style.height = `${Math.floor(vp.height)}px`
      state.element.style.minHeight = `${Math.floor(vp.height)}px`
    } catch {}
  }

  // Рендерим страницы в области видимости
  const containerRect = container.getBoundingClientRect()
  for (const [pageNum, state] of pageStates) {
    const rect = state.element.getBoundingClientRect()
    if (rect.bottom > containerRect.top - 400 && rect.top < containerRect.bottom + 400) {
      renderPage(pageNum)
    }
  }

  // Миниатюры — просто заново отрисуются, когда попадут в viewport sidebar
  if (!sidebar.hidden) {
    for (const [pageNum, st] of thumbStates) {
      const r = st.element.getBoundingClientRect()
      const sr = sidebar.getBoundingClientRect()
      if (r.bottom > sr.top - 400 && r.top < sr.bottom + 400) renderThumb(pageNum)
    }
  }

  updateIndicators()
}

function setScale(newScale) {
  const clamped = Math.max(0.25, Math.min(4, newScale))
  if (Math.abs(clamped - scale) < 0.01) return
  scale = clamped
  reRenderAll()
}

btnZoomIn.addEventListener('click', () => { userAdjustedZoom = true; setScale(scale + 0.25) })
btnZoomOut.addEventListener('click', () => { userAdjustedZoom = true; setScale(scale - 0.25) })
btnZoomFit.addEventListener('click', async () => {
  if (!pdfDoc) return
  userAdjustedZoom = false
  try {
    const page = await pdfDoc.getPage(1)
    const vp = page.getViewport({ scale: 1, rotation })
    const availableWidth = container.clientWidth - 40
    setScale(availableWidth / vp.width)
  } catch {}
})

// ============ Поворот ============
btnRotate.addEventListener('click', async () => {
  if (!pdfDoc) return
  rotation = (rotation + 90) % 360
  await reRenderAll()
})

// ============ Sidebar (миниатюры) ============
btnSidebar.addEventListener('click', async () => {
  const willShow = sidebar.hidden
  sidebar.hidden = !willShow
  btnSidebar.classList.toggle('active', willShow)
  if (willShow) {
    // Первый раз создаём плейсхолдеры миниатюр
    if (thumbStates.size === 0) {
      await setupThumbnails()
    }
    updateActiveThumb(currentPage)
  }
})

// ============ Поиск ============
function openFindbar() {
  findbar.hidden = false
  setTimeout(() => {
    findInput.focus()
    findInput.select()
  }, 30)
}

function closeFindbar() {
  findbar.hidden = true
  findInput.value = ''
  findState.query = ''
  findState.matches = []
  findState.currentIndex = -1
  clearAllHighlights()
  updateFindCounter()
}

function clearAllHighlights() {
  document.querySelectorAll('.text-layer .highlight').forEach((el) => {
    el.classList.remove('highlight', 'selected')
  })
}

function applyHighlightToPage(pageNum) {
  const state = pageStates.get(pageNum)
  if (!state || !state.textLayerElement) return

  const query = findState.query.toLowerCase()
  if (!query) return

  const spans = state.textLayerElement.querySelectorAll('span')
  spans.forEach((span) => {
    const text = (span.textContent || '').toLowerCase()
    if (text.includes(query)) {
      span.classList.add('highlight')
    }
  })
}

function updateFindCounter() {
  const total = findState.matches.length
  const idx = findState.currentIndex
  if (total === 0) {
    findCounter.textContent = findState.query ? '0/0' : ''
    findCounter.classList.toggle('empty', !!findState.query)
  } else {
    findCounter.textContent = `${idx + 1}/${total}`
    findCounter.classList.remove('empty')
  }
}

async function runSearch(query, direction = 1) {
  findState.query = query
  findState.matches = []
  findState.currentIndex = -1

  clearAllHighlights()

  if (!query || !pdfDoc) {
    updateFindCounter()
    return
  }

  const lowerQuery = query.toLowerCase()

  // Обходим все страницы и собираем совпадения по span-ам.
  // Текстовые слои могут быть ещё не отрисованы — дожидаемся их появления
  // по мере обхода (или рендерим страницу принудительно).
  for (let i = 1; i <= totalPages; i++) {
    const st = pageStates.get(i)
    if (!st) continue

    // Если страница не отрисована — пропускаем (не форсируем всё сразу)
    if (!st.textLayerElement) continue

    const spans = st.textLayerElement.querySelectorAll('span')
    spans.forEach((span) => {
      const text = (span.textContent || '').toLowerCase()
      if (text.includes(lowerQuery)) {
        findState.matches.push({ pageNum: i, spanEl: span })
      }
    })
  }

  if (findState.matches.length > 0) {
    // Первое совпадение (или ближайшее после текущей страницы)
    let startIdx = findState.matches.findIndex((m) => m.pageNum >= currentPage)
    if (startIdx === -1) startIdx = 0
    findState.currentIndex = startIdx
    focusMatch(startIdx)
  }

  updateFindCounter()
}

function focusMatch(idx) {
  const m = findState.matches[idx]
  if (!m) return

  // Снимаем selected со старого
  document.querySelectorAll('.text-layer .highlight.selected').forEach((el) => {
    el.classList.remove('selected')
  })
  m.spanEl.classList.add('highlight', 'selected')

  // Скроллим к странице (без smooth, чтобы было быстро)
  const st = pageStates.get(m.pageNum)
  if (st) {
    st.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function nextMatch(direction) {
  if (findState.matches.length === 0) return
  const total = findState.matches.length
  findState.currentIndex = (findState.currentIndex + direction + total) % total
  focusMatch(findState.currentIndex)
  updateFindCounter()
}

btnSearch.addEventListener('click', () => {
  if (findbar.hidden) openFindbar()
  else closeFindbar()
})

findClose.addEventListener('click', closeFindbar)
findNext.addEventListener('click', () => nextMatch(1))
findPrev.addEventListener('click', () => nextMatch(-1))

let findDebounce = null
findInput.addEventListener('input', () => {
  clearTimeout(findDebounce)
  const q = findInput.value.trim()
  findDebounce = setTimeout(() => runSearch(q), 250)
})

findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (findState.matches.length === 0) {
      runSearch(findInput.value.trim(), e.shiftKey ? -1 : 1)
    } else {
      nextMatch(e.shiftKey ? -1 : 1)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeFindbar()
  }
})

// Cmd/Ctrl+F открывает поиск
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    openFindbar()
  } else if (e.key === 'Escape' && !findbar.hidden) {
    closeFindbar()
  }
})

// ============ Пересчёт по ширине при ресайзе ============
let resizeTimer = null
window.addEventListener('resize', () => {
  if (userAdjustedZoom) return
  if (!pdfDoc) return
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(async () => {
    try {
      const firstPage = await pdfDoc.getPage(1)
      const vp = firstPage.getViewport({ scale: 1, rotation })
      const availableWidth = container.clientWidth - 40
      const newScale = Math.max(0.25, Math.min(4, availableWidth / vp.width))
      if (Math.abs(newScale - scale) < 0.01) return
      scale = newScale
      await reRenderAll()
    } catch {}
  }, 200)
})

// Сохраняем прогресс при уходе со страницы
window.addEventListener('beforeunload', () => {
  if (progressKey) saveProgress()
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && progressKey) saveProgress()
})

// ============ Старт ============
async function init() {
  try {
    const data = await window.browserAPI.getPdfData()
    if (!data) {
      showError('Не удалось получить PDF-файл.')
      return
    }
    await loadPdf(data)
  } catch (err) {
    console.error('[pdf]', err)
    showError('Ошибка инициализации PDF-просмотрщика.')
  }
}

init()