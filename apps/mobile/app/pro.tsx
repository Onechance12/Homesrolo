import { useCallback, useEffect } from 'react'
import { Redirect } from 'expo-router'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { NativeProfessionalHub } from '../src/components/NativeProfessionalHub.tsx'
import { Brand, Loading, Notice, Page } from '../src/components/ui.tsx'
import { useResource } from '../src/hooks/useResource.ts'
import { writeWorkspacePreference } from '../src/workspace/preference.ts'
import { hasActiveProfessionalWorkspace } from '../src/workspace/startup.ts'

export default function ProfessionalScreen() {
  const { state, api, refreshSession } = useSession()
  const professionalEnabled = state.kind === 'signed_in'
    && state.session.capabilities.invitations
    && state.session.capabilities.projectQuotes
  const profileLoader = useCallback(() => api.getProfessionalProfile(), [api])
  const profile = useResource(profileLoader, professionalEnabled)
  const hasProfessionalWorkspace = profile.state.kind === 'ready'
    && hasActiveProfessionalWorkspace(profile.state.value)
  const principalRef = state.kind === 'signed_in' ? state.session.principalRef : null

  useEffect(() => {
    if (!principalRef || !hasProfessionalWorkspace) return
    void writeWorkspacePreference(principalRef, 'pro')
  }, [hasProfessionalWorkspace, principalRef])

  if (state.kind === 'loading') return <Loading label="Opening Homesrolo Pro…" />
  if (state.kind === 'signed_out') {
    return <Redirect href={{ pathname: '/sign-in', params: { returnTo: '/pro' } }} />
  }
  if (state.kind === 'error') {
    return (
      <Page>
        <Brand compact />
        <Notice message={state.message} actionLabel="Try again" onAction={() => void refreshSession()} />
      </Page>
    )
  }
  if (!professionalEnabled) {
    return (
      <Page>
        <Brand compact />
        <Notice message="Homesrolo Pro isn’t available for this account right now." />
      </Page>
    )
  }
  if (profile.state.kind === 'loading') return <Loading label="Opening your company…" />
  if (profile.state.kind === 'error') {
    return (
      <Page>
        <Brand compact />
        <Notice
          message="Homesrolo could not open your company."
          actionLabel="Try again"
          onAction={profile.reload}
        />
      </Page>
    )
  }
  if (!hasProfessionalWorkspace) {
    return <Redirect href={{ pathname: '/onboarding', params: { mode: 'pro' } }} />
  }

  return <NativeProfessionalHub api={api} />
}
