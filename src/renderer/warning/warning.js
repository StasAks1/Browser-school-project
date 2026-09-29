const params = new URLSearchParams(window.location.search)
const targetUrl = params.get('url') || ''
const httpsOnly = params.get('httpsOnly') === '1'

document.getElementById('warning-url').textContent = targetUrl

document.getElementById('btn-back').addEventListener('click', () => {
  window.browserAPI.warningGoBack()
})

const btnProceed = document.getElementById('btn-proceed')

// В HTTPS-only режиме переход на HTTP запрещён — скрываем кнопку
if (httpsOnly) {
  btnProceed.style.display = 'none'
  const hint = document.querySelector('.warning-hint')
  if (hint) {
    hint.textContent = 'Включён режим «Только HTTPS». Переход на незащищённые сайты заблокирован. Отключите режим в настройках, если хотите перейти.'
  }
} else {
  btnProceed.addEventListener('click', () => {
    window.browserAPI.warningProceed(targetUrl)
  })
}

// Тема и акцент: см. shared/theme.js
//эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго