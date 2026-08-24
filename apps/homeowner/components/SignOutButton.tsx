'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { usePort, useSession } from '../lib/port/provider.tsx'

export function SignOutButton({ compact = false }: { readonly compact?: boolean }) {
  const port = usePort()
  const { refresh } = useSession()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function signOut() {
    setBusy(true)
    try {
      await port.signOut()
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
