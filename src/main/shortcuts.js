/**
 * Централизованная обработка горячих клавиш.
 * Вызывается из main-процесса для КАЖДОГО WebContents (chromeView + вкладки).
 *
 * Возвращает строку-команду или null, если клавиша не наша.
 * Возможные команды:
 *   'new-tab', 'restore-tab', 'close-tab', 'focus-address', 'bookmark-page',
 *   'open-downloads', 'open-history', 'open-settings', 'open-bookmarks-manager',
 *   'find-in-page', 'reload', 'force-reload', 'go-back', 'go-forward', 'go-home',
 *   'zoom-in', 'zoom-out', 'zoom-reset', 'toggle-fullscreen'
 */
export function matchShortcut(input) {
  if (!input || input.type !== 'keyDown') return null
  if (input.isAutoRepeat) return null

  const key = (input.key || '').toLowerCase()
  const mod = input.meta || input.control
  const shift = !!input.shift
  const isMac = process.platform === 'darwin'

  // ============ Без модификаторов ============
  if (!mod) {
    if (key === 'f5') return 'reload'
    if (key === 'f11') return 'toggle-fullscreen'
    return null
  }

  // ============ С модификатором (Cmd на Mac / Ctrl на Win-Linux) ============

  // Вкладки
  if (key === 't') return shift ? 'restore-tab' : 'new-tab'
  if (key === 'w') return shift ? null : 'close-tab'

  // Навигация в адресной строке
  if (key === 'l') return 'focus-address'

  // Закладки
  if (key === 'd') return shift ? null : 'bookmark-page'

  // Внутренние страницы
  if (key === 'j') return 'open-downloads'
  if (key === 'y' && !shift) return 'open-history' // Mac: Cmd+Y / Win: Ctrl+Y
  if (key === 'h' && !shift) {
    // На macOS Cmd+H — системная команда «скрыть приложение». Не перехватываем.
    // Ctrl+H на Mac и Win/Linux — открыть историю.
    if (isMac && input.meta && !input.control) return null
    return 'open-history'
  }
  if (key === ',' ) return 'open-settings'
  if (key === 'o' && shift) return 'open-bookmarks-manager'

  // Поиск по странице
  if (key === 'f' && !shift) return 'find-in-page'

  // Перезагрузка
  if (key === 'r') return shift ? 'force-reload' : 'reload'

  // Навигация
  if (key === '[') return 'go-back'
  if (key === ']') return 'go-forward'
  if (key === 'h' && shift) return 'go-home' // Cmd+Shift+H

  // Масштаб
  if (key === '0') return 'zoom-reset'
  if (key === '=' || key === '+') return 'zoom-in'
  if (key === '-') return 'zoom-out'

  return null
}