# Кроссплатформенность

Проект работает на **macOS**, **Windows** и **Linux**. Один код — три платформы.

## Что значит «кроссплатформенный»

Это значит, что:
- Один и тот же исходный код запускается на всех трёх ОС
- Интерфейс (Chrome UI) выглядит и работает одинаково везде
- Базовые функции (вкладки, закладки, история, загрузки) ведут себя идентично
- Отличия есть только там, где их диктует сама ОС (кнопки окна, сочетания клавиш)

## Что делает каждая платформа по-своему

### macOS
- **Кнопки окна («светофоры»)** — встроены в интерфейс через `titleBarStyle: 'hidden'`
- **Позиция светофоров** — задаётся `trafficLightPosition: { x: 16, y: 14 }`
- **Модификатор клавиш** — `Cmd` вместо `Ctrl`
- **Иконка в Dock** — устанавливается через `app.dock.setIcon()`
- **Меню приложения** — вынесено в верхнюю полосу экрана, первый пункт — название приложения
- **Системные хоткеи** — `Cmd+H` (скрыть), `Cmd+M` (свернуть), `Cmd+Q` (выход)

### Windows
- **Кнопки окна** — рисуются нативно поверх Chrome UI через `titleBarOverlay`
- **Отступ справа в tab-strip** — 140px, чтобы не перекрывать системные кнопки
- **Модификатор клавиш** — `Ctrl`
- **Меню приложения** — скрыто, вызывается по `Alt`
- **Стиль окна** — `titleBarStyle: 'hidden'` + overlay с цветом фона темы

### Linux
- **Кнопки окна** — системные, рисуются оконным менеджером (GNOME / KDE / XFCE)
- **Заголовок окна** — системный (`titleBarStyle: 'default'`)
- **Модификатор клавиш** — `Ctrl`
- **Меню приложения** — скрыто, вызывается по `Alt`
- **Путь к данным** — `~/.config/browser-project/`

## Что унифицировано

- **Chrome UI** — единый HTML + CSS для всех платформ
- **Внутренние страницы** — 13 страниц в `src/renderer/` одинаковы везде
- **Хоткеи** — через `CmdOrCtrl`, работают в Electron на всех ОС
- **IPC** — через `contextBridge`, одинаково
- **Хранение данных** — через `app.getPath('userData')`, кросс-платформенно
- **Блокировка трекеров** — работает на всех ОС
- **Reader Mode** — работает на всех ОС

## Как собирается под каждую платформу

Каждый установщик требует **своей ОС** для сборки:

| Платформа | Формат | Где собирается |
|---|---|---|
| macOS | `.dmg`, `.zip` | только на macOS |
| Windows | `.exe` (NSIS), portable `.exe` | только на Windows |
| Linux | `.AppImage`, `.deb` | только на Linux |

### Локальная сборка

```bash
# Только на macOS
npm run dist:mac

# Только на Windows
npm run dist:win

# Только на Linux
npm run dist:linux
```

Все три команды требуют соответствующей ОС — собрать `.exe` на Mac невозможно.

### GitHub Actions (CI)

При пуше тега `v*` GitHub Actions автоматически:

1. Запускает **3 виртуальные машины** параллельно (`macos-latest`, `windows-latest`, `ubuntu-latest`)
2. На каждой устанавливает Node.js, npm-зависимости
3. Запускает `npm run dist:mac` / `dist:win` / `dist:linux`
4. Собирает все артефакты в **GitHub Releases**

**Что это даёт:**

- Три платформы собираются за 10–15 минут без твоего участия
- Готовые установщики доступны для скачивания в Releases
- Кроссплатформенность подтверждается реальными файлами

Конфигурация workflow — в файле `.github/workflows/build.yml`. Логика:

- `strategy.matrix` — три ОС
- `npm run ${{ matrix.script }}` — своя команда для каждой
- `softprops/action-gh-release` — публикация в Releases

## Где тестировалось

| Платформа | Устройство | Что проверялось |
|---|---|---|
| **macOS** | MacBook Air M5, 16 gb Unified Memory | Все функции, dev-режим |
| **Windows** | пк на i7 13700f, rtx 4060 ti (16gb), 32 gb ram | Запуск, вкладки, хоткеи, меню |
| **Linux** | ноутбук на amd a9 9425, radeon r7 m445, 8 gb ram | Запуск, вкладки, хоткеи, системный заголовок |

## Кроссплатформенные детали в коде

**Горячие клавиши** (`src/main/shortcuts.js`):
```js
const isMac = process.platform === 'darwin'
```

**Создание окна** (`src/main/index.js`):
```js
...(isMac ? {
  titleBarStyle: 'hidden',
  trafficLightPosition: { x: 16, y: 14 },
} : {}),
...(isWin ? {
  titleBarStyle: 'hidden',
  titleBarOverlay: { color: themeColor, symbolColor, height: 44 },
} : {}),
...(!isMac && !isWin ? {
  titleBarStyle: 'default',
} : {}),
```

**Меню приложения** (`src/main/menu.js`):
- На macOS — с app menu (название приложения)
- На Windows / Linux — без app menu, с Quit в File

**CSS chrome UI** (`src/renderer/index/index.css`):
```css
body[data-platform="win32"] .tab-strip {
  padding-right: 140px;
}
body[data-platform="linux"] .tab-strip {
  padding-left: 8px;
}
```

---

## См. также

- [README](../README.md) — обзор проекта
- [TECHNOLOGIES](TECHNOLOGIES.md) — стек
- [INSTALLATION](INSTALLATION.md) — как установить на каждой ОС
- [PRIVACY](PRIVACY.md) — где хранятся данные на разных ОС