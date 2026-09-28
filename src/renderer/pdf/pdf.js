import * as pdfjsLib from 'pdfjs-dist'
// Worker через Vite: ?url даёт корректный путь в dev и prod
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const container = document.getElementById('container')
const loadingEl = document.getElementById('loading')
const errorEl = document.getElementById('error')
const pageIndicator = document.getElementById('page-indicator')
const zoomIndicator = document.getElementById('zoom-indicator')
const btnPrev = document.getElementById('btn-prev')
const btnNext = document.getElementById('btn-next')
const btnZoomIn = document.getElementById('btn-zoom-in')
const btnZoomOut = document.getElementById('btn-zoom-out')
const btnZoomFit = document.getElementById('btn-zoom-fit')

let pdfDoc = null
let scale = 1.0
let currentPage = 1
let totalPages = 0
const pageStates = new Map() // pageNum -> { element, rendered, renderTask, viewport }
let observer = null
let userAdjustedZoom = false

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

// ============ Рендер страницы ============
async function renderPage(pageNum) {
  const state = pageStates.get(pageNum)
  if (!state || state.rendered || state.renderTask) return

  state.element.classList.add('rendering')

  try {
    const page = await pdfDoc.getPage(pageNum)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    // Рендерим с учётом devicePixelRatio для чёткости на Retina.
    // Буфер canvas × dpr, CSS-размер — обычный.
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    // pdfjs сам применяет transform при рендере — ctx.scale НЕ нужен.
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    })

    state.renderTask = renderTask

    await renderTask.promise

    state.element.innerHTML = ''
    state.element.appendChild(canvas)
    state.element.classList.remove('rendering')
    state.rendered = true
    state.viewport = viewport
  } catch (err) {
    // Отмена рендера — не ошибка
    if (err?.name === 'RenderingCancelledException') {
      state.element.classList.remove('rendering')
      state.renderTask = null
      return
    }
    console.error(`[pdf] Ошибка рендера страницы ${pageNum}:`, err)
    state.element.classList.remove('rendering')
  } finally {
    state.renderTask = null
  }
}

// ============ Lazy-загрузка через IntersectionObserver ============
function setupObserver() {
  if (observer) observer.disconnect()

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const pageNum = Number(entry.target.dataset.page)
        if (!pageNum) continue
        renderPage(pageNum)
      }
    },
    {
      root: container,
      rootMargin: '400px 0px', // страницы начинают рендериться заранее
      threshold: 0.01,
    }
  )

  for (const [pageNum, state] of pageStates) {
    observer.observe(state.element)
  }
}

// ============ Создание контейнеров страниц ============
async function createPagePlaceholders() {
  container.innerHTML = ''
  pageStates.clear()
  if (observer) { observer.disconnect(); observer = null }

  // Заранее получаем размеры всех страниц (метаданные — быстро)
  const sizes = []
  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await pdfDoc.getPage(i)
      const viewport = page.getViewport({ scale })
      sizes.push({ num: i, width: viewport.width, height: viewport.height })
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

    // Подгоняем масштаб под ширину контейнера ДО создания плейсхолдеров
    try {
      const firstPage = await pdfDoc.getPage(1)
      const baseViewport = firstPage.getViewport({ scale: 1 })
      const availableWidth = container.clientWidth - 40
      scale = Math.max(0.25, Math.min(4, availableWidth / baseViewport.width))
      userAdjustedZoom = false
    } catch (e) {
      scale = 1.0
    }

    await createPagePlaceholders()
    updateIndicators()

    loadingEl.hidden = true

    // Сразу рендерим первую страницу, не ждём observer
    renderPage(1)

    // Отслеживаем текущую страницу при скролле
    container.addEventListener('scroll', onScroll, { passive: true })
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

  for (const [pageNum, state] of pageStates) {
    const rect = state.element.getBoundingClientRect()
    const pageCenter = rect.top + rect.height / 2
    const dist = Math.abs(pageCenter - centerY)
    if (dist < bestDist) {
      bestDist = dist
      bestPage = pageNum
    }
  }

  if (bestPage !== currentPage) {
    currentPage = bestPage
    updateIndicators()
  }
}

// ============ Навигация ============
function scrollToPage(pageNum) {
  const state = pageStates.get(pageNum)
  if (!state) return
  state.element.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  // Отменяем все активные рендеры и перерисовываем
  for (const state of pageStates.values()) {
    if (state.renderTask) {
      try { state.renderTask.cancel() } catch {}
      state.renderTask = null
    }
    state.rendered = false
    state.element.innerHTML = ''
  }

  // Пересчитываем размеры плейсхолдеров
  for (const [pageNum, state] of pageStates) {
    try {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      state.element.style.width = `${Math.floor(viewport.width)}px`
      state.element.style.height = `${Math.floor(viewport.height)}px`
      state.element.style.minHeight = `${Math.floor(viewport.height)}px`
    } catch {}
  }

  // Рендерим страницы в области видимости (и запас 400px)
  const containerRect = container.getBoundingClientRect()
  for (const [pageNum, state] of pageStates) {
    const rect = state.element.getBoundingClientRect()
    if (rect.bottom > containerRect.top - 400 && rect.top < containerRect.bottom + 400) {
      renderPage(pageNum)
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

btnZoomIn.addEventListener('click', () => {
  userAdjustedZoom = true
  setScale(scale + 0.25)
})

btnZoomOut.addEventListener('click', () => {
  userAdjustedZoom = true
  setScale(scale - 0.25)
})

btnZoomFit.addEventListener('click', async () => {
  if (!pdfDoc) return
  userAdjustedZoom = false
  try {
    const page = await pdfDoc.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const availableWidth = container.clientWidth - 40
    const newScale = availableWidth / viewport.width
    setScale(newScale)
  } catch {}
})

// ============ Пересчёт "по ширине" при ресайзе окна ============
let resizeTimer = null

window.addEventListener('resize', () => {
  if (userAdjustedZoom) return
  if (!pdfDoc) return
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(async () => {
    try {
      const firstPage = await pdfDoc.getPage(1)
      const baseViewport = firstPage.getViewport({ scale: 1 })
      const availableWidth = container.clientWidth - 40
      const newScale = Math.max(0.25, Math.min(4, availableWidth / baseViewport.width))
      if (Math.abs(newScale - scale) < 0.01) return
      scale = newScale
      await reRenderAll()
    } catch (e) {}
  }, 200)
})

// ============ Старт: получаем данные PDF из main ============
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