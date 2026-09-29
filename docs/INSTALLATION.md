# Установка

## Требования

- **Node.js 18+** и **npm** (для запуска из исходников)
- **macOS**, **Windows** или **Linux**

Проверить версии:
```bash
node -v
npm -v
```

## Запуск из исходников (для разработки)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/StasAks1/Browser-school-project.git
cd Browser-school-project

# 2. Установить зависимости
npm install

# 3. Запустить в dev-режиме
npm run dev
```

**С подробными логами:**
```bash
DEBUG=1 npm run dev
```

**Windows (PowerShell):**
```powershell
$env:DEBUG="1"; npm run dev
```

## Установка как приложения

Готовые установщики появятся в разделе [Releases](https://github.com/StasAks1/Browser-school-project/releases) после публикации версии.

### macOS
1. Скачай `Malina-Browser-1.0.0.dmg`
2. Двойной клик → перетащи в Applications
3. При первом запуске: правый клик → «Открыть» (обход Gatekeeper)

### Windows
1. Скачай `Malina-Browser-Setup-1.0.0.exe`
2. Запусти → мастер установки
3. Приложение появится в меню «Пуск»

### Linux
1. Скачай `Malina-Browser-1.0.0.AppImage`
2. Сделай исполняемым: `chmod +x Malina-Browser-1.0.0.AppImage`
3. Двойной клик или запуск из терминала

## Сборка установщика вручную

```bash
# macOS (.dmg)
npm run dist:mac

# Windows (.exe) — только на Windows
npm run dist:win

# Linux (.AppImage) — только на Linux
npm run dist:linux
```

Готовые файлы появятся в `dist/`.


## Удаление

### macOS
Удали `Malina Browser.app` из Applications.
Данные пользователя: `~/Library/Application Support/malina-browser/`

### Windows
Удали через «Установка и удаление программ».
Данные пользователя: `%APPDATA%\malina-browser\`

### Linux
Удали `.AppImage` файл.
Данные пользователя: `~/.config/malina-browser/`

## Что внутри установщика

- Полный код приложения (main + preload + renderer) в формате `asar`
- Иконки для системы
- Метаданные: название, версия, автор, лицензия (MIT)
- `pdfjs-dist`, `@mozilla/readability`, `electron-chrome-web-store` — включены в бандл
- Никаких внешних зависимостей при запуске — всё упаковано

## Использование расширений

После установки браузера можно поставить расширения Chrome:

1. Открой **Настройки → Приватность → Управление расширениями**
   (или набери `internal://extensions` в адресной строке)
2. Найди нужное расширение на [chromewebstore.google.com](https://chromewebstore.google.com)
3. Скопируй **ID** из URL — 32-символьный код после последнего `/`
4. Вставь ID в поле установки и нажми **«Установить»**

**Важно:** из-за ограничений Electron работают только расширения на **Manifest V3** (например, uBlock Origin Lite). Классические MV2-расширения (uBlock Origin) не работают. Подробнее — в [PRIVACY.md](PRIVACY.md).

## Решение проблем

**`npm run dev` падает с ошибкой**
- Проверь версию Node.js: `node -v` (нужно 18+)
- Удали `node_modules` и переустанови: `rm -rf node_modules && npm install`

**Приложение запускается, но пустое окно**
- Запусти с логами: `DEBUG=1 npm run dev`
- Проверь консоль терминала на ошибки

**На Windows нет кнопок окна**
- Убедись, что версия Windows 10 или 11
- `titleBarOverlay` требует Windows 10+

**На Linux пустая полоса сверху**
- Это нормально — используется системный заголовок, зависит от DE

**PDF-viewer пустой экран или не рендерит страницы**
- Открой DevTools вкладки (правый клик → Inspect)
- Проверь консоль — если ошибка про worker, пересобери проект: `npm run build && npm run dev`
- Worker pdfjs-dist собирается Vite автоматически, но иногда требуется полный пересбор

**При drag & drop PDF ничего не происходит**
- Убедись, что перетаскиваешь файл, а не ссылку
- Проверь, что у файла расширение `.pdf` (регистр не важен)
- Запусти с `DEBUG=1` и посмотри логи main

**Реклама не блокируется на некоторых сайтах**
- Это ожидаемо: first-party реклама (с того же домена, что сайт) не блокируется
- Проверь, что в настройках включены нужные категории и URL-блокировка
- Открой `DEBUG=1 npm run dev` и посмотри строки `[Tracker]` — если пусто, значит запросы не похожи на рекламу

**Расширение не устанавливается**
- Проверь, что ID — это 32 строчных латинских буквы (скопируй точно)
- Убедись, что браузер имеет доступ к `chromewebstore.google.com`
- После установки проверь консоль main (`DEBUG=1`) — там будут строки `[Extensions]`

**Расширение установилось, но не работает**
- Скорее всего, оно несовместимо с Electron (использует `chrome.tabs` или MV2 API)
- Проверь DevTools вкладки — там будет ошибка типа `chrome.tabs is undefined`
- Работают только расширения на **Manifest V3** с `content_scripts` и `declarativeNetRequest`

---

## См. также

- [README](../README.md) — обзор проекта
- [SHORTCUTS](SHORTCUTS.md) — горячие клавиши
- [PRIVACY](PRIVACY.md) — что хранится локально, какие ограничения у расширений
- [CROSS-PLATFORM](CROSS-PLATFORM.md) — различия между ОС