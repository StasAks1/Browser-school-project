/**
 * Импорт и экспорт закладок в формате Netscape Bookmark File.
 * Формат понимают Chrome, Firefox, Safari, Edge, Opera.
 *
 * Экспорт: закладки и папки → HTML-файл.
 * Импорт: HTML-файл → объект { bookmarks, folders }.
 */

// ============================================================
// ============ ЭКСПОРТ =======================================
// ============================================================
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

function toUnixSeconds(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return Math.floor(Date.now() / 1000)
  return Math.floor(n / 1000)
}

function bookmarkToLine(bm, indent) {
  const pad = '    '.repeat(indent)
  const addDate = toUnixSeconds(bm.createdAt)
  let attrs = `HREF="${escapeHtml(bm.url)}" ADD_DATE="${addDate}"`
  if (bm.favicon && typeof bm.favicon === 'string') {
    if (bm.favicon.startsWith('data:')) {
      attrs += ` ICON="${escapeHtml(bm.favicon)}"`
    } else if (/^https?:\/\//i.test(bm.favicon)) {
      attrs += ` ICON_URI="${escapeHtml(bm.favicon)}"`
    }
  }
  const title = escapeHtml(bm.title || bm.url)
  return `${pad}<DT><A ${attrs}>${title}</A>`
}

/**
 * Генерирует HTML-строку в формате Netscape Bookmark File.
 *
 * @param {Array} bookmarks — плоский массив закладок (с полем folderId или null)
 * @param {Array} folders — плоский массив папок (с полем id, name)
 * @returns {string} — полный HTML документ
 */
export function generateBookmarksHTML(bookmarks, folders) {
  const lines = []
  lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
  lines.push('<!-- This is an automatically generated file.')
  lines.push('     It will be read and overwritten.')
  lines.push('     DO NOT EDIT! -->')
  lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">')
  lines.push('<TITLE>Bookmarks</TITLE>')
  lines.push('<H1>Bookmarks</H1>')
  lines.push('<DL><p>')

  // Сначала — закладки без папки (в корне)
  const rootBookmarks = (bookmarks || []).filter((b) => !b.folderId)
  for (const bm of rootBookmarks) {
    lines.push(bookmarkToLine(bm, 1))
  }

  // Потом — папки с содержимым
  for (const folder of folders || []) {
    const pad = '    '
    const addDate = toUnixSeconds(folder.createdAt)
    lines.push(`${pad}<DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${addDate}">${escapeHtml(folder.name)}</H3>`)
    lines.push(`${pad}<DL><p>`)

    const items = (bookmarks || []).filter((b) => b.folderId === folder.id)
    for (const bm of items) {
      lines.push(bookmarkToLine(bm, 2))
    }

    lines.push(`${pad}</DL><p>`)
  }

  lines.push('</DL><p>')
  return lines.join('\n') + '\n'
}

// ============================================================
// ============ ИМПОРТ ========================================
// ============================================================
function decodeHtmlEntities(str) {
  return String(str == null ? '' : str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCharCode(parseInt(n, 10)) } catch { return _ }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      try { return String.fromCharCode(parseInt(n, 16)) } catch { return _ }
    })
}

function parseAttrs(str) {
  const attrs = {}
  const re = /([\w-]+)\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(str)) !== null) {
    attrs[m[1].toLowerCase()] = m[2]
  }
  return attrs
}

function makeId(suffix) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${suffix}`
}

/**
 * Парсит HTML в формате Netscape Bookmark File.
 *
 * @param {string} html — содержимое файла
 * @returns {{ bookmarks: Array, folders: Array }}
 */
export function parseBookmarksHTML(html) {
  const bookmarks = []
  const folders = []
  // Стек контекстов. Верхний — текущий контекст.
  // pendingFolderId — папка, объявленная прямо перед <DL>, станет parentId для следующего уровня.
  const stack = [{ parentId: null, pendingFolderId: null }]

  // Регексп ищет три типа токенов:
  // 1) <DT><H3 ...>name</H3>  — объявление папки
  // 2) <DT><A ...>name</A>    — закладка
  // 3) <DL> и </DL>           — открытие/закрытие уровня
  const tagRe = /<DT>\s*<H3([^>]*)>([\s\S]*?)<\/H3>|<DT>\s*<A([^>]*)>([\s\S]*?)<\/A>|<DL[^>]*>|<\/DL>/gi

  let match
  while ((match = tagRe.exec(html)) !== null) {
    const full = match[0]

    // ============ <DL> — открываем новый уровень ============
    if (/^<DL/i.test(full)) {
      const top = stack[stack.length - 1]
      const parentId = top.pendingFolderId || top.parentId
      stack.push({ parentId, pendingFolderId: null })
      continue
    }

    // ============ </DL> — закрываем уровень ============
    if (/^<\/DL/i.test(full)) {
      if (stack.length > 1) stack.pop()
      continue
    }

    // ============ <H3> — папка ============
    if (match[1] !== undefined) {
      const attrs = parseAttrs(match[1])
      const name = decodeHtmlEntities(match[2].trim()) || 'Без названия'
      const top = stack[stack.length - 1]
      const addDate = parseInt(attrs.add_date, 10)
      const createdAt = Number.isFinite(addDate) && addDate > 0 ? addDate * 1000 : Date.now()

      const id = makeId(`f${folders.length}`)
      folders.push({
        id,
        name,
        createdAt,
      })
      // Запоминаем папку как pending — следующий <DL> станет её содержимым
      top.pendingFolderId = id
      continue
    }

    // ============ <A> — закладка ============
    if (match[3] !== undefined) {
      const attrs = parseAttrs(match[3])
      const title = decodeHtmlEntities(match[4].trim())
      const url = decodeHtmlEntities(attrs.href || '').trim()
      if (!url) continue

      const top = stack[stack.length - 1]
      const addDate = parseInt(attrs.add_date, 10)
      const createdAt = Number.isFinite(addDate) && addDate > 0 ? addDate * 1000 : Date.now()
      const favicon = attrs.icon || attrs.icon_uri || null

      bookmarks.push({
        id: makeId(`b${bookmarks.length}`),
        title: title || url,
        url,
        favicon: favicon || null,
        createdAt,
        folderId: top.parentId || null,
      })
    }
  }

  return { bookmarks, folders }
}