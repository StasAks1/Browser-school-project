# Структура проекта

## Дерево

```
browser_school_project/
├── .github/                        GitHub Actions
│   └── workflows/
│       └── build.yml               CI: сборка под 3 платформы
│
├── build/                          Иконки приложения (коммитятся!)
│   ├── icon.svg                    Исходник
│   ├── icon.png                    1024×1024 для dev-режима
│   ├── icon.icns                   macOS
│   ├── icon.ico                    Windows
│   └── icons/                      Linux (набор PNG)
│
├── docs/                           Документация
│   ├── SHORTCUTS.md
│   ├── INSTALLATION.md
│   ├── PRIVACY.md
│   ├── CROSS-PLATFORM.md
│   ├── TECHNOLOGIES.md
│   ├── ARCHITECTURE.md
│   ├── PROJECT-STRUCTURE.md        (этот файл)
│   └── DEVELOPMENT.md
│
├── src/
│   ├── main/
│   │   ├── index.js                Ядро: окно, вкладки, IPC, безопасность
│   │   ├── shortcuts.js            Хоткеи
│   │   ├── menu.js                 Системное меню
│   │   ├── context-menu.js         Меню правого клика
│   │   ├── reader.js               Reader Mode
│   │   ├── popup.js                Обработка window.open
│   │   ├── private.js              Приватная сессия
│   │   ├── session.js              Session restore
│   │   ├── bookmarks-io.js         Импорт/экспорт HTML
│   │   ├── tracker-list.js         Список трекеров (статический)
│   │   ├── tracker-blocker.js      Блокировка
│   │   ├── debug.js                Логи
│   │   └── debug.config.js         Флаги
│   │
│   ├── preload/
│   │   └── index.js                contextBridge + drag & drop файлов
│   │
│   └── renderer/
│       ├── shared/
│       │   ├── theme.js
│       │   ├── tooltip.js
│       │   └── tooltip.css
│       │
│       ├── index/                  Chrome UI (табы, тулбар, find bar)
│       ├── startpage/              Стартовая страница
│       ├── bookmarks/              Менеджер закладок + bulk-операции
│       ├── history/                История
│       ├── downloads/              Загрузки
│       ├── cookies/                Cookie-менеджер
│       ├── reader/                 Reader Mode UI
│       ├── settings/               Настройки (4 секции)
│       ├── pdf/                    PDF-viewer (pdfjs-dist)
│       ├── statusbar/              URL при наведении
│       ├── error/                  Error-страница
│       ├── warning/                HTTP-warning
│       ├── popup/                  Попап закладки
│       └── permission/             Диалог разрешений
│
├── electron.vite.config.js
├── package.json
├── package-lock.json
├── README.md
├── LICENSE
├── THIRD_PARTY_LICENSES
└── .gitignore
```

## Что где лежит

### `src/main/` — Main-процесс
Работает в Node.js-окружении. Отвечает за:
- Создание окон и вкладок
- IPC с renderer
- Работу с файлами (bookmarks, history, downloads, settings)
- Безопасность (CSP, разрешения, блокировка трекеров, `data:` в mainFrame)
- Ограничение размера кэша
- PDF-viewer — чтение файла и передача данных в renderer
- Drag & drop вкладок (перестановка массива)
- Bulk-операции с закладками
- Всё, что требует доступа к системе

### `src/preload/` — Preload-скрипт
Единственный файл. Работает в изолированном контексте между main и renderer. Экспортирует `window.browserAPI` через `contextBridge`. Дополнительно **перехватывает drag & drop файлов** через `webUtils.getPathForFile()` и отправляет пути в main. Renderer не имеет доступа к Node.js напрямую — только через этот API.

### `src/renderer/` — Интерфейс
Все HTML-страницы приложения. Работают как обычные веб-страницы, но с доступом к `window.browserAPI`. Без Node.js, без `require`.

**Особые страницы:**
- **`pdf/`** — PDF-viewer на `pdfjs-dist`, включает свой worker, ленивый рендер через `IntersectionObserver`, Retina-рендер (devicePixelRatio)
- **`bookmarks/`** — кроме стандартного менеджера, поддерживает bulk-режим (выделение, массовое удаление, перемещение)

### `build/` — Иконки
Все форматы иконок приложения. **Коммитятся в репозиторий** (не в `.gitignore`). Используются electron-builder при сборке установщиков.

### `docs/` — Документация
Эта папка.

## Правила именования

- **HTML / CSS / JS в renderer** — `kebab-case` или совпадает с именем папки (`index.html`, `index.js`)
- **Модули в main** — `kebab-case` (`context-menu.js`, `tracker-blocker.js`)
- **Переменные и функции** — `camelCase`
- **Константы** — `UPPER_SNAKE_CASE`
- **IPC-методы** — `kebab-case` через дефис (`tab-create`, `get-settings`)
- **CSS-переменные** — `--kebab-case`

## Куда добавлять новое

### Новую внутреннюю страницу
1. Создать папку `src/renderer/<name>/`
2. Внутри: `<name>.html`, `<name>.css`, `<name>.js`
3. Добавить в `electron.vite.config.js` в `renderer.build.rollupOptions.input`
4. Добавить путь в `src/main/index.js` — функции `getXxxPagePath` / `getXxxPageUrl`
5. Добавить проверку в `isTrustedInternalUrl` и `isInternalUrl`
6. Добавить ветку в `loadTabContent` и `navigateInActiveTab`

### Новый IPC-метод
1. В `src/main/index.js` — `ipcMain.handle('my-method', ...)`
2. В `src/preload/index.js` — `myMethod: () => ipcRenderer.invoke('my-method')`
3. В renderer — `window.browserAPI.myMethod()`

### Новый хоткей
1. В `src/main/shortcuts.js` — добавить `if` в `matchShortcut`
2. В `src/main/index.js` — добавить `case` в `executeShortcut`
3. Опционально: добавить пункт в `src/main/menu.js`

### Новую настройку
1. В `src/main/index.js` — добавить поле в `settingsCache`
2. В `loadSettings` / `saveSettings` — обработать
3. IPC-методы `get-setting` / `set-setting`
4. В `src/preload/index.js` — экспортировать
5. В `src/renderer/settings/` — добавить UI

### Новую кнопку тулбара
1. Добавить `<button data-toolbar-id="my-id">` в `src/renderer/index/index.html`
2. Добавить `'my-id'` в `ALL_TOOLBAR_BUTTONS` в `src/main/index.js`
3. Добавить в `TOOLBAR_LABELS` в `src/renderer/settings/settings.js`

---

## См. также

- [README](../README.md) — обзор проекта
- [ARCHITECTURE](ARCHITECTURE.md) — как всё работает
- [TECHNOLOGIES](TECHNOLOGIES.md) — стек и библиотеки
- [DEVELOPMENT](DEVELOPMENT.md) — пошаговые рецепты