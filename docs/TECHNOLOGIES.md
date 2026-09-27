# Технологии

## Основной стек

### Electron 44
Фреймворк для десктопных приложений на веб-технологиях. Объединяет:
- **Chromium** — движок рендеринга веб-страниц
- **Node.js** — для main-процесса (файлы, сеть, IPC)

Почему Electron:
- Один код — три платформы (macOS / Windows / Linux)
- Полный доступ к системным API (окна, меню, файлы, диалоги)
- Chromium — тот же движок, что в Chrome, значит современные веб-стандарты работают

### electron-vite 5 + Vite 7
Сборщик и dev-сервер. Что делает:
- Hot Module Replacement (HMR) при разработке
- Быстрая сборка через esbuild + Rollup
- Разделение main / preload / renderer
- Автоматическая подстановка путей

Почему electron-vite, а не webpack:
- В 5–10 раз быстрее
- Проще конфигурация
- Современный подход к сборке

### JavaScript
Проект на чистом JS, без TypeScript. Почему:
- Размер проекта не требует статической типизации
- Быстрее писать прототипы
- Меньше конфигурации

**Модульная система:**
- `main` — ESM (`import`/`export`)
- `preload` — CJS (`require`) — требование Electron
- `renderer` — ESM через `<script type="module">`

### HTML + CSS
Без фреймворков (React, Vue, Svelte). Почему:
- 13 страниц интерфейса — не тот масштаб, чтобы тянуть фреймворк
- Свой CSS с переменными (`:root`) позволяет легко менять тему и акцент
- Полный контроль над каждым пикселем

## Ключевые API Electron

| API | Где используется | Зачем |
|---|---|---|
| `WebContentsView` | Вкладки, chrome UI, status bar | Современная замена `<webview>` |
| `BrowserWindow` | Главное окно, попап закладки, диалог разрешений | |
| `session.fromPartition` | Приватный режим | Отдельная сессия Chromium |
| `ipcMain` / `ipcRenderer` | Связь main ↔ renderer | |
| `contextBridge` | Безопасный API для renderer | |
| `Menu.setApplicationMenu` | Системное меню | |
| `dialog` | Сохранение файлов, выбор папок | |
| `shell` | Открытие файлов, папок, ссылок | |
| `webRequest.onBeforeRequest` | Блокировка трекеров | |
| `webContents.findInPage` | Поиск по странице | |
| `session.cookies` | Cookie-менеджер | |
| `nativeTheme` | Системная тема | |

## Сторонние библиотеки

| Библиотека / сервис | Версия | Лицензия | Для чего |
|---|---|---|---|
| Electron | 44.x | MIT | Фреймворк |
| electron-vite | 5.x | MIT | Сборщик |
| Vite | 7.x | MIT | Бандлер |
| electron-builder | 26.x | MIT | Упаковщик установщиков |
| @mozilla/readability | 0.6.x | Apache 2.0 | Reader Mode |
| GitHub Actions | — | бесплатно для public repo | CI/CD, автосборка |

Полный список с текстами лицензий — см. [THIRD_PARTY_LICENSES](../THIRD_PARTY_LICENSES).

## Публичные API

### DuckDuckGo Autocomplete
- **URL:** `https://duckduckgo.com/ac/?q=...&type=list&kl=ru-ru`
- **Когда:** при вводе в поисковую строку (debounce 120 мс)
- **Что отправляется:** только текст запроса
- **Аутентификация:** не требуется

### DuckDuckGo Favicon Service
- **URL:** `https://icons.duckduckgo.com/ip3/<domain>.ico`
- **Когда:** при показе закладки, истории, ярлыка
- **Что отправляется:** только домен сайта
- **Аутентификация:** не требуется

## Что сознательно НЕ используется

| Что | Почему нет |
|---|---|
| **TypeScript** | Избыточен для размера проекта |
| **React / Vue / Svelte** | Оверкилл, свой UI проще и легче |
| **Webpack** | Заменён на Vite (быстрее, современнее) |
| **jQuery** | Не нужен в 2026 |
| **Tailwind CSS** | Для 13 страниц — свой CSS с переменными компактнее |
| **Bootstrap / Material UI** | Свой дизайн в стиле Safari |
| **Redux / MobX** | Состояние вкладок управляется в main-процессе |

## Где что лежит

| Технология | Файлы |
|---|---|
| Electron main API | `src/main/*.js` |
| contextBridge | `src/preload/index.js` |
| Chrome UI | `src/renderer/index/` |
| Внутренние страницы | `src/renderer/<page>/` |
| Общие модули renderer | `src/renderer/shared/` |
| Сборка | `electron.vite.config.js` |

---

## См. также

- [README](../README.md) — обзор проекта
- [ARCHITECTURE](ARCHITECTURE.md) — как всё устроено
- [PROJECT-STRUCTURE](PROJECT-STRUCTURE.md) — структура папок
- [CROSS-PLATFORM](CROSS-PLATFORM.md) — различия между ОС