const params = new URLSearchParams(window.location.search)
const targetUrl = params.get('url') || ''

document.getElementById('warning-url').textContent = targetUrl

document.getElementById('btn-back').addEventListener('click', () => {
  window.browserAPI.warningGoBack()
})

document.getElementById('btn-proceed').addEventListener('click', () => {
  window.browserAPI.warningProceed(targetUrl)
})

// Тема и акцент: см. shared/theme.js