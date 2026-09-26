/**
 * Флаги для отладки.
 * Перед релизом поставь enabled: false.
 * Или запусти с DEBUG=1 npm run dev — тогда всё включится автоматически.
 */
const envDebug = process.env.DEBUG === '1' || process.env.DEBUG === 'true'

export const DEBUG = {
  // Главный выключатель — если false, все debugLog становятся no-op
  enabled: envDebug || true,

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