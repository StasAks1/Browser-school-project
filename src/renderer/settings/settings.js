const content = document.getElementById('content')
const sidebarItems = document.querySelectorAll('.sidebar-item')

let appInfo = null
let currentTheme = 'dark'
let currentAccent = 'orange'
let accentOptions = []
let downloadsInfo = { path: '', askWhereToSave: false, isDefault: true }
let restoreSessionEnabled = true
let trackerEnabled = true
let trackerStats = { total: 0, byDomain: [] }
let toolbarSettings = { all: [], visible: [] }
let httpsOnlyEnabled = false
let homepageValue = 'startpage'
let customTheme = null

// ============ Инициализация ============
async function init() {
  appInfo = await window.browserAPI.getAppInfo()
  const settings = await window.browserAPI.getSettings()
  currentTheme = settings.theme || 'dark'
  currentAccent = settings.accent || 'orange'
  restoreSessionEnabled = settings.restoreSession !== false
  accentOptions = await window.browserAPI.getAccentOptions()

  const trackerSetting = await window.browserAPI.getTrackerSetting()
  trackerEnabled = !!trackerSetting.enabled
  trackerStats = trackerSetting.stats || { total: 0, byDomain: [] }

  toolbarSettings = await window.browserAPI.getToolbarSettings()
  httpsOnlyEnabled = await window.browserAPI.getHttpsOnly()
  homepageValue = await window.browserAPI.getHomepage()
  customTheme = await window.browserAPI.getCustomTheme()

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
const TOOLBAR_LABELS = {
  reader: 'Режим чтения',
  find: 'Поиск на странице',
  downloads: 'Загрузки',
  history: 'История',
  reload: 'Обновить',
  home: 'Домой',
}

function renderToolbarCheckboxes() {
  const visible = new Set(toolbarSettings.visible || [])
  const order = Array.isArray(toolbarSettings.visible) ? toolbarSettings.visible : []
  const all = [...order, ...(toolbarSettings.all || []).filter(id => !order.includes(id))]

  return all.map((id, idx) => {
    const isVisible = visible.has(id)
    const isFirst = idx === 0
    const isLast = idx === all.length - 1

    return `
      <div class="toolbar-row" data-row-id="${id}">
        <label class="toolbar-checkbox">
          <input type="checkbox" data-toolbar-toggle="${id}" ${isVisible ? 'checked' : ''}>
          <span>${escapeHtml(TOOLBAR_LABELS[id] || id)}</span>
        </label>
        <div class="toolbar-arrows">
          <button type="button" class="toolbar-arrow" data-move-up="${id}" title="Вверх" ${isFirst ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 15l-6-6-6 6"/>
            </svg>
          </button>
          <button type="button" class="toolbar-arrow" data-move-down="${id}" title="Вниз" ${isLast ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
        </div>
      </div>
    `
  }).join('')
}

function renderAppearance() {
  const accentSwatches = accentOptions.map((opt) => `
    <button class="accent-option${opt.name === currentAccent ? ' active' : ''}"
            data-accent="${opt.name}"
            title="${escapeHtml(opt.label)}">
      <span class="accent-circle" style="background: ${opt.color};"></span>
    </button>
  `).join('')

  const isCustomHomepage = homepageValue !== 'startpage' && homepageValue !== 'about:blank'

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

      <div class="setting-row column">
        <div class="setting-body">
          <div class="setting-label">Кнопки на панели</div>
          <div class="setting-desc">Какие кнопки показывать в правой части тулбара и в каком порядке. Кнопка «Настройки» всегда видна.</div>
        </div>
        <div class="setting-control" style="width: 100%; margin-top: 8px;">
          <div class="toolbar-checkboxes" id="toolbar-checkboxes">
            ${renderToolbarCheckboxes()}
          </div>
        </div>
      </div>

      <div class="setting-row column">
        <div class="setting-body">
          <div class="setting-label">Домашняя страница</div>
          <div class="setting-desc">Что открывается при нажатии кнопки «Домой» (Cmd/Ctrl+Shift+H)</div>
        </div>
        <div class="setting-control" style="width: 100%; margin-top: 12px;">
          <div class="homepage-options" id="homepage-options">
            <label class="homepage-option">
              <input type="radio" name="homepage-mode" value="startpage" ${homepageValue === 'startpage' ? 'checked' : ''}>
              <span>Стартовая страница браузера</span>
            </label>
            <label class="homepage-option">
              <input type="radio" name="homepage-mode" value="about:blank" ${homepageValue === 'about:blank' ? 'checked' : ''}>
              <span>Пустая страница</span>
            </label>
            <label class="homepage-option">
              <input type="radio" name="homepage-mode" value="custom" ${isCustomHomepage ? 'checked' : ''}>
              <span>Пользовательский адрес</span>
            </label>
          </div>
          <input
            type="text"
            id="homepage-url-input"
            class="modal-input"
            style="margin-top: 10px; width: 100%;"
            placeholder="https://example.com"
            value="${isCustomHomepage ? escapeHtml(homepageValue) : ''}"
            ${!isCustomHomepage ? 'disabled' : ''}
          >
        </div>
      </div>

      <div class="setting-row column">
        <div class="setting-body">
          <div class="setting-label">Кастомная тема из файла</div>
          <div class="setting-desc">
            Загрузите JSON-файл с переменными темы (цвета фона, текста, акцента).
            Если тема активна — перебивает светлую/тёмную.
          </div>
        </div>
        <div class="setting-control theme-control" style="width: 100%; margin-top: 12px;">
          <div class="custom-theme-status" id="custom-theme-status">
            ${customTheme
              ? `<strong>${escapeHtml(customTheme.name || 'Без названия')}</strong> — активно`
              : 'Кастомная тема не активна'}
          </div>
          <div class="custom-theme-actions">
            <button id="import-theme-btn" class="btn-dl">Загрузить тему…</button>
            ${customTheme ? '<button id="clear-theme-btn" class="btn-dl btn-dl-secondary">Сбросить</button>' : ''}
            <button id="export-theme-btn" class="btn-dl btn-dl-secondary">Скачать пример</button>
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

  const toolbarBox = document.getElementById('toolbar-checkboxes')

  function collectToolbarState() {
    const order = []
    toolbarBox.querySelectorAll('[data-row-id]').forEach((row) => {
      const id = row.dataset.rowId
      const cb = row.querySelector('[data-toolbar-toggle]')
      if (cb && cb.checked) order.push(id)
    })
    return order
  }

  function rerenderToolbarBox() {
    toolbarBox.innerHTML = renderToolbarCheckboxes()
    bindToolbarHandlers()
  }

  function bindToolbarHandlers() {
    toolbarBox.querySelectorAll('[data-toolbar-toggle]').forEach((cb) => {
      cb.addEventListener('change', async () => {
        toolbarSettings = await window.browserAPI.setToolbarSettings(collectToolbarState())
        rerenderToolbarBox()
      })
    })

    toolbarBox.querySelectorAll('[data-move-up]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.moveUp
        const arr = [...(toolbarSettings.visible || [])]
        const idx = arr.indexOf(id)
        if (idx > 0) {
          [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
          toolbarSettings = await window.browserAPI.setToolbarSettings(arr)
          rerenderToolbarBox()
        }
      })
    })

    toolbarBox.querySelectorAll('[data-move-down]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.moveDown
        const arr = [...(toolbarSettings.visible || [])]
        const idx = arr.indexOf(id)
        if (idx >= 0 && idx < arr.length - 1) {
          [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
          toolbarSettings = await window.browserAPI.setToolbarSettings(arr)
          rerenderToolbarBox()
        }
      })
    })
  }

  bindToolbarHandlers()

  // ============ Homepage ============
  const homepageOptions = document.getElementById('homepage-options')
  const homepageInput = document.getElementById('homepage-url-input')

  homepageOptions.querySelectorAll('input[name="homepage-mode"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      const mode = radio.value
      if (mode === 'startpage') {
        homepageInput.disabled = true
        homepageInput.value = ''
        homepageValue = await window.browserAPI.setHomepage('startpage')
      } else if (mode === 'about:blank') {
        homepageInput.disabled = true
        homepageInput.value = ''
        homepageValue = await window.browserAPI.setHomepage('about:blank')
      } else {
        homepageInput.disabled = false
        homepageInput.focus()
        const v = homepageInput.value.trim()
        if (v && /^https?:\/\//i.test(v)) {
          homepageValue = await window.browserAPI.setHomepage(v)
        }
      }
    })
  })

  let homepageSaveTimer = null
  homepageInput.addEventListener('input', () => {
    clearTimeout(homepageSaveTimer)
    homepageSaveTimer = setTimeout(async () => {
      const v = homepageInput.value.trim()
      if (!v) return
      homepageValue = await window.browserAPI.setHomepage(v)
    }, 600)
  })

  // ============ Кастомная тема ============
  const importThemeBtn = document.getElementById('import-theme-btn')
  const clearThemeBtn = document.getElementById('clear-theme-btn')
  const exportThemeBtn = document.getElementById('export-theme-btn')
  const themeStatus = document.getElementById('custom-theme-status')

  importThemeBtn.addEventListener('click', async () => {
    importThemeBtn.disabled = true
    try {
      const res = await window.browserAPI.importTheme()
      if (res.ok) {
        customTheme = res.theme
        themeStatus.innerHTML = `<strong>${escapeHtml(customTheme.name)}</strong> — активно`
        renderAppearance()
      } else if (!res.canceled) {
        window.alert(res.error || 'Не удалось загрузить тему')
      }
    } catch (err) {
      window.alert('Ошибка загрузки темы')
    } finally {
      importThemeBtn.disabled = false
    }
  })

  if (clearThemeBtn) {
    clearThemeBtn.addEventListener('click', async () => {
      await window.browserAPI.clearCustomTheme()
      customTheme = null
      renderAppearance()
    })
  }

  exportThemeBtn.addEventListener('click', async () => {
    exportThemeBtn.disabled = true
    try {
      const res = await window.browserAPI.exportThemeExample()
      if (res.ok) {
        const original = exportThemeBtn.textContent
        exportThemeBtn.textContent = 'Сохранено'
        setTimeout(() => { exportThemeBtn.textContent = original }, 1500)
      } else if (!res.canceled) {
        window.alert(res.error || 'Не удалось сохранить пример')
      }
    } catch {
      window.alert('Ошибка сохранения')
    } finally {
      exportThemeBtn.disabled = false
    }
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
  const topDomains = (trackerStats.byDomain || []).slice(0, 5)
  const topDomainsHtml = topDomains.length
    ? `
      <div class="tracker-top">
        <div class="tracker-top-title">Топ домены:</div>
        <ul class="tracker-top-list">
          ${topDomains.map(d => `
            <li>
              <span class="tracker-domain">${escapeHtml(d.domain)}</span>
              <span class="tracker-count">${d.count}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `
    : ''

  content.innerHTML = `
    <div class="section-title">Приватность</div>
    <div class="section-subtitle">Управление локальными данными и блокировкой трекеров.</div>

    <div class="setting-group">
      <div class="setting-row">
        <div class="setting-body">
          <div class="setting-label">Блокировка трекеров и рекламы</div>
          <div class="setting-desc">Отменяет запросы к аналитическим и рекламным сетям (Google Analytics, Facebook Pixel, Yandex Metrica и др.)</div>
        </div>
        <div class="setting-control">
          <label class="switch">
            <input type="checkbox" id="tracker-switch" ${trackerEnabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="setting-row column">
        <div class="setting-body">
          <div class="setting-label">Статистика блокировки</div>
          <div class="setting-desc">
            Заблокировано запросов с момента запуска браузера:
            <strong id="tracker-total">${trackerStats.total || 0}</strong>
          </div>
        </div>
        ${topDomainsHtml}
        <div class="setting-control" style="margin-top: 12px;">
          <button id="reset-tracker-stats" class="btn-dl btn-dl-secondary">Сбросить статистику</button>
        </div>
      </div>
    </div>

    <div class="setting-group">
      <div class="setting-row">
        <div class="setting-body">
          <div class="setting-label">Только HTTPS</div>
          <div class="setting-desc">
            Блокирует все незащищённые сайты (HTTP). Это защищает от перехвата данных —
            паролей, сообщений, платёжной информации — третьими лицами.
          </div>
        </div>
        <div class="setting-control">
          <label class="switch">
            <input type="checkbox" id="https-only-switch" ${httpsOnlyEnabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      </div>
    </div>

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
          Просмотр, редактирование и удаление cookie, которые сайты сохранили в браузере.
          Все cookie хранятся <strong>только на вашем устройстве</strong> —
          браузер не сохраняет их в свои файлы, не логирует содержимое и никуда не отправляет.
        </div>
        <div class="setting-control" style="margin-top: 14px;">
          <button id="open-cookies" class="btn-dl">Открыть менеджер cookie</button>
        </div>
      </div>
    </div>

    <div class="setting-group">
      <div class="setting-row column">
        <div class="setting-label">Кэш браузера</div>
        <div class="setting-desc" style="margin-top: 8px;">
          Chromium хранит копии страниц, картинок и скриптов на диске, чтобы сайты открывались быстрее.
          Размер ограничен <strong>100 МБ</strong>. Очистка удалит накопленные данные —
          сайты будут загружаться чуть медленнее, но никакие копии не останутся на устройстве.
        </div>
        <div class="setting-control" style="margin-top: 14px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <span id="cache-size-label" class="cache-size-label">Размер кэша: —</span>
          <button id="clear-cache-btn" class="btn-dl btn-dl-secondary">Очистить кэш</button>
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

  // ============ Кэш браузера ============
  const cacheSizeLabel = document.getElementById('cache-size-label')
  const clearCacheBtn = document.getElementById('clear-cache-btn')

  function formatBytes(bytes) {
    if (!bytes || bytes < 0) return '0 Б'
    const units = ['Б', 'КБ', 'МБ', 'ГБ']
    let i = 0
    let v = bytes
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
  }

  async function refreshCacheSize() {
    try {
      const res = await window.browserAPI.getCacheSize()
      const bytes = res?.bytes || 0
      cacheSizeLabel.textContent = `Размер кэша: ~${formatBytes(bytes)}`
    } catch {
      cacheSizeLabel.textContent = 'Размер кэша: —'
    }
  }

  refreshCacheSize()

  clearCacheBtn.addEventListener('click', async () => {
    const sizeText = cacheSizeLabel.textContent.replace('Размер кэша: ', '')
    const confirmed = window.confirm(
      `Очистить кэш браузера?\n\nБудут удалены копии страниц, картинок и скриптов (сейчас: ${sizeText}).\n\nКуки, история и закладки не затрагиваются. Это действие нельзя отменить.`
    )
    if (!confirmed) return

    const originalText = clearCacheBtn.textContent
    clearCacheBtn.disabled = true
    clearCacheBtn.textContent = 'Очистка…'

    try {
      const res = await window.browserAPI.clearCache()
      if (res.ok) {
        clearCacheBtn.textContent = 'Кэш очищен'
        await refreshCacheSize()
      } else {
        clearCacheBtn.textContent = res.error || 'Ошибка'
      }
    } catch {
      clearCacheBtn.textContent = 'Ошибка'
    } finally {
      setTimeout(() => {
        clearCacheBtn.textContent = originalText
        clearCacheBtn.disabled = false
      }, 1500)
    }
  })

  // ============ HTTPS-only ============
  document.getElementById('https-only-switch').addEventListener('change', async (e) => {
    httpsOnlyEnabled = await window.browserAPI.setHttpsOnly(e.target.checked)
  })

  // ============ Восстановление сессии ============
  document.getElementById('restore-session-switch').addEventListener('change', async (e) => {
    const value = e.target.checked
    const res = await window.browserAPI.setSessionSetting(value)
    restoreSessionEnabled = res.restoreSession
  })

  // ============ Трекеры ============
  document.getElementById('tracker-switch').addEventListener('change', async (e) => {
    const value = e.target.checked
    const res = await window.browserAPI.setTrackerSetting(value)
    trackerEnabled = res.enabled
    trackerStats = res.stats
    renderPrivacy()
  })

  const resetStatsBtn = document.getElementById('reset-tracker-stats')
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener('click', async () => {
      trackerStats = await window.browserAPI.resetTrackerStats()
      renderPrivacy()
    })
  }
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
          <strong>@mozilla/readability</strong> — Apache 2.0<br>
          <strong>pdfjs-dist</strong> — Apache 2.0<br>
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
          восстановления сессии, приватного режима, режима чтения, PDF-viewer, блокировки трекеров
          и кастомных разрешений. Все данные хранятся локально на устройстве пользователя.
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

// ============ Старт ============
function getInitialSection() {
  const valid = ['appearance', 'downloads', 'privacy', 'about']
  try {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('section')
    if (s && valid.includes(s)) return s
  } catch (e) {}
  return 'appearance'
}

init().then(() => {
  const section = getInitialSection()
  if (section !== 'appearance') {
    sidebarItems.forEach((x) => {
      x.classList.toggle('active', x.dataset.section === section)
    })
    renderSection(section)
  }
})