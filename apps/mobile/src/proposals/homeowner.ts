import type {
  ArtifactRecord,
  ProjectQuote,
  QuoteScope,
  QuoteScopeKey,
  QuoteScopeStatus,
  WorkCategory,
  WorkRecord,
} from '../api/model.ts'

export type QuoteDraftStatus = QuoteScopeStatus | 'unreviewed'

export interface QuoteScopeRow {
  readonly key: QuoteScopeKey
  readonly label: string
}

export interface QuoteScopeDraftItem {
  readonly status: QuoteDraftStatus
  readonly detail: string
}

export type QuoteScopeDraft = Readonly<Partial<Record<QuoteScopeKey, QuoteScopeDraftItem>>>

export const GENERAL_SCOPE_ROWS: readonly QuoteScopeRow[] = Object.freeze([
  { key: 'project_scope', label: 'Work included' },
  { key: 'site_conditions', label: 'Site conditions and assumptions' },
  { key: 'preparation', label: 'Preparation and removal' },
  { key: 'labor', label: 'Labor and crew responsibilities' },
  { key: 'materials_products', label: 'Materials, products, and finishes' },
  { key: 'allowances', label: 'Allowances and undecided selections' },
  { key: 'schedule', label: 'Start window and estimated duration' },
  { key: 'access_protection', label: 'Access and protection of the home' },
  { key: 'permits', label: 'Permits and inspections' },
  { key: 'cleanup', label: 'Cleanup and disposal' },
  { key: 'inspection_closeout', label: 'Final walkthrough and closeout' },
  { key: 'warranty', label: 'Work and product warranties' },
  { key: 'change_orders', label: 'Change-order process' },
  { key: 'payment_terms', label: 'Payment terms' },
  { key: 'exclusions', label: 'Exclusions' },
])

export const ROOF_SCOPE_ROWS: readonly QuoteScopeRow[] = Object.freeze([
  { key: 'measurement', label: 'Roof measurement' },
  { key: 'roof_configuration', label: 'Pitch, stories, hips, and roof configuration' },
  { key: 'tear_off', label: 'Tear-off and existing layers' },
  { key: 'decking', label: 'Decking and wood-repair terms' },
  { key: 'underlayment', label: 'Underlayment' },
  { key: 'leak_barrier', label: 'Leak barrier' },
  { key: 'primary_materials', label: 'Primary materials and product line' },
  { key: 'starter_and_ridge', label: 'Starter, edge metal, and hip/ridge' },
  { key: 'valleys', label: 'Valleys' },
  { key: 'flashing_transitions', label: 'Walls, chimneys, skylights, and transitions' },
  { key: 'penetrations', label: 'Pipe boots and other penetrations' },
  { key: 'ventilation', label: 'Intake and exhaust ventilation' },
  { key: 'permits', label: 'Permits and inspections' },
  { key: 'cleanup', label: 'Disposal and cleanup' },
  { key: 'workmanship_warranty', label: 'Workmanship warranty' },
  { key: 'manufacturer_warranty', label: 'Manufacturer warranty and registration' },
  { key: 'payment_terms', label: 'Payment and change-order terms' },
  { key: 'exclusions', label: 'Exclusions' },
])

export const QUOTE_STATUS_LABEL: Readonly<Record<QuoteDraftStatus, string>> = Object.freeze({
  unreviewed: 'Not reviewed',
  included: 'Included',
  excluded: 'Excluded',
  allowance: 'Allowance / open',
  not_stated: 'Not stated',
})

const CATEGORY_LABEL: Readonly<Record<WorkCategory, string>> = Object.freeze({
  roofing: 'Roofing',
  exterior: 'Exterior',
  interior: 'Interior & remodeling',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hvac: 'Heating & cooling',
  landscaping: 'Yard & landscaping',
  appliances: 'Appliances',
  pest: 'Pest control',
  pool: 'Pool & outdoor living',
  new_construction: 'New construction',
  other: 'Home work',
})

