# Технологии

## Основной стек

### Electron 44
Фреймворк для десктопных приложений на веб-технологиях:
- **Chromium** — движок рендеринга веб-страниц
- **Node.js** — для main-процесса

### electron-vite 5 + Vite 7
Сборщик и dev-сервер:
- HMR при разработке
- Разделение main / preload / renderer
- Поддержка `?url` для воркеров pdfjs-dist

### JavaScript
Проект на чистом JS, без TypeScript.
- `main` — ESM (`import`/`export`)
- `preload` — CJS (`require`)
- `renderer` — ESM через `<script type="module">`

### HTML + CSS
Без фреймворков. Свой CSS с переменными (`:root`) + поддержка кастомных тем через CSS-переменные.

## Ключевые API Electron

| API | Где используется | Зачем |
|---|---|---|
| `WebContentsView` | Вкладки, chrome UI, status bar | Современная замена `<webview>` |
| `BrowserWindow` | Главное окно, попап закладки, диалог разрешений | |
| `session.fromPartition` | Приватный режим | Отдельная сессия Chromium |
| `session.getCacheSize` / `clearCache` | Настройки → Приватность | Размер и очистка кэша |
| `ipcMain` / `ipcRenderer` | Связь main ↔ renderer | |
| `contextBridge` | Безопасный API для renderer | |
| `webUtils.getPathForFile` | Preload, drag & drop | Получить путь к файлу в Electron 32+ |
| `Menu.setApplicationMenu` | Системное меню | |
| `Menu.buildFromTemplate` | Контекстные меню | Меню вкладок, закладок, экспорт истории |
| `dialog` | Сохранение файлов, выбор папок | |
| `shell` | Открытие файлов, папок, ссылок | |
| `webContents.findInPage` | Поиск по странице | |
| `session.cookies` | Cookie-менеджер | |
| `nativeTheme` | Системная тема | |

## Безопасность и приватность в API

| Техника | Где | Зачем |
|---|---|---|
| `webRequest.onBeforeRequest({ urls: ['data:*'] })` | main | Блокировка `data:` в mainFrame |
| `webRequest.onBeforeRequest` | tracker-blocker.js | Блокировка трекеров + счётчик |
| `webRequest.onBeforeSendHeaders` | main | Обрезка `Referer` до origin |
| `app.commandLine.appendSwitch('disk-cache-size', ...)` | main | Ограничение кэша до 100 МБ |
| `app.commandLine.appendSwitch('webrtc-ip-handling-policy', ...)` | main | Защита от WebRTC IP leak |
| `setPermissionRequestHandler` / `setPermissionCheckHandler` | main | Кастомные диалоги разрешений |
| `will-navigate` / `will-redirect` | main | HTTPS-only, warning-страницы |
| `setWindowOpenHandler` | main | Popup, OAuth |

## Кастомные темы

Кастомная тема — JSON-файл с подмножеством CSS-переменных. Значения валидируются по **белому списку**:

```
--bg, --bg-elevated, --bg-hover, --bg-active, --bg-tab-active,
--bg-sidebar, --bg-card, --text, --text-muted, --accent,
--accent-hover, --border, --danger, --star
```

**Валидация значений:** только цвета (`#xxx`, `#xxxxxx`, `rgb(...)`, `rgba(...)`, `hsl(...)`, `hsla(...)`, named). Запрещены `url(...)`, `expression(...)`, `javascript:`, `@import`, `<script>`.

Применение — через `document.documentElement.style.setProperty()` в `shared/theme.js`. Это **перебивает** дефолтные значения light/dark темы, но не ломает структуру.

## PDF-viewer

Собственный просмотрщик на `pdfjs-dist`. Возможности:
- Рендер на `<canvas>` с `devicePixelRatio` для Retina
- Ленивая загрузка страниц через `IntersectionObserver`
- **Миниатюры** с собственной ленивой загрузкой
- **Текстовый слой** для выделения и поиска (`TextLayer`)
- **Поиск по тексту** с подсветкой совпадений
- Поворот на 90°
- Прогресс чтения по имени файла в `localStorage`

## Сторонние библиотеки

| Библиотека / сервис | Версия | Лицензия | Для чего |
|---|---|---|---|
| Electron | 44.x | MIT | Фреймворк |
| electron-vite | 5.x | MIT | Сборщик |
| Vite | 7.x | MIT | Бандлер |
| electron-builder | 26.x | MIT | Упаковщик |
| @mozilla/readability | 0.6.x | Apache 2.0 | Reader Mode |
| pdfjs-dist | 4.x | Apache 2.0 | PDF-viewer |
| GitHub Actions | — | бесплатно | CI/CD |

## Публичные API

### DuckDuckGo Autocomplete
- **URL:** `https://duckduckgo.com/ac/?q=...`
- **Когда:** ввод в поисковую строку (debounce 120 мс)
- **Что отправляется:** только текст запроса

### DuckDuckGo Favicon Service
- **URL:** `https://icons.duckduckgo.com/ip3/<domain>.ico`
- **Когда:** показ закладки, истории, ярлыка
- **Что отправляется:** только домен сайта

## Что сознательно НЕ используется

| Что | Почему нет |
|---|---|
| **TypeScript** | Избыточен для размера проекта |
| **React / Vue / Svelte** | Оверкилл, свой UI проще |
| **Webpack** | Заменён на Vite |
| **jQuery** | Не нужен в 2026 |
| **Tailwind CSS** | Свой CSS с переменными компактнее |
| **Redux / MobX** | Состояние вкладок в main-процессе |
| **Динамические списки трекеров** | Осознанный отказ по 152-ФЗ |

---

## См. также

- [README](../README.md) — обзор проекта
- [ARCHITECTURE](ARCHITECTURE.md) — как всё устроено
- [PROJECT-STRUCTURE](PROJECT-STRUCTURE.md) — структура папок
- [CROSS-PLATFORM](CROSS-PLATFORM.md) — различия между ОС