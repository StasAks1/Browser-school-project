/**
 * Кастомные tooltips для элементов с атрибутом title или data-tooltip.
 *
 * Особенности:
 *   • mouseover-only, без mouseout (надёжнее).
 *   • При активации title убирается, но вешается маркер data-tooltip-active —
 *     чтобы closest() находил элемент даже без title (иначе мерцание).
 *   • Если курсор ушёл на элемент вне текущей цели — тултип скрывается.
 *   • Задержка появления 400 мс, исчезновение мгновенное.
 */
(function () {
  const SHOW_DELAY = 400
  const OFFSET = 10
  const EDGE_PADDING = 8
  const ACTIVE_ATTR = 'data-tooltip-active'

  let tooltipEl = null
  let showTimer = null
  let currentTarget = null
  let savedTitle = null

  function createTooltipEl() {
    if (tooltipEl) return tooltipEl
    tooltipEl = document.createElement('div')
    tooltipEl.className = 'app-tooltip'
    tooltipEl.setAttribute('role', 'tooltip')
    tooltipEl.style.display = 'none'
    document.body.appendChild(tooltipEl)
    return tooltipEl
  }

  function getTooltipText(el) {
    if (!el) return ''
    const fromData = el.getAttribute('data-tooltip')
    if (fromData && fromData.trim()) return fromData.trim()
    const fromTitle = el.getAttribute('title')
    if (fromTitle && fromTitle.trim()) return fromTitle.trim()
    const fromSaved = el.getAttribute(ACTIVE_ATTR)
    if (fromSaved && fromSaved.trim()) return fromSaved.trim()
    return ''
  }

  function positionTooltip(targetEl, text) {
    const el = createTooltipEl()
    el.textContent = text
    el.style.display = 'block'
    el.style.visibility = 'hidden'

    const rect = targetEl.getBoundingClientRect()
    const tipRect = el.getBoundingClientRect()

    let top = rect.top - tipRect.height - OFFSET
    let placeBelow = false

    if (top < EDGE_PADDING) {
      top = rect.bottom + OFFSET
      placeBelow = true
    }

    let left = rect.left + rect.width / 2 - tipRect.width / 2
    const maxLeft = window.innerWidth - tipRect.width - EDGE_PADDING
    if (left < EDGE_PADDING) left = EDGE_PADDING
    if (left > maxLeft) left = maxLeft

    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
    el.style.visibility = 'visible'
    el.classList.toggle('app-tooltip-below', placeBelow)
    el.classList.add('visible')
  }

  function hideTooltip() {
    clearTimeout(showTimer)
    showTimer = null

    if (tooltipEl) {
      tooltipEl.classList.remove('visible')
      tooltipEl.style.display = 'none'
    }

    if (currentTarget) {
      try {
        const activeVal = currentTarget.getAttribute(ACTIVE_ATTR)
        currentTarget.removeAttribute(ACTIVE_ATTR)
        if (savedTitle !== null) {
          currentTarget.setAttribute('title', savedTitle)
        } else if (activeVal !== null) {
          currentTarget.setAttribute('title', activeVal)
        }
      } catch (e) {}
    }
    currentTarget = null
    savedTitle = null
  }

  function activate(target) {
    const text = getTooltipText(target)
    if (!text) return

    // Забираем title (если есть) и запоминаем
    savedTitle = target.getAttribute('title')
    if (savedTitle !== null) target.removeAttribute('title')

    // Маркер, по которому мы потом найдём элемент даже без title
    if (!target.hasAttribute(ACTIVE_ATTR)) {
      target.setAttribute(ACTIVE_ATTR, text)
    }
    currentTarget = target

    clearTimeout(showTimer)
    showTimer = setTimeout(() => {
      if (currentTarget === target && document.body.contains(target)) {
        positionTooltip(target, text)
      }
    }, SHOW_DELAY)
  }

  function onMouseOver(e) {
    const el = e.target
    if (!el || !el.closest) return

    // Двигаемся внутри текущей цели — ничего не делаем
    if (currentTarget && currentTarget.contains(el)) return

    // Ищем ближайший элемент с tooltip-атрибутом (включая маркер)
    const target = el.closest(`[title], [data-tooltip], [${ACTIVE_ATTR}]`)

    if (!target) {
      if (currentTarget) hideTooltip()
      return
    }

    if (target === currentTarget) return

    // Перешли на другой элемент — закрываем текущий и активируем новый
    if (currentTarget) hideTooltip()
    activate(target)
  }

  function onInterrupt() {
    if (currentTarget) hideTooltip()
  }

  // Основной обработчик
  document.addEventListener('mouseover', onMouseOver, true)

  // Курсор ушёл за пределы окна
  document.addEventListener('mouseleave', onInterrupt)
  document.documentElement.addEventListener('mouseleave', onInterrupt)
  window.addEventListener('blur', onInterrupt)

  // Прерывания
  document.addEventListener('mousedown', onInterrupt, true)
  document.addEventListener('scroll', onInterrupt, true)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onInterrupt()
  }, true)
  window.addEventListener('resize', onInterrupt)
})()