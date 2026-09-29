const urlEl = document.getElementById('url')

// ============ Приём URL из main ============
window.browserAPI.onStatusBarUrl((url) => {
  urlEl.textContent = url || ''
})

// Тема и акцент: см. shared/theme.js

//эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго