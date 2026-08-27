import type { HomesroloApi } from '../api/contract.ts'
import type { CredentialStorage } from './credential-storage.ts'

/**
 * Restore a native bearer, or erase and exchange the bearer left behind by the
 * older PWA. Browser storage is cleared before the network call so a transient
 * migration failure cannot leave the raw session persisted in localStorage.
 */
export async function bootstrapSessionToken(
  api: Pick<HomesroloApi, 'upgradeLegacyPwaSession'>,
  storage: CredentialStorage,
  transport: 'bearer' | 'cookie',
): Promise<string | null> {
  const storedToken = await storage.read()
  if (transport === 'bearer') return storedToken
  await storage.remove()
  try {
    await api.upgradeLegacyPwaSession(storedToken)
  } catch (error) {
    if (storedToken === null) throw error
    // A valid HttpOnly cookie may belong to a newer browser sign-in than the
    // retired local bearer. Once the local value is erased, retry without it;
    // the server can then validate the unambiguous cookie instead of making the
    // homeowner reload once to recover.
    await api.upgradeLegacyPwaSession(null)
  }
  return null
}