export function scopeRowsFor(category: WorkCategory): readonly QuoteScopeRow[] {
  return category === 'roofing' ? ROOF_SCOPE_ROWS : GENERAL_SCOPE_ROWS
}

export function emptyScopeDraft(rows: readonly QuoteScopeRow[]): QuoteScopeDraft {
  return Object.fromEntries(rows.map(row => [row.key, {
    status: 'unreviewed' as const,
    detail: '',
  }])) as QuoteScopeDraft
}

export function scopeDraftForQuote(
  quote: ProjectQuote,
  rows: readonly QuoteScopeRow[],
): QuoteScopeDraft {
  const draft: Partial<Record<QuoteScopeKey, QuoteScopeDraftItem>> = {
    ...emptyScopeDraft(rows),
  }
  for (const row of rows) {
    const item = quote.scope[row.key]
    if (item) draft[row.key] = { status: item.status, detail: item.detail ?? '' }
  }
  return draft
}

/**
 * A work category can be corrected after a proposal was recorded. Keep scope
 * rows that are no longer visible so editing a label cannot erase evidence.
 */
export function scopeOutsideRows(
  quote: ProjectQuote,
  rows: readonly QuoteScopeRow[],
): QuoteScope {
  const visible = new Set(rows.map(row => row.key))
  return Object.fromEntries(
    Object.entries(quote.scope).filter(([key]) => !visible.has(key as QuoteScopeKey)),
  ) as QuoteScope
}

export function scopeFromDraft(
  draft: QuoteScopeDraft,
  rows: readonly QuoteScopeRow[],
  preserved: QuoteScope = {},
): QuoteScope | null {
  const output: Partial<Record<QuoteScopeKey, { status: QuoteScopeStatus; detail?: string }>> = {
    ...preserved,
  }
  for (const row of rows) {
    delete output[row.key]
    const item = draft[row.key]
    if (!item || item.status === 'unreviewed') continue
    if (item.status !== 'included' && item.status !== 'excluded'
      && item.status !== 'allowance' && item.status !== 'not_stated') return null
    const detail = item.detail.trim()
    if (detail.length > 160) return null
    output[row.key] = detail ? { status: item.status, detail } : { status: item.status }
  }
  return output
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function projectPdfArtifacts(
  artifacts: readonly ArtifactRecord[],
  projectRef: string,
): readonly ArtifactRecord[] {
  return artifacts.filter(artifact => artifact.projectRef === projectRef
    && artifact.kind === 'document'
    && artifact.mediaType === 'application/pdf')
}

export function homeownerEnteredQuotes(
  quotes: readonly ProjectQuote[],
): readonly ProjectQuote[] {
  return quotes.filter(quote => quote.source === 'homeowner_entry')
}

export function proposalRequestText(
  work: WorkRecord,
  artifacts: readonly ArtifactRecord[],
): string {
  const projectArtifacts = artifacts.filter(artifact => artifact.projectRef === work.projectRef)
  const photoCount = projectArtifacts.filter(artifact => artifact.kind === 'photo').length
  const fileCount = projectArtifacts.filter(artifact => artifact.kind !== 'photo').length
  return [
    `Homesrolo work request: ${work.title}`,
    `Home area: ${CATEGORY_LABEL[work.category]}`,
    work.summary
      ? `What I need: ${work.summary}`
      : 'What I need: I would like to discuss the work and available options.',
    photoCount > 0
      ? `${photoCount} private ${photoCount === 1 ? 'photo is' : 'photos are'} organized in Homesrolo. I can share only what you need to prepare an estimate.`
      : '',
    fileCount > 0
      ? `${fileCount} private ${fileCount === 1 ? 'file is' : 'files are'} saved with this work. Nothing is attached to this message.`
      : '',
    'Please reply with your availability and a written scope covering the work, products or materials, timing, warranties, payment and change-order terms, and exclusions.',
    'This message does not grant access to my private home record or approve any work.',
  ].filter(Boolean).join('\n\n')
}

export function reviewedScopeCount(scope: QuoteScope): number {
  return Object.keys(scope).length
}
