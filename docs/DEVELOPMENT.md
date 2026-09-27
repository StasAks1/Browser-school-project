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
   - Добавь обработку в `loadTabContent`

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

## Сборка релиза

```bash
# 1. Обнови версию в package.json
# 2. Обнови документацию, если нужно
# 3. Собери локально для проверки
npm run dist:mac

# 4. Отправь тег — GitHub Actions соберёт все три платформы
git tag v1.0.1
git push --tags
```

## Полезные ссылки

- [Electron docs](https://www.electronjs.org/docs)
- [electron-vite](https://electron-vite.org/)
- [Vite](https://vitejs.dev/)
- [@mozilla/readability](https://github.com/mozilla/readability)
- [MDN Web Docs](https://developer.mozilla.org/)

---

## См. также

- [README](../README.md) — обзор
- [ARCHITECTURE](ARCHITECTURE.md) — как всё работает
- [PROJECT-STRUCTURE](PROJECT-STRUCTURE.md) — структура файлов
- [SHORTCUTS](SHORTCUTS.md) — текущие хоткеи
- [TECHNOLOGIES](TECHNOLOGIES.md) — стек