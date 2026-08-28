import { Redirect } from 'expo-router'
import { Loading, Notice, Page } from '../src/components/ui.tsx'
import { useSession } from '../src/auth/SessionProvider.tsx'

export default function EntryScreen() {
  const { state, refreshSession } = useSession()
  if (state.kind === 'loading') return <Loading label="Opening Homesrolo…" />
  if (state.kind === 'error') {
    return (
      <Page>
        <Notice message={state.message} actionLabel="Try again" onAction={() => void refreshSession()} />
      </Page>
    )
  }
  return <Redirect href={state.kind === 'signed_in' ? '/start' : '/sign-in'} />
}
