import { z } from 'zod'
import { isRealCalendarDate } from '../contracts/home-file-record.v1.ts'
import type {
  AuthorizedHomeownerAction,
  AuthorizedHomeownerWorkspace,
  HomeownerProject,
} from './homeowner-runtime.v1.ts'

export const HOMEOWNER_PROJECT_WORKSPACE_VERSION = 'homeowner-project-workspace.v1' as const

const opaqueRef = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{43}$`))

const calendarDate = z.string().refine(isRealCalendarDate, 'must be a real calendar date')

const utcInstant = z.string().refine(value => {
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}, 'must be a canonical UTC instant')

export const homeownerProjectCategorySchema = z.enum([
  'roofing',
  'exterior',
  'interior',
  'electrical',
  'plumbing',
  'hvac',
  'landscaping',
  'appliances',
  'pest',
  'pool',
  'new_construction',
  'other',
])

export const homeownerProjectStatusSchema = z.enum([
  'planned',
  'in_progress',
  'completed',
  'cancelled',
])

/**
 * A bounded partial update protected by the project's current revision. Null
 * intentionally clears optional homeowner-entered fields; omission preserves
 * them. Browser input never supplies a principal, membership, home, or time.
 */
export const updateHomeownerProjectFieldsSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  projectRef: opaqueRef('hprj'),
  expectedRevision: z.number().int().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  category: homeownerProjectCategorySchema.optional(),
  status: homeownerProjectStatusSchema.optional(),
  occurredOn: calendarDate.nullable().optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
  professionalLabel: z.string().trim().min(1).max(160).nullable().optional(),
  archived: z.boolean().optional(),
  requestedAt: utcInstant,
}).strict()

export const updateHomeownerProjectInputSchema =
  updateHomeownerProjectFieldsSchema.superRefine((command, context) => {
    const editableKeys = [
      'title',
      'category',
      'status',
      'occurredOn',
      'summary',
      'professionalLabel',
      'archived',
    ] as const
    if (!editableKeys.some(key => Object.hasOwn(command, key))) {
      context.addIssue({
        code: 'custom',
        message: 'at least one project field must be supplied',
      })
    }
  })

export const homeownerProjectActivityKindSchema = z.enum(['note', 'milestone'])

export const appendHomeownerProjectActivityInputSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  projectRef: opaqueRef('hprj'),
  kind: homeownerProjectActivityKindSchema,
  body: z.string().trim().min(1).max(2000),
  requestedAt: utcInstant,
}).strict()

export const homeownerProjectActivitySchema = z.object({
  recordVersion: z.literal(HOMEOWNER_PROJECT_WORKSPACE_VERSION),
  activityRef: opaqueRef('hact'),
  homeRef: opaqueRef('hhom'),
  projectRef: opaqueRef('hprj'),
  actorPrincipalRef: opaqueRef('hprn'),
  kind: homeownerProjectActivityKindSchema,
  body: z.string().trim().min(1).max(2000),
  source: z.literal('homeowner_entry'),
  createdAt: utcInstant,
}).strict()

export const homeownerProjectItemKindSchema = z.enum(['material', 'decision', 'wishlist'])
export const homeownerProjectItemStateSchema = z.enum([
  'considering',
  'chosen',
  'purchased',
  'declined',
])

/**
 * The same receipt-backed command creates or replaces one homeowner item. A
 * missing itemRef means create; an exact itemRef requires expectedRevision.
 */
export const saveHomeownerProjectItemFieldsSchema = z.object({
  commandRef: opaqueRef('hcmd'),
  projectRef: opaqueRef('hprj'),
  itemRef: opaqueRef('hpit').optional(),
  expectedRevision: z.number().int().min(1).optional(),
  kind: homeownerProjectItemKindSchema,
  label: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(2000).optional(),
  state: homeownerProjectItemStateSchema,
  requestedAt: utcInstant,
}).strict()

export const saveHomeownerProjectItemInputSchema =
  saveHomeownerProjectItemFieldsSchema.superRefine((command, context) => {
    if ((command.itemRef === undefined) !== (command.expectedRevision === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['expectedRevision'],
        message: 'itemRef and expectedRevision must be supplied together',
      })
    }
  })

export const homeownerProjectItemSchema = z.object({
  recordVersion: z.literal(HOMEOWNER_PROJECT_WORKSPACE_VERSION),
  itemRef: opaqueRef('hpit'),
  homeRef: opaqueRef('hhom'),
  projectRef: opaqueRef('hprj'),
  createdByPrincipalRef: opaqueRef('hprn'),
  kind: homeownerProjectItemKindSchema,
  label: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(2000).optional(),
  state: homeownerProjectItemStateSchema,
  source: z.literal('homeowner_entry'),
  revision: z.number().int().min(1),
  createdAt: utcInstant,
  updatedAt: utcInstant,
}).strict().superRefine((item, context) => {
  if (item.updatedAt < item.createdAt) {
    context.addIssue({
      code: 'custom',
      path: ['updatedAt'],
      message: 'updatedAt must be on or after createdAt',
    })
  }
})

export type UpdateHomeownerProjectInput = z.infer<typeof updateHomeownerProjectInputSchema>
export type AppendHomeownerProjectActivityInput = z.infer<
  typeof appendHomeownerProjectActivityInputSchema
>
export type HomeownerProjectActivity = z.infer<typeof homeownerProjectActivitySchema>
export type SaveHomeownerProjectItemInput = z.infer<typeof saveHomeownerProjectItemInputSchema>
export type HomeownerProjectItem = z.infer<typeof homeownerProjectItemSchema>

/** Execution time is server-owned and excluded from idempotency hashing. */
export function homeownerProjectWorkspaceCommandIntent<
  T extends UpdateHomeownerProjectInput
    | AppendHomeownerProjectActivityInput
    | SaveHomeownerProjectItemInput,
>(command: T): Omit<T, 'requestedAt'> {
  const { requestedAt: _executionTime, ...intent } = command
  return intent
}

export interface HomeownerProjectWorkspacePort {
  readProject(
    grant: AuthorizedHomeownerWorkspace,
    projectRef: string,
  ): Promise<HomeownerProject | null>
  listProjectActivity(
    grant: AuthorizedHomeownerWorkspace,
    projectRef: string,
  ): Promise<readonly HomeownerProjectActivity[]>
  listProjectItems(
    grant: AuthorizedHomeownerWorkspace,
    projectRef: string,
  ): Promise<readonly HomeownerProjectItem[]>
  updateProject(input: {
    readonly grant: AuthorizedHomeownerAction<'project.update'>
    readonly command: UpdateHomeownerProjectInput
  }): Promise<HomeownerProject>
  appendProjectActivity(input: {
    readonly grant: AuthorizedHomeownerAction<'project.activity.append'>
    readonly command: AppendHomeownerProjectActivityInput
  }): Promise<HomeownerProjectActivity>
  saveProjectItem(input: {
    readonly grant: AuthorizedHomeownerAction<'project.item.save'>
    readonly command: SaveHomeownerProjectItemInput
  }): Promise<HomeownerProjectItem>
}

export const HOMEOWNER_PROJECT_WORKSPACE_WARNING =
  'Homeowner-entered project fields and items are revisioned private working data. Activity is append-only. Contractor-issued evidence remains immutable and outside these edit commands.'
