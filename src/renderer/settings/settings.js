const content = document.getElementById('content')
const sidebarItems = document.querySelectorAll('.sidebar-item')

let appInfo = null
let currentTheme = 'dark'
let currentAccent = 'orange'
let accentOptions = []

// ============ Инициализация ============
async function init() {
  appInfo = await window.browserAPI.getAppInfo()
  const settings = await window.browserAPI.getSettings()
  currentTheme = settings.theme || 'dark'
  currentAccent = settings.accent || 'orange'
  accentOptions = await window.browserAPI.getAccentOptions()

  renderSection('appearance')

  sidebarItems.forEach((item) => {
    item.addEventListener('click', () => {
      sidebarItems.forEach((x) => x.classList.remove('active'))
      item.classList.add('active')
      renderSection(item.dataset.section)
    })
  })
}

// ============ Рендер секции ============
function renderSection(section) {
  if (section === 'appearance') renderAppearance()
  else if (section === 'about') renderAbout()
}

// ============ Внешний вид ============
function renderAppearance() {
  const accentSwatches = accentOptions.map((opt) => `
    <button class="accent-option${opt.name === currentAccent ? ' active' : ''}"
            data-accent="${opt.name}"
            title="${escapeHtml(opt.label)}">
      <span class="accent-circle" style="background: ${opt.color};"></span>
    </button>
  `).join('')

  content.innerHTML = `
    <div class="section-title">Внешний вид</div>
    <div class="section-subtitle">Настройте оформление браузера — светлая, тёмная или автоматически по системной теме macOS.</div>

    <div class="setting-group">
      <div class="setting-row column">
        <div class="setting-body">
          <div class="setting-label">Тема оформления</div>
          <div class="setting-desc">Применится ко всем окнам и вкладкам</div>
        </div>
        <div class="setting-control" style="width: 100%; margin-top: 12px;">
          <div class="theme-options" id="theme-options">
            <button class="theme-option${currentTheme === 'light' ? ' active' : ''}" data-theme="light">
              <div class="theme-preview light">
                <div class="theme-preview-bar"></div>
                <div class="theme-preview-body"></div>
              </div>
              <span>Светлая</span>
            </button>
            <button class="theme-option${currentTheme === 'dark' ? ' active' : ''}" data-theme="dark">
              <div class="theme-preview dark">
                <div class="theme-preview-bar"></div>
                <div class="theme-preview-body"></div>
              </div>
              <span>Тёмная</span>
            </button>
            <button class="theme-option${currentTheme === 'system' ? ' active' : ''}" data-theme="system">
              <div class="theme-preview system">
                <div class="theme-preview-bar"></div>
                <div class="theme-preview-body"></div>
              </div>
              <span>Системная</span>
            </button>
          </div>
        </div>
      </div>

      <div class="setting-row column">
        <div class="setting-body">
          <div class="setting-label">Акцентный цвет</div>
          <div class="setting-desc">Цвет кнопок, ссылок и активных элементов</div>
        </div>
        <div class="setting-control" style="width: 100%;">
          <div class="accent-options" id="accent-options">
            ${accentSwatches}
          </div>
        </div>
      </div>
    </div>
  `

  const themeOptions = document.getElementById('theme-options')
  themeOptions.querySelectorAll('.theme-option').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.theme
      currentTheme = theme
      await window.browserAPI.setTheme(theme)
      themeOptions.querySelectorAll('.theme-option').forEach((x) => x.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  const accentBox = document.getElementById('accent-options')
  accentBox.querySelectorAll('.accent-option').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.accent
      currentAccent = name
      await window.browserAPI.setAccent(name)
      accentBox.querySelectorAll('.accent-option').forEach((x) => x.classList.remove('active'))
      btn.classList.add('active')
    })
  })
}

// ============ О браузере ============
function renderAbout() {
  const info = appInfo || {
    name: 'Browser Project',
    version: '—',
    electronVersion: '—',
    chromeVersion: '—',
    nodeVersion: '—',
    platform: '—',
  }

  const platformLabels = {
    darwin: 'macOS',
    win32: 'Windows',
    linux: 'Linux',
  }

  content.innerHTML = `
    <div class="section-title">О браузере</div>
    <div class="section-subtitle">Информация о версии и используемых технологиях.</div>

    <div class="about-header">
      <div>
        <div class="about-name">${escapeHtml(info.name)}</div>
        <div class="about-version">Версия ${escapeHtml(info.version)}</div>
      </div>
    </div>

    <div class="setting-group">
      <div class="info-list">
        <div class="info-row">
          <span class="info-key">Версия приложения</span>
          <span class="info-value">${escapeHtml(info.version)}</span>
        </div>
        <div class="info-row">
          <span class="info-key">Electron</span>
          <span class="info-value">${escapeHtml(info.electronVersion)}</span>
        </div>
        <div class="info-row">
          <span class="info-key">Chromium</span>
          <span class="info-value">${escapeHtml(info.chromeVersion)}</span>
        </div>
        <div class="info-row">
          <span class="info-key">Node.js</span>
          <span class="info-value">${escapeHtml(info.nodeVersion)}</span>
        </div>
        <div class="info-row">
          <span class="info-key">Платформа</span>
          <span class="info-value">${escapeHtml(platformLabels[info.platform] || info.platform)}</span>
        </div>
      </div>
    </div>

    <div class="setting-group">
      <div class="setting-row column">
        <div class="setting-label">Используемые технологии</div>
        <div class="licenses-list" style="margin-top: 8px;">
          <strong>Electron</strong> — MIT License<br>
          <strong>Vite</strong> — MIT License<br>
          <strong>electron-vite</strong> — MIT License<br>
          <strong>DuckDuckGo Autocomplete API</strong> — публичный API<br>
          <strong>DuckDuckGo Favicon Service</strong> — публичный сервис
        </div>
      </div>
    </div>

    <div class="setting-group">
      <div class="setting-row column">
        <div class="setting-label">Итоговый проект</div>
        <div class="setting-desc" style="margin-top: 8px; line-height: 1.6;">
          Учебный проект по информатике. Кроссплатформенный браузер на Electron + Vite
          с поддержкой вкладок, закладок, папок, истории и кастомных разрешений.
          Все данные хранятся локально на устройстве пользователя.
        </div>
      </div>
    </div>
  `
}

// ============ Утилиты ============
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}

// ============ Тема и акцент ============
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
}

function applyAccent(data) {
  if (!data) return
  document.documentElement.style.setProperty('--accent', data.color)
  document.documentElement.style.setProperty('--accent-hover', data.hover)
}

window.browserAPI.onThemeChanged((theme) => {
  applyTheme(theme)
  const themeOptions = document.getElementById('theme-options')
  if (themeOptions) {
    themeOptions.querySelectorAll('.theme-option').forEach((x) => {
      x.classList.toggle('active', x.dataset.theme === currentTheme)
    })
  }
})

window.browserAPI.onAccentChanged((data) => {
  applyAccent(data)
  currentAccent = data.name
  const accentBox = document.getElementById('accent-options')
  if (accentBox) {
    accentBox.querySelectorAll('.accent-option').forEach((x) => {
      x.classList.toggle('active', x.dataset.accent === currentAccent)
    })
  }
})

window.browserAPI.getTheme().then((theme) => applyTheme(theme))
window.browserAPI.getAccent().then((data) => applyAccent(data))

// ============ Запуск ============
init()