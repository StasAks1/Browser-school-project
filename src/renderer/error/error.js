const params = new URLSearchParams(window.location.search)
const failedUrl = params.get('url') || ''
const errorCode = params.get('code') || ''
const errorDesc = params.get('desc') || ''

const iconEl = document.getElementById('error-icon')
const titleEl = document.getElementById('error-title')
const descEl = document.getElementById('error-description')
const urlEl = document.getElementById('error-url')
const codeEl = document.getElementById('error-code')
const btnProceed = document.getElementById('btn-proceed')

function isCertificateError(code) {
  const c = parseInt(code, 10)
  if (isNaN(c)) return false
  if (c <= -200 && c >= -299) return true
  if (c === -501) return true
  return false
}

function getErrorInfo(code, desc) {
  const c = parseInt(code, 10)
  const map = {
    '-105': { icon: '🔍', title: 'Не удалось найти сайт', description: 'Проверьте правильность адреса или подключение к интернету.' },
    '-106': { icon: '📡', title: 'Нет подключения к интернету', description: 'Проверьте сетевые настройки и попробуйте снова.' },
    '-102': { icon: '⏳', title: 'Сервер не отвечает', description: 'Сайт временно недоступен. Попробуйте позже.' },
    '-109': { icon: '🚫', title: 'Хост недоступен', description: 'Не удаётся установить соединение с сервером.' },
    '-118': { icon: '⌛', title: 'Превышено время ожидания', description: 'Сервер слишком долго не отвечает.' },

    '-200': { icon: '🔒', title: 'Сертификат недействителен', description: 'Сертификат сайта содержит ошибки или не соответствует домену.' },
    '-201': { icon: '🔒', title: 'Сертификат отклонён', description: 'Сертификат сайта недействителен.' },
    '-202': { icon: '🔒', title: 'Сертификат отклонён', description: 'Не удалось проверить подлинность сертификата. Возможно, сайт использует нестандартный удостоверяющий центр.' },
    '-203': { icon: '🔒', title: 'Сертификат отозван', description: 'Сертификат сайта был отозван удостоверяющим центром.' },
    '-204': { icon: '🔒', title: 'Недействительный сертификат', description: 'Сертификат сайта не может быть проверен.' },
    '-205': { icon: '🔒', title: 'Слабый алгоритм подписи', description: 'Сертификат использует устаревший алгоритм подписи.' },
    '-206': { icon: '🔒', title: 'Некорректный домен', description: 'Имя в сертификате не совпадает с адресом сайта.' },
    '-207': { icon: '🔒', title: 'Недействительный сертификат', description: 'Не удалось проверить подлинность сайта.' },
    '-208': { icon: '🔒', title: 'Слабый алгоритм', description: 'Сертификат использует слабый алгоритм шифрования.' },
    '-210': { icon: '📅', title: 'Истёкший сертификат', description: 'Срок действия сертификата истёк или ещё не начался.' },
    '-211': { icon: '🔒', title: 'Слабый ключ', description: 'Сертификат использует слишком короткий ключ.' },
    '-212': { icon: '🔒', title: 'Недействительный сертификат', description: 'Сертификат не соответствует требованиям безопасности.' },
    '-501': { icon: '🔓', title: 'Небезопасное соединение', description: 'Сайт пытается установить небезопасное соединение.' },
  }

  if (map[String(c)]) return map[String(c)]
  return {
    icon: '⚠️',
    title: 'Не удалось открыть страницу',
    description: desc || 'Что-то пошло не так. Попробуйте перезагрузить страницу.',
  }
}

const info = getErrorInfo(errorCode, errorDesc)
iconEl.textContent = info.icon
titleEl.textContent = info.title
descEl.textContent = info.description

if (failedUrl) urlEl.textContent = failedUrl
else urlEl.style.display = 'none'

if (errorCode) codeEl.textContent = `Код ошибки: ${errorCode}${errorDesc ? ' · ' + errorDesc : ''}`
else codeEl.style.display = 'none'

if (isCertificateError(errorCode) && failedUrl) {
  btnProceed.style.display = 'inline-flex'
}

document.getElementById('btn-retry').addEventListener('click', () => {
  window.browserAPI.errorRetry()
})

btnProceed.addEventListener('click', () => {
  window.browserAPI.errorProceedAnyway(failedUrl)
})

document.getElementById('btn-home').addEventListener('click', () => {
  window.browserAPI.errorGoHome()
})

// Тема и акцент: см. shared/theme.js