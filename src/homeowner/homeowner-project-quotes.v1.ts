import { z } from 'zod'
import type {
  AuthorizedHomeownerAction,
  AuthorizedHomeownerWorkspace,
} from './homeowner-runtime.v1.ts'

export const HOMEOWNER_PROJECT_QUOTE_VERSION = 'homeowner-project-quote.v1' as const

const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`))

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'must be a real calendar date')

const utcInstant = z.string().refine(value => {
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}, 'must be a canonical UTC instant')

export const HOMEOWNER_QUOTE_SCOPE_KEYS = Object.freeze([
  'project_scope',
  'site_conditions',
  'preparation',
  'labor',
  'materials_products',
  'allowances',
  'schedule',
  'access_protection',
  'inspection_closeout',
  'warranty',
  'change_orders',
  'measurement',
  'roof_configuration',
  'tear_off',
  'decking',
  'underlayment',
  'leak_barrier',
  'primary_materials',
  'starter_and_ridge',
  'valleys',
  'flashing_transitions',
  'penetrations',
  'ventilation',
  'permits',
  'cleanup',
  'workmanship_warranty',
  'manufacturer_warranty',
  'payment_terms',
  'exclusions',
] as const)

export const homeownerQuoteScopeStatusSchema = z.enum([
  'included',
  'excluded',
  'allowance',
  'not_stated',
])

export const homeownerQuoteScopeItemSchema = z.object({
  status: homeownerQuoteScopeStatusSchema,
  detail: z.string().trim().min(1).max(160).optional(),
}).strict()

export const homeownerQuoteScopeSchema = z.object({
  project_scope: homeownerQuoteScopeItemSchema.optional(),
  site_conditions: homeownerQuoteScopeItemSchema.optional(),
  preparation: homeownerQuoteScopeItemSchema.optional(),
  labor: homeownerQuoteScopeItemSchema.optional(),
  materials_products: homeownerQuoteScopeItemSchema.optional(),
  allowances: homeownerQuoteScopeItemSchema.optional(),
  schedule: homeownerQuoteScopeItemSchema.optional(),
  access_protection: homeownerQuoteScopeItemSchema.optional(),
  inspection_closeout: homeownerQuoteScopeItemSchema.optional(),
  warranty: homeownerQuoteScopeItemSchema.optional(),
  change_orders: homeownerQuoteScopeItemSchema.optional(),
  measurement: homeownerQuoteScopeItemSchema.optional(),
  roof_configuration: homeownerQuoteScopeItemSchema.optional(),
  tear_off: homeownerQuoteScopeItemSchema.optional(),
  decking: homeownerQuoteScopeItemSchema.optional(),
  underlayment: homeownerQuoteScopeItemSchema.optional(),
  leak_barrier: homeownerQuoteScopeItemSchema.optional(),
  primary_materials: homeownerQuoteScopeItemSchema.optional(),
  starter_and_ridge: homeownerQuoteScopeItemSchema.optional(),
  valleys: homeownerQuoteScopeItemSchema.optional(),
  flashing_transitions: homeownerQuoteScopeItemSchema.optional(),
  penetrations: homeownerQuoteScopeItemSchema.optional(),
  ventilation: homeownerQuoteScopeItemSchema.optional(),
  permits: homeownerQuoteScopeItemSchema.optional(),
  cleanup: homeownerQuoteScopeItemSchema.optional(),
  workmanship_warranty: homeownerQuoteScopeItemSchema.optional(),
  manufacturer_warranty: homeownerQuoteScopeItemSchema.optional(),
  payment_terms: homeownerQuoteScopeItemSchema.optional(),
  exclusions: homeownerQuoteScopeItemSchema.optional(),
}).strict()

export const createHomeownerProjectQuoteInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  projectRef: opaqueRef('hprj'),
  contractorLabel: z.string().trim().min(1).max(120),
  proposalDate: calendarDate.optional(),
  artifactRef: opaqueRef('hart').optional(),
  scope: homeownerQuoteScopeSchema,
  notes: z.string().trim().min(1).max(500).optional(),
  requestedAt: utcInstant,
}).strict()

export const saveHomeownerProjectQuoteInputSchema =
  createHomeownerProjectQuoteInputSchema.extend({
    quoteRef: opaqueRef('hquo'),
    expectedRevision: z.number().int().min(1),
  }).strict()

const homeownerProjectQuoteBaseShape = {
  recordVersion: z.literal(HOMEOWNER_PROJECT_QUOTE_VERSION),
  quoteRef: opaqueRef('hquo'),
  homeRef: opaqueRef('hhom'),
  projectRef: opaqueRef('hprj'),
  controllerPrincipalRef: opaqueRef('hprn'),
  contractorLabel: z.string().trim().min(1).max(120),
  scope: homeownerQuoteScopeSchema,
  revision: z.number().int().min(1),
  createdAt: utcInstant,
  updatedAt: utcInstant,
} as const

export const homeownerEnteredProjectQuoteSchema = z.object({
  ...homeownerProjectQuoteBaseShape,
  proposalDate: calendarDate.optional(),
  artifactRef: opaqueRef('hart').optional(),
  notes: z.string().trim().min(1).max(500).optional(),
  source: z.literal('homeowner_entry'),
}).strict()

export const professionalSubmittedProjectQuoteSchema = z.object({
  ...homeownerProjectQuoteBaseShape,
  proposalDate: calendarDate,
  source: z.literal('professional_submission'),
  professionalOrganizationRef: opaqueRef('horg'),
  invitationRef: opaqueRef('hinv'),
  submittedByPrincipalRef: opaqueRef('hprn'),
  totalAmountCents: z.number().int().min(0).max(1_000_000_000).optional(),
  currencyCode: z.literal('USD'),
  summary: z.string().trim().min(1).max(2_000).optional(),
  proposalState: z.enum(['submitted', 'withdrawn']),
  homeownerDecision: z.enum(['undecided', 'shortlisted', 'selected', 'declined']),
  decisionRevision: z.number().int().min(1),
  latestVersionRef: opaqueRef('hpvr'),
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()

export const homeownerProjectQuoteSchema = z.discriminatedUnion('source', [
  homeownerEnteredProjectQuoteSchema,
  professionalSubmittedProjectQuoteSchema,
]).superRefine((quote, context) => {
  if (quote.updatedAt < quote.createdAt) {
    context.addIssue({
      code: 'custom',
      path: ['updatedAt'],
      message: 'updatedAt must be on or after createdAt',
    })
  }
  if (quote.source === 'professional_submission'
    && quote.proposalState === 'withdrawn'
    && quote.homeownerDecision === 'selected') {
    context.addIssue({
      code: 'custom',
      path: ['homeownerDecision'],
      message: 'a selected proposal cannot be withdrawn',
    })
  }
})

export type HomeownerQuoteScope = z.infer<typeof homeownerQuoteScopeSchema>
export type HomeownerQuoteScopeStatus = z.infer<typeof homeownerQuoteScopeStatusSchema>
export type HomeownerQuoteScopeItem = z.infer<typeof homeownerQuoteScopeItemSchema>
export type CreateHomeownerProjectQuoteInput = z.infer<
  typeof createHomeownerProjectQuoteInputSchema
>
export type HomeownerProjectQuote = z.infer<typeof homeownerProjectQuoteSchema>
export type SaveHomeownerProjectQuoteInput = z.infer<
  typeof saveHomeownerProjectQuoteInputSchema
>

/**
 * Idempotency binds the homeowner's stable intent, not the server execution
 * time. A retry after a lost response receives a new requestedAt but must
 * still resolve to the original command receipt.
 */
export function homeownerProjectQuoteCommandIntent<
  T extends CreateHomeownerProjectQuoteInput | SaveHomeownerProjectQuoteInput,
>(command: T): Omit<T, 'requestedAt'> {
  const { requestedAt: _executionTime, ...intent } = command
  return intent
}

/**
 * Private Homesrolo persistence only. This port has no Jobrolo transport and
 * no authority to distribute a proposal, its comparison, or a linked file.
 */
export interface HomeownerProjectQuotePort {
  listProjectQuotes(
    grant: AuthorizedHomeownerWorkspace,
    projectRef: string,
  ): Promise<readonly HomeownerProjectQuote[]>
  createProjectQuote(input: {
    readonly grant: AuthorizedHomeownerAction<'quote.create'>
    readonly command: CreateHomeownerProjectQuoteInput
  }): Promise<HomeownerProjectQuote>
  saveProjectQuote(input: {
    readonly grant: AuthorizedHomeownerAction<'quote.save'>
    readonly command: SaveHomeownerProjectQuoteInput
  }): Promise<HomeownerProjectQuote>
}

export const HOMEOWNER_PROJECT_QUOTE_WARNING =
  'A proposal is homeowner-entered private project data. Homesrolo does not rate the price, recommend a professional, or send proposal metadata to Jobrolo.'
