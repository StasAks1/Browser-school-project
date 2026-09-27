/**
 * Меню приложения.
 */
import { Menu, app, shell } from 'electron'

function safeCall(fn) {
  return () => {
    try { fn() } catch (e) { console.error('[menu]', e) }
  }
}

export function buildApplicationMenu(actions, opts = {}) {
  const isMac = process.platform === 'darwin'
  const appName = opts.appName || app.getName() || 'Browser Project'

  const template = []

  // ============================================================
  // ============ macOS: app menu (первый пункт) ================
  // ============================================================
  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { role: 'about', label: `О ${appName}` },
        { type: 'separator' },
        {
          label: 'Настройки…',
          accelerator: 'Cmd+,',
          click: safeCall(actions.openSettings),
        },
        {
          label: 'Приватность…',
          click: safeCall(actions.openCookies),
        },
        { type: 'separator' },
        { role: 'services', label: 'Службы' },
        { type: 'separator' },
        { role: 'hide', label: `Скрыть ${appName}` },
        { role: 'hideOthers', label: 'Скрыть остальные' },
        { role: 'unhide', label: 'Показать все' },
        { type: 'separator' },
        { role: 'quit', label: `Выйти из ${appName}` },
      ],
    })
  }

  // ============================================================
  // ============ File ==========================================
  // ============================================================
  const fileSubmenu = [
    {
      label: 'Новая вкладка',
      accelerator: 'CmdOrCtrl+T',
      click: safeCall(actions.newTab),
    },
    {
      label: 'Новая приватная вкладка',
      accelerator: 'CmdOrCtrl+Shift+N',
      click: safeCall(actions.newPrivateTab),
    },
    { type: 'separator' },
    {
      label: 'Закрыть вкладку',
      accelerator: 'CmdOrCtrl+W',
      click: safeCall(actions.closeTab),
    },
    {
      label: 'Восстановить закрытую вкладку',
      accelerator: 'CmdOrCtrl+Shift+T',
      click: safeCall(actions.restoreTab),
    },
    {
      label: 'Дублировать вкладку',
      click: safeCall(actions.duplicateTab),
    },
    { type: 'separator' },
    {
      label: 'Сохранить страницу как…',
      accelerator: 'CmdOrCtrl+S',
      click: safeCall(actions.savePageAs),
    },
    {
      label: 'Печать…',
      accelerator: 'CmdOrCtrl+P',
      click: safeCall(actions.print),
    },
    { type: 'separator' },
    {
      label: 'Импорт закладок (HTML)…',
      click: safeCall(actions.importBookmarks),
    },
    {
      label: 'Экспорт закладок…',
      click: safeCall(actions.exportBookmarks),
    },
    { type: 'separator' },
    {
      label: 'Закрыть все приватные вкладки',
      click: safeCall(actions.closeAllPrivate),
    },
  ]

  if (!isMac) {
    fileSubmenu.push(
      { type: 'separator' },
      { role: 'quit', label: 'Выход' }
    )
  }

  template.push({
    label: 'Файл',
    submenu: fileSubmenu,
  })

  // ============================================================
  // ============ Edit ==========================================
  // ============================================================
  template.push({
    label: 'Правка',
    submenu: [
      { role: 'undo', label: 'Отменить' },
      { role: 'redo', label: 'Повторить' },
      { type: 'separator' },
      { role: 'cut', label: 'Вырезать' },
      { role: 'copy', label: 'Копировать' },
      { role: 'paste', label: 'Вставить' },
      ...(isMac
        ? [
            { role: 'pasteAndMatchStyle', label: 'Вставить без форматирования' },
            { role: 'delete', label: 'Удалить' },
          ]
        : [
            { role: 'delete', label: 'Удалить' },
            { type: 'separator' },
            { role: 'selectAll', label: 'Выделить всё' },
          ]),
      ...(isMac
        ? [
            { type: 'separator' },
            { role: 'selectAll', label: 'Выделить всё' },
          ]
        : []),
      { type: 'separator' },
      {
        label: 'Найти на странице…',
        accelerator: 'CmdOrCtrl+F',
        click: safeCall(actions.findInPage),
      },
      {
        label: 'Фокус на адресную строку',
        accelerator: 'CmdOrCtrl+L',
        click: safeCall(actions.focusAddress),
      },
      {
        label: 'Добавить в закладки',
        accelerator: 'CmdOrCtrl+D',
        click: safeCall(actions.bookmarkCurrent),
      },
    ],
  })

  // ============================================================
  // ============ View ==========================================
  // ============================================================
  template.push({
    label: 'Вид',
    submenu: [
      {
        label: 'Перезагрузить',
        accelerator: 'CmdOrCtrl+R',
        click: safeCall(actions.reload),
      },
      {
        label: 'Перезагрузить без кэша',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: safeCall(actions.forceReload),
      },
      { type: 'separator' },
      {
        label: 'Назад',
        accelerator: isMac ? 'Cmd+[' : 'Alt+Left',
        click: safeCall(actions.goBack),
      },
      {
        label: 'Вперёд',
        accelerator: isMac ? 'Cmd+]' : 'Alt+Right',
        click: safeCall(actions.goForward),
      },
      {
        label: 'Домой',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: safeCall(actions.goHome),
      },
      { type: 'separator' },
      {
        label: 'Увеличить масштаб',
        accelerator: 'CmdOrCtrl+Plus',
        click: safeCall(actions.zoomIn),
      },
      {
        label: 'Уменьшить масштаб',
        accelerator: 'CmdOrCtrl+-',
        click: safeCall(actions.zoomOut),
      },
      {
        label: 'Сбросить масштаб',
        accelerator: 'CmdOrCtrl+0',
        click: safeCall(actions.zoomReset),
      },
      { type: 'separator' },
      {
        label: 'Полноэкранный режим',
        accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
        click: safeCall(actions.toggleFullscreen),
      },
      { type: 'separator' },
      {
        label: 'Инструменты разработчика (вкладка)',
        accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
        click: safeCall(actions.toggleDevTools),
      },
      {
        label: 'Инструменты разработчика (панель)',
        accelerator: isMac ? 'Alt+Cmd+Shift+I' : 'Ctrl+Shift+Alt+I',
        click: safeCall(actions.toggleChromeDevTools),
      },
    ],
  })

  // ============================================================
  // ============ History =======================================
  // ============================================================
  template.push({
    label: 'История',
    submenu: [
      {
        label: 'Показать историю',
        accelerator: isMac ? 'Cmd+Y' : 'Ctrl+H',
        click: safeCall(actions.openHistory),
      },
      {
        label: 'Загрузки',
        accelerator: 'CmdOrCtrl+J',
        click: safeCall(actions.openDownloads),
      },
    ],
  })

  // ============================================================
  // ============ Bookmarks =====================================
  // ============================================================
  template.push({
    label: 'Закладки',
    submenu: [
      {
        label: 'Добавить в закладки',
        accelerator: 'CmdOrCtrl+D',
        click: safeCall(actions.bookmarkCurrent),
      },
      {
        label: 'Показать все закладки',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: safeCall(actions.openBookmarks),
      },
      { type: 'separator' },
      {
        label: 'Импорт закладок (HTML)…',
        click: safeCall(actions.importBookmarks),
      },
      {
        label: 'Экспорт закладок…',
        click: safeCall(actions.exportBookmarks),
      },
    ],
  })

  // ============================================================
  // ============ Window ========================================
  // ============================================================
  template.push({
    label: 'Окно',
    role: 'windowMenu',
    submenu: [
      { role: 'minimize', label: 'Свернуть' },
      ...(isMac
        ? [
            { role: 'zoom', label: 'Развернуть' },
            { type: 'separator' },
            { role: 'front', label: 'Все окна на передний план' },
          ]
        : [
            { role: 'zoom', label: 'Развернуть' },
            { role: 'close', label: 'Закрыть окно' },
          ]),
    ],
  })

  // ============================================================
  // ============ Help ==========================================
  // ============================================================
  const helpSubmenu = [
    {
      label: 'О браузере',
      click: safeCall(actions.openSettings),
    },
    {
      label: 'Репозиторий на GitHub',
      click: () => {
        try { shell.openExternal('https://github.com/StasAks1/Browser-school-project') } catch (e) {}
      },
    },
  ]

  if (!isMac) {
    helpSubmenu.push(
      { type: 'separator' },
      {
        label: 'О приложении',
        role: 'about',
      }
    )
  }

  template.push({
    label: 'Справка',
    role: 'help',
    submenu: helpSubmenu,
  })

  return Menu.buildFromTemplate(template)
}

export function setupApplicationMenu(actions, opts = {}) {
  const isMac = process.platform === 'darwin'
  const appName = opts.appName || app.getName() || 'Browser Project'

  if (isMac && typeof app.setAboutPanelOptions === 'function') {
    try {
      app.setAboutPanelOptions({
        applicationName: appName,
        applicationVersion: app.getVersion(),
        version: `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
        copyright: '© 2026 StasAks1 · MIT License',
        credits: 'Кроссплатформенный браузер на Electron — школьный проект по информатике',
      })
    } catch (e) {
      console.error('[menu] setAboutPanelOptions:', e)
    }
  }

  const menu = buildApplicationMenu(actions, { appName })
  Menu.setApplicationMenu(menu)
  return menu
}