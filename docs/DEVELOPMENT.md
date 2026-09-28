# Разработка

## Настройка окружения

**Требуется:**
- Node.js 18+
- npm
- VS Code (рекомендуется)
- Git

```bash
git clone https://github.com/StasAks1/Browser-school-project.git
cd Browser-school-project
npm install
```

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | Запуск в dev-режиме |
| `DEBUG=1 npm run dev` | Dev-режим с логами |
| `npm run build` | Сборка без упаковки (папка `out/`) |
| `npm run start` | Запуск собранной версии |
| `npm run dist:mac` | Сборка `.dmg` для macOS |
| `npm run dist:win` | Сборка `.exe` (только на Windows) |
| `npm run dist:linux` | Сборка `.AppImage` (только на Linux) |

## Соглашения по коду

- **Отступы** — 2 пробела
- **Кавычки** — одинарные `'...'` в JS, двойные `"..."` в HTML/CSS
- **Точки с запятой** — не ставятся (стиль без ASI)
- **Именование** — `camelCase` для переменных, `kebab-case` для файлов
- **Комментарии** — на русском, только там, где неочевидно
- **Функции** — стараться держать < 100 строк

## Debug-режим

В `src/main/debug.config.js` — флаги:

```js
export const DEBUG = {
  enabled: envDebug,        // включается через DEBUG=1
  openTabDevTools: false,   // DevTools для каждой вкладки
  logIPC: true,             // логи IPC
  logTabEvents: false,      // события вкладок
  logNetwork: false,        // HTTP-запросы (очень шумно)
  colors: true,             // цветные логи
}
```

Запуск с логами:
```bash
DEBUG=1 npm run dev
```

В терминале:
```
[Tab] Выгружена вкладка #3 (https://...)
[Session] Восстановлено вкладок: 5
[Tracker] Заблокировано: https://google-analytics.com/...
[Cache] Кэш Chromium очищен
[Tab] Перестановка: #2 after #5
```

## Отладка

### Main-процесс
- **Терминал** — там `console.log`, ошибки, `debugLog`
- **DevTools main** — не работает (это Node.js)
- Для детальной отладки: `DEBUG=1 npm run dev`

### Renderer
- **Cmd+Opt+I** (`Ctrl+Shift+I` на Win/Linux) — DevTools chrome UI
- **Правый клик на странице → Inspect Element** — DevTools вкладки

### Отдельные вкладки
Включи в `debug.config.js`: `openTabDevTools: true` — DevTools будет открываться в отдельном окне для каждой вкладки.

## Рецепты

### Добавить новую внутреннюю страницу

1. Создай папку: `src/renderer/mypage/`
2. Внутри три файла: `mypage.html`, `mypage.css`, `mypage.js`
3. В `mypage.html` — стандартная структура с CSP, inline anti-flicker скриптом, подключением `../shared/theme.js`, `../shared/tooltip.js`
4. Добавь в `electron.vite.config.js`:
   ```js
   mypage: resolve(__dirname, 'src/renderer/mypage/mypage.html'),
   ```
5. В `src/main/index.js`:
   - Добавь константу `const INTERNAL_MYPAGE = 'internal://mypage'`
   - Добавь функции `getMypagePagePath()` и `getMypagePageUrl()`
   - Добавь проверку `isMypagePageUrl(url)` в `isInternalUrl`
   - Добавь в `isTrustedInternalUrl`
   - Добавь обработку в `loadTabContent` и `navigateInActiveTab`

### Добавить новый IPC-метод

1. **Main** (`src/main/index.js`):
   ```js
   ipcMain.handle('my-action', (_e, payload) => {
     // логика
     return { ok: true, data: ... }
   })
   ```

2. **Preload** (`src/preload/index.js`):
   ```js
   myAction: (payload) => ipcRenderer.invoke('my-action', payload),
   ```

3. **Renderer**:
   ```js
   const result = await window.browserAPI.myAction(payload)
   ```

### Добавить односторонний IPC (без ответа)

Для событий, где ответ не нужен — например, drag & drop:

1. **Main** (`src/main/index.js`):
   ```js
   ipcMain.on('my-event', (_e, payload) => handleMyEvent(payload))
   ```

2. **Preload** (`src/preload/index.js`):
   ```js
   ipcRenderer.send('my-event', payload)
   ```

### Добавить новый хоткей

1. **`src/main/shortcuts.js`** — добавь в `matchShortcut`:
   ```js
   if (key === 'x' && shift) return 'my-command'
   ```

2. **`src/main/index.js`** — добавь в `executeShortcut`:
   ```js
   case 'my-command':
     doSomething()
     break
   ```

3. Опционально — добавь в `src/main/menu.js`:
   ```js
   {
     label: 'Моя команда',
     accelerator: 'CmdOrCtrl+Shift+X',
     click: safeCall(actions.myCommand),
   }
   ```

### Добавить новую настройку

1. **`src/main/index.js`**:
   ```js
   let settingsCache = {
     ...,
     mySetting: true,
   }
   ```
