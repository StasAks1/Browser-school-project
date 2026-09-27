/**
 * Блокировка трекеров и рекламы.
 *
 * Работает через session.webRequest.onBeforeRequest — проверяет hostname
 * запроса против списка трекерных доменов. Блокирует совпадения.
 *
 * Логика совпадения:
 *   • hostname === tracker                        → блок
 *   • hostname.endsWith("." + tracker)            → блок
 *
 * Это позволяет блокировать "www.google-analytics.com", не блокируя "mygoogle-analytics.com".
 */
import { TRACKER_SET } from './tracker-list.js'
import { debugLog } from './debug.js'

// Простая статистика (в памяти, сбрасывается при перезапуске)
let blockedCount = 0
let blockedByDomain = new Map()

function isTrackerHost(hostname) {
  if (!hostname) return false
  const host = hostname.toLowerCase()

  // Точное совпадение
  if (TRACKER_SET.has(host)) return true

  // Проверяем суффиксы: снимаем первый лейбл и смотрим снова
  let idx = host.indexOf('.')
  while (idx !== -1) {
    const suffix = host.slice(idx + 1)
    if (TRACKER_SET.has(suffix)) return true
    idx = host.indexOf('.', idx + 1)
  }

  return false
}

/**
 * Проверяет URL и возвращает true, если запрос нужно заблокировать.
 */
export function shouldBlock(url) {
  if (!url || typeof url !== 'string') return false

  // Пропускаем служебные схемы
  if (url.startsWith('data:') || url.startsWith('blob:') ||
      url.startsWith('file:') || url.startsWith('devtools:') ||
      url.startsWith('chrome:') || url.startsWith('chrome-extension:')) {
    return false
  }

  // Только http/https
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

  return isTrackerHost(parsed.hostname)
}

export function getStats() {
  const topDomains = [...blockedByDomain.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }))

  return {
    total: blockedCount,
    byDomain: topDomains,
  }
}

export function resetStats() {
  blockedCount = 0
  blockedByDomain = new Map()
}

/**
 * Навешивает обработчик блокировки на session.
 * @param {Electron.Session} ses
 * @param {() => boolean} isEnabled — функция, возвращающая текущее состояние блокировки
 */
export function attachTrackerBlocker(ses, isEnabled) {
  if (!ses || ses._trackerBlockerAttached) return
  ses._trackerBlockerAttached = true

  ses.webRequest.onBeforeRequest((details, callback) => {
    // Если блокировка выключена — пропускаем
    if (typeof isEnabled === 'function' && !isEnabled()) {
      callback({})
      return
    }

    const url = details.url
    if (!url) {
      callback({})
      return
    }

    // Защита: data: в mainFrame — уже была в setupSecurity
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'data:' && details.resourceType === 'mainFrame') {
        callback({ cancel: true })
        return
      }
    } catch {}

    // Основная проверка на трекер
    if (shouldBlock(url)) {
      blockedCount++
      try {
        const parsed = new URL(url)
        const host = parsed.hostname.toLowerCase()
        blockedByDomain.set(host, (blockedByDomain.get(host) || 0) + 1)
      } catch {}

      debugLog('Tracker', `Заблокировано: ${url}`)
      callback({ cancel: true })
      return
    }

    callback({})
  })
}