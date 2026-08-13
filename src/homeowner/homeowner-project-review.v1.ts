import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
  HOMESROLO_JOBROLO_DOWNLOAD_LIFETIME_MS,
  HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT,
  HOMESROLO_PROJECT_REVIEW_CONSENT_VERSION,
  homesroloJobroloDisclosure,
  homesroloJobroloSha256,
  parseHomesroloJobroloProjectIntake,
  type HomesroloJobroloProjectIntake,
  type HomesroloJobroloProjectIntakeReceipt,
} from '../contracts/homesrolo-jobrolo-project-intake.v1.ts'
import {
  authorizeHomeownerWorkspace,
  homeownerArtifactMetadataSchema,
  homeownerProjectSchema,
  homeownerUtcInstantSchema,
  requireHomeownerActionGrant,
  type AuthorizedHomeownerAction,
  type HomeownerArtifactMetadata,
  type HomeownerIdentityPort,
  type HomeownerRepositoryPort,
} from './homeowner-runtime.v1.ts'
import { HomeownerApiError, type HomeownerApiRequestContext } from './homeowner-api.v1.ts'

const OPAQUE_BODY = '[A-Za-z0-9_-]{43}'
const opaqueRef = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_${OPAQUE_BODY}$`))

const homeownerProjectReviewDraftShape = {
  name: z.string().trim().min(1).max(120),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).optional(),
  preferredContact: z.enum(['email', 'phone', 'text']),
  selectedArtifactRefs: z.array(opaqueRef('hart')).max(10),
} as const

function requireProjectReviewContact(
  input: { preferredContact: 'email' | 'phone' | 'text'; phone?: string; selectedArtifactRefs: string[] },
  context: z.RefinementCtx,
) {
  if (new Set(input.selectedArtifactRefs).size !== input.selectedArtifactRefs.length) {
    context.addIssue({ code: 'custom', path: ['selectedArtifactRefs'], message: 'must be unique' })
  }
  if ((input.preferredContact === 'phone' || input.preferredContact === 'text')
    && !input.phone) {
    context.addIssue({ code: 'custom', path: ['phone'], message: 'phone is required' })
  }
}

const homeownerProjectReviewDraftSchema = z.object(homeownerProjectReviewDraftShape)
  .strict().superRefine(requireProjectReviewContact)

export const homeownerProjectReviewPreviewInputSchema = z.object({
  ...homeownerProjectReviewDraftShape,
  operation: z.literal('preview'),
}).strict().superRefine(requireProjectReviewContact)

export const homeownerProjectReviewInputSchema = z.object({
  ...homeownerProjectReviewDraftShape,
  operation: z.literal('submit'),
  commandRef: opaqueRef('hcmd'),
  reviewedDisclosureDigest: z.string().regex(/^[a-f0-9]{64}$/),
  consentAccepted: z.literal(true),
}).strict().superRefine(requireProjectReviewContact)

export type HomeownerProjectReviewInput = z.infer<typeof homeownerProjectReviewInputSchema>

export const homeownerProjectReviewPreviewViewSchema = z.object({
  projectRef: opaqueRef('hprj'),
  disclosureDigest: z.string().regex(/^[a-f0-9]{64}$/),
  homeowner: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().email().max(254),
    phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).optional(),
    preferredContact: z.enum(['email', 'phone', 'text']),
  }).strict(),
  property: z.object({ label: z.string().trim().min(1).max(240) }).strict(),
  project: z.object({
    title: z.string().trim().min(1).max(160),
    category: z.literal('roofing'),
    status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']),
    summary: z.string().max(4000),
  }).strict(),
  attachments: z.array(z.object({
    artifactRef: opaqueRef('hart'),
    displayName: z.string().trim().min(1).max(160),
    kind: z.enum(['photo', 'document', 'warranty']),
    mediaType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
    byteLength: z.number().int().min(1).max(25 * 1024 * 1024),
  }).strict()).max(10),
  consentText: z.literal(HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT),
}).strict()

export type HomeownerProjectReviewPreviewView = z.infer<typeof homeownerProjectReviewPreviewViewSchema>

export const homeownerProjectReviewViewSchema = z.object({
  submissionRef: opaqueRef('hsub'),
  projectRef: opaqueRef('hprj'),
  status: z.enum(['awaiting_chance_review', 'reconciliation_required']),
  submittedAt: homeownerUtcInstantSchema,
  message: z.string().trim().min(1).max(240),
}).strict()

export type HomeownerProjectReviewView = z.infer<typeof homeownerProjectReviewViewSchema>

export type HomeownerProjectReviewReservation =
  | {
      readonly state: 'reserved'
      readonly submissionRef: string
      readonly commandDigest: string
      readonly disclosureDigest: string
    }
  | {
      readonly state: 'awaiting_chance_review'
      readonly submissionRef: string
      readonly submittedAt: string
      readonly receipt: HomesroloJobroloProjectIntakeReceipt
    }
  | {
      readonly state: 'reconciliation_required'
      readonly submissionRef: string
      readonly submittedAt: string
    }

export interface HomeownerProjectReviewPersistencePort {
  readCanonicalEmail(grant: AuthorizedHomeownerAction<'project.submit_for_review'>): Promise<string>
  reserveSubmission(input: {
    readonly grant: AuthorizedHomeownerAction<'project.submit_for_review'>
    readonly commandRef: string
    readonly commandDigest: string
    readonly submissionRef: string
    readonly projectRef: string
    readonly disclosureDigest: string
    readonly disclosure: ReturnType<typeof homesroloJobroloDisclosure>
    readonly consentAcceptedAt: string
  }): Promise<HomeownerProjectReviewReservation>
  createArtifactTransfer(input: {
    readonly grant: AuthorizedHomeownerAction<'project.submit_for_review'>
    readonly artifact: HomeownerArtifactMetadata
    readonly expiresAt: string
  }): Promise<{ readonly downloadUrl: string; readonly downloadExpiresAt: string }>
  markSubmissionReceived(input: {
    readonly grant: AuthorizedHomeownerAction<'project.submit_for_review'>
    readonly commandRef: string
    readonly commandDigest: string
    readonly submissionRef: string
    readonly projectRef: string
    readonly receipt: HomesroloJobroloProjectIntakeReceipt
    readonly receivedAt: string
  }): Promise<void>
  markSubmissionUnknown(input: {
    readonly grant: AuthorizedHomeownerAction<'project.submit_for_review'>
    readonly commandRef: string
    readonly commandDigest: string
    readonly submissionRef: string
    readonly failedAt: string
  }): Promise<void>
}

export interface HomeownerProjectReviewTransport {
  deliver(input: HomesroloJobroloProjectIntake): Promise<HomesroloJobroloProjectIntakeReceipt>
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const row = value as Record<string, unknown>
  return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`
}

