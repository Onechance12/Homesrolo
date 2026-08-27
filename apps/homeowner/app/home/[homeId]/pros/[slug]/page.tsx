'use client'

import Link from 'next/link'
import { use } from 'react'
import { ErrorState, Skeleton } from '../../../../../components/states.tsx'
import { usePortCall } from '../../../../../lib/port/hooks.ts'
import { usePort } from '../../../../../lib/port/provider.tsx'
import type { ProjectCategory } from '../../../../../lib/port/types.ts'

const TRADE_LABEL: Readonly<Record<ProjectCategory, string>> = {
  roofing: 'Roofing', exterior: 'Exterior', interior: 'Interior & remodeling',
  electrical: 'Electrical', plumbing: 'Plumbing', hvac: 'Heating & cooling',
  landscaping: 'Yard & landscaping', appliances: 'Appliances', pest: 'Pest control',
  pool: 'Pools & outdoor living', new_construction: 'New construction', other: 'Home services',
}

export default function ProfessionalProfilePage({
  params,
}: {
  readonly params: Promise<{ homeId: string; slug: string }>
}) {
  const { homeId, slug } = use(params)
  const port = usePort()
  const profile = usePortCall(() => port.getProfessional(slug))
  const projects = usePortCall(() => port.listProjects(homeId))

  if (profile.state.status === 'loading') return <Skeleton lines={6} label="Loading company profile" />
  if (profile.state.status === 'error') return <ErrorState retry={profile.retry} error={profile.state.error} />
  if (profile.state.status !== 'ready') return null
  const organization = profile.state.value
  const compatibleProjects = projects.state.status === 'ready'
    ? projects.state.value.filter(project => organization.trades.includes(project.category) && !project.archived)
    : []

  return (
    <div className="pro-profile stack">
      <Link className="backlink" href={`/home/${homeId}/pros`}>← All professionals</Link>
      <header className="pro-profile__hero">
        <div className="pro-profile__mark" aria-hidden="true">
          {organization.displayName.slice(0, 1).toLocaleUpperCase('en-US')}
        </div>
        <div>
          <p className="mono">COMPANY-SUPPLIED PROFILE</p>
          <h1>{organization.displayName}</h1>
          <p>{organization.description ?? 'This company has published its service and contact details in Homesrolo.'}</p>
        </div>
      </header>

      <div className="pro-profile__layout">
        <section className="pro-profile__facts">
          <div>
            <p className="mono">WORK</p>
            <h2>Services</h2>
            <div className="pro-card__tags">
              {organization.trades.map(trade => <span key={trade}>{TRADE_LABEL[trade]}</span>)}
            </div>
          </div>
          <div>
            <p className="mono">AREA</p>
            <h2>Service areas</h2>
            <p>{organization.serviceAreas.join(' · ')}</p>
          </div>
          <div>
            <p className="mono">CONTACT</p>
            <h2>Public contact</h2>
            <div className="pro-profile__contact">
              {organization.publicPhone ? <a href={`tel:${organization.publicPhone}`}>{organization.publicPhone}</a> : null}
              {organization.publicEmail ? <a href={`mailto:${organization.publicEmail}`}>{organization.publicEmail}</a> : null}
              {organization.websiteUrl ? <a href={organization.websiteUrl} rel="noreferrer" target="_blank">Company website ↗</a> : null}
              {!organization.publicPhone && !organization.publicEmail && !organization.websiteUrl
                ? <span>No public contact method listed.</span>
                : null}
            </div>
          </div>
        </section>

        <section className="pro-profile__invite" aria-labelledby="invite-this-company">
          <p className="mono">PRIVATE BY DEFAULT</p>
          <h2 id="invite-this-company">Invite this company to a plan</h2>
          <p>Choose one compatible plan. On the next screen you decide which exact photos or files—if any—the company may review.</p>
          {projects.state.status === 'loading' ? <Skeleton lines={3} label="Loading compatible plans" /> : null}
          {projects.state.status === 'error' ? <ErrorState retry={projects.retry} error={projects.state.error} /> : null}
          {projects.state.status === 'ready' && compatibleProjects.length > 0 ? (
            <div className="pro-profile__projects">
              {compatibleProjects.map(project => (
                <Link key={project.projectRef} href={`/home/${homeId}/projects/${project.projectRef}?section=quotes&professional=${organization.organizationRef}`}>
                  <span><strong>{project.title}</strong><small>{TRADE_LABEL[project.category]}</small></span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          ) : projects.state.status === 'ready' ? (
            <div className="project-empty-inline">
              <strong>No matching plan yet</strong>
              <span>Start a repair, service request, or project first. Then invite the company into that exact plan.</span>
              <Link className="btn btn--primary" href={`/home/${homeId}/projects`}>Start a plan</Link>
            </div>
          ) : null}
          <p className="field__hint">An invitation is not approval to begin work and never grants access to the rest of your home.</p>
        </section>
      </div>

      <aside className="notice">
        <strong>Know what the label means.</strong>{' '}
        The company supplied this profile. Homesrolo has not turned those facts into a blanket verification badge or recommendation.
      </aside>
    </div>
  )
}
