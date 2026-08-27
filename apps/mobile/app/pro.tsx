import { Redirect } from 'expo-router'
import { useSession } from '../src/auth/SessionProvider.tsx'
import { NativeProfessionalHub } from '../src/components/NativeProfessionalHub.tsx'
import { Brand, Loading, Notice, Page } from '../src/components/ui.tsx'

export default function ProfessionalScreen() {
  const { state, api, refreshSession } = useSession()

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
  if (!state.session.capabilities.invitations || !state.session.capabilities.projectQuotes) {
    return (
      <Page>
        <Brand compact />
        <Notice message="Homesrolo Pro isn’t available for this account right now." />
      </Page>
    )
  }

  return <NativeProfessionalHub api={api} />
}
