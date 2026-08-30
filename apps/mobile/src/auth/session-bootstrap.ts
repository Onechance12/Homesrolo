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
  // The bridge exists only to exchange the retired script-readable PWA
  // bearer. A current browser session already lives in an HttpOnly cookie and
  // is authoritatively checked by GET /session immediately after bootstrap.
  // Calling the legacy bridge without a legacy bearer adds a second identity
  // read and can turn a harmless proxy/startup hiccup into a fatal launch.
  if (storedToken === null) return null
  try {
    await api.upgradeLegacyPwaSession(storedToken)
  } catch {
    // A valid HttpOnly cookie may belong to a newer browser sign-in than the
    // retired local bearer. Once the local value is erased, retry without it;
    // the server can then validate the unambiguous cookie instead of making the
    // homeowner reload once to recover.
    try {
      await api.upgradeLegacyPwaSession(null)
    } catch {
      // Migration is best-effort after the exposed credential has been
      // erased. The ordinary session request can still validate a newer
      // HttpOnly cookie or safely resolve the browser as signed out.
    }
  }
  return null
}
