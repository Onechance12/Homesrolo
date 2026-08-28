import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import {
  createWorkspacePreferenceStore,
  type WorkspacePreferenceStorage,
} from './preference-core.ts'

export type { Workspace } from './preference-core.ts'

function webStorage(): WorkspacePreferenceStorage {
  return {
    read: async key => {
      if (typeof window === 'undefined' || !window.localStorage) return null
      return window.localStorage.getItem(key)
    },
    write: async (key, value) => {
      if (typeof window === 'undefined' || !window.localStorage) return
      window.localStorage.setItem(key, value)
    },
    remove: async key => {
      if (typeof window === 'undefined' || !window.localStorage) return
      window.localStorage.removeItem(key)
    },
  }
}

function nativeStorage(): WorkspacePreferenceStorage {
  return {
    read: key => SecureStore.getItemAsync(key),
    write: (key, value) => SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
    remove: key => SecureStore.deleteItemAsync(key),
  }
}

const store = createWorkspacePreferenceStore(
  Platform.OS === 'web' ? webStorage() : nativeStorage(),
)

/** Read the last deliberate Home/Pro workspace choice for this signed-in principal. */
export function readWorkspacePreference(principalRef: string) {
  return store.read(principalRef)
}

/** Persist only the non-sensitive Home/Pro choice, scoped to the signed-in principal. */
export function writeWorkspacePreference(principalRef: string, workspace: 'home' | 'pro') {
  return store.write(principalRef, workspace)
}

export function clearWorkspacePreference(principalRef: string) {
  return store.clear(principalRef)
}
