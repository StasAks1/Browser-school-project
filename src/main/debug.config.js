/**
 * Флаги для отладки.
 *
 * Перед релизом оставь enabled как есть — он зависит от переменной окружения.
 * Чтобы включить debug локально:
 *   DEBUG=1 npm run dev
 * или на Windows (PowerShell):
 *   $env:DEBUG="1"; npm run dev
 * или на Windows (cmd):
 *   set DEBUG=1 && npm run dev
 */
const envDebug = process.env.DEBUG === '1' || process.env.DEBUG === 'true'

export const DEBUG = {
  // Главный выключатель — если false, все debugLog становятся no-op
  enabled: envDebug,

  // Открывать DevTools для каждой новой вкладки (в отдельном окне)
  openTabDevTools: false,

  // Открывать DevTools для chrome-окна
  openChromeDevTools: false,

  // Логировать IPC-вызовы
  logIPC: true,

  // Логировать события вкладок (did-navigate, favicon-updated и т.д.)
  logTabEvents: false,

  // Логировать HTTP-запросы (очень шумно)
  logNetwork: false,

  // Показывать цветные логи
  colors: true,
}