function commandDigest(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex')
}

export class HomeownerProjectReviewService {
  readonly #identity: HomeownerIdentityPort
  readonly #repository: HomeownerRepositoryPort
  readonly #persistence: HomeownerProjectReviewPersistencePort
  readonly #transport: HomeownerProjectReviewTransport
  readonly #now: () => string

  constructor(input: {
    readonly identity: HomeownerIdentityPort
    readonly repository: HomeownerRepositoryPort
    readonly persistence: HomeownerProjectReviewPersistencePort
    readonly transport: HomeownerProjectReviewTransport
    readonly now?: () => string
  }) {
    this.#identity = input.identity
    this.#repository = input.repository
    this.#persistence = input.persistence
    this.#transport = input.transport
    this.#now = input.now ?? (() => new Date().toISOString())
  }

  async preview(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
    input: unknown,
  ): Promise<HomeownerProjectReviewPreviewView> {
    const parsed = homeownerProjectReviewPreviewInputSchema.safeParse(input)
    if (!parsed.success || !opaqueRef('hhom').safeParse(requestedHomeRef).success
      || !opaqueRef('hprj').safeParse(requestedProjectRef).success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#grant(context, requestedHomeRef)
    const [home, projects, artifacts, canonicalEmail] = await Promise.all([
      this.#repository.readHome(grant),
      this.#repository.listProjects(grant),
      this.#repository.listArtifactMetadata(grant),
      this.#persistence.readCanonicalEmail(grant),
    ])
    if (!home) throw new HomeownerApiError('not_found')
    const project = projects.find(candidate => candidate.projectRef === requestedProjectRef)
    if (!project || project.homeRef !== grant.homeRef || project.category !== 'roofing') {
      throw new HomeownerApiError('not_found')
    }
    const selected = parsed.data.selectedArtifactRefs.map(artifactRef => {
      const artifact = artifacts.find(candidate => candidate.artifactRef === artifactRef)
      if (!artifact || artifact.homeRef !== grant.homeRef || artifact.projectRef !== project.projectRef) {
        throw new HomeownerApiError('not_found')
      }
      return homeownerArtifactMetadataSchema.parse(artifact)
    })
    const disclosure = homesroloJobroloDisclosure({
      source: { homeRef: grant.homeRef, projectRef: project.projectRef },
      homeowner: {
        name: parsed.data.name,
        email: canonicalEmail,
        ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
        preferredContact: parsed.data.preferredContact,
      },
      property: { label: home.privateLocationLabel },
      project: {
        title: project.title,
        category: 'roofing' as const,
        status: project.status,
        summary: project.summary ?? '',
      },
      attachments: selected.map(artifact => ({
        artifactRef: artifact.artifactRef,
        displayName: artifact.displayName,
        kind: artifact.kind,
        mediaType: z.enum(['application/pdf', 'image/jpeg', 'image/png']).parse(artifact.mediaType),
        byteLength: artifact.byteLength,
        sha256: artifact.payloadSha256,
        downloadUrl: 'https://placeholder.invalid/not-disclosed',
        downloadExpiresAt: this.#now(),
      })),
    })
    return homeownerProjectReviewPreviewViewSchema.parse({
      projectRef: project.projectRef,
      disclosureDigest: homesroloJobroloSha256(disclosure),
      homeowner: disclosure.homeowner,
      property: disclosure.property,
      project: disclosure.project,
      attachments: disclosure.attachments.map(({ sha256: _sha256, ...attachment }) => attachment),
      consentText: HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT,
    })
  }

  async submit(
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedProjectRef: string,
    input: unknown,
  ): Promise<HomeownerProjectReviewView> {
    const parsed = homeownerProjectReviewInputSchema.safeParse(input)
    if (!parsed.success || !opaqueRef('hhom').safeParse(requestedHomeRef).success
      || !opaqueRef('hprj').safeParse(requestedProjectRef).success) {
      throw new HomeownerApiError('invalid_request')
    }
    const grant = await this.#grant(context, requestedHomeRef)
    const [home, projects, artifacts, canonicalEmail] = await Promise.all([
      this.#repository.readHome(grant),
      this.#repository.listProjects(grant),
      this.#repository.listArtifactMetadata(grant),
      this.#persistence.readCanonicalEmail(grant),
    ])
    if (!home) throw new HomeownerApiError('not_found')
    const project = projects.find(candidate => candidate.projectRef === requestedProjectRef)
    if (!project || project.homeRef !== grant.homeRef || project.category !== 'roofing') {
      throw new HomeownerApiError('not_found')
    }
    const selected = parsed.data.selectedArtifactRefs.map(artifactRef => {
      const artifact = artifacts.find(candidate => candidate.artifactRef === artifactRef)
      if (!artifact || artifact.homeRef !== grant.homeRef
        || artifact.projectRef !== project.projectRef) {
        throw new HomeownerApiError('not_found')
      }
      return homeownerArtifactMetadataSchema.parse(artifact)
    })
    const submittedAt = this.#now()
    const disclosureBase = {
      source: { homeRef: grant.homeRef, projectRef: project.projectRef },
      homeowner: {
        name: parsed.data.name,
        email: canonicalEmail,
        ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
        preferredContact: parsed.data.preferredContact,
      },
      property: { label: home.privateLocationLabel },
      project: {
        title: project.title,
        category: 'roofing' as const,
        status: project.status,
        summary: project.summary ?? '',
      },
      attachments: selected.map(artifact => ({
        artifactRef: artifact.artifactRef,
        displayName: artifact.displayName,
        kind: artifact.kind,
        mediaType: artifact.mediaType as 'application/pdf' | 'image/jpeg' | 'image/png',
        byteLength: artifact.byteLength,
        sha256: artifact.payloadSha256,
        downloadUrl: 'https://placeholder.invalid/not-disclosed',
        downloadExpiresAt: submittedAt,
      })),
    }
    const disclosure = homesroloJobroloDisclosure(disclosureBase)
    const disclosureDigest = homesroloJobroloSha256(disclosure)
    if (parsed.data.reviewedDisclosureDigest !== disclosureDigest) {
      throw new HomeownerApiError('conflict')
    }
    const digest = commandDigest({
      ...parsed.data,
      homeRef: grant.homeRef,
      projectRef: project.projectRef,
      canonicalEmail,
      disclosureDigest,
    })
    const submissionRef = `hsub_${randomBytes(32).toString('base64url')}`
    const reservation = await this.#persistence.reserveSubmission({
      grant,
      commandRef: parsed.data.commandRef,
      commandDigest: digest,
      submissionRef,
      projectRef: project.projectRef,
      disclosureDigest,
      disclosure,
      consentAcceptedAt: submittedAt,
    })
    if (reservation.state !== 'reserved') {
      // The exact project ref is authoritative locally; never derive it from a
      // receipt. Existing terminal states are returned below with that ref.
      return homeownerProjectReviewViewSchema.parse({
        submissionRef: reservation.submissionRef,
        projectRef: project.projectRef,
        status: reservation.state,
        submittedAt: reservation.submittedAt,
        message: reservation.state === 'awaiting_chance_review'
          ? 'Sent to Chance\u2019s private review inbox. It has not been shared with a contractor yet.'
          : 'Delivery could not be confirmed. Homesrolo must reconcile it before another attempt.',
      })
    }

