/**
 * Централизованная обработка горячих клавиш.
 */
export function matchShortcut(input) {
  if (!input || input.type !== 'keyDown') return null
  if (input.isAutoRepeat) return null

  const key = (input.key || '').toLowerCase()
  const mod = input.meta || input.control
  const shift = !!input.shift
  const alt = !!input.alt
  const isMac = process.platform === 'darwin'

  // ============ Переключение вкладок (без модификаторов по номеру) ============
  // Cmd+1..9 / Ctrl+1..9 — переход на N-ную вкладку
  if (mod && !shift && !alt && /^[1-9]$/.test(key)) {
    return `switch-tab-${key}`
  }

  // macOS: Cmd+Opt+←/→ — соседняя вкладка
  if (isMac && input.meta && alt && !shift) {
    if (key === 'arrowleft') return 'prev-tab'
    if (key === 'arrowright') return 'next-tab'
  }

  // Win/Linux: Ctrl+Tab / Ctrl+Shift+Tab — циклический переход
  if (!isMac && input.control && !alt) {
    if (key === 'tab') return shift ? 'prev-tab' : 'next-tab'
  }

  // ============ Без модификаторов ============
  if (!mod) {
    if (key === 'f5') return 'reload'
    if (key === 'f11') return 'toggle-fullscreen'
    return null
  }

  // ============ С модификатором ============

  // Вкладки
  if (key === 't') return shift ? 'restore-tab' : 'new-tab'
  if (key === 'n' && shift) return 'new-private-tab'
  if (key === 'w') return shift ? null : 'close-tab'

  // Навигация
  if (key === 'l') return 'focus-address'

  // Закладки
  if (key === 'd') return shift ? null : 'bookmark-page'

  // Внутренние страницы
  if (key === 'j') return 'open-downloads'
  if (key === 'y' && !shift) return 'open-history'
  if (key === 'h' && !shift) {
    if (isMac && input.meta && !input.control) return null
    return 'open-history'
  }
  if (key === ',') return 'open-settings'
  if (key === 'o' && shift) return 'open-bookmarks-manager'

  // Режим чтения
  if (key === 'e' && shift) return 'toggle-reader'

  // Поиск по странице
  if (key === 'f' && !shift) return 'find-in-page'

  // Перезагрузка
  if (key === 'r') return shift ? 'force-reload' : 'reload'

  // Навигация
  if (key === '[') return 'go-back'
  if (key === ']') return 'go-forward'
  if (key === 'h' && shift) return 'go-home'

  // Масштаб
  if (key === '0') return 'zoom-reset'
  if (key === '=' || key === '+') return 'zoom-in'
  if (key === '-') return 'zoom-out'

  return null
}

//эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго