'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { usePort, useSession } from '../../../lib/port/provider.tsx'
import { HouseMark } from '../../../components/icons.tsx'
import { UnauthorizedState } from '../../../components/states.tsx'
import type { CreateHomeInput } from '../../../lib/port/types.ts'

/**
 * Create-home onboarding — MOCK. The created home lives in memory for this
 * demo session only. Note what is deliberately NOT asked for: a postal
 * address. A home file is identified by an alias here; real property
 * resolution is a runtime decision that belongs to the integration lane.
 */
export default function NewHomePage() {
  const port = usePort()
  const { state: session } = useSession()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [form, setForm] = useState<CreateHomeInput>({
    alias: '',
    locality: '',
    homeType: 'house',
    yearBuilt: null,
  })

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFailed(false)
    const result = await port.createHome(form)
    if (!result.ok) { setBusy(false); setFailed(true); return }
    router.push(`/home/${result.value.homeRef}`)
  }

  return (
    <div className="gate">
      <span className="gate__brand"><HouseMark /> <span>Homes<span className="accent">rolo</span></span></span>
      <main id="main" tabIndex={-1} className="gate__main">
        <div className="gate__card">
          {session.kind === 'signed_out' ? <UnauthorizedState /> : (
            <>
              <Link href="/homes" className="backlink">← Back to your homes</Link>
              <p className="mono" style={{ marginBottom: '0.4rem' }}>New home file</p>
              <h1 style={{ fontSize: '1.5rem' }}>Give the home its file.</h1>
              <p style={{ color: 'var(--ink-soft)', fontSize: '0.92rem', marginTop: '0.6rem' }}>
                A name and a rough area are enough to start. The record grows from
                the first project you add.
              </p>

              <form onSubmit={create}>
                <div className="field">
                  <label htmlFor="alias">What do you call this home?</label>
                  <input id="alias" type="text" required value={form.alias}
                    onChange={e => setForm(f => ({ ...f, alias: e.target.value }))}
                    placeholder="The Birch House" autoComplete="off" />
                  <span className="field__hint">An alias, not an address. Addresses are never collected in this demo.</span>
                </div>
                <div className="field">
                  <label htmlFor="locality">Area</label>
                  <input id="locality" type="text" value={form.locality}
                    onChange={e => setForm(f => ({ ...f, locality: e.target.value }))}
                    placeholder="Sample Metro — North" autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="home-type">Type</label>
                  <select id="home-type" value={form.homeType}
                    onChange={e => setForm(f => ({ ...f, homeType: e.target.value as CreateHomeInput['homeType'] }))}>
                    <option value="house">House</option>
                    <option value="townhouse">Townhouse</option>
                    <option value="condo">Condo</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="year-built">Year built (if known)</label>
                  <input id="year-built" type="number" inputMode="numeric" min={1700} max={2026}
                    value={form.yearBuilt ?? ''}
                    onChange={e => setForm(f => ({ ...f, yearBuilt: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="1987" />
                </div>

                {failed && (
                  <p role="alert" style={{ color: 'var(--brick)', fontSize: '0.88rem', marginTop: '0.75rem' }}>
                    The demo could not add that home. Try again.
                  </p>
                )}

                <div style={{ marginTop: '1.25rem' }}>
                  <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
                    {busy ? 'Opening the file…' : 'Open this home’s file'}
                  </button>
                </div>
                <p className="mono" style={{ marginTop: '0.8rem' }}>
                  Demo only: this home lives in memory and disappears on refresh.
                </p>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