2. В `loadSettings` / `saveSettings` — обработать
3. IPC:
   ```js
   ipcMain.handle('get-my-setting', () => settingsCache.mySetting)
   ipcMain.handle('set-my-setting', (_e, v) => {
     settingsCache.mySetting = !!v
     saveSettings()
     return settingsCache.mySetting
   })
   ```
4. Preload: `getMySetting`, `setMySetting`
5. UI в `src/renderer/settings/settings.js`

### Добавить новую кнопку в тулбар

1. **`src/renderer/index/index.html`** — добавь кнопку:
   ```html
   <button id="btn-my" class="circle-btn" data-toolbar-id="my" title="Моя кнопка">
     <svg>...</svg>
   </button>
   ```

2. **`src/main/index.js`** — добавь `'my'` в массив `ALL_TOOLBAR_BUTTONS`

3. **`src/renderer/settings/settings.js`** — добавь в `TOOLBAR_LABELS`:
   ```js
   my: 'Моя кнопка',
   ```

Кнопка автоматически появится в списке кастомизации в настройках. Порядок и видимость — настраиваются пользователем.

### Добавить пункт в системное меню

`src/main/menu.js` — в нужном submenu (File / Edit / View / ...):

```js
{
  label: 'Мой пункт',
  accelerator: 'CmdOrCtrl+Shift+M',
  click: safeCall(actions.myAction),
},
```

И добавь `myAction` в `menuActions` в `src/main/index.js`.

### Динамическое подменю в меню (пример «Недавно закрытые»)

Если нужно подменю, которое обновляется при изменениях — передай **функцию**, которая возвращает массив пунктов:

```js
// menu.js
{
  label: 'Недавно закрытые',
  submenu: typeof actions.recentlyClosedItems === 'function'
    ? actions.recentlyClosedItems()
    : [{ label: 'Недоступно', enabled: false }],
}

// main/index.js — menuActions
recentlyClosedItems: () => {
  const list = getRecentlyClosed()
  if (list.length === 0) return [{ label: 'Пусто', enabled: false }]
  return list.map(t => ({ label: t.title, click: () => restoreById(t.id) }))
}
```

При каждом изменении данных вызывай `refreshMenu()` — это пересоберёт меню с актуальным списком.

## Сборка релиза

### Локально (для проверки)

1. Обнови `version` в `package.json`
2. Обнови документацию, если нужно
3. Собери для своей платформы:

```bash
npm run dist:mac       # на macOS
npm run dist:win       # на Windows
npm run dist:linux     # на Linux
```

Готовые файлы появятся в `dist/`.

### Через GitHub Actions (рекомендуется)

**Что происходит:**
- При пуше тега `v*` GitHub запускает 3 виртуалки: macOS, Windows, Linux
- Каждая собирает свой установщик (`.dmg`, `.exe`, `.AppImage`, `.deb`)
- Файлы автоматически публикуются в **Releases** репозитория

**Как запустить:**

```bash
# 1. Убедиться, что всё закоммичено
git status

# 2. Обновить version в package.json (например, 1.0.0 → 1.0.1)

# 3. Коммит + push
git add .
git commit -m "Release v1.0.1"
git push

# 4. Создать и запушить тег
git tag v1.0.1
git push --tags
```

**Как следить:**
- Открой `https://github.com/StasAks1/Browser-school-project/actions`
- Увидишь запущенный workflow `Build releases`
- Через 10–15 минут все job'ы станут зелёными

**Где скачать:**
- `https://github.com/StasAks1/Browser-school-project/releases`
- Раздел `v1.0.1` — все файлы для трёх платформ

### Если сборка упала

1. Открой страницу Actions
2. Кликни на упавший job
3. Раскрой упавший шаг (красный крестик)
4. Смотри последние 20–30 строк лога — там ошибка
5. Фикси код → новый тег с другим именем (например, `v1.0.2`)

### Повторный запуск без нового тега

Если нужно перезапустить CI на том же коде:
- Открой Actions → выбери workflow → **Re-run all jobs**
- Или удали тег и создай заново:

```bash
git tag -d v1.0.0
git push origin :refs/tags/v1.0.0
git tag v1.0.0
git push --tags
```

## Полезные ссылки

- [Electron docs](https://www.electronjs.org/docs)
- [electron-vite](https://electron-vite.org/)
- [Vite](https://vitejs.dev/)
- [@mozilla/readability](https://github.com/mozilla/readability)
- [pdfjs-dist](https://github.com/mozilla/pdf.js)
- [MDN Web Docs](https://developer.mozilla.org/)

---

## См. также

- [README](../README.md) — обзор
- [ARCHITECTURE](ARCHITECTURE.md) — как всё работает
- [PROJECT-STRUCTURE](PROJECT-STRUCTURE.md) — структура файлов
- [SHORTCUTS](SHORTCUTS.md) — текущие хоткеи
- [TECHNOLOGIES](TECHNOLOGIES.md) — стек