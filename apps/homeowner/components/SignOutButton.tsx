'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { usePort, useSession } from '../lib/port/provider.tsx'
import { clearRoloThreadsForPrincipal } from '../lib/rolo-thread-storage.ts'

export function SignOutButton({ compact = false }: { readonly compact?: boolean }) {
  const port = usePort()
  const { state: session, refresh } = useSession()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    try {
      await port.signOut()
      if (session.kind === 'signed_in') {
        clearRoloThreadsForPrincipal(session.session.principalRef)
      }
      await refresh()
      router.push('/signin')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={`btn btn--quiet${compact ? ' btn--compact' : ''}`}
      onClick={signOut}
      disabled={busy}
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
