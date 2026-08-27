import { isSessionToken } from '../api/protocol.ts'

const WEB_SESSION_KEY = 'homesrolo.web.session.v1'

export interface CredentialStorage {
  read(): Promise<string | null>
  write(token: string): Promise<void>
  remove(): Promise<void>
}

interface OriginStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function browserLocalStorage(): OriginStorage {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('web_storage_unavailable')
  }
  return window.localStorage
}

/**
 * Browser sessions stay in origin-scoped storage. The credential never enters a
 * URL, cookie, route state, or rendered element, and corrupt values are removed
 * before the API can see them.
 */
export function webCredentialStorage(
  storageProvider: () => OriginStorage = browserLocalStorage,
): CredentialStorage {
  return {
    read: async () => {
      const storage = storageProvider()
      const token = storage.getItem(WEB_SESSION_KEY)
      if (token === null) return null
      if (isSessionToken(token)) return token
      storage.removeItem(WEB_SESSION_KEY)
      return null
    },
    write: async token => {
      if (!isSessionToken(token)) throw new Error('invalid_session_token')
      storageProvider().setItem(WEB_SESSION_KEY, token)
    },
    remove: async () => storageProvider().removeItem(WEB_SESSION_KEY),
  }
}
