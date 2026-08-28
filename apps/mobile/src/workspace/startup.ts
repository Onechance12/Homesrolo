import type { Workspace } from './preference-core.ts'

interface ProfessionalWorkspacePresence {
  readonly organizations: readonly { readonly organizationRef: string }[]
  readonly memberships: readonly {
    readonly organizationRef: string
    readonly state: 'active' | 'revoked'
  }[]
}

export type StartupDestination = '/onboarding' | '/homes' | '/pro' | {
  readonly pathname: '/home/[homeId]/rolo'
  readonly params: { readonly homeId: string }
}

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
  homeRefs: readonly string[],
  hasProfessionalWorkspace: boolean,
  preference: Workspace | null,
): StartupDecision {
  const hasHomes = homeRefs.length > 0
  const homeDestination: StartupDestination = homeRefs.length === 1 && homeRefs[0]
    ? { pathname: '/home/[homeId]/rolo', params: { homeId: homeRefs[0] } }
    : '/homes'
  if (!hasHomes && !hasProfessionalWorkspace) {
    return { destination: '/onboarding', workspace: null }
  }
  if (hasHomes && !hasProfessionalWorkspace) {
    return { destination: homeDestination, workspace: 'home' }
  }
  if (!hasHomes && hasProfessionalWorkspace) {
    return { destination: '/pro', workspace: 'pro' }
  }
  const workspace = preference ?? 'home'
  return { destination: workspace === 'pro' ? '/pro' : homeDestination, workspace }
}
