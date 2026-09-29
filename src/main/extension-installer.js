/**
 * Собственный загрузчик расширений Chrome.
 *
 * Не использует electron-chrome-web-store — там транзитивно тянется
 * уязвимый adm-zip@0.5.18. Здесь используем @electron-internal/extract-zip
 * — безопасный форк от команды Electron, устойчивый к symlink traversal.
 */
import { session } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import https from 'https'
import { URL } from 'url'
import { createRequire } from 'module'
import { debugLog } from './debug.js'

const require = createRequire(import.meta.url)
const extractRaw = require('@electron-internal/extract-zip')
const extract = extractRaw.default || extractRaw.extract || extractRaw
const CRX_URL = 'https://clients2.google.com/service/update2/crx'

function buildCrxUrl(extensionId) {
  // Расширенный набор параметров — Chrome Web Store проверяет их и отдаёт
  // корректный .crx только при реалистичном наборе (os/arch/prod).
  const params = [
    'response=redirect',
    'os=mac',
    'arch=arm64',
    'os_arch=arm64',
    'nacl_arch=arm64',
    'prod=chromiumcrx',
    'prodchannel=unknown',
    'prodversion=133.0.0.0',
    'acceptformat=crx2,crx3',
    `x=id%3D${extensionId}%26uc`,
  ]
  return `${CRX_URL}?${params.join('&')}`
}

function downloadCrx(extensionId) {
  return new Promise((resolve, reject) => {
    const url = buildCrxUrl(extensionId)

    function follow(targetUrl, redirectsLeft = 5) {
      if (redirectsLeft === 0) {
        return reject(new Error('Слишком много редиректов при скачивании'))
      }

      let parsed
      try {
        parsed = new URL(targetUrl)
      } catch (e) {
        return reject(new Error('Некорректный URL: ' + targetUrl))
      }

      const req = https.get({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
      }, (res) => {
        // Редирект — идём по Location
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          const nextUrl = new URL(res.headers.location, targetUrl).toString()
          debugLog('Extensions', `Редирект → ${nextUrl.slice(0, 80)}...`)
          follow(nextUrl, redirectsLeft - 1)
          return
        }

        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode} при скачивании расширения`))
          return
        }

        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          if (buffer.length < 100) {
            reject(new Error('Получен пустой файл — возможно, расширение не найдено'))
            return
          }
          resolve(buffer)
        })
        res.on('error', reject)
      })

      req.on('error', (err) => reject(err))
      req.setTimeout(30000, () => {
        req.destroy()
        reject(new Error('Таймаут при скачивании расширения'))
      })
    }

    follow(url)
  })
}

function stripCrxHeader(buffer) {
  // CRX2 и CRX3: ищем ZIP-сигнатуру "PK\x03\x04" и обрезаем всё до неё
  const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04])
  const idx = buffer.indexOf(zipMagic)
  if (idx === -1) throw new Error('Не найдена ZIP-сигнатура в CRX')
  return buffer.slice(idx)
}

export async function installExtensionFromStore(extensionId, extensionsDir) {
  if (!/^[a-z]{32}$/.test(extensionId)) {
    return { ok: false, error: 'Некорректный ID (нужно 32 строчные латинские буквы)' }
  }

  const ses = session.defaultSession

  const existing = ses.getAllExtensions().find(e => e.id === extensionId)
  if (existing) return { ok: false, error: 'Расширение уже установлено' }

  const targetDir = path.join(extensionsDir, extensionId)
  const tmpZip = path.join(os.tmpdir(), `ext-${extensionId}-${Date.now()}.zip`)

  try {
    debugLog('Extensions', `Скачивание ${extensionId}...`)
    const buffer = await downloadCrx(extensionId)
    const zipBuffer = stripCrxHeader(buffer)
    fs.writeFileSync(tmpZip, zipBuffer)

    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
    fs.mkdirSync(targetDir, { recursive: true })

    debugLog('Extensions', `Распаковка в ${targetDir}...`)
    await extract(tmpZip, { dir: path.resolve(targetDir) })

    if (!fs.existsSync(path.join(targetDir, 'manifest.json'))) {
      throw new Error('В архиве нет manifest.json — это не расширение Chrome')
    }

    debugLog('Extensions', 'Загрузка в Chromium...')
    const loaded = await ses.loadExtension(targetDir, { allowFileAccess: true })

    try { fs.unlinkSync(tmpZip) } catch {}

    debugLog('Extensions', `Установлено: ${loaded.name} v${loaded.version}`)
    return { ok: true, id: loaded.id, name: loaded.name }
  } catch (err) {
    try { fs.unlinkSync(tmpZip) } catch {}
    try { fs.rmSync(targetDir, { recursive: true, force: true }) } catch {}
    debugLog('Extensions', `Ошибка установки: ${err.message}`)
    return { ok: false, error: err.message || 'Не удалось установить расширение' }
  }
}

export async function removeExtensionFromSession(extensionId) {
  try {
    await session.defaultSession.removeExtension(extensionId)
    debugLog('Extensions', `Удалено: ${extensionId}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export function listInstalledExtensions() {
  try {
    return session.defaultSession.getAllExtensions().map(ext => ({
      id: ext.id,
      name: ext.name,
      version: ext.version,
      description: ext.manifest?.description || '',
      path: ext.path,
    }))
  } catch (err) {
    debugLog('Extensions', `Ошибка получения списка: ${err.message}`)
    return []
  }
}

/**
 * Загружает все ранее установленные расширения при старте приложения.
 */
export async function loadInstalledExtensions(extensionsDir) {
  if (!fs.existsSync(extensionsDir)) return

  let entries
  try {
    entries = fs.readdirSync(extensionsDir, { withFileTypes: true })
  } catch (err) {
    debugLog('Extensions', `Не удалось прочитать папку: ${err.message}`)
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const extPath = path.join(extensionsDir, entry.name)
    if (!fs.existsSync(path.join(extPath, 'manifest.json'))) continue

    try {
      const loaded = await session.defaultSession.loadExtension(extPath, { allowFileAccess: true })
      debugLog('Extensions', `Автозагружено: ${loaded.name} v${loaded.version}`)
    } catch (err) {
      debugLog('Extensions', `Не удалось загрузить ${entry.name}: ${err.message}`)
    }
  }
}