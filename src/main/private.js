/**
 * Приватная сессия (Incognito).
 *
 * Cookie, кэш, localStorage — изолированы от обычной сессии.
 * Данные очищаются при выходе из приложения.
 */
import { session } from 'electron'
import { debugLog } from './debug.js'

const PRIVATE_PARTITION = 'incognito'

let privateSessionInstance = null

/**
 * Возвращает (и при необходимости создаёт) приватную session.
 * Одна на всё приложение.
 */
export function getPrivateSession() {
  if (privateSessionInstance) return privateSessionInstance
  privateSessionInstance = session.fromPartition(PRIVATE_PARTITION)
  return privateSessionInstance
}

/**
 * Очищает все данные приватной сессии: cookie, кэш, localStorage,
 * IndexedDB, авторизации, service workers и т.д.
 */
export async function clearPrivateData() {
  const ses = getPrivateSession()
  if (!ses) return
  try {
    await ses.clearStorageData()
    await ses.clearCache()
    if (typeof ses.clearAuthCache === 'function') {
      await ses.clearAuthCache()
    }
    debugLog('Private', 'Данные приватной сессии очищены')
  } catch (err) {
    console.error('[private] clear failed:', err)
  }
}

export const PRIVATE_BG_COLOR = '#1e1a2e'