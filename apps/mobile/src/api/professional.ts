import type {
  CreateProfessionalOrganizationInput,
  CreatedProfessionalOrganization,
  DecideProfessionalProposalInput,
  InviteProfessionalInput,
  ProfessionalMembership,
  ProfessionalOrganization,
  ProfessionalProfileWorkspace,
  ProfessionalProposal,
  ProfessionalTrade,
  ProjectInvitation,
  ProjectQuote,
  QuoteScope,
  QuoteScopeItem,
  QuoteScopeKey,
  RespondToProjectInvitationInput,
  RevokeProjectInvitationInput,
  ReviseProfessionalProposalInput,
  SaveProfessionalProfileInput,
  SubmitProfessionalProposalInput,
  WorkCategory,
  WorkKind,
  WorkStatus,
} from './model.ts'
import { isArtifactRef, isHomeRef, isProjectRef } from './protocol.ts'

type JsonRecord = Record<string, unknown>

const COMMAND_REF = /^hcmd_[A-Za-z0-9_-]{43}$/
const ORGANIZATION_REF = /^horg_[A-Za-z0-9_-]{43}$/
const MEMBERSHIP_REF = /^hpmr_[A-Za-z0-9_-]{43}$/
const INVITATION_REF = /^hinv_[A-Za-z0-9_-]{43}$/
const QUOTE_REF = /^hquo_[A-Za-z0-9_-]{43}$/
const VERSION_REF = /^hpvr_[A-Za-z0-9_-]{43}$/
const PROFESSIONAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export const PROFESSIONAL_TRADES = [
  'roofing', 'exterior', 'interior', 'electrical', 'plumbing', 'hvac',
  'landscaping', 'appliances', 'pest', 'pool', 'new_construction', 'other',
] as const satisfies readonly ProfessionalTrade[]

export const QUOTE_SCOPE_KEYS = [
  'project_scope', 'site_conditions', 'preparation', 'labor', 'materials_products',
  'allowances', 'schedule', 'access_protection', 'inspection_closeout', 'warranty',
  'change_orders', 'measurement', 'roof_configuration', 'tear_off', 'decking',
  'underlayment', 'leak_barrier', 'primary_materials', 'starter_and_ridge', 'valleys',
  'flashing_transitions', 'penetrations', 'ventilation', 'permits', 'cleanup',
  'workmanship_warranty', 'manufacturer_warranty', 'payment_terms', 'exclusions',
] as const satisfies readonly QuoteScopeKey[]

const WORK_KINDS = new Set<WorkKind>(['project', 'issue', 'repair', 'service', 'incident'])
const WORK_STATUSES = new Set<WorkStatus>(['planned', 'in_progress', 'completed', 'cancelled'])
const TRADE_SET = new Set<WorkCategory>(PROFESSIONAL_TRADES)
const SCOPE_KEY_SET = new Set<QuoteScopeKey>(QUOTE_SCOPE_KEYS)

function fail(): never {
  throw new Error('invalid_wire_data')
}

function object(value: unknown, allowedKeys: readonly string[]): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const source = value as JsonRecord
  const allowed = new Set(allowedKeys)
  if (Object.keys(source).some(key => !allowed.has(key))) return fail()
  return source
}

function requiredText(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length > maximum
    || (!allowEmpty && value.length < 1)) return fail()
  return value
}

function optionalText(value: unknown, maximum: number): string | undefined {
  return value === undefined ? undefined : requiredText(value, maximum)
}

function count(value: unknown, positive = false): number {
  if (typeof value !== 'number' || !Number.isInteger(value)
    || value < (positive ? 1 : 0)) return fail()
  return value
}

function utcInstant(value: unknown): string {
  if (typeof value !== 'string' || !UTC_INSTANT.test(value)) return fail()
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) return fail()
  return value
}

function calendarDate(value: unknown): string {
  if (typeof value !== 'string' || !CALENDAR_DATE.test(value)) return fail()
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return fail()
  return value
}

function unique(values: readonly string[], caseInsensitive = false): boolean {
  const normalized = caseInsensitive
    ? values.map(value => value.toLocaleLowerCase('en-US'))
    : values
  return new Set(normalized).size === normalized.length
}

function professionalPublicUrl(value: unknown): string {
  const candidate = requiredText(value, 2_048)
  try {
    const url = new URL(candidate)
    const hostname = url.hostname.toLocaleLowerCase('en-US')
    const bareHostname = hostname.replace(/^\[|\]$/g, '')
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bareHostname)
    const privateIpv4 = match ? (() => {
      const octets = match.slice(1).map(Number)
      if (octets.some(octet => octet > 255)) return true
      const first = octets[0] ?? 999
      const second = octets[1] ?? 999
      return first === 0 || first === 10 || first === 127
        || (first === 100 && second >= 64 && second <= 127)
        || (first === 169 && second === 254)
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168) || first >= 224
    })() : false
    const privateIpv6 = bareHostname === '::' || bareHostname === '::1'
      || bareHostname.startsWith('fc') || bareHostname.startsWith('fd')
      || /^fe[89ab]/.test(bareHostname) || bareHostname.startsWith('::ffff:')
    if (url.protocol !== 'https:' || url.username || url.password
      || (url.port && url.port !== '443') || url.hash
      || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || privateIpv4 || privateIpv6) return fail()
    return candidate
  } catch {
    return fail()
  }
}

function parseStringArray(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length > maximumItems) return fail()
  return value.map(item => requiredText(item, maximumLength))
}

export function isOrganizationRef(value: unknown): value is string {
  return typeof value === 'string' && ORGANIZATION_REF.test(value)
}

export function isInvitationRef(value: unknown): value is string {
  return typeof value === 'string' && INVITATION_REF.test(value)
}

export function isQuoteRef(value: unknown): value is string {
  return typeof value === 'string' && QUOTE_REF.test(value)
}

export function normalizedProfessionalSlug(value: string): string | null {
  const slug = value.trim().toLowerCase()
  return slug.length >= 3 && slug.length <= 80 && PROFESSIONAL_SLUG.test(slug) ? slug : null
}

function parseQuoteScopeItem(value: unknown): QuoteScopeItem {
  const source = object(value, ['status', 'detail'])
  if (source.status !== 'included' && source.status !== 'excluded'
    && source.status !== 'allowance' && source.status !== 'not_stated') return fail()
  const detail = optionalText(source.detail, 160)
  return detail === undefined ? { status: source.status } : { status: source.status, detail }
}

export function parseQuoteScope(value: unknown): QuoteScope {
  const source = object(value, QUOTE_SCOPE_KEYS)
  const scope: Partial<Record<QuoteScopeKey, QuoteScopeItem>> = {}
  for (const [key, item] of Object.entries(source)) {
    if (!SCOPE_KEY_SET.has(key as QuoteScopeKey)) return fail()
    scope[key as QuoteScopeKey] = parseQuoteScopeItem(item)
  }
  return scope
}

export function parseProfessionalOrganization(value: unknown): ProfessionalOrganization {
  const source = object(value, [
    'organizationRef', 'slug', 'displayName', 'legalName', 'description', 'publicPhone',
    'publicEmail', 'websiteUrl', 'logoUrl', 'trades', 'serviceAreas', 'publicationState',
    'provenance', 'revision', 'createdAt', 'updatedAt',
  ])
  if (!isOrganizationRef(source.organizationRef)
    || typeof source.slug !== 'string' || normalizedProfessionalSlug(source.slug) !== source.slug
    || source.provenance !== 'company_self_reported'
    || (source.publicationState !== 'draft' && source.publicationState !== 'published'
      && source.publicationState !== 'suspended')
    || !Array.isArray(source.trades) || source.trades.length > 12
    || source.trades.some(trade => typeof trade !== 'string'
      || !TRADE_SET.has(trade as ProfessionalTrade))) return fail()
  const trades = source.trades as ProfessionalTrade[]
  const serviceAreas = parseStringArray(source.serviceAreas, 40, 80)
  if (!unique(trades) || !unique(serviceAreas, true)
    || (source.publicationState === 'published'
      && (trades.length === 0 || serviceAreas.length === 0))) return fail()
  const createdAt = utcInstant(source.createdAt)
  const updatedAt = utcInstant(source.updatedAt)
  if (updatedAt < createdAt) return fail()
  const legalName = optionalText(source.legalName, 160)
  const description = optionalText(source.description, 1_200)
  const publicPhone = optionalText(source.publicPhone, 32)
  const publicEmail = optionalText(source.publicEmail, 254)
  if (publicEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail)) return fail()
  const websiteUrl = source.websiteUrl === undefined ? undefined : professionalPublicUrl(source.websiteUrl)
  const logoUrl = source.logoUrl === undefined ? undefined : professionalPublicUrl(source.logoUrl)
  return {
    organizationRef: source.organizationRef,
    slug: source.slug,
    displayName: requiredText(source.displayName, 120),
    ...(legalName === undefined ? {} : { legalName }),
    ...(description === undefined ? {} : { description }),
    ...(publicPhone === undefined ? {} : { publicPhone }),
    ...(publicEmail === undefined ? {} : { publicEmail }),
    ...(websiteUrl === undefined ? {} : { websiteUrl }),
    ...(logoUrl === undefined ? {} : { logoUrl }),
    trades,
    serviceAreas,
    publicationState: source.publicationState,
    provenance: source.provenance,
    revision: count(source.revision, true),
    createdAt,
    updatedAt,
  }
}

export function parseProfessionalMembership(value: unknown): ProfessionalMembership {
  const source = object(value, [
    'membershipRef', 'organizationRef', 'role', 'state', 'revision', 'createdAt', 'revokedAt',
  ])
  if (typeof source.membershipRef !== 'string' || !MEMBERSHIP_REF.test(source.membershipRef)
    || !isOrganizationRef(source.organizationRef)
    || (source.role !== 'owner' && source.role !== 'admin' && source.role !== 'member')
    || (source.state !== 'active' && source.state !== 'revoked')) return fail()
  const revokedAt = source.revokedAt === undefined ? undefined : utcInstant(source.revokedAt)
  if ((source.state === 'revoked') !== (revokedAt !== undefined)) return fail()
  return {
    membershipRef: source.membershipRef,
    organizationRef: source.organizationRef,
    role: source.role,
    state: source.state,
    revision: count(source.revision, true),
    createdAt: utcInstant(source.createdAt),
    ...(revokedAt === undefined ? {} : { revokedAt }),
  }
}

export function parseProfessionalProfileWorkspace(value: unknown): ProfessionalProfileWorkspace {
  const source = object(value, ['organizations', 'memberships'])
  if (!Array.isArray(source.organizations) || source.organizations.length > 20
    || !Array.isArray(source.memberships) || source.memberships.length > 20) return fail()
  return {
    organizations: source.organizations.map(parseProfessionalOrganization),
    memberships: source.memberships.map(parseProfessionalMembership),
  }
}

export function parseCreatedProfessionalOrganization(value: unknown): CreatedProfessionalOrganization {
  const source = object(value, ['organization', 'membership'])
  const organization = parseProfessionalOrganization(source.organization)
  const membership = parseProfessionalMembership(source.membership)
  if (membership.organizationRef !== organization.organizationRef) return fail()
  return { organization, membership }
}

function parseDisclosure(value: unknown): ProjectInvitation['disclosure'] {
  const source = object(value, [
    'title', 'workKind', 'category', 'trade', 'status', 'summary', 'selectedArtifactRefs',
  ])
  if (typeof source.workKind !== 'string' || !WORK_KINDS.has(source.workKind as WorkKind)
    || typeof source.category !== 'string' || !TRADE_SET.has(source.category as WorkCategory)
    || typeof source.status !== 'string' || !WORK_STATUSES.has(source.status as WorkStatus)
    || !Array.isArray(source.selectedArtifactRefs) || source.selectedArtifactRefs.length > 25
    || source.selectedArtifactRefs.some(ref => !isArtifactRef(ref))) return fail()
  const selectedArtifactRefs = source.selectedArtifactRefs as string[]
  if (!unique(selectedArtifactRefs)) return fail()
  return {
    title: requiredText(source.title, 120),
    workKind: source.workKind as WorkKind,
    category: source.category as WorkCategory,
    trade: requiredText(source.trade, 80),
    status: source.status as WorkStatus,
    summary: requiredText(source.summary, 2_000, true),
    selectedArtifactRefs,
  }
}

export function parseProjectInvitation(value: unknown): ProjectInvitation {
  const source = object(value, [
    'invitationRef', 'homeRef', 'projectRef', 'professionalOrganizationRef', 'status',
    'message', 'disclosure', 'expiresAt', 'revision', 'createdAt', 'respondedAt', 'revokedAt',
  ])
  if (!isInvitationRef(source.invitationRef) || !isHomeRef(source.homeRef)
    || !isProjectRef(source.projectRef) || !isOrganizationRef(source.professionalOrganizationRef)
    || (source.status !== 'pending' && source.status !== 'accepted'
      && source.status !== 'declined' && source.status !== 'revoked'
      && source.status !== 'expired')) return fail()
  const message = optionalText(source.message, 1_000)
  const createdAt = utcInstant(source.createdAt)
  const expiresAt = utcInstant(source.expiresAt)
  const respondedAt = source.respondedAt === undefined ? undefined : utcInstant(source.respondedAt)
  const revokedAt = source.revokedAt === undefined ? undefined : utcInstant(source.revokedAt)
  if (expiresAt <= createdAt
    || ((source.status === 'accepted' || source.status === 'declined') && !respondedAt)
    || ((source.status === 'pending' || source.status === 'revoked') && respondedAt !== undefined)
    || ((source.status === 'revoked') !== (revokedAt !== undefined))) return fail()
  return {
    invitationRef: source.invitationRef,
    homeRef: source.homeRef,
    projectRef: source.projectRef,
    professionalOrganizationRef: source.professionalOrganizationRef,
    status: source.status,
    ...(message === undefined ? {} : { message }),
    disclosure: parseDisclosure(source.disclosure),
    expiresAt,
    revision: count(source.revision, true),
    createdAt,
    ...(respondedAt === undefined ? {} : { respondedAt }),
    ...(revokedAt === undefined ? {} : { revokedAt }),
  }
}

export function parseProfessionalProposal(value: unknown): ProfessionalProposal {
  const source = object(value, [
    'quoteRef', 'versionRef', 'invitationRef', 'professionalOrganizationRef', 'homeRef',
    'projectRef', 'contractorLabel', 'proposalDate', 'totalAmountCents', 'currencyCode',
    'summary', 'scope', 'state', 'homeownerDecision', 'decisionRevision', 'revision',
    'createdAt', 'updatedAt',
  ])
  if (!isQuoteRef(source.quoteRef) || typeof source.versionRef !== 'string'
    || !VERSION_REF.test(source.versionRef) || !isInvitationRef(source.invitationRef)
    || !isOrganizationRef(source.professionalOrganizationRef) || !isHomeRef(source.homeRef)
    || !isProjectRef(source.projectRef) || source.currencyCode !== 'USD'
    || (source.state !== 'submitted' && source.state !== 'withdrawn')
    || (source.homeownerDecision !== 'undecided' && source.homeownerDecision !== 'shortlisted'
      && source.homeownerDecision !== 'selected' && source.homeownerDecision !== 'declined')) return fail()
  const createdAt = utcInstant(source.createdAt)
  const updatedAt = utcInstant(source.updatedAt)
  if (updatedAt < createdAt
    || (source.state === 'withdrawn' && source.homeownerDecision === 'selected')) return fail()
  const totalAmountCents = source.totalAmountCents === undefined
    ? undefined : count(source.totalAmountCents)
  const summary = optionalText(source.summary, 2_000)
  return {
    quoteRef: source.quoteRef,
    versionRef: source.versionRef,
    invitationRef: source.invitationRef,
    professionalOrganizationRef: source.professionalOrganizationRef,
    homeRef: source.homeRef,
    projectRef: source.projectRef,
    contractorLabel: requiredText(source.contractorLabel, 120),
    proposalDate: calendarDate(source.proposalDate),
    ...(totalAmountCents === undefined ? {} : { totalAmountCents }),
    currencyCode: 'USD',
    ...(summary === undefined ? {} : { summary }),
    scope: parseQuoteScope(source.scope),
    state: source.state,
    homeownerDecision: source.homeownerDecision,
    decisionRevision: count(source.decisionRevision, true),
    revision: count(source.revision, true),
    createdAt,
    updatedAt,
  }
}

export function parseProjectQuote(value: unknown): ProjectQuote {
  const source = object(value, [
    'quoteRef', 'homeRef', 'projectRef', 'contractorLabel', 'proposalDate', 'artifactRef',
    'scope', 'notes', 'source', 'professionalOrganizationRef', 'invitationRef',
    'totalAmountCents', 'currencyCode', 'professionalSummary', 'proposalState',
    'homeownerDecision', 'decisionRevision', 'revision', 'createdAt', 'updatedAt',
  ])
  if (!isQuoteRef(source.quoteRef) || !isHomeRef(source.homeRef) || !isProjectRef(source.projectRef)
    || (source.proposalDate !== null && typeof source.proposalDate !== 'string')
    || (source.artifactRef !== null && !isArtifactRef(source.artifactRef))
    || (source.source !== 'homeowner_entry' && source.source !== 'professional_submission')
    || (source.professionalOrganizationRef !== null
      && !isOrganizationRef(source.professionalOrganizationRef))
    || (source.invitationRef !== null && !isInvitationRef(source.invitationRef))
    || (source.totalAmountCents !== null
      && (typeof source.totalAmountCents !== 'number' || !Number.isInteger(source.totalAmountCents)
        || source.totalAmountCents < 0))
    || (source.currencyCode !== null && source.currencyCode !== 'USD')
    || (source.proposalState !== null && source.proposalState !== 'submitted'
      && source.proposalState !== 'withdrawn')
    || (source.homeownerDecision !== 'undecided' && source.homeownerDecision !== 'shortlisted'
      && source.homeownerDecision !== 'selected' && source.homeownerDecision !== 'declined')
    || (source.decisionRevision !== null
      && (typeof source.decisionRevision !== 'number'
        || !Number.isInteger(source.decisionRevision) || source.decisionRevision < 1))) return fail()
  const proposalDate = source.proposalDate === null ? null : calendarDate(source.proposalDate)
  const createdAt = utcInstant(source.createdAt)
  const updatedAt = utcInstant(source.updatedAt)
  if (updatedAt < createdAt) return fail()
  if (source.source === 'homeowner_entry'
    && (source.professionalOrganizationRef !== null || source.invitationRef !== null
      || source.totalAmountCents !== null || source.currencyCode !== null
      || source.professionalSummary !== '' || source.proposalState !== null
      || source.homeownerDecision !== 'undecided' || source.decisionRevision !== null)) return fail()
  if (source.source === 'professional_submission'
    && (!source.professionalOrganizationRef || !source.invitationRef
      || source.currencyCode !== 'USD' || !source.proposalState
      || source.decisionRevision === null || source.artifactRef !== null || source.notes !== '')) return fail()
  return {
    quoteRef: source.quoteRef,
    homeRef: source.homeRef,
    projectRef: source.projectRef,
    contractorLabel: requiredText(source.contractorLabel, 120),
    proposalDate,
    artifactRef: source.artifactRef,
    scope: parseQuoteScope(source.scope),
    notes: requiredText(source.notes, 500, true),
    source: source.source,
    professionalOrganizationRef: source.professionalOrganizationRef,
    invitationRef: source.invitationRef,
    totalAmountCents: source.totalAmountCents,
    currencyCode: source.currencyCode,
    professionalSummary: requiredText(source.professionalSummary, 2_000, true),
    proposalState: source.proposalState,
    homeownerDecision: source.homeownerDecision,
    decisionRevision: source.decisionRevision,
    revision: count(source.revision, true),
    createdAt,
    updatedAt,
  }
}

export function professionalDirectoryQuery(filters: {
  readonly trade?: ProfessionalTrade
  readonly serviceArea?: string
} = {}): string | null {
  const query = new URLSearchParams()
  if (filters.trade !== undefined) {
    if (!TRADE_SET.has(filters.trade)) return null
    query.set('trade', filters.trade)
  }
  if (filters.serviceArea !== undefined) {
    const serviceArea = filters.serviceArea.trim()
    if (serviceArea.length < 2 || serviceArea.length > 80) return null
    query.set('serviceArea', serviceArea)
  }
  return query.toString()
}

export function createProfessionalOrganizationBody(
  input: CreateProfessionalOrganizationInput,
): JsonRecord | null {
  const displayName = input.displayName.trim()
  const slug = normalizedProfessionalSlug(input.slug)
  if (!COMMAND_REF.test(input.commandRef) || displayName.length < 1
    || displayName.length > 120 || !slug) return null
  return { commandRef: input.commandRef, displayName, slug }
}

function optionalInputText(value: string | null, maximum: number, minimum = 1): string | null | undefined {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed.length >= minimum && trimmed.length <= maximum ? trimmed : undefined
}

function canonicalProfessionalInputUrl(value: string | null): string | null | undefined {
  if (value === null) return null
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && url.href === value.trim() ? url.href : undefined
  } catch {
    return undefined
  }
}

export function saveProfessionalProfileBody(input: SaveProfessionalProfileInput): JsonRecord | null {
  const displayName = input.displayName.trim()
  const legalName = optionalInputText(input.legalName, 160)
  const description = optionalInputText(input.description, 1_200)
  const publicPhone = optionalInputText(input.publicPhone, 32, 7)
  const publicEmail = input.publicEmail === null ? null : input.publicEmail.trim().toLowerCase()
  const websiteUrl = canonicalProfessionalInputUrl(input.websiteUrl)
  const logoUrl = canonicalProfessionalInputUrl(input.logoUrl)
  const serviceAreas = input.serviceAreas.map(area => area.trim())
  if (!COMMAND_REF.test(input.commandRef) || !isOrganizationRef(input.organizationRef)
    || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 1
    || displayName.length < 1 || displayName.length > 120 || legalName === undefined
    || description === undefined || publicPhone === undefined || websiteUrl === undefined
    || logoUrl === undefined || (publicEmail !== null
      && (publicEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail)))
    || input.trades.length > 12 || input.trades.some(trade => !TRADE_SET.has(trade))
    || !unique(input.trades) || serviceAreas.length > 40
    || serviceAreas.some(area => area.length < 2 || area.length > 80)
    || !unique(serviceAreas, true)
    || (input.publicationState !== 'draft' && input.publicationState !== 'published')
    || (input.publicationState === 'published'
      && (input.trades.length === 0 || serviceAreas.length === 0))) return null
  return {
    commandRef: input.commandRef,
    organizationRef: input.organizationRef,
    expectedRevision: input.expectedRevision,
    displayName,
    legalName,
    description,
    publicPhone,
    publicEmail,
    websiteUrl,
    logoUrl,
    trades: [...input.trades],
    serviceAreas,
    publicationState: input.publicationState,
  }
}

export function inviteProfessionalBody(input: InviteProfessionalInput): JsonRecord | null {
  const message = input.message?.trim()
  if (!COMMAND_REF.test(input.commandRef) || !isOrganizationRef(input.professionalOrganizationRef)
    || (message !== undefined && (message.length < 1 || message.length > 1_000))
    || input.selectedArtifactRefs.length > 25
    || input.selectedArtifactRefs.some(ref => !isArtifactRef(ref))
    || !unique(input.selectedArtifactRefs) || !Number.isInteger(input.expiresInDays)
    || input.expiresInDays < 1 || input.expiresInDays > 30) return null
  return {
    commandRef: input.commandRef,
    professionalOrganizationRef: input.professionalOrganizationRef,
    ...(message ? { message } : {}),
    selectedArtifactRefs: [...input.selectedArtifactRefs],
    expiresInDays: input.expiresInDays,
  }
}

export function invitationRevisionBody(
  input: RevokeProjectInvitationInput,
): JsonRecord | null {
  return COMMAND_REF.test(input.commandRef) && Number.isInteger(input.expectedRevision)
    && input.expectedRevision >= 1
    ? { commandRef: input.commandRef, expectedRevision: input.expectedRevision }
    : null
}

export function respondToProjectInvitationBody(
  input: RespondToProjectInvitationInput,
): JsonRecord | null {
  const revision = invitationRevisionBody(input)
  return revision && (input.response === 'accepted' || input.response === 'declined')
    ? { ...revision, response: input.response }
    : null
}

function normalizedQuoteScopeInput(input: QuoteScope): QuoteScope | null {
  try {
    return parseQuoteScope(input)
  } catch {
    return null
  }
}

export function professionalProposalBody(
  input: SubmitProfessionalProposalInput | ReviseProfessionalProposalInput,
): JsonRecord | null {
  const summary = input.summary?.trim()
  const scope = normalizedQuoteScopeInput(input.scope)
  const expectedRevision = 'expectedRevision' in input ? input.expectedRevision : undefined
  try { calendarDate(input.proposalDate) } catch { return null }
  if (!COMMAND_REF.test(input.commandRef)
    || (input.totalAmountCents !== undefined && (!Number.isInteger(input.totalAmountCents)
      || input.totalAmountCents < 0 || input.totalAmountCents > 1_000_000_000))
    || (summary !== undefined && (summary.length < 1 || summary.length > 2_000)) || !scope
    || (expectedRevision !== undefined
      && (!Number.isInteger(expectedRevision) || expectedRevision < 1))) return null
  return {
    commandRef: input.commandRef,
    proposalDate: input.proposalDate,
    ...(input.totalAmountCents === undefined ? {} : { totalAmountCents: input.totalAmountCents }),
    ...(summary ? { summary } : {}),
    scope,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
}

export function decideProfessionalProposalBody(
  input: DecideProfessionalProposalInput,
): JsonRecord | null {
  if (!COMMAND_REF.test(input.commandRef) || !Number.isInteger(input.expectedDecisionRevision)
    || input.expectedDecisionRevision < 1 || (input.decision !== 'shortlisted'
      && input.decision !== 'selected' && input.decision !== 'declined')) return null
  return {
    commandRef: input.commandRef,
    expectedDecisionRevision: input.expectedDecisionRevision,
    decision: input.decision,
  }
}
