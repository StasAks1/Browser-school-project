const urlEl = document.getElementById('url')

// ============ Приём URL из main ============
window.browserAPI.onStatusBarUrl((url) => {
  urlEl.textContent = url || ''
})

// Тема и акцент: см. shared/theme.js