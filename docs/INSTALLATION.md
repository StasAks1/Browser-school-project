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
1. Скачай `Browser-Project-1.0.0.dmg`
2. Двойной клик → перетащи в Applications
3. При первом запуске: правый клик → «Открыть» (обход Gatekeeper)

### Windows
1. Скачай `Browser-Project-Setup-1.0.0.exe`
2. Запусти → мастер установки
3. Приложение появится в меню «Пуск»

### Linux
1. Скачай `Browser-Project-1.0.0.AppImage`
2. Сделай исполняемым: `chmod +x Browser-Project-1.0.0.AppImage`
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
Удали `Browser Project.app` из Applications.
Данные пользователя: `~/Library/Application Support/browser-project/`

### Windows
Удали через «Установка и удаление программ».
Данные пользователя: `%APPDATA%\browser-project\`

### Linux
Удали `.AppImage` файл.
Данные пользователя: `~/.config/browser-project/`

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

---

## См. также

- [README](../README.md) — обзор проекта
- [SHORTCUTS](SHORTCUTS.md) — горячие клавиши
- [PRIVACY](PRIVACY.md) — что хранится локально
- [CROSS-PLATFORM](CROSS-PLATFORM.md) — различия между ОС