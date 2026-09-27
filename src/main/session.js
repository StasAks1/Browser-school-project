import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const SESSION_VERSION = 1
const MAX_TABS = 50

export function getSessionFile() {
  return path.join(app.getPath('userData'), 'session.json')
}

export function saveSession({ tabs, activeIndex }) {
  try {
    const data = {
      version: SESSION_VERSION,
      savedAt: Date.now(),
      tabs: Array.isArray(tabs) ? tabs.slice(0, MAX_TABS) : [],
      activeIndex: Number.isInteger(activeIndex) ? activeIndex : 0,
    }
    fs.writeFileSync(getSessionFile(), JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('Failed to save session:', err)
    return false
  }
}

export function loadSession() {
  try {
    const file = getSessionFile()
    if (!fs.existsSync(file)) return null
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    if (data.version !== SESSION_VERSION) return null

    const tabs = Array.isArray(data.tabs) ? data.tabs : []
    const filtered = tabs
      .filter((t) => t && typeof t.url === 'string' && t.url.trim())
      .slice(0, MAX_TABS)

    if (filtered.length === 0) return null

    const activeIndex = Math.min(
      Math.max(0, Number.isInteger(data.activeIndex) ? data.activeIndex : 0),
      filtered.length - 1
    )

    return { tabs: filtered, activeIndex, savedAt: data.savedAt || null }
  } catch (err) {
    console.error('Failed to load session:', err)
    return null
  }
}

export function clearSession() {
  try {
    const file = getSessionFile()
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return true
  } catch (err) {
    console.error('Failed to clear session:', err)
    return false
  }
}

/**
 * Возвращает true, если URL имеет смысл восстанавливать.
 * Отсеиваем внутренние страницы браузера, служебные протоколы и заглушки.
 */
export function isRestorableUrl(url) {
  if (!url || typeof url !== 'string') return false
  const u = url.trim()
  if (!u || u === 'about:blank') return false
  if (u.startsWith('data:') || u.startsWith('file:') || u.startsWith('devtools:')) return false
  if (u.startsWith('chrome:') || u.startsWith('chrome-extension:')) return false

  // Внутренние страницы браузера не восстанавливаем
  if (u.includes('startpage.html')) return false
  if (u.includes('index/index.html')) return false
  if (u.includes('bookmarks/bookmarks.html')) return false
  if (u.includes('history/history.html')) return false
  if (u.includes('downloads/downloads.html')) return false
  if (u.includes('settings/settings.html')) return false
  if (u.includes('cookies/cookies.html')) return false
  if (u.includes('error/error.html')) return false
  if (u.includes('warning/warning.html')) return false
  if (u.includes('statusbar/statusbar.html')) return false
  if (u.includes('popup/popup.html')) return false
  if (u.includes('permission/permission.html')) return false

  return true
}