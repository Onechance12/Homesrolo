import { useCallback } from 'react'
import { Redirect } from 'expo-router'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { useResource } from '../src/hooks/useResource.ts'
import { Brand, Loading, Notice, Page } from '../src/components/ui.tsx'
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
      homes.length > 0,
      hasActiveProfessionalWorkspace(professional),
      preference,
    )
    if (decision.workspace) {
      await writeWorkspacePreference(principalRef, decision.workspace)
    }
    return decision
  }, [api, principalRef, professionalEnabled])
  const startup = useResource(loader, state.kind === 'signed_in')

  if (state.kind === 'loading') return <Loading label="Opening Homesrolo…" />
  if (state.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (state.kind === 'error') {
    return (
      <Page>
        <Brand compact />
        <Notice message={state.message} actionLabel="Try again" onAction={() => void refreshSession()} />
      </Page>
    )
  }
  if (startup.state.kind === 'loading') return <Loading label="Opening your workspace…" />
  if (startup.state.kind === 'error') {
    return (
      <Page>
        <Brand compact />
        <Notice
          message="Homesrolo couldn’t open your workspace."
          actionLabel="Try again"
          onAction={startup.reload}
        />
      </Page>
    )
  }
  return <Redirect href={startup.state.value.destination} />
}
