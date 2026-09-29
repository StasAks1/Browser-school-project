import { DEBUG } from './debug.config.js'

// ANSI-цвета для читаемых логов
const C = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
}

function colorize(color, text) {
  if (!DEBUG.colors) return text
  return `${color}${text}${C.reset}`
}

function timestamp() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

/**
 * Общий лог с временной меткой и префиксом.
 * debugLog('Tab', 'Создана вкладка', id)
 */
export function debugLog(tag, ...args) {
  if (!DEBUG.enabled) return
  const ts = colorize(C.gray, timestamp())
  const prefix = colorize(C.cyan, `[${tag}]`)
  console.log(`${ts} ${prefix}`, ...args)
}

/**
 * Открыть DevTools для webContents в отдельном окне.
 * debugDevTools(wc, 'Tab #3')
 */
export function debugDevTools(wc, label = '') {
  if (!DEBUG.enabled || !DEBUG.openTabDevTools) return
  try {
    wc.openDevTools({ mode: 'detach' })
    debugLog('DevTools', `Открыт для: ${label}`)
  } catch (e) {
    debugLog('DevTools', colorize(C.red, `Ошибка: ${e.message}`))
  }
}

/**
 * Логирование событий вкладки.
 * debugTabEvent(tab.id, 'did-navigate', url)
 */
export function debugTabEvent(tabId, event, data) {
  if (!DEBUG.enabled || !DEBUG.logTabEvents) return
  debugLog('Tab', colorize(C.magenta, `#${tabId}`), event, data ?? '')
}

/**
 * Логирование сетевых запросов (очень шумно — только для отладки).
 * attachNetworkLogger(session)
 */
export function attachNetworkLogger(session) {
  if (!DEBUG.enabled || !DEBUG.logNetwork) return

  session.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url.length > 100 ? details.url.slice(0, 100) + '...' : details.url
    debugLog('Network', colorize(C.blue, details.method || 'GET'), url)
    callback({})
  })
}

/**
 * Красивый заголовок при старте.
 */
export function debugStartupBanner() {
  if (!DEBUG.enabled) return
  console.log('')
  console.log(colorize(C.green, '┌─────────────────────────────────────────┐'))
  console.log(colorize(C.green, '│  ') + colorize(C.cyan, 'Browser Project — DEBUG MODE') + colorize(C.green, '          │'))
  console.log(colorize(C.green, '└─────────────────────────────────────────┘'))
  console.log(colorize(C.gray, `  IPC=${DEBUG.logIPC}  TabEvents=${DEBUG.logTabEvents}  Network=${DEBUG.logNetwork}  DevTools=${DEBUG.openTabDevTools}`))
  console.log('')
}

//эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго