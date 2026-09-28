# Архитектура

## Три процесса Electron

Electron состоит из трёх независимых контекстов:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  MAIN (Node.js)                                  │
│  ─ окно, вкладки, PDF-viewer                     │
│  ─ файлы, IPC, сеть                              │
│  ─ безопасность, ограничение кэша                │
│  ─ Menu, dialog, session, webUtils               │
│                                                  │
└────────────────────┬─────────────────────────────┘
                     │
                     │ IPC (contextBridge)
                     │
┌────────────────────▼─────────────────────────────┐
│                                                  │
│  PRELOAD (CJS, изолированный контекст)           │
│  ─ contextBridge.exposeInMainWorld               │
│  ─ window.browserAPI                             │
│  ─ drag & drop файлов (webUtils)                 │
│                                                  │
└────────────────────┬─────────────────────────────┘
                     │
                     │ window.browserAPI
                     │
┌────────────────────▼─────────────────────────────┐
│                                                  │
│  RENDERER (Chromium, без Node.js)                │
│  ─ HTML + CSS + JS                               │
│  ─ Chrome UI, внутренние страницы, PDF-viewer    │
│  ─ НЕТ доступа к require, fs, process            │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Зачем три процесса

- **Безопасность.** Renderer не имеет доступа к файловой системе, сети, процессам. Даже если на странице выполнится вредоносный код — он не получит доступ к системе.
- **Context Isolation.** Preload и renderer не видят переменные друг друга напрямую. Только через `contextBridge`.
- **Node.js в main.** Только main-процесс может работать с файлами, процессами, нативными API.

## Как работает IPC

**Из renderer в main:**
```js
// renderer
window.browserAPI.createTab('https://example.com')

// preload
contextBridge.exposeInMainWorld('browserAPI', {
  createTab: (url) => ipcRenderer.invoke('tab-create', url),
})

// main
ipcMain.handle('tab-create', (_e, url) => createTab(url))
```

**Из main в renderer:**
```js
// main
chromeView.webContents.send('tabs-updated', serializeTabs())

// preload
onTabsUpdated: (cb) => ipcRenderer.on('tabs-updated', (_e, tabs) => cb(tabs))

// renderer
window.browserAPI.onTabsUpdated((tabs) => renderTabs(tabs))
```

**Однонаправленный IPC (без ответа):**
```js
// preload — отправка без ожидания ответа
ipcRenderer.send('drop-files', paths)

// main
ipcMain.on('drop-files', (_e, paths) => handleDropFiles(paths))
```

## WebContentsView — основа UI

Приложение использует **`WebContentsView`** (современная замена `<webview>`):

- **1 view — Chrome UI** (вкладки, адресная строка, кнопки)
- **N views — по одному на каждую вкладку** (включая PDF-viewer как отдельный view)
- **1 view — status bar** (URL при наведении)
- **Отдельные `BrowserWindow`** — попап закладки, диалог разрешений

**Chrome UI** занимает верхнюю часть окна (высота 80 или 112 px).
**Активная вкладка** — под ним, на всю оставшуюся высоту.
**Неактивные вкладки** — с нулевыми bounds (не видны).
**Status bar** — поверх активной вкладки в левом нижнем углу, видим только при наведении на ссылку.

Переключение вкладок = пересчёт bounds у всех view через `applyLayout`.

## Drag & drop вкладок

Drag & drop вкладок работает **внутри chrome UI** (это DOM-элементы в `index/index.js`), а сами `WebContentsView` при перетаскивании не двигаются.

**Алгоритм:**
1. Пользователь тащит вкладку — срабатывает `dragstart` на DOM-элементе
2. `dragover` на соседней вкладке показывает индикатор (слева/справа от неё)
3. При `drop` — IPC `tabs-reorder` с `{sourceId, targetId, position}`
4. Main пересобирает массив `tabs` (splice + вставка)
5. `sendTabsUpdate()` отправляет обновлённый список в renderer
6. DOM перерисовывается в новом порядке

**Важно:** во время drag обновления от main буферизуются (`pendingTabsUpdate`), чтобы DOM не перерисовался и не сломал drag. Применяются после `dragend`.

## Bulk-операции с закладками

Работает в renderer (`bookmarks.js`). Есть два режима:
- **Обычный** — клик по карточке навигирует на сайт
- **Режим выделения** — класс `select-mode` на `body`, клики переключают чекбоксы

**IPC:**
- `remove-bookmarks(ids)` — удалить массив закладок одним вызовом
- `move-bookmarks({ids, folderId})` — переместить массив в папку

Массовые операции делаются **одним IPC-вызовом**, а не N — это быстрее и не даёт промежуточных состояний.

## Кастомизация тулбара

Настройка хранится в `settings.json` как `toolbarButtons: ['reader', 'find', ...]`. Порядок в массиве = порядок кнопок в тулбаре.

**Синхронизация:**
1. При старте chrome UI получает настройки через IPC `get-toolbar-settings`
2. Функция `applyToolbarSettings(visibleList)` скрывает/показывает кнопки по `data-toolbar-id` и переставляет их через `insertBefore`
3. При изменении в настройках — IPC `set-toolbar-settings` + broadcast `toolbar-settings-changed` во все окна

## PDF-viewer

Собственный просмотрщик на `pdfjs-dist`, не встроенный Chromium PDF viewer.

