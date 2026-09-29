/**
 * Reader Mode — извлечение основного содержимого страницы через Mozilla Readability.
 *
 * Readability — CommonJS-модуль, поэтому при инжекте в браузерный контекст
 * приходится имитировать module/exports/require. Дополнительно мы берём файл
 * Readability.js напрямую (а не index.js), чтобы не тянуть require("./Readability").
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { debugLog } from './debug.js'

const require = createRequire(import.meta.url)

let readabilityCode = null
let readabilityLoadFailed = false

function getReadabilityCode() {
  if (readabilityCode) return readabilityCode
  if (readabilityLoadFailed) return null

  try {
    // Достаём путь до пакета и берём файл Readability.js напрямую
    const pkgPath = require.resolve('@mozilla/readability/package.json')
    const pkgDir = path.dirname(pkgPath)
    const readabilityPath = path.join(pkgDir, 'Readability.js')

    if (!fs.existsSync(readabilityPath)) {
      throw new Error(`Файл не найден: ${readabilityPath}`)
    }

    const rawCode = fs.readFileSync(readabilityPath, 'utf-8')

    // Оборачиваем в имитацию CommonJS, чтобы `module.exports = Readability` сработал
    readabilityCode = `
      ;(function(){
        try {
          var module = { exports: {} };
          var exports = module.exports;
          ${rawCode}
          window.__Readability = module.exports && module.exports.default
            ? module.exports.default
            : module.exports;
        } catch (e) {
          window.__ReadabilityError = String((e && e.message) || e);
        }
      })();
    `
    debugLog('Reader', `Readability подготовлен (${readabilityCode.length} байт)`)
    return readabilityCode
  } catch (err) {
    readabilityLoadFailed = true
    console.error('[reader] Не удалось загрузить Readability:', err)
    return null
  }
}

/**
 * Извлекает статью из WebContents.
 * @returns {Promise<{ok: boolean, article?: object, error?: string}>}
 */
export async function extractArticle(wc) {
  if (!wc || wc.isDestroyed()) {
    return { ok: false, error: 'Вкладка недоступна' }
  }

  const code = getReadabilityCode()
  if (!code) {
    return { ok: false, error: 'Библиотека Readability не найдена' }
  }

  const script = `
    (function() {
      try {
        // 1. Сначала проверяем, не инжектили ли мы уже Readability
        if (typeof window.__Readability !== 'function') {
          ${code}
        }

        if (typeof window.__Readability !== 'function') {
          return {
            ok: false,
            error: window.__ReadabilityError || 'Readability не загрузился'
          }
        }

        // 2. Клонируем документ, чтобы Readability не менял текущую страницу
        var clone = document.cloneNode(true)

        // 3. Запускаем парсер
        var reader = new window.__Readability(clone, { charThreshold: 100 })
        var article = reader.parse()

        if (!article) {
          return { ok: false, error: 'На этой странице нет статьи для чтения' }
        }
        if (!article.content) {
          return { ok: false, error: 'Содержимое статьи пусто' }
        }

        return {
          ok: true,
          article: {
            title: article.title || document.title || '',
            byline: article.byline || '',
            dir: article.dir || '',
            lang: article.lang || document.documentElement.lang || '',
            content: article.content || '',
            textContent: (article.textContent || '').slice(0, 20000),
            length: article.length || 0,
            excerpt: article.excerpt || '',
            siteName: article.siteName || ''
          }
        }
      } catch (e) {
        return { ok: false, error: String((e && e.message) || e) }
      }
    })()
  `

  try {
    const result = await wc.executeJavaScript(script, true)
    if (!result || typeof result !== 'object') {
      return { ok: false, error: 'Пустой результат извлечения' }
    }
    if (!result.ok) {
      return { ok: false, error: result.error || 'Не удалось извлечь статью' }
    }
    if (!result.article || !result.article.content) {
      return { ok: false, error: 'Содержимое статьи пусто' }
    }
    return { ok: true, article: result.article }
  } catch (err) {
    return { ok: false, error: err.message || 'Ошибка извлечения' }
  }
}

//эта строка создана только для красивого коммита 10 обновления на гитхаб, чисто эстетика, не судите строго