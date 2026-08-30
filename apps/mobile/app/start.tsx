import { useCallback } from 'react'
import { Redirect } from 'expo-router'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { useResource } from '../src/hooks/useResource.ts'
import { LaunchError, LaunchLoading } from '../src/components/ui.tsx'
import {
  readWorkspacePreference,
  writeWorkspacePreference,
} from '../src/workspace/preference.ts'
import {
  decideStartupDestination,
  hasActiveProfessionalWorkspace,
  type StartupDecision,
} from '../src/workspace/startup.ts'

export default function StartupScreen() {
  const { state, api, refreshSession } = useSession()
  const principalRef = state.kind === 'signed_in' ? state.session.principalRef : null
  const professionalEnabled = state.kind === 'signed_in'
    && state.session.capabilities.invitations
    && state.session.capabilities.projectQuotes
  const loader = useCallback(async (): Promise<StartupDecision> => {
    if (!principalRef) throw new Error('signed_in_session_required')
    const [homes, professional, preference] = await Promise.all([
      api.listHomes(),
      professionalEnabled
        ? api.getProfessionalProfile()
        : Promise.resolve({ organizations: [], memberships: [] }),
      readWorkspacePreference(principalRef),
    ])
    const decision = decideStartupDestination(
      homes.map(home => home.homeRef),
      hasActiveProfessionalWorkspace(professional),
      preference,
    )
    if (decision.workspace) {
      await writeWorkspacePreference(principalRef, decision.workspace)
    }
    return decision
  }, [api, principalRef, professionalEnabled])
  const startup = useResource(loader, state.kind === 'signed_in')

  if (state.kind === 'loading') return <LaunchLoading label="Opening Homesrolo…" />
  if (state.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (state.kind === 'error') {
    return (
      <LaunchError message={state.message} onRetry={() => void refreshSession()} />
    )
  }
  if (startup.state.kind === 'loading') return <LaunchLoading label="Opening your workspace…" />
  if (startup.state.kind === 'error') {
    return (
      <LaunchError
        message="Your space didn’t finish opening. Try again and we’ll pick up where you left off."
        onRetry={startup.reload}
      />
    )
  }
  return <Redirect href={startup.state.value.destination} />
}
