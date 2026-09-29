const content = document.getElementById('content')
const btnInstall = document.getElementById('btn-install')
const btnUpdateAll = document.getElementById('btn-update-all')
const btnInstallUblock = document.getElementById('btn-install-ublock')
const installInput = document.getElementById('install-input')
const toastEl = document.getElementById('toast')

let extensions = []

// ============ Утилиты ============
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

const EXTENSION_ID_RE = /^[a-z]{32}$/

function isValidExtensionId(id) {
  return EXTENSION_ID_RE.test(String(id || '').trim().toLowerCase())
}

let toastTimer = null
function showToast(msg) {
  toastEl.textContent = msg
  toastEl.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2800)
}

// ============ Рендер ============
const ICON_PUZZLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/></svg>`

function render() {
  if (extensions.length === 0) {
    content.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🧩</div>
        <div class="empty-title">Расширений пока нет</div>
        <div class="empty-subtitle">
          Установите первое расширение по ID из Chrome Web Store — например, uBlock Origin Lite для блокировки рекламы.
        </div>
      </div>`
    return
  }

  content.innerHTML = `
    <div class="content-title">Установлено: ${extensions.length}</div>
    <div id="ext-list"></div>
  `

  const list = document.getElementById('ext-list')
  for (const ext of extensions) list.appendChild(createCard(ext))
}

function createCard(ext) {
  const el = document.createElement('div')
  el.className = 'ext-card'
  el.dataset.id = ext.id

  el.innerHTML = `
    <div class="ext-icon">${ICON_PUZZLE}</div>
    <div class="ext-body">
      <div class="ext-name">${escapeHtml(ext.name || 'Без названия')}</div>
      <div class="ext-meta">
        <span>v${escapeHtml(ext.version || '—')}</span>
      </div>
      ${ext.description ? `<div class="ext-desc">${escapeHtml(ext.description)}</div>` : ''}
      <div class="ext-id">${escapeHtml(ext.id)}</div>
    </div>
    <div class="ext-actions">
      <button class="item-btn danger" data-action="remove">Удалить</button>
    </div>
  `

  el.querySelector('[data-action="remove"]').addEventListener('click', async () => {
    if (!confirm(`Удалить расширение «${ext.name}»?`)) return
    const res = await window.browserAPI.removeExtension(ext.id)
    if (!res.ok) {
      showToast(res.error || 'Не удалось удалить')
      return
    }
    showToast('Расширение удалено')
    await reload()
  })

  return el
}

// ============ Действия ============
async function reload() {
  extensions = await window.browserAPI.listExtensions() || []
  render()
}

async function installById(id) {
  const clean = String(id || '').trim().toLowerCase()
  if (!isValidExtensionId(clean)) {
    showToast('Некорректный ID — должно быть 32 строчных латинских буквы')
    return
  }

  const existing = extensions.find(e => e.id === clean)
  if (existing) {
    showToast('Это расширение уже установлено')
    return
  }

  btnInstall.disabled = true
  const originalText = btnInstall.textContent
  btnInstall.textContent = 'Установка…'

  try {
    const res = await window.browserAPI.installExtension(clean)
    if (!res.ok) {
      showToast(res.error || 'Не удалось установить расширение')
      return
    }
    showToast('Расширение установлено')
    installInput.value = ''
    await reload()
  } catch (err) {
    showToast('Ошибка установки: ' + (err.message || 'неизвестно'))
  } finally {
    btnInstall.disabled = false
    btnInstall.textContent = originalText
  }
}

btnInstall.addEventListener('click', () => installById(installInput.value))

installInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    installById(installInput.value)
  }
})

btnInstallUblock.addEventListener('click', () => {
  installInput.value = 'ddkjiahejlhfcafbddmgiahcphecmpfh'
  installById('ddkjiahejlhfcafbddmgiahcphecmpfh')
})

btnUpdateAll.addEventListener('click', async () => {
  btnUpdateAll.disabled = true
  const originalText = btnUpdateAll.querySelector('span').textContent
  btnUpdateAll.querySelector('span').textContent = 'Обновление…'
  try {
    const res = await window.browserAPI.updateExtensions()
    if (!res.ok) {
      showToast(res.error || 'Не удалось обновить')
      return
    }
    showToast('Проверка обновлений завершена')
    await reload()
  } catch (err) {
    showToast('Ошибка: ' + (err.message || 'неизвестно'))
  } finally {
    btnUpdateAll.disabled = false
    btnUpdateAll.querySelector('span').textContent = originalText
  }
})

// ============ Старт ============
reload()

//эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго