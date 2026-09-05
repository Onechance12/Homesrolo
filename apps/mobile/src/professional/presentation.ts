import type {
  ProfessionalOrganization,
  ProfessionalProposal,
  ProjectInvitation,
  ProjectQuote,
  QuoteScope,
  QuoteScopeKey,
  WorkCategory,
} from '../api/model.ts'

export const PROFESSIONAL_TRADES = [
  ['roofing', 'Roofing'],
  ['hvac', 'Heating & air'],
  ['plumbing', 'Plumbing'],
  ['electrical', 'Electrical'],
  ['interior', 'Interior & remodeling'],
  ['exterior', 'Exterior'],
  ['landscaping', 'Yard & landscaping'],
  ['pest', 'Pest control'],
  ['pool', 'Pools & outdoor living'],
  ['appliances', 'Appliances'],
  ['new_construction', 'New construction'],
  ['other', 'Other home services'],
] as const satisfies readonly (readonly [WorkCategory, string])[]

export const PROPOSAL_FIELDS = [
  ['project_scope', 'Work included'],
  ['materials_products', 'Materials and products'],
  ['schedule', 'Timing'],
  ['warranty', 'Warranties'],
  ['payment_terms', 'Payment and change orders'],
  ['exclusions', 'Not included'],
] as const satisfies readonly (readonly [QuoteScopeKey, string])[]

export type ProposalScopeDraft = Partial<Record<(typeof PROPOSAL_FIELDS)[number][0], string>>

export function tradeLabel(trade: WorkCategory): string {
  return PROFESSIONAL_TRADES.find(([value]) => value === trade)?.[1] ?? 'Home services'
}

export function matchesProfessional(
  organization: ProfessionalOrganization,
  query: string,
  trade: WorkCategory | 'all' = 'all',
): boolean {
  if (trade !== 'all' && !organization.trades.includes(trade)) return false
  const normalized = query.trim().toLocaleLowerCase('en-US')
  if (!normalized) return true
  return [
    organization.displayName,
    organization.description ?? '',
    ...organization.serviceAreas,
    ...organization.trades.map(tradeLabel),
  ].some(value => value.toLocaleLowerCase('en-US').includes(normalized))
}

export function cleanServiceAreas(value: string): readonly string[] {
  const seen = new Set<string>()
  return value
    .split(/[\r\n]+/)
    .map(item => item.trim())
    .filter(item => {
      const key = item.toLocaleLowerCase('en-US')
      if (item.length < 2 || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 40)
}

export function slugFor(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function invitationStatus(invitation: ProjectInvitation): string {
  return ({
    pending: 'Waiting for response',
    accepted: 'Invitation accepted',
    declined: 'Passed',
    revoked: 'Access removed',
    expired: 'Expired',
  } as const)[invitation.status]
}

export function proposalDecisionLabel(
  decision: ProjectQuote['homeownerDecision'] | ProfessionalProposal['homeownerDecision'],
): string {
  return ({
    undecided: 'New proposal',
    shortlisted: 'Considering',
    selected: 'Selected',
    declined: 'Passed',
  } as const)[decision]
}

export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'Total not stated'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

export function proposalScopeDraft(proposal: ProfessionalProposal | null): ProposalScopeDraft {
  if (!proposal) return {}
  return Object.fromEntries(PROPOSAL_FIELDS.map(([key]) => [key, proposal.scope[key]?.detail ?? '']))
}

export function proposalScopePayload(draft: ProposalScopeDraft): QuoteScope {
  const scope: Partial<Record<QuoteScopeKey, { status: 'included' | 'excluded'; detail: string }>> = {}
  for (const [key] of PROPOSAL_FIELDS) {
    const detail = draft[key]?.trim()
    if (!detail) continue
    scope[key] = { status: key === 'exclusions' ? 'excluded' : 'included', detail }
  }
  return scope
}

export function localToday(): string {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}
