import { Redirect } from 'expo-router'
import { LaunchError, LaunchLoading } from '../src/components/ui.tsx'
import { useSession } from '../src/auth/SessionProvider.tsx'

export default function EntryScreen() {
  const { state, refreshSession } = useSession()
  if (state.kind === 'loading') return <LaunchLoading label="Opening Homesrolo…" />
  if (state.kind === 'error') {
    return (
      <LaunchError message={state.message} onRetry={() => void refreshSession()} />
    )
  }
  return <Redirect href={state.kind === 'signed_in' ? '/start' : '/sign-in'} />
}
