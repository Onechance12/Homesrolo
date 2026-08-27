'use client'

import Link from 'next/link'
import { ProfessionalHub } from '../../components/ProfessionalHub.tsx'
import { HouseMark } from '../../components/icons.tsx'
import { SignOutButton } from '../../components/SignOutButton.tsx'
import { Skeleton } from '../../components/states.tsx'
import { useSession } from '../../lib/port/provider.tsx'

export default function ProPage() {
  const session = useSession()
  return (
    <div className="pro-hub">
      <header className="pro-hub__topbar">
        <Link href="/homes" className="topbar__brand"><HouseMark size={24} /><span>homesrolo</span><em>PRO</em></Link>
        {session.state.kind === 'signed_in' ? <SignOutButton compact /> : null}
      </header>
      <main id="main" tabIndex={-1}>
        {session.state.kind === 'loading' ? <Skeleton lines={5} label="Opening Homesrolo Pro" /> : null}
        {session.state.kind === 'signed_out' ? (
          <section className="pro-hub__gate">
            <HouseMark size={42} />
            <h1>Use your Homesrolo sign-in.</h1>
            <p>One account can manage a home and a professional organization. Signing in does not give a company access to any home.</p>
            <Link className="btn btn--primary" href="/signin?destination=pro">Sign in with email code</Link>
            <Link href="/homes">Back to Homesrolo</Link>
          </section>
        ) : null}
        {session.state.kind === 'signed_in' ? <ProfessionalHub /> : null}
      </main>
    </div>
  )
}