**Как работает:**
1. Пользователь бросает PDF в окно → preload перехватывает drop через `webUtils.getPathForFile(file)` (в Electron 32+ `File.path` больше нет)
2. Preload отправляет `drop-files` в main
3. Main открывает новую вкладку `internal://pdf`, сохраняет путь в `pdfDataStore`
4. Renderer PDF-страницы вызывает `get-pdf-data` — main читает файл и возвращает `Uint8Array`
5. `pdfjs-dist` рендерит страницы на `<canvas>` лениво (только видимые)

**Worker** подключается через Vite `?url` — работает в dev и prod.

**Retina:** canvas рендерится с `devicePixelRatio`, CSS-размер = обычный. Не дублируем масштаб в `ctx.scale()` — pdfjs сам применяет transform.

## LRU-выгрузка вкладок

Когда открыто больше **10 вкладок**, самые старые неактивные выгружаются:
- Сохраняются `savedUrl`, `savedTitle`, `savedFavicon`
- `WebContentsView` уничтожается
- Вкладка помечается `isUnloaded: true`
- При возврате — view создаётся заново, страница загружается

Это экономит 50–200 МБ на каждой выгруженной вкладке. Внутренние страницы (настройки, PDF) не выгружаются.

## Сессии Chromium

Приложение использует **две сессии**:

1. **Обычная** (`mainWindow.webContents.session`)
   - Куки, кэш, localStorage сохраняются
   - Размер кэша ограничен 100 МБ через `--disk-cache-size`
   - Используется для всех обычных вкладок

2. **Приватная** (`session.fromPartition('incognito')`)
   - Изолированные куки, кэш, localStorage
   - Очищается **дважды**: при выходе (`before-quit` с `await`) и при запуске (страховка от краша)
   - Используется для приватных вкладок

Блокировка трекеров навешивается **на обе сессии** через `webRequest.onBeforeRequest`.

## Хранение данных

### JSON-файлы в `userData`

| Файл | Что | Кто пишет |
|---|---|---|
| `bookmarks.json` | Закладки + папки | main |
| `history.json` | История (кроме приватных) | main |
| `downloads.json` | Список загрузок | main |
| `settings.json` | Настройки (включая порядок кнопок тулбара) | main |
| `session.json` | Открытые вкладки | main |

### RAM-only данные (никогда на диск)

- **Стек «недавно закрытые»** — массив в main-процессе, максимум 25. Не сохраняется
- **PDF-данные** — `Map<tabId, {path, data}>`, освобождается при закрытии вкладки
- **Статистика блокировки трекеров** — сбрасывается при перезапуске
- **Кэш подсказок DuckDuckGo** — 5 минут, только в памяти

### localStorage в renderer

- `browser-resolved-theme` — для anti-flicker (тема до отрисовки)
- `reader:font-size` — размер шрифта в Reader Mode
- `browser-project:shortcuts` — ярлыки на стартовой странице

### Ключевые модули

| Модуль | Отвечает за |
|---|---|
| `shortcuts.js` | Распознавание нажатий |
| `menu.js` | Системное меню (включая «Недавно закрытые») |
| `context-menu.js` | Меню правого клика |
| `reader.js` | Reader Mode |
| `popup.js` | `window.open` с popup |
| `private.js` | Приватная сессия |
| `session.js` | Сохранение/восстановление вкладок |
| `bookmarks-io.js` | Импорт/экспорт HTML |
| `tracker-blocker.js` | Блокировка трекеров |
| `debug.js` | Логи |

## Поток данных при клике на ссылку

```
1. Пользователь кликает на <a href="...">
2. Chromium в активной вкладке запускает навигацию
3. Main ловит событие 'will-navigate'
4. Проверка: HTTPS? HTTP? внутренний URL?
   ├── HTTP без разрешения → показать warning-страницу
   ├── HTTPS → продолжить
   └── внутренний → продолжить
5. Chromium загружает страницу
6. Событие 'did-navigate' → обновить title, favicon
7. Отправить IPC в chrome UI:
   - page-url (обновить адресную строку)
   - security-state (обновить индикатор)
   - tabs-updated (обновить favicon в вкладке)
   - history-updated (если не приватная — обновить историю)
```

## Поток при открытии новой вкладки

```
1. Cmd+T (before-input-event) или клик на «+»
2. executeShortcut('new-tab') в main
3. createTab():
   - Создать WebContentsView
   - Приватная? Подключить приватную сессию
   - attachTabSecurityHandlers (навигация, разрешения, загрузки)
   - attachTabListeners (события вкладки)
   - Загрузить стартовую страницу
4. sendTabsUpdate → chrome UI перерисовывает полосу вкладок
5. enforceTabLimit() — если > 10 вкладок, выгрузить LRU
```

## Безопасность

- **CSP** во всех HTML (`default-src 'self'`)
- **Context Isolation** — renderer не видит Node.js
- **Sandbox** для вкладок и попапов
- **Блокировка `file://` и `data:`** в mainFrame — на уровне сессии, работает даже при выключенных трекерах
- **Кастомные диалоги разрешений** с кэшем решений
- **Warning-страница** для HTTP и плохих сертификатов
- **Блокировка трекеров** через `webRequest`
- **Ограничение кэша** до 100 МБ + ручная очистка
- **Гарантированная очистка приватной сессии** при выходе (`before-quit` с `await clearPrivateData()`)

---

## См. также

- [README](../README.md) — обзор
- [PROJECT-STRUCTURE](PROJECT-STRUCTURE.md) — структура файлов
- [DEVELOPMENT](DEVELOPMENT.md) — рецепты разработки
- [PRIVACY](PRIVACY.md) — хранение данных
- [TECHNOLOGIES](TECHNOLOGIES.md) — используемые API