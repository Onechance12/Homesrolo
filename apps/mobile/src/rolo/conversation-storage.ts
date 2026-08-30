import {
  MAX_ROLO_CONVERSATION_CHARACTERS,
  isRoloConversationScope,
  parseRoloConversation,
  serializeRoloConversation,
  type PersistedRoloConversation,
  type RoloConversationScope,
} from './conversation-persistence.ts'

const WEB_KEY_PREFIX = 'homesrolo.rolo.v1.'

export interface RoloRawStorage {
  read(key: string): Promise<string | null>
  write(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  removeScope(prefix: string): Promise<void>
  clear(): Promise<void>
}

export type RoloHomeConversationScope = Readonly<Pick<
  RoloConversationScope,
  'principalRef' | 'homeRef'
>>

export interface RoloConversationStorage {
  read(scope: RoloConversationScope): Promise<PersistedRoloConversation | null>
  write(value: PersistedRoloConversation): Promise<void>
  remove(scope: RoloConversationScope): Promise<void>
  clearHome(scope: RoloHomeConversationScope): Promise<void>
  clearAll(): Promise<void>
}

interface OriginStorage {
  readonly length: number
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
}

export function createRoloConversationStorage(driver: RoloRawStorage): RoloConversationStorage {
  let tail: Promise<void> = Promise.resolve()
  const schedule = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation)
    tail = result.then(() => undefined, () => undefined)
    return result
  }

  return {
    read: scope => schedule(async () => {
      if (!isRoloConversationScope(scope)) return null
      const key = scopeKey(scope)
      let raw = await driver.read(key)
      // Migrate the former one-thread-per-home key only when it proves it
      // belongs to the exact requested project. General Rolo never revives it.
      if (raw === null && scope.projectRef) {
        const legacyKey = legacyScopeKey(scope)
        raw = await driver.read(legacyKey)
        if (raw !== null) {
          const legacyValue = parseRoloConversation(raw, scope)
          if (!legacyValue) return null
          try {
            await driver.write(key, serializeRoloConversation(legacyValue))
            await driver.remove(legacyKey)
          } catch { /* The valid legacy thread can still be returned once. */ }
          return legacyValue
        }
      }
      if (raw === null) return null
      const value = parseRoloConversation(raw, scope)
      if (value) return value
      try { await driver.remove(key) } catch { /* Invalid state remains unusable. */ }
      return null
    }),
    write: value => schedule(async () => {
      if (!isRoloConversationScope(value)) throw new Error('invalid_rolo_conversation_scope')
      const serialized = serializeRoloConversation(value)
      await driver.write(scopeKey(value), serialized)
    }),
    remove: scope => schedule(async () => {
      if (!isRoloConversationScope(scope)) return
      await driver.remove(scopeKey(scope))
    }),
    clearHome: scope => schedule(async () => {
      if (!isRoloConversationScope(scope)) return
      await driver.removeScope(legacyScopeKey(scope))
    }),
    clearAll: () => schedule(() => driver.clear()),
  }
}

export function memoryRoloRawStorage(seed: Readonly<Record<string, string>> = {}): RoloRawStorage & {
  readonly values: ReadonlyMap<string, string>
} {
  const values = new Map(Object.entries(seed))
  return {
    values,
    read: async key => values.get(key) ?? null,
    write: async (key, value) => { values.set(key, value) },
    remove: async key => { values.delete(key) },
    removeScope: async prefix => {
      for (const key of values.keys()) {
        if (key === prefix || key.startsWith(`${prefix}.`)) values.delete(key)
      }
    },
    clear: async () => { values.clear() },
  }
}

export function webRoloRawStorage(
  storageProvider: () => OriginStorage = browserLocalStorage,
): RoloRawStorage {
  return {
    read: async key => {
      const storage = storageProvider()
      const raw = storage.getItem(`${WEB_KEY_PREFIX}${key}`)
      if (raw !== null && raw.length > MAX_ROLO_CONVERSATION_CHARACTERS) {
        storage.removeItem(`${WEB_KEY_PREFIX}${key}`)
        return null
      }
      return raw
    },
    write: async (key, value) => {
      if (value.length > MAX_ROLO_CONVERSATION_CHARACTERS) throw new Error('rolo_conversation_too_large')
      storageProvider().setItem(`${WEB_KEY_PREFIX}${key}`, value)
    },
    remove: async key => storageProvider().removeItem(`${WEB_KEY_PREFIX}${key}`),
    removeScope: async prefix => {
      const storage = storageProvider()
      const scopedPrefix = `${WEB_KEY_PREFIX}${prefix}`
      const keys: string[] = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key === scopedPrefix || key?.startsWith(`${scopedPrefix}.`)) keys.push(key)
      }
      for (const key of keys) storage.removeItem(key)
    },
    clear: async () => {
      const storage = storageProvider()
      const keys: string[] = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key?.startsWith(WEB_KEY_PREFIX)) keys.push(key)
      }
      for (const key of keys) storage.removeItem(key)
    },
  }
}

function browserLocalStorage(): OriginStorage {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('web_storage_unavailable')
  }
  return window.localStorage
}

function scopeKey(scope: RoloConversationScope): string {
  return `${legacyScopeKey(scope)}.${scope.projectRef ?? 'general'}`
}

function legacyScopeKey(scope: RoloConversationScope): string {
  return `${scope.principalRef}.${scope.homeRef}`
}
