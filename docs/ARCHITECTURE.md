# Архитектура

## Три процесса Electron

Electron состоит из трёх независимых контекстов:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  MAIN (Node.js)                                  │
│  ─ окно, вкладки                                 │
│  ─ файлы, IPC, сеть                              │
│  ─ безопасность                                  │
│  ─ Menu, dialog, session                         │
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
│                                                  │
└────────────────────┬─────────────────────────────┘
                     │
                     │ window.browserAPI
                     │
┌────────────────────▼─────────────────────────────┐
│                                                  │
│  RENDERER (Chromium, без Node.js)                │
│  ─ HTML + CSS + JS                               │
│  ─ Chrome UI, внутренние страницы                │
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

## WebContentsView — основа UI

Приложение использует **`WebContentsView`** (современная замена `<webview>`):

- **1 view — Chrome UI** (вкладки, адресная строка, кнопки)
- **N views — по одному на каждую вкладку**
- **1 view — status bar** (URL при наведении)
- **Отдельные `BrowserWindow`** — попап закладки, диалог разрешений

**Chrome UI** занимает верхнюю часть окна (высота 80 или 112 px).
**Активная вкладка** — под ним, на всю оставшуюся высоту.
**Неактивные вкладки** — с нулевыми bounds (не видны).
**Status bar** — поверх активной вкладки в левом нижнем углу, видим только при наведении на ссылку.

Переключение вкладок = пересчёт bounds у всех view через `applyLayout`.

## LRU-выгрузка вкладок

Когда открыто больше **10 вкладок**, самые старые неактивные выгружаются:
- Сохраняются `savedUrl`, `savedTitle`, `savedFavicon`
- `WebContentsView` уничтожается
- Вкладка помечается `isUnloaded: true`
- При возврате — view создаётся заново, страница загружается

Это экономит 50–200 МБ на каждой выгруженной вкладке.

## Сессии Chromium

Приложение использует **две сессии**:

1. **Обычная** (`mainWindow.webContents.session`)
   - Куки, кэш, localStorage сохраняются
   - Используется для всех обычных вкладок

2. **Приватная** (`session.fromPartition('incognito')`)
   - Изолированные куки, кэш, localStorage
   - Очищается при выходе через `clearStorageData()`
   - Используется для приватных вкладок

Блокировка трекеров навешивается **на обе сессии** через `webRequest.onBeforeRequest`.

## Хранение данных

### JSON-файлы в `userData`

| Файл | Что | Кто пишет |
|---|---|---|
| `bookmarks.json` | Закладки + папки | main |
| `history.json` | История (кроме приватных) | main |
| `downloads.json` | Список загрузок | main |
| `settings.json` | Настройки | main |
| `session.json` | Открытые вкладки | main |

### localStorage в renderer

- `browser-resolved-theme` — для anti-flicker (тема до отрисовки)
- `reader:font-size` — размер шрифта в Reader Mode
- `browser-project:shortcuts` — ярлыки на стартовой странице

### Ключевые модули

| Модуль | Отвечает за |
|---|---|
| `shortcuts.js` | Распознавание нажатий |
| `menu.js` | Системное меню |
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
- **Блокировка `file://` и `data:`** в mainFrame
- **Кастомные диалоги разрешений** с кэшем решений
- **Warning-страница** для HTTP и плохих сертификатов
- **Блокировка трекеров** через `webRequest`

---

## См. также

- [README](../README.md) — обзор
- [PROJECT-STRUCTURE](PROJECT-STRUCTURE.md) — структура файлов
- [DEVELOPMENT](DEVELOPMENT.md) — рецепты разработки
- [PRIVACY](PRIVACY.md) — хранение данных
- [TECHNOLOGIES](TECHNOLOGIES.md) — используемые API