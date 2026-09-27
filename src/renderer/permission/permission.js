const params = new URLSearchParams(window.location.search)
const origin = params.get('origin') || 'Сайт'
const label = params.get('label') || 'чему-то'

document.getElementById('domain').textContent = origin
document.getElementById('perm-label').textContent = label

const btnAllow = document.getElementById('btn-allow')
const btnDeny = document.getElementById('btn-deny')

let responded = false

function respond(allowed) {
  if (responded) return
  responded = true
  window.browserAPI.permissionRespond(allowed)
}

btnAllow.addEventListener('click', () => respond(true))
btnDeny.addEventListener('click', () => respond(false))

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); respond(false) }
  else if (e.key === 'Enter') { e.preventDefault(); respond(true) }
})

// Тема и акцент: см. shared/theme.js