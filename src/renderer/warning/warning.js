const params = new URLSearchParams(window.location.search)
const targetUrl = params.get('url') || ''

document.getElementById('warning-url').textContent = targetUrl

document.getElementById('btn-back').addEventListener('click', () => {
  window.browserAPI.warningGoBack()
})

document.getElementById('btn-proceed').addEventListener('click', () => {
  window.browserAPI.warningProceed(targetUrl)
})

// ============ Тема и акцент ============
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
}

function applyAccent(data) {
  if (!data) return
  document.documentElement.style.setProperty('--accent', data.color)
  document.documentElement.style.setProperty('--accent-hover', data.hover)
}

window.browserAPI.onThemeChanged((theme) => applyTheme(theme))
window.browserAPI.onAccentChanged((data) => applyAccent(data))
window.browserAPI.getTheme().then((theme) => applyTheme(theme))
window.browserAPI.getAccent().then((data) => applyAccent(data))