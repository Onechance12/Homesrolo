import type {
  CreateProjectQuoteInput,
  ProjectQuote,
  QuoteScope,
  SaveProjectQuoteInput,
} from './model.ts'
import { isQuoteRef, parseQuoteScope } from './professional.ts'
import { isArtifactRef } from './protocol.ts'

const COMMAND_REF = /^hcmd_[A-Za-z0-9_-]{43}$/

export interface NormalizedProjectQuoteBody {
  readonly commandRef: string
  readonly contractorLabel: string
  readonly proposalDate?: string
  readonly artifactRef?: string
  readonly scope: QuoteScope
  readonly notes?: string
  readonly expectedRevision?: number
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function homeownerProjectQuoteBody(
  input: CreateProjectQuoteInput | SaveProjectQuoteInput,
): NormalizedProjectQuoteBody | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const saving = Object.hasOwn(input, 'expectedRevision')
  const allowed = new Set([
    'commandRef', 'contractorLabel', 'proposalDate', 'artifactRef', 'scope', 'notes',
    ...(saving ? ['expectedRevision'] : []),
  ])
  if (Object.keys(input).some(key => !allowed.has(key))) return null
  const contractorLabel = input.contractorLabel.trim()
  const notes = input.notes?.trim()
  const expectedRevision = saving ? (input as SaveProjectQuoteInput).expectedRevision : undefined
  let scope: QuoteScope
  try { scope = parseQuoteScope(input.scope) } catch { return null }
  if (!COMMAND_REF.test(input.commandRef)
    || contractorLabel.length < 1 || contractorLabel.length > 120
    || (input.proposalDate !== undefined && !calendarDate(input.proposalDate))
    || (input.artifactRef !== undefined && !isArtifactRef(input.artifactRef))
    || (notes !== undefined && notes.length > 500)
    || (saving && (!Number.isInteger(expectedRevision) || (expectedRevision ?? 0) < 1))) {
    return null
  }
  return {
    commandRef: input.commandRef,
    contractorLabel,
    ...(input.proposalDate ? { proposalDate: input.proposalDate } : {}),
    ...(input.artifactRef ? { artifactRef: input.artifactRef } : {}),
    scope,
    ...(notes ? { notes } : {}),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  }
}

function scopesEqual(left: QuoteScope, right: QuoteScope): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) return false
    const leftItem = left[key as keyof QuoteScope]
    const rightItem = right[key as keyof QuoteScope]
    return leftItem?.status === rightItem?.status
      && (leftItem?.detail ?? null) === (rightItem?.detail ?? null)
  })
}

export function projectQuoteMatchesBody(
  quote: ProjectQuote,
  body: NormalizedProjectQuoteBody,
): boolean {
  return quote.source === 'homeowner_entry'
    && quote.contractorLabel === body.contractorLabel
    && quote.proposalDate === (body.proposalDate ?? null)
    && quote.artifactRef === (body.artifactRef ?? null)
    && quote.notes === (body.notes ?? '')
    && scopesEqual(quote.scope, body.scope)
}

export function projectQuoteCommandIntent(
  projectRef: string,
  quoteRef: string | null,
  body: NormalizedProjectQuoteBody,
): string {
  const { commandRef: _commandRef, ...fields } = body
  return JSON.stringify({ projectRef, quoteRef, ...fields })
}

export function validProjectQuoteRef(value: unknown): value is string {
  return isQuoteRef(value)
}
