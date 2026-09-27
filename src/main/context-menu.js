/**
 * Контекстное меню веб-страницы.
 * Строит меню в зависимости от того, куда пользователь кликнул правой кнопкой:
 * по ссылке, картинке, тексту, редактируемому полю или пустому месту.
 */
import { Menu, clipboard, app, dialog } from 'electron'
import path from 'path'
import { debugLog } from './debug.js'

function sanitizeFilename(name) {
  const s = String(name || 'page')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  return s || 'page'
}

async function handleSavePageAs(wc) {
  let title = 'page'
  try { title = wc.getTitle() || 'page' } catch {}

  const defaultPath = path.join(app.getPath('downloads'), sanitizeFilename(title) + '.html')

  const result = await dialog.showSaveDialog({
    title: 'Сохранить страницу',
    defaultPath,
    filters: [
      { name: 'Веб-страница, полностью', extensions: ['html', 'htm'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
  })

  if (result.canceled || !result.filePath) return

  try {
    await wc.savePage(result.filePath, 'HTMLComplete')
    debugLog('ContextMenu', `Страница сохранена: ${result.filePath}`)
  } catch (err) {
    console.error('Failed to save page:', err)
    dialog.showErrorBox('Ошибка', 'Не удалось сохранить страницу: ' + err.message)
  }
}

/**
 * Показывает контекстное меню для веб-страницы.
 *
 * @param {object} opts
 * @param {object} opts.params — объект из события 'context-menu' в Electron
 * @param {Electron.WebContents} opts.wc — WebContents, на котором произошёл клик
 * @param {object} opts.actions — колбэки из main/index.js
 * @param {Function} opts.actions.createTab — создать новую вкладку с URL
 */
export function showTabContextMenu({ params, wc, actions }) {
  const template = []

  const addSep = () => {
    if (template.length === 0) return
    if (template[template.length - 1].type === 'separator') return
    template.push({ type: 'separator' })
  }

  // ============ Ссылка ============
  if (params.linkURL) {
    template.push({
      label: 'Открыть в новой вкладке',
      click: () => actions.createTab(params.linkURL),
    })
    template.push({
      label: 'Копировать ссылку',
      click: () => clipboard.writeText(params.linkURL),
    })
    template.push({
      label: 'Сохранить ссылку как…',
      click: () => {
        try { wc.downloadURL(params.linkURL) } catch (e) {}
      },
    })
    addSep()
  }

  // ============ Изображение ============
  if (params.mediaType === 'image' && params.srcURL) {
    template.push({
      label: 'Открыть изображение в новой вкладке',
      click: () => actions.createTab(params.srcURL),
    })
    template.push({
      label: 'Сохранить изображение как…',
      click: () => {
        try { wc.downloadURL(params.srcURL) } catch (e) {}
      },
    })
    template.push({
      label: 'Копировать изображение',
      click: () => {
        try { wc.copyImageAt(params.x, params.y) } catch (e) {}
      },
    })
    template.push({
      label: 'Копировать адрес изображения',
      click: () => clipboard.writeText(params.srcURL),
    })
    addSep()
  }

  // ============ Видео / аудио ============
  if ((params.mediaType === 'video' || params.mediaType === 'audio') && params.srcURL) {
    template.push({
      label: 'Открыть медиа в новой вкладке',
      click: () => actions.createTab(params.srcURL),
    })
    template.push({
      label: 'Копировать адрес медиа',
      click: () => clipboard.writeText(params.srcURL),
    })
    addSep()
  }

  // ============ Выделенный текст ============
  const selection = (params.selectionText || '').trim()
  if (selection) {
    template.push({
      label: 'Копировать',
      role: 'copy',
    })

    const preview = selection.length > 30 ? selection.slice(0, 30) + '…' : selection
    template.push({
      label: `Найти в DuckDuckGo: «${preview}»`,
      click: () => {
        const url = 'https://duckduckgo.com/?q=' + encodeURIComponent(selection)
        actions.createTab(url)
      },
    })
    addSep()
  }

  // ============ Редактируемое поле ============
  if (params.isEditable) {
    const flags = params.editFlags || {}
    template.push({ label: 'Отменить', role: 'undo', enabled: !!flags.canUndo })
    template.push({ label: 'Повторить', role: 'redo', enabled: !!flags.canRedo })
    addSep()
    template.push({ label: 'Вырезать', role: 'cut', enabled: !!flags.canCut })
    template.push({ label: 'Копировать', role: 'copy', enabled: !!flags.canCopy })
    template.push({ label: 'Вставить', role: 'paste', enabled: !!flags.canPaste })
    template.push({ label: 'Выделить всё', role: 'selectAll', enabled: !!flags.canSelectAll })
    addSep()
  }

  // ============ Навигация ============
  template.push({
    label: 'Назад',
    enabled: wc.canGoBack(),
    click: () => { try { wc.goBack() } catch (e) {} },
  })
  template.push({
    label: 'Вперёд',
    enabled: wc.canGoForward(),
    click: () => { try { wc.goForward() } catch (e) {} },
  })
  template.push({
    label: 'Обновить',
    click: () => { try { wc.reload() } catch (e) {} },
  })
  addSep()

  // ============ Служебные ============
  template.push({
    label: 'Сохранить страницу как…',
    click: () => handleSavePageAs(wc),
  })
  template.push({
    label: 'Печать…',
    click: () => { try { wc.print() } catch (e) {} },
  })
  addSep()

  template.push({
    label: 'Копировать адрес страницы',
    click: () => {
      try { clipboard.writeText(wc.getURL()) } catch (e) {}
    },
  })
  template.push({
    label: 'Проверить элемент',
    click: () => {
      try { wc.inspectElement(params.x, params.y) } catch (e) {}
    },
  })

  // Убираем хвостовые разделители
  while (template.length && template[template.length - 1].type === 'separator') {
    template.pop()
  }

  if (template.length === 0) return

  const menu = Menu.buildFromTemplate(template)
  menu.popup()
}