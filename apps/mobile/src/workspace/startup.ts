import type { Workspace } from './preference-core.ts'

interface ProfessionalWorkspacePresence {
  readonly organizations: readonly { readonly organizationRef: string }[]
  readonly memberships: readonly {
    readonly organizationRef: string
    readonly state: 'active' | 'revoked'
  }[]
}

export type StartupDestination = '/onboarding' | '/homes' | '/pro'

export interface StartupDecision {
  readonly destination: StartupDestination
  readonly workspace: Workspace | null
}

export function hasActiveProfessionalWorkspace(profile: ProfessionalWorkspacePresence): boolean {
  const activeOrganizationRefs = new Set(
    profile.memberships
      .filter(membership => membership.state === 'active')
      .map(membership => membership.organizationRef),
  )
  return profile.organizations.some(organization => (
    activeOrganizationRefs.has(organization.organizationRef)
  ))
}

export function decideStartupDestination(
  hasHomes: boolean,
  hasProfessionalWorkspace: boolean,
  preference: Workspace | null,
): StartupDecision {
  if (!hasHomes && !hasProfessionalWorkspace) {
    return { destination: '/onboarding', workspace: null }
  }
  if (hasHomes && !hasProfessionalWorkspace) {
    return { destination: '/homes', workspace: 'home' }
  }
  if (!hasHomes && hasProfessionalWorkspace) {
    return { destination: '/pro', workspace: 'pro' }
  }
  const workspace = preference ?? 'home'
  return { destination: workspace === 'pro' ? '/pro' : '/homes', workspace }
}
