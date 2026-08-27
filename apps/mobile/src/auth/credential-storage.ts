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
 * Read and remove the credential left by the previous PWA release so it can be
 * exchanged once for the server's HttpOnly cookie. New browser credentials are
 * never written into script-readable storage.
 */
export function webCredentialStorage(
  storageProvider: () => OriginStorage = browserLocalStorage,
): CredentialStorage {
  return {
    read: async () => {
      try {
        const storage = storageProvider()
        const token = storage.getItem(WEB_SESSION_KEY)
        if (token === null) return null
        if (isSessionToken(token)) return token
        storage.removeItem(WEB_SESSION_KEY)
        return null
      } catch {
        // Cookie authentication does not depend on script-readable storage.
        return null
      }
    },
    write: async () => { throw new Error('web_sessions_are_cookie_only') },
    remove: async () => {
      try { storageProvider().removeItem(WEB_SESSION_KEY) } catch { /* Already unavailable. */ }
    },
  }
}
