/**
 * Общий модуль темы и акцента для всех renderer-страниц.
 *
 * Подключается в HTML до основного скрипта:
 *   <script src="../shared/theme.js"></script>
 *   <script src="index.js"></script>
 *
 * После загрузки в window появляется объект themeManager:
 *   themeManager.onTheme(cb)   — подписка на изменения темы
 *   themeManager.onAccent(cb)  — подписка на изменения акцента
 *   themeManager.onCustomTheme(cb) — подписка на кастомную тему
 *   themeManager.getTheme()    — текущая тема
 *   themeManager.getAccent()   — текущий акцент
 *   themeManager.getCustomTheme() — кастомная тема или null
 *
 * Кастомная тема применяется через CSS-переменные на documentElement,
 * перебивая дефолтные значения light/dark темы.
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

  // ============ Кастомная тема ============
  const CUSTOM_VARS = [
    '--bg', '--bg-elevated', '--bg-hover', '--bg-active',
    '--bg-tab-active', '--bg-sidebar', '--bg-card',
    '--text', '--text-muted',
    '--accent', '--accent-hover',
    '--border', '--danger', '--star',
  ]

  let currentCustomTheme = null

  function clearCustomThemeVars() {
    for (const v of CUSTOM_VARS) {
      document.documentElement.style.removeProperty(v)
    }
  }

  function applyCustomTheme(theme) {
    clearCustomThemeVars()
    if (!theme || !theme.vars || typeof theme.vars !== 'object') {
      currentCustomTheme = null
      return
    }
    for (const [key, value] of Object.entries(theme.vars)) {
      if (!CUSTOM_VARS.includes(key)) continue
      if (typeof value !== 'string') continue
      document.documentElement.style.setProperty(key, value)
    }
    currentCustomTheme = theme
  }

  // ============ Состояние и подписчики ============
  let currentTheme = null
  let currentAccent = null
  let customThemeEmitted = false
  const themeListeners = []
  const accentListeners = []
  const customThemeListeners = []

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

  function emitCustomTheme(theme) {
    applyCustomTheme(theme)
    customThemeEmitted = true
    for (const cb of customThemeListeners) {
      try { cb(theme) } catch (e) { console.error('[theme]', e) }
    }
  }

  // ============ Публичный API ============
  window.themeManager = {
    getTheme: () => currentTheme || document.documentElement.dataset.theme || 'dark',
    getAccent: () => currentAccent,
    getCustomTheme: () => currentCustomTheme,

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
    onCustomTheme: (cb) => {
      if (typeof cb !== 'function') return
      customThemeListeners.push(cb)
      if (customThemeEmitted || currentCustomTheme !== null) {
        try { cb(currentCustomTheme) } catch (e) { console.error('[theme]', e) }
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

  if (typeof window.browserAPI.onCustomThemeChanged === 'function') {
    window.browserAPI.onCustomThemeChanged((theme) => emitCustomTheme(theme))
  }

  // Начальная синхронизация с main-процессом
  window.browserAPI.getTheme().then((theme) => emitTheme(theme)).catch(() => {})
  window.browserAPI.getAccent().then((data) => emitAccent(data)).catch(() => {})

  if (typeof window.browserAPI.getCustomTheme === 'function') {
    window.browserAPI.getCustomTheme().then((theme) => emitCustomTheme(theme)).catch(() => {
      emitCustomTheme(null)
    })
  }
})()