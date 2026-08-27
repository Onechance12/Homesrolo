'use client'

import Link from 'next/link'
import { use, useMemo, useState } from 'react'
import { ErrorState, Skeleton } from '../../../../components/states.tsx'
import { usePortCall } from '../../../../lib/port/hooks.ts'
import { usePort } from '../../../../lib/port/provider.tsx'
import type { ProfessionalOrganization, ProjectCategory } from '../../../../lib/port/types.ts'

const TRADES = [
  ['roofing', 'Roof'], ['hvac', 'Heating & cooling'], ['plumbing', 'Plumbing'],
  ['electrical', 'Electrical'], ['interior', 'Remodeling'], ['exterior', 'Exterior'],
  ['landscaping', 'Yard'], ['pest', 'Pest'], ['pool', 'Pool'],
  ['appliances', 'Appliances'], ['new_construction', 'New construction'], ['other', 'Other'],
] as const satisfies readonly (readonly [ProjectCategory, string])[]

const TRADE_LABEL = Object.fromEntries(TRADES) as Readonly<Record<ProjectCategory, string>>

function matches(organization: ProfessionalOrganization, query: string) {
  const value = query.trim().toLocaleLowerCase('en-US')
  if (!value) return true
  return [organization.displayName, organization.description ?? '', ...organization.serviceAreas]
    .some(part => part.toLocaleLowerCase('en-US').includes(value))
}

export default function ProfessionalsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ homeId: string }>
  readonly searchParams: Promise<{ trade?: string | string[] }>
}) {
  const { homeId } = use(params)
  const queryParams = use(searchParams)
  const requestedTrade = Array.isArray(queryParams.trade) ? null : queryParams.trade
  const trade = TRADES.some(([value]) => value === requestedTrade)
    ? requestedTrade as ProjectCategory
    : null
  const port = usePort()
  // Load once and filter locally so switching a trade chip never depends on a
  // route remount. The public API projection is already bounded to 200 rows.
  const directory = usePortCall(() => port.listProfessionals())
  const [query, setQuery] = useState('')
  const organizations = useMemo(
    () => directory.state.status === 'ready'
      ? directory.state.value.filter(organization =>
          (!trade || organization.trades.includes(trade)) && matches(organization, query))
      : [],
    [directory.state, query, trade],
  )

  return (
    <div className="pro-directory stack">
      <header className="pro-directory__hero">
        <div>
          <p className="mono">YOUR HOME · YOUR INVITATION</p>
          <h1>Find the right person for this home.</h1>
          <p>Browse company-supplied profiles, then invite one company into one exact project. Nobody gets the keys to your whole Home Record.</p>
        </div>
        <Link className="btn btn--quiet" href={`/home/${homeId}/rolo?filter=people`}>
          People from past work
        </Link>
      </header>

      <section className="pro-directory__controls" aria-label="Find a home professional">
        <label className="pro-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search companies or service areas</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search company or service area"
          />
        </label>
        <nav className="pro-trades" aria-label="Filter by home service">
          <Link href={`/home/${homeId}/pros`} aria-current={trade === null ? 'page' : undefined}>All</Link>
          {TRADES.map(([value, label]) => (
            <Link key={value} href={`/home/${homeId}/pros?trade=${value}`} aria-current={trade === value ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </section>

      <div className="pro-directory__count">
        <div>
          <strong>{trade ? `${TRADE_LABEL[trade]} professionals` : 'Home professionals'}</strong>
          <span>{organizations.length} matching profile{organizations.length === 1 ? '' : 's'}</span>
        </div>
        <Link href="/pro">List or manage my company →</Link>
      </div>

      {directory.state.status === 'loading' ? <Skeleton lines={5} label="Loading professional profiles" /> : null}
      {directory.state.status === 'error' ? <ErrorState retry={directory.retry} error={directory.state.error} /> : null}
      {directory.state.status === 'ready' && organizations.length === 0 ? (
        <section className="pro-directory__empty">
          <span aria-hidden="true">⌂</span>
          <div>
            <h2>No matching profile yet.</h2>
            <p>Homesrolo does not fill the page with paid placements or invented companies. You can still save a proposal or ask the company to create its own profile.</p>
          </div>
          <Link className="btn btn--primary" href={`/home/${homeId}/projects`}>Open my plans</Link>
        </section>
      ) : null}

      {organizations.length > 0 ? (
        <div className="pro-directory__grid">
          {organizations.map(organization => (
            <article key={organization.organizationRef} className="pro-card">
              <div className="pro-card__mark" aria-hidden="true">
                {organization.displayName.slice(0, 1).toLocaleUpperCase('en-US')}
              </div>
              <div className="pro-card__body">
                <p className="mono">COMPANY-SUPPLIED PROFILE</p>
                <h2>{organization.displayName}</h2>
                <p>{organization.description ?? 'Open the profile to see the company’s service areas and public contact information.'}</p>
                <div className="pro-card__tags">
                  {organization.trades.slice(0, 4).map(value => <span key={value}>{TRADE_LABEL[value]}</span>)}
                </div>
                <small>{organization.serviceAreas.slice(0, 4).join(' · ')}</small>
              </div>
              <Link className="pro-card__open" href={`/home/${homeId}/pros/${organization.slug}`} aria-label={`Open ${organization.displayName}`}>
                →
              </Link>
            </article>
          ))}
        </div>
      ) : null}

      <aside className="pro-directory__trust">
        <strong>Profiles are not endorsements.</strong>
        <p>Company facts are labeled by source. Homesrolo does not sell the top spot, rank a contractor by price, or approve work for you.</p>
      </aside>
    </div>
  )
}
