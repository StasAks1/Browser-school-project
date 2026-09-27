/**
 * Общий модуль темы и акцента для всех renderer-страниц.
 *
 * Подключается в HTML до основного скрипта:
 *   <script src="../shared/theme.js"></script>
 *   <script src="index.js"></script>
 *
 * После загрузки в window появляется объект themeManager:
 *   themeManager.onTheme(cb)   — подписка на изменения темы (cb(theme))
 *   themeManager.onAccent(cb)  — подписка на изменения акцента (cb(data))
 *   themeManager.getTheme()    — текущая тема ('light' | 'dark')
 *   themeManager.getAccent()   — текущий акцент ({ name, color, hover })
 *
 * Если страница уже загрузилась с готовой темой (анти-flash inline-скрипт),
 * при подписке cb вызовется сразу с текущим значением.
 */
(function () {
  // ============ Базовые функции ============
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
  }

  function applyAccent(data) {
    if (!data) return
    if (typeof data.color === 'string') {
      document.documentElement.style.setProperty('--accent', data.color)
    }
    if (typeof data.hover === 'string') {
      document.documentElement.style.setProperty('--accent-hover', data.hover)
    }
  }

  // ============ Состояние и подписчики ============
  let currentTheme = null
  let currentAccent = null
  const themeListeners = []
  const accentListeners = []

  function emitTheme(theme) {
    const normalized = theme === 'light' ? 'light' : 'dark'
    currentTheme = normalized
    applyTheme(normalized)
    for (const cb of themeListeners) {
      try { cb(normalized) } catch (e) { console.error('[theme]', e) }
    }
  }

  function emitAccent(data) {
    if (!data) return
    currentAccent = data
    applyAccent(data)
    for (const cb of accentListeners) {
      try { cb(data) } catch (e) { console.error('[theme]', e) }
    }
  }

  // ============ Публичный API ============
  window.themeManager = {
    getTheme: () => currentTheme || document.documentElement.dataset.theme || 'dark',
    getAccent: () => currentAccent,
    onTheme: (cb) => {
      if (typeof cb !== 'function') return
      themeListeners.push(cb)
      if (currentTheme) {
        try { cb(currentTheme) } catch (e) { console.error('[theme]', e) }
      }
    },
    onAccent: (cb) => {
      if (typeof cb !== 'function') return
      accentListeners.push(cb)
      if (currentAccent) {
        try { cb(currentAccent) } catch (e) { console.error('[theme]', e) }
      }
    },
  }

  // ============ Подписки на IPC ============
  if (!window.browserAPI) {
    console.warn('[theme] browserAPI не найден, тема не будет синхронизирована')
    return
  }

  window.browserAPI.onThemeChanged((theme) => emitTheme(theme))
  window.browserAPI.onAccentChanged((data) => emitAccent(data))

  // Начальная синхронизация с main-процессом
  window.browserAPI.getTheme().then((theme) => emitTheme(theme)).catch(() => {})
  window.browserAPI.getAccent().then((data) => emitAccent(data)).catch(() => {})
})()