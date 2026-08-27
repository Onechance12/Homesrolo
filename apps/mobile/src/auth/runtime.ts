import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import type { HomesroloApi } from '../api/contract.ts'
import { HomesroloNativeApi } from '../api/client.ts'
import type { ServerSession } from '../api/model.ts'
import { PreviewHomesroloApi, PREVIEW_SIGNED_IN_SESSION } from '../preview/api.ts'
import { isHomesroloPreviewEnabled, type PreviewEnvironment } from '../preview/mode.ts'
import { webCredentialStorage, type CredentialStorage } from './credential-storage.ts'

export type { CredentialStorage } from './credential-storage.ts'

const SESSION_KEY = 'homesrolo.native.session.v1'

export interface SessionRuntime {
  readonly api: HomesroloApi
  readonly storage: CredentialStorage
  readonly previewMode: boolean
  readonly initialSession: Extract<ServerSession, { kind: 'signed_in' }> | null
}

interface RuntimeOptions {
  readonly tokenProvider: () => string | null
  readonly onSignedOut: () => void
  readonly environment?: PreviewEnvironment
}

function nativeCredentialStorage(): CredentialStorage {
  return {
    read: () => SecureStore.getItemAsync(SESSION_KEY),
    write: token => SecureStore.setItemAsync(SESSION_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
    remove: () => SecureStore.deleteItemAsync(SESSION_KEY),
  }
}

function memoryStorage(): CredentialStorage {
  let value: string | null = null
  return {
    read: async () => value,
    write: async token => { value = token },
    remove: async () => { value = null },
  }
}

export function createSessionRuntime(options: RuntimeOptions): SessionRuntime {
  const environment = options.environment ?? {
    development: __DEV__,
    platform: Platform.OS,
    flag: process.env.EXPO_PUBLIC_HOMESROLO_PREVIEW_MODE,
  }
  if (isHomesroloPreviewEnabled(environment)) {
    return {
      api: new PreviewHomesroloApi(),
      storage: memoryStorage(),
      previewMode: true,
      initialSession: PREVIEW_SIGNED_IN_SESSION,
    }
  }
  return {
    api: new HomesroloNativeApi(options.tokenProvider, { onSignedOut: options.onSignedOut }),
    storage: environment.platform === 'web' ? webCredentialStorage() : nativeCredentialStorage(),
    previewMode: false,
    initialSession: null,
  }
}
