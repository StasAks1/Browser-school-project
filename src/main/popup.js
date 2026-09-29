/**
 * Обработка window.open — определение popup-окон и настройка их безопасности.
 *
 * Правила:
 *   • Если сайт передал `popup=yes` или указал `width` и `height` — открываем настоящее окно.
 *   • Если просто window.open(url) без features — открываем в новой вкладке (делается в index.js).
 *   • Для popup включается `window.opener` — это нужно для OAuth-флоу.
 *   • Popup-окно наследует session родителя (куки, разрешения).
 */
import { debugLog } from './debug.js'

const DEFAULT_WIDTH = 480
const DEFAULT_HEIGHT = 640
const MIN_WIDTH = 320
const MIN_HEIGHT = 240
const MAX_WIDTH = 1600
const MAX_HEIGHT = 1200

// ============================================================
// ============ ПАРСИНГ FEATURES ==============================
// ============================================================
/**
 * Разбирает строку features из window.open в объект.
 * Пример: "width=500,height=600,popup=yes,noopener" →
 *   { width: '500', height: '600', popup: 'yes', noopener: true }
 */
export function parseFeatures(features) {
  const result = {}
  if (!features || typeof features !== 'string') return result

  for (const part of features.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) {
      result[trimmed.toLowerCase()] = true
    } else {
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase()
      const val = trimmed.slice(eqIdx + 1).trim()
      result[key] = val
    }
  }
  return result
}

// ============================================================
// ============ ОПРЕДЕЛЕНИЕ POPUP =============================
// ============================================================
/**
 * Решает, является ли запрос window.open настоящим popup-окном.
 *
 * Считаем popup, если:
 *   • disposition === 'new-window', ИЛИ
 *   • в features есть popup=yes/1/true, ИЛИ
 *   • в features есть И width, И height (как делают OAuth-провайдеры)
 */
export function isPopupRequest(details) {
  if (!details) return false

  if (details.disposition === 'new-window') return true

  const f = String(details.features || '').toLowerCase()
  if (!f) return false

  // popup=yes / popup=1 / popup=true
  if (/\bpopup\s*=\s*(yes|1|true)/.test(f)) return true

  // Просто "popup" без значения, но не "popup=no"
  if (/\bpopup\b/.test(f) && !/\bpopup\s*=\s*(no|0|false)/.test(f)) return true

  // width + height вместе — типичный признак popup
  if (/\bwidth\s*=/.test(f) && /\bheight\s*=/.test(f)) return true

  return false
}

// ============================================================
// ============ ПАРАМЕТРЫ ОКНА ================================
// ============================================================
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

/**
 * Формирует опции для BrowserWindow на основе features.
 * Позиционирует popup в центре родительского окна.
 */
export function buildPopupWindowOptions(details, parentWindow) {
  const features = parseFeatures(details.features)

  let w = parseInt(features.width, 10)
  let h = parseInt(features.height, 10)
  if (!Number.isFinite(w) || w <= 0) w = DEFAULT_WIDTH
  if (!Number.isFinite(h) || h <= 0) h = DEFAULT_HEIGHT
  w = clamp(w, MIN_WIDTH, MAX_WIDTH)
  h = clamp(h, MIN_HEIGHT, MAX_HEIGHT)

  // Позиция: центр родительского окна
  let x
  let y
  if (parentWindow && !parentWindow.isDestroyed()) {
    const b = parentWindow.getBounds()
    x = Math.round(b.x + (b.width - w) / 2)
    y = Math.round(b.y + (b.height - h) / 2)
  }

  // Фон — в цвет текущей темы, чтобы не мелькало белым
  // Фон наследуется от родительского окна — чтобы не мелькало при открытии
  const bgColor = (parentWindow && !parentWindow.isDestroyed())
    ? parentWindow.getBackgroundColor()
    : '#1a1a1a'

  return {
    width: w,
    height: h,
    x,
    y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: bgColor,
    // Обычная рамка с системными кнопками — важно для OAuth,
    // чтобы пользователь мог закрыть окно крестиком.
    frame: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // ВАЖНО: webSecurity оставляем включённым.
      // Session наследуется от родителя автоматически.
    },
  }
}

// ============================================================
// ============ БЕЗОПАСНОСТЬ POPUP-ОКНА =======================
// ============================================================
/**
 * Навешивает обработчики на созданный popup-WebContents.
 * Вызывается из main/index.js в 'did-create-window'.
 */
export function attachPopupHandlers(popupWin, createTab) {
  if (!popupWin || popupWin.isDestroyed()) return

  const wc = popupWin.webContents

  // ============ Показываем при готовности ============
  popupWin.once('ready-to-show', () => {
    if (popupWin.isDestroyed()) return
    popupWin.show()
    popupWin.focus()
  })

  // ============ Заголовок окна ============
  wc.on('page-title-updated', (_e, title) => {
    if (popupWin.isDestroyed()) return
    popupWin.setTitle(title || 'Окно')
  })

  // ============ Навигация ============
  wc.on('will-navigate', (event, url) => {
    let parsed = null
    try { parsed = new URL(url) } catch {}

    if (!parsed) { event.preventDefault(); return }

    // Разрешаем только http/https/about:blank
    const allowed =
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'about:' && parsed.pathname === 'blank')

    if (!allowed) {
      event.preventDefault()
      debugLog('Popup', `Заблокирована навигация на ${parsed.protocol}`)
    }
  })

  // ============ Popup внутри popup ============
  // Если из popup-окна сайт снова вызывает window.open —
  // открываем уже во вкладке, чтобы не плодить окна.
  wc.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        createTab(url)
      }
    } catch {}
    return { action: 'deny' }
  })

  // ============ Логирование закрытия ============
  popupWin.on('closed', () => {
    debugLog('Popup', 'Popup-окно закрыто')
  })

  debugLog('Popup', `Открыт popup: ${wc.getURL() || 'about:blank'}`)
}

/* эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго */