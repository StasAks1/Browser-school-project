/**
 * Блокировка трекеров и рекламы с поддержкой категорий и URL-паттернов.
 *
 * Три уровня фильтрации:
 *   1. Домены из tracker-list.js — по hostname запроса
 *   2. URL-паттерны — по сегментам пути (например, /ads/, /adserver/, /pagead/)
 *   3. Категории — каждая группа трекеров включается/выключается отдельно
 *
 * Плюс статистика: общая, по домену, по категории.
 */
import {
  TRACKER_SET,
  TRACKER_CATEGORIES,
  AD_PATH_SEGMENTS,
  getCategoryForHostname,
} from './tracker-list.js'
import { debugLog } from './debug.js'

// ============ Статистика в памяти ============
// Сбрасывается при перезапуске приложения
let blockedTotal = 0
let blockedByDomain = new Map()      // domain → count
let blockedByCategory = new Map()    // categoryId → count
let blockedByUrlPattern = 0          // сколько заблокировано именно URL-паттерном

// ============ Проверка по домену ============
function isTrackerHost(hostname) {
  if (!hostname) return false
  const host = hostname.toLowerCase()

  if (TRACKER_SET.has(host)) return true

  let idx = host.indexOf('.')
  while (idx !== -1) {
    const suffix = host.slice(idx + 1)
    if (TRACKER_SET.has(suffix)) return true
    idx = host.indexOf('.', idx + 1)
  }

  return false
}

/**
 * Проверяет URL по домену. Возвращает true, если запрос нужно заблокировать.
 */
export function shouldBlock(url) {
  if (!url || typeof url !== 'string') return false

  if (url.startsWith('data:') || url.startsWith('blob:') ||
      url.startsWith('file:') || url.startsWith('devtools:') ||
      url.startsWith('chrome:') || url.startsWith('chrome-extension:')) {
    return false
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

  return isTrackerHost(parsed.hostname)
}

// ============ Проверка по URL-паттерну ============
const URL_EXTENSION_RE = /\.(js|mjs|html?|php|aspx?|jsp|gif|png|jpe?g|webp|svg|css)$/i

/**
 * Проверяет URL по сегментам пути. Возвращает true, если путь похож на рекламный.
 *
 * Работает с сегментами целиком — то есть /ads/ матчится, /downloads/ нет.
 * Также снимает типичные расширения файлов (adserver.js → adserver).
 */
export function isAdUrlPath(url) {
  if (!url || typeof url !== 'string') return false

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

  const path = parsed.pathname.toLowerCase()
  const segments = path.split('/')

  for (const seg of segments) {
    if (!seg) continue
    if (AD_PATH_SEGMENTS.has(seg)) return true

    // Снимаем расширение: adserver.js → adserver
    if (URL_EXTENSION_RE.test(seg)) {
      const base = seg.replace(URL_EXTENSION_RE, '')
      if (AD_PATH_SEGMENTS.has(base)) return true
    }
  }

  return false
}

// ============ Статистика ============
export function getStats() {
  const topDomains = [...blockedByDomain.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }))

  const byCategory = {}
  for (const [catId, cat] of Object.entries(TRACKER_CATEGORIES)) {
    byCategory[catId] = {
      label: cat.label,
      count: blockedByCategory.get(catId) || 0,
    }
  }

  return {
    total: blockedTotal,
    byUrlPattern: blockedByUrlPattern,
    byDomain: topDomains,
    byCategory,
  }
}

export function resetStats() {
  blockedTotal = 0
  blockedByDomain = new Map()
  blockedByCategory = new Map()
  blockedByUrlPattern = 0
}

/**
 * Список категорий с метаданными и текущим состоянием включённости.
 */
export function getCategories(isCategoryEnabled) {
  return Object.entries(TRACKER_CATEGORIES).map(([id, cat]) => ({
    id,
    label: cat.label,
    description: cat.description,
    domainsCount: cat.domains.length,
    enabled: typeof isCategoryEnabled === 'function' ? !!isCategoryEnabled(id) : true,
  }))
}

// ============ Подключение к сессии ============
/**
 * Навешивает обработчик блокировки на session.
 *
 * @param {Electron.Session} ses
 * @param {object} opts
 * @param {() => boolean} opts.isEnabled — включён ли блокировщик глобально
 * @param {(categoryId: string) => boolean} opts.isCategoryEnabled — включена ли конкретная категория
 * @param {() => boolean} [opts.isAdUrlBlockEnabled] — включена ли блокировка по URL-паттернам
 * @param {(info: object) => void} [onBlocked] — колбэк при каждом заблокированном запросе
 */
export function attachTrackerBlocker(ses, opts, onBlocked) {
  if (!ses || ses._trackerBlockerAttached) return
  ses._trackerBlockerAttached = true

  // Обратная совместимость со старым API
  const isEnabledFn = typeof opts === 'function' ? opts : opts.isEnabled
  const isCategoryEnabledFn = (typeof opts === 'object' && typeof opts.isCategoryEnabled === 'function')
    ? opts.isCategoryEnabled
    : (() => true)
  const isAdUrlBlockEnabledFn = (typeof opts === 'object' && typeof opts.isAdUrlBlockEnabled === 'function')
    ? opts.isAdUrlBlockEnabled
    : (() => false)

  ses.webRequest.onBeforeRequest((details, callback) => {
    if (typeof isEnabledFn === 'function' && !isEnabledFn()) {
      callback({})
      return
    }

    const url = details.url
    if (!url) {
      callback({})
      return
    }

    // Пропускаем не-http схемы
    if (url.startsWith('data:') || url.startsWith('blob:') ||
        url.startsWith('file:') || url.startsWith('devtools:') ||
        url.startsWith('chrome:')) {
      callback({})
      return
    }

    let hostname = ''
    try { hostname = new URL(url).hostname.toLowerCase() } catch {}

    // ============ Уровень 1: домен ============
    if (isTrackerHost(hostname)) {
      const categoryId = getCategoryForHostname(hostname)

      if (categoryId && !isCategoryEnabledFn(categoryId)) {
        callback({})
        return
      }

      blockedTotal++
      if (hostname) blockedByDomain.set(hostname, (blockedByDomain.get(hostname) || 0) + 1)
      if (categoryId) blockedByCategory.set(categoryId, (blockedByCategory.get(categoryId) || 0) + 1)

      debugLog('Tracker', `[domain] Заблокировано [${categoryId || 'unknown'}]: ${url}`)

      if (typeof onBlocked === 'function') {
        try {
          onBlocked({ webContentsId: details.webContentsId, url, hostname, categoryId: categoryId || 'unknown' })
        } catch {}
      }

      callback({ cancel: true })
      return
    }

    // ============ Уровень 2: URL-паттерн ============
    // Только для под-ресурсов — не трогаем mainFrame, чтобы не сломать
    // легитимные страницы вида /ads-news/article.html
    if (
      details.resourceType !== 'mainFrame' &&
      typeof isAdUrlBlockEnabledFn === 'function' &&
      isAdUrlBlockEnabledFn() &&
      isAdUrlPath(url)
    ) {
      // Если категория "ads" выключена — не блокируем
      if (!isCategoryEnabledFn('ads')) {
        callback({})
        return
      }

      blockedTotal++
      blockedByUrlPattern++
      if (hostname) blockedByDomain.set(hostname, (blockedByDomain.get(hostname) || 0) + 1)
      blockedByCategory.set('ads', (blockedByCategory.get('ads') || 0) + 1)

      debugLog('Tracker', `[url] Заблокировано [ads]: ${url}`)

      if (typeof onBlocked === 'function') {
        try {
          onBlocked({ webContentsId: details.webContentsId, url, hostname, categoryId: 'ads' })
        } catch {}
      }

      callback({ cancel: true })
      return
    }

    callback({})
  })
}

/* эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго */