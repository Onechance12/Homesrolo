'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PhotoCheckups } from '../../../../components/PhotoCheckups.tsx'
import { Skeleton } from '../../../../components/states.tsx'
import { usePort, usePortMode, useSession } from '../../../../lib/port/provider.tsx'

/** A first-class home-checkup workspace backed by the private photo service. */
export default function CheckupsPage({ params }: { params: Promise<{ homeId: string }> }) {
  const { homeId } = use(params)
  const router = useRouter()
  const port = usePort()
  const mode = usePortMode()
  const session = useSession()
  const enabled = mode === 'remote'
    && session.state.kind === 'signed_in'
    && session.state.capabilities.photoCheckups

  useEffect(() => {
    if (session.state.kind === 'loading' || enabled) return
    router.replace(`/home/${homeId}/documents`)
  }, [enabled, homeId, router, session.state.kind])

  if (!enabled) {
    return <div className="panel"><Skeleton lines={3} label="Opening the home record" /></div>
  }

  return (
    <div className="stack" style={{ ['--stack-gap' as never]: '1.1rem' }}>
      <div className="pagehead">
        <div>
          <p className="mono">Private photo record</p>
          <h1>Home checkups</h1>
        </div>
        <p>Photograph the same places over time so this home has a useful visual history.</p>
      </div>
      <PhotoCheckups homeRef={homeId} enabled port={port} />
    </div>
  )
}
