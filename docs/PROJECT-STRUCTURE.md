# Структура проекта

## Дерево

```
browser_school_project/
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
│   ├── main/                       Main-процесс (Node.js)
│   │   ├── index.js                Точка входа, окно, IPC, вкладки
│   │   ├── shortcuts.js            Хоткеи
│   │   ├── menu.js                 Системное меню
│   │   ├── context-menu.js         Меню правого клика на странице
│   │   ├── reader.js               Reader Mode (Readability)
│   │   ├── popup.js                Обработка window.open
│   │   ├── private.js              Приватная сессия
│   │   ├── session.js              Восстановление сессии
│   │   ├── bookmarks-io.js         Импорт/экспорт закладок
│   │   ├── tracker-list.js         Список трекерных доменов
│   │   ├── tracker-blocker.js      Блокировка трекеров
│   │   ├── debug.js                Логи
│   │   └── debug.config.js         Флаги отладки
│   │
│   ├── preload/                    Preload-скрипт
│   │   └── index.js                contextBridge, экспорт API
│   │
│   └── renderer/                   Страницы интерфейса
│       ├── shared/
│       │   ├── theme.js            Общая логика темы
│       │   ├── tooltip.js          Кастомные tooltips
│       │   └── tooltip.css
│       │
│       ├── index/                  Chrome UI (вкладки, адресная строка)
│       │   ├── index.html
│       │   ├── index.css
│       │   └── index.js
│       │
│       ├── startpage/              Стартовая страница
│       ├── bookmarks/              Менеджер закладок
│       ├── history/                История
│       ├── downloads/              Загрузки
│       ├── cookies/                Cookie-менеджер
│       ├── reader/                 Reader Mode
│       ├── settings/               Настройки
│       ├── statusbar/              Status bar (URL при наведении)
│       ├── error/                  Страница ошибок
│       ├── warning/                Предупреждение HTTP
│       ├── popup/                  Попап закладки
│       └── permission/             Диалог разрешений
│
├── electron.vite.config.js         Конфиг сборки
├── package.json
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
- Безопасность (CSP, разрешения, блокировка трекеров)
- Всё, что требует доступа к системе

### `src/preload/` — Preload-скрипт
Единственный файл. Работает в изолированном контексте между main и renderer. Экспортирует `window.browserAPI` через `contextBridge`. Renderer не имеет доступа к Node.js напрямую — только через этот API.

### `src/renderer/` — Интерфейс
Все HTML-страницы приложения. Работают как обычные веб-страницы, но с доступом к `window.browserAPI`. Без Node.js, без `require`.

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

### Новый IPC-метод
1. В `src/main/index.js` — `ipcMain.handle('my-method', ...)`
2. В `src/preload/index.js` — `myMethod: () => ipcRenderer.invoke('my-method')`
3. В renderer — `window.browserAPI.myMethod()`

### Новый хоткей
1. В `src/main/shortcuts.js` — добавить `if` в `matchShortcut`
2. В `src/main/index.js` — добавить `case` в `executeShortcut`
3. Опционально: добавить пункт в `src/main/menu.js`

### Новая настройка
1. В `src/main/index.js` — добавить поле в `settingsCache`
2. В `loadSettings` / `saveSettings` — обработать
3. IPC-методы `get-setting` / `set-setting`
4. В `src/preload/index.js` — экспортировать
5. В `src/renderer/settings/` — добавить UI

---

## См. также

- [README](../README.md) — обзор проекта
- [ARCHITECTURE](ARCHITECTURE.md) — как всё работает
- [TECHNOLOGIES](TECHNOLOGIES.md) — стек и библиотеки
- [DEVELOPMENT](DEVELOPMENT.md) — пошаговые рецепты