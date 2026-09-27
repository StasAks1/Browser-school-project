const content = document.getElementById('content')
const sidebarItems = document.querySelectorAll('.sidebar-item')

let appInfo = null
let currentTheme = 'dark'
let currentAccent = 'orange'
let accentOptions = []
let downloadsInfo = { path: '', askWhereToSave: false, isDefault: true }
let restoreSessionEnabled = true

// ============ Инициализация ============
async function init() {
  appInfo = await window.browserAPI.getAppInfo()
  const settings = await window.browserAPI.getSettings()
  currentTheme = settings.theme || 'dark'
  currentAccent = settings.accent || 'orange'
  restoreSessionEnabled = settings.restoreSession !== false
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

function renderSection(section) {
  if (section === 'appearance') renderAppearance()
  else if (section === 'downloads') renderDownloadsSettings()
  else if (section === 'privacy') renderPrivacy()
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
    <div class="section-subtitle">Настройте оформление браузера — светлая, тёмная или автоматически по системной теме.</div>

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

// ============ Загрузки ============
async function renderDownloadsSettings() {
  downloadsInfo = await window.browserAPI.getDownloadsPath()

  content.innerHTML = `
    <div class="section-title">Загрузки</div>
    <div class="section-subtitle">Куда сохранять файлы и как спрашивать о месте сохранения.</div>

    <div class="setting-group">
      <div class="setting-row column">
        <div class="setting-body">
          <div class="setting-label">Папка для сохранения файлов</div>
          <div class="setting-desc">Куда будут попадать скачанные файлы по умолчанию</div>
        </div>
        <div class="setting-control dl-path-control">
          <div class="dl-path" id="dl-path" title="${escapeHtml(downloadsInfo.path)}">${escapeHtml(downloadsInfo.path)}</div>
          <div class="dl-actions">
            <button id="dl-change" class="btn-dl">Изменить…</button>
            ${!downloadsInfo.isDefault ? '<button id="dl-reset" class="btn-dl btn-dl-secondary">По умолчанию</button>' : ''}
          </div>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-body">
          <div class="setting-label">Спрашивать, куда сохранять</div>
          <div class="setting-desc">Показывать диалог сохранения перед каждой загрузкой</div>
        </div>
        <div class="setting-control">
          <label class="switch">
            <input type="checkbox" id="ask-switch" ${downloadsInfo.askWhereToSave ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      </div>
    </div>
  `

  document.getElementById('dl-change').addEventListener('click', async () => {
    downloadsInfo = await window.browserAPI.setDownloadsPath()
    renderDownloadsSettings()
  })

  const resetBtn = document.getElementById('dl-reset')
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      downloadsInfo = await window.browserAPI.resetDownloadsPath()
      renderDownloadsSettings()
    })
  }

  document.getElementById('ask-switch').addEventListener('change', async (e) => {
    downloadsInfo = await window.browserAPI.setAskWhereToSave(e.target.checked)
  })
}

// ============ Приватность ============
function renderPrivacy() {
  content.innerHTML = `
    <div class="section-title">Приватность</div>
    <div class="section-subtitle">Управление локальными данными и поведением при запуске.</div>

    <div class="setting-group">
      <div class="setting-row">
        <div class="setting-body">
          <div class="setting-label">Восстанавливать сессию при запуске</div>
          <div class="setting-desc">Открывать вкладки, которые были открыты в прошлый раз. Внутренние страницы браузера не сохраняются.</div>
        </div>
        <div class="setting-control">
          <label class="switch">
            <input type="checkbox" id="restore-session-switch" ${restoreSessionEnabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="setting-group">
      <div class="setting-row column">
        <div class="setting-label">Cookie-менеджер</div>
        <div class="setting-desc" style="margin-top: 8px;">
          Просмотр и удаление cookie, которые сайты сохранили в браузере.
          Все cookie хранятся <strong>только на вашем устройстве</strong> —
          браузер не сохраняет их в свои файлы, не логирует содержимое и никуда не отправляет.
          Это соответствует принципу «локальной обработки» и не требует статуса оператора персональных данных (152-ФЗ).
        </div>
        <div class="setting-control" style="margin-top: 14px;">
          <button id="open-cookies" class="btn-dl">Открыть менеджер cookie</button>
        </div>
      </div>
    </div>

    <div class="setting-group">
      <div class="setting-row column">
        <div class="setting-label">Хранение данных</div>
        <div class="setting-desc" style="margin-top: 8px; line-height: 1.6;">
          <strong>Что и где хранится:</strong><br>
          • Закладки, история, настройки, список загрузок — в локальной папке профиля приложения (userData)<br>
          • Сессия (список открытых вкладок) — в userData/session.json, только если включено восстановление<br>
          • Cookie, кэш, localStorage сайтов — во встроенной сессии Chromium<br>
          • Всё это находится исключительно на вашем компьютере и не передаётся разработчику или третьим лицам
        </div>
      </div>
    </div>
  `

  document.getElementById('open-cookies').addEventListener('click', () => {
    window.browserAPI.openCookiesPage()
  })

  document.getElementById('restore-session-switch').addEventListener('change', async (e) => {
    const value = e.target.checked
    const res = await window.browserAPI.setSessionSetting(value)
    restoreSessionEnabled = res.restoreSession
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
          с поддержкой вкладок, закладок, папок, истории, загрузок, cookie-менеджера,
          восстановления сессии и кастомных разрешений. Все данные хранятся локально на устройстве пользователя.
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

// ============ Тема и акцент (синхронизация UI) ============
// Применение темы и акцента к DOM делает shared/theme.js.
// Здесь только обновляем активные кнопки при изменении.
window.themeManager.onTheme(() => {
  const themeOptions = document.getElementById('theme-options')
  if (themeOptions) {
    themeOptions.querySelectorAll('.theme-option').forEach((x) => {
      x.classList.toggle('active', x.dataset.theme === currentTheme)
    })
  }
})

window.themeManager.onAccent((data) => {
  if (data && data.name) currentAccent = data.name
  const accentBox = document.getElementById('accent-options')
  if (accentBox) {
    accentBox.querySelectorAll('.accent-option').forEach((x) => {
      x.classList.toggle('active', x.dataset.accent === currentAccent)
    })
  }
})

// ============ Запуск ============
init()