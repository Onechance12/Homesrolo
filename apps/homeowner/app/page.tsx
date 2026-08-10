'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '../lib/port/provider.tsx'
import { Skeleton } from '../components/states.tsx'
import { HouseMark } from '../components/icons.tsx'

/** The root routes by session: signed in goes to homes, signed out to sign-in. */
export default function IndexPage() {
  const { state } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (state.kind === 'signed_in') router.replace('/homes')
    if (state.kind === 'signed_out') router.replace('/signin')
  }, [state.kind, router])

  return (
    <div className="gate">
      <span className="gate__brand"><HouseMark /> <span>Homes<span className="accent">rolo</span></span></span>
      <main id="main" tabIndex={-1} className="gate__main">
        <div className="gate__card">
          <Skeleton lines={3} label="Opening Homesrolo" />
        </div>
      </main>
    </div>
  )
}
