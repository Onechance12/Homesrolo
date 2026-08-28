export type Workspace = 'home' | 'pro'

export interface WorkspacePreferenceStorage {
  read(key: string): Promise<string | null>
  write(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

const PRINCIPAL_REF = /^hprn_[A-Za-z0-9_-]{43}$/
const KEY_PREFIX = 'homesrolo.workspace.v1.'

export function workspacePreferenceKey(principalRef: string): string {
  if (!PRINCIPAL_REF.test(principalRef)) throw new Error('invalid_principal_ref')
  return `${KEY_PREFIX}${principalRef}`
}

export function parseWorkspacePreference(value: unknown): Workspace | null {
  return value === 'home' || value === 'pro' ? value : null
}

export function createWorkspacePreferenceStore(storage: WorkspacePreferenceStorage) {
  return {
    async read(principalRef: string): Promise<Workspace | null> {
      try {
        return parseWorkspacePreference(await storage.read(workspacePreferenceKey(principalRef)))
      } catch {
        return null
      }
    },
    async write(principalRef: string, workspace: Workspace): Promise<void> {
      try {
        await storage.write(workspacePreferenceKey(principalRef), workspace)
      } catch {
        // A navigation preference must never block access to either workspace.
      }
    },
    async clear(principalRef: string): Promise<void> {
      try {
        await storage.remove(workspacePreferenceKey(principalRef))
      } catch {
        // The preference is optional and contains no account or home data.
      }
    },
  }
}