    const expiresAt = new Date(
      Date.parse(submittedAt) + HOMESROLO_JOBROLO_DOWNLOAD_LIFETIME_MS,
    ).toISOString()
    let transfers: Awaited<ReturnType<HomeownerProjectReviewPersistencePort['createArtifactTransfer']>>[]
    try {
      const beforeTransferGrant = await this.#grant(context, requestedHomeRef)
      if (beforeTransferGrant.membershipRef !== grant.membershipRef
        || beforeTransferGrant.membershipRevision !== grant.membershipRevision
        || beforeTransferGrant.principalRef !== grant.principalRef) {
        throw new HomeownerApiError('not_found')
      }
      const freshArtifacts = await this.#repository.listArtifactMetadata(beforeTransferGrant)
      selected.forEach(selectedArtifact => {
        const current = freshArtifacts.find(candidate =>
          candidate.artifactRef === selectedArtifact.artifactRef)
        if (!current || current.homeRef !== grant.homeRef
          || current.projectRef !== project.projectRef
          || current.payloadSha256 !== selectedArtifact.payloadSha256
          || current.byteLength !== selectedArtifact.byteLength
          || current.mediaType !== selectedArtifact.mediaType) {
          throw new HomeownerApiError('not_found')
        }
      })
      transfers = await Promise.all(selected.map(artifact =>
        this.#persistence.createArtifactTransfer({ grant, artifact, expiresAt })))
      const beforeDeliveryGrant = await this.#grant(context, requestedHomeRef)
      if (beforeDeliveryGrant.membershipRef !== grant.membershipRef
        || beforeDeliveryGrant.membershipRevision !== grant.membershipRevision
        || beforeDeliveryGrant.principalRef !== grant.principalRef) {
        throw new HomeownerApiError('not_found')
      }
      const request = parseHomesroloJobroloProjectIntake({
        contractVersion: HOMESROLO_JOBROLO_PROJECT_INTAKE_VERSION,
        submissionRef,
        source: disclosureBase.source,
        submittedAt,
        consent: {
          version: HOMESROLO_PROJECT_REVIEW_CONSENT_VERSION,
          acceptedAt: submittedAt,
          statementDigest: homesroloJobroloSha256(HOMESROLO_PROJECT_REVIEW_CONSENT_TEXT),
          disclosureDigest,
        },
        homeowner: disclosureBase.homeowner,
        property: disclosureBase.property,
        project: disclosureBase.project,
        attachments: selected.map((artifact, index) => ({
          artifactRef: artifact.artifactRef,
          displayName: artifact.displayName,
          kind: artifact.kind,
          mediaType: artifact.mediaType,
          byteLength: artifact.byteLength,
          sha256: artifact.payloadSha256,
          downloadUrl: transfers[index]?.downloadUrl,
          downloadExpiresAt: transfers[index]?.downloadExpiresAt,
        })),
      })
      const receipt = await this.#transport.deliver(request)
      await this.#persistence.markSubmissionReceived({
        grant,
        commandRef: parsed.data.commandRef,
        commandDigest: digest,
        submissionRef,
        projectRef: project.projectRef,
        receipt,
        receivedAt: this.#now(),
      })
      return homeownerProjectReviewViewSchema.parse({
        submissionRef,
        projectRef: project.projectRef,
        status: 'awaiting_chance_review',
        submittedAt: receipt.acceptedAt,
        message: 'Sent to Chance\u2019s private review inbox. It has not been shared with a contractor yet.',
      })
    } catch {
      try {
        await this.#persistence.markSubmissionUnknown({
          grant,
          commandRef: parsed.data.commandRef,
          commandDigest: digest,
          submissionRef,
          failedAt: this.#now(),
        })
      } catch {
        // The caller still sees reconciliation_required. A failed state write
        // must never turn an uncertain external outcome into a retryable one.
      }
      return homeownerProjectReviewViewSchema.parse({
        submissionRef,
        projectRef: project.projectRef,
        status: 'reconciliation_required',
        submittedAt,
        message: 'Delivery could not be confirmed. Homesrolo must reconcile it before another attempt.',
      })
    }
  }

  async #grant(context: HomeownerApiRequestContext, homeRef: string) {
    if (!context.sessionHandle) throw new HomeownerApiError('signed_out')
    const principal = await this.#identity.resolvePrincipal(context.sessionHandle)
    if (!principal) throw new HomeownerApiError('signed_out')
    const membership = await this.#repository.readMembership(principal.principalRef, homeRef)
    if (!membership) throw new HomeownerApiError('not_found')
    const decision = authorizeHomeownerWorkspace({
      principal,
      membership,
      requestedHomeRef: homeRef,
      action: 'project.submit_for_review',
      recheckedAt: this.#now(),
    })
    if (!decision.authorized) {
      if (decision.reason === 'role_denied') throw new HomeownerApiError('forbidden')
      throw new HomeownerApiError('not_found')
    }
    const grant = requireHomeownerActionGrant(decision, 'project.submit_for_review')
    if (!grant) throw new HomeownerApiError('forbidden')
    return grant
  }
}
