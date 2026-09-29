# Кроссплатформенность

Проект работает на **macOS**, **Windows** и **Linux**. Один код — три платформы.

## Что значит «кроссплатформенный»

Это значит, что:
- Один и тот же исходный код запускается на всех трёх ОС
- Интерфейс (Chrome UI) выглядит и работает одинаково везде
- Базовые функции (вкладки, закладки, история, загрузки, PDF-viewer, Reader Mode, блокировка трекеров) ведут себя идентично
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
- **Путь к данным** — `~/.config/malina-browser/`

## Что унифицировано

- **Chrome UI** — единый HTML + CSS для всех платформ
- **Внутренние страницы** — 15 страниц в `src/renderer/` одинаковы везде
- **PDF-viewer** — работает идентично на всех ОС через `pdfjs-dist`
- **Reader Mode** — работает на всех ОС
- **Drag & drop файлов** — работает на всех ОС через `webUtils.getPathForFile`
- **Drag & drop вкладок** — работает на всех ОС
- **Хоткеи** — через `CmdOrCtrl`, работают в Electron на всех ОС
- **IPC** — через `contextBridge`, одинаково
- **Хранение данных** — через `app.getPath('userData')`, кросс-платформенно
- **Блокировка рекламы и трекеров** — работает на всех ОС (свой движок, не зависит от платформы)
- **Ограничение кэша** — работает на всех ОС
- **Расширения Chrome** — работают на всех ОС (через `electron-chrome-web-store`)

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
| **macOS** | MacBook Air M5, 16 GB Unified Memory | Все функции: вкладки, drag & drop, PDF-viewer, Reader Mode, bulk-закладки, кастомизация тулбара, очистка кэша, блокировка рекламы, расширения Chrome |
| **Windows** | ПК на i7 13700F, RTX 4060 Ti (16 GB), 32 GB RAM | Запуск, вкладки, drag & drop, PDF-viewer, хоткеи, меню, PDF из drag & drop, блокировка рекламы |
| **Linux** | Ноутбук на AMD A9 9425, Radeon R7 M445, 8 GB RAM | Запуск, вкладки, drag & drop, PDF-viewer, системный заголовок, AppImage, блокировка рекламы |

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