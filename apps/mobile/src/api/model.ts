export type HomeRelationship = 'claimed_unverified' | 'verified_controller' | 'invited_participant'

export interface Capabilities {
  readonly emailCodeSignIn: boolean
  readonly magicLinkSignIn: boolean
  readonly persistence: boolean
  readonly projectQuotes: boolean
  readonly homeResearch: boolean
  readonly homeAssistant: boolean
  readonly homeAssistantVision: boolean
  readonly uploads: boolean
  readonly photoCheckups: boolean
  readonly projectReview: boolean
  readonly projectReviewAttachments: boolean
  readonly homeRecordHandoffs: boolean
  readonly invitations: boolean
  readonly sharing: boolean
}

export type ServerSession =
  | {
      readonly apiVersion: 'homeowner-api.v1-draft'
      readonly kind: 'signed_out'
      readonly capabilities: Capabilities
    }
  | {
      readonly apiVersion: 'homeowner-api.v1-draft'
      readonly kind: 'signed_in'
      readonly principalRef: string
      readonly capabilities: Capabilities
    }

export interface NativeSessionCredential {
  readonly token: string
  readonly tokenType: 'Bearer'
  readonly expiresInSeconds: number
}

export interface HomeSummary {
  readonly homeRef: string
  readonly displayLabel: string
  readonly privateLocationLabel: string
  readonly relationshipLabel: HomeRelationship
}

export interface HomeView extends HomeSummary {
  readonly projectCount: number
  readonly documentCount: number
  readonly warrantyCount: number
  readonly maintenanceCount: number
  readonly updatedAt: string
}

export type WorkKind = 'project' | 'issue' | 'repair' | 'service' | 'incident'
export type WorkStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'
export type WorkCategory =
  | 'roofing'
  | 'exterior'
  | 'interior'
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'landscaping'
  | 'appliances'
  | 'pest'
  | 'pool'
  | 'new_construction'
  | 'other'

export interface WorkRecord {
  readonly projectRef: string
  readonly homeRef: string
  readonly title: string
  readonly workKind: WorkKind
  readonly category: WorkCategory
  readonly status: WorkStatus
  readonly occurredOn: string | null
  readonly summary: string
  readonly professionalLabel: string | null
  readonly revision: number
  readonly archived: boolean
  readonly archivedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export type ProjectActivityKind = 'note' | 'milestone'

/** One immutable update attached to an exact home and work record. */
export interface ProjectActivityRecord {
  readonly activityRef: string
  readonly homeRef: string
  readonly projectRef: string
  readonly kind: ProjectActivityKind
  readonly body: string
  readonly source: 'homeowner_entry'
  readonly createdAt: string
}

export interface CreateWorkInput {
  readonly commandRef: string
  readonly workKind: WorkKind
  readonly title: string
  readonly category: WorkCategory
  readonly status: WorkStatus
  readonly occurredOn?: string
  readonly summary?: string
  readonly professionalLabel?: string
  readonly initialActivity?: {
    readonly kind: 'note' | 'milestone'
    readonly body: string
  }
}

export interface UpdateWorkInput {
  readonly commandRef: string
  readonly expectedRevision: number
  readonly title?: string
  readonly workKind?: WorkKind
  readonly category?: WorkCategory
  readonly status?: WorkStatus
  readonly occurredOn?: string | null
  readonly summary?: string | null
  readonly professionalLabel?: string | null
  readonly archived?: boolean
}

export type QuoteScopeKey =
  | 'project_scope'
  | 'site_conditions'
  | 'preparation'
  | 'labor'
  | 'materials_products'
  | 'allowances'
  | 'schedule'
  | 'access_protection'
  | 'inspection_closeout'
  | 'warranty'
  | 'change_orders'
  | 'measurement'
  | 'roof_configuration'
  | 'tear_off'
  | 'decking'
  | 'underlayment'
  | 'leak_barrier'
  | 'primary_materials'
  | 'starter_and_ridge'
  | 'valleys'
  | 'flashing_transitions'
  | 'penetrations'
  | 'ventilation'
  | 'permits'
  | 'cleanup'
  | 'workmanship_warranty'
  | 'manufacturer_warranty'
  | 'payment_terms'
  | 'exclusions'

export type QuoteScopeStatus = 'included' | 'excluded' | 'allowance' | 'not_stated'

export interface QuoteScopeItem {
  readonly status: QuoteScopeStatus
  readonly detail?: string
}

export type QuoteScope = Readonly<Partial<Record<QuoteScopeKey, QuoteScopeItem>>>

export interface ProjectQuote {
  readonly quoteRef: string
  readonly homeRef: string
  readonly projectRef: string
  readonly contractorLabel: string
  readonly proposalDate: string | null
  readonly artifactRef: string | null
  readonly scope: QuoteScope
  readonly notes: string
  readonly source: 'homeowner_entry' | 'professional_submission'
  readonly professionalOrganizationRef: string | null
  readonly invitationRef: string | null
  readonly totalAmountCents: number | null
  readonly currencyCode: 'USD' | null
  readonly professionalSummary: string
  readonly proposalState: 'submitted' | 'withdrawn' | null
  readonly homeownerDecision: 'undecided' | 'shortlisted' | 'selected' | 'declined'
  readonly decisionRevision: number | null
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export type ProfessionalTrade = WorkCategory
export type ProfessionalPublicationState = 'draft' | 'published' | 'suspended'

export interface ProfessionalOrganization {
  readonly organizationRef: string
  readonly slug: string
  readonly displayName: string
  readonly legalName?: string
  readonly description?: string
  readonly publicPhone?: string
  readonly publicEmail?: string
  readonly websiteUrl?: string
  readonly logoUrl?: string
  readonly trades: readonly ProfessionalTrade[]
  readonly serviceAreas: readonly string[]
  readonly publicationState: ProfessionalPublicationState
  readonly provenance: 'company_self_reported'
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ProfessionalMembership {
  readonly membershipRef: string
  readonly organizationRef: string
  readonly role: 'owner' | 'admin' | 'member'
  readonly state: 'active' | 'revoked'
  readonly revision: number
  readonly createdAt: string
  readonly revokedAt?: string
}

export interface ProfessionalProfileWorkspace {
  readonly organizations: readonly ProfessionalOrganization[]
  readonly memberships: readonly ProfessionalMembership[]
}

export interface CreateProfessionalOrganizationInput {
  readonly commandRef: string
  readonly displayName: string
  readonly slug: string
}

export interface CreatedProfessionalOrganization {
  readonly organization: ProfessionalOrganization
  readonly membership: ProfessionalMembership
}

export interface SaveProfessionalProfileInput {
  readonly commandRef: string
  readonly organizationRef: string
  readonly expectedRevision: number
  readonly displayName: string
  readonly legalName: string | null
  readonly description: string | null
  readonly publicPhone: string | null
  readonly publicEmail: string | null
  readonly websiteUrl: string | null
  readonly logoUrl: string | null
  readonly trades: readonly ProfessionalTrade[]
  readonly serviceAreas: readonly string[]
  readonly publicationState: 'draft' | 'published'
}

export interface ProjectInvitationDisclosure {
  readonly title: string
  readonly workKind: WorkKind
  readonly category: WorkCategory
  readonly trade: string
  readonly status: WorkStatus
  readonly summary: string
  readonly selectedArtifactRefs: readonly string[]
}

export interface ProjectInvitation {
  readonly invitationRef: string
  readonly homeRef: string
  readonly projectRef: string
  readonly professionalOrganizationRef: string
  readonly status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'
  readonly message?: string
  readonly disclosure: ProjectInvitationDisclosure
  readonly expiresAt: string
  readonly revision: number
  readonly createdAt: string
  readonly respondedAt?: string
  readonly revokedAt?: string
}

export interface InviteProfessionalInput {
  readonly commandRef: string
  readonly professionalOrganizationRef: string
  readonly message?: string
  readonly selectedArtifactRefs: readonly string[]
  readonly expiresInDays: number
}

export interface RespondToProjectInvitationInput {
  readonly commandRef: string
  readonly expectedRevision: number
  readonly response: 'accepted' | 'declined'
}

export interface RevokeProjectInvitationInput {
  readonly commandRef: string
  readonly expectedRevision: number
}

export interface ProfessionalProposal {
  readonly quoteRef: string
  readonly versionRef: string
  readonly invitationRef: string
  readonly professionalOrganizationRef: string
  readonly homeRef: string
  readonly projectRef: string
  readonly contractorLabel: string
  readonly proposalDate: string
  readonly totalAmountCents?: number
  readonly currencyCode: 'USD'
  readonly summary?: string
  readonly scope: QuoteScope
  readonly state: 'submitted' | 'withdrawn'
  readonly homeownerDecision: 'undecided' | 'shortlisted' | 'selected' | 'declined'
  readonly decisionRevision: number
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SubmitProfessionalProposalInput {
  readonly commandRef: string
  readonly proposalDate: string
  readonly totalAmountCents?: number
  readonly summary?: string
  readonly scope: QuoteScope
}

export interface ReviseProfessionalProposalInput extends SubmitProfessionalProposalInput {
  readonly expectedRevision: number
}

export interface DecideProfessionalProposalInput {
  readonly commandRef: string
  readonly expectedDecisionRevision: number
  readonly decision: 'shortlisted' | 'selected' | 'declined'
}

export interface RoloTurn {
  readonly role: 'user' | 'assistant'
  readonly text: string
}

export interface RoloWorkDraft {
  readonly kind: WorkKind
  readonly title: string
  readonly category: WorkCategory
  readonly status: WorkStatus
  readonly occurredOn: string | null
  readonly summary: string
  readonly professionalLabel: string | null
  readonly firstUpdate: string | null
}

export interface RoloConversationState {
  readonly pendingWork: RoloWorkDraft | null
  readonly unansweredFollowUpQuestion: string | null
}

export interface RoloSelectedPhoto {
  readonly source: 'artifact'
  readonly artifactRef: string
  /** Consent is scoped to one assistant request and is never stored as a default. */
  readonly consentToAnalyze: true
}

export interface RoloReply {
  readonly requestRef: string
  readonly answer: string
  readonly proposedWork: RoloWorkDraft | null
  readonly destination: 'home' | 'rolo' | 'activity' | 'library' | 'details' | 'work' | null
  readonly projectRef: string | null
  readonly followUpQuestions: readonly string[]
  readonly photoReview: {
    readonly visibleObservations: readonly string[]
    readonly cannotConfirm: readonly string[]
    readonly urgency: 'routine' | 'prompt_attention' | 'urgent'
    readonly suggestedTrade: WorkCategory | null
    readonly hazardSignal:
      | 'none'
      | 'visible_fire_or_smoke'
      | 'visible_sparking_or_exposed_electrical'
      | 'water_near_electrical'
      | 'major_displacement_or_collapse'
  } | null
  readonly disclosure: string
}

export type ArtifactKind = 'photo' | 'document' | 'warranty'
export type ArtifactMediaType = 'application/pdf' | 'image/jpeg' | 'image/png'

export interface ArtifactRecord {
  readonly artifactRef: string
  readonly homeRef: string
  readonly projectRef: string | null
  readonly kind: ArtifactKind
  readonly displayName: string
  readonly mediaType: ArtifactMediaType
  readonly byteLength: number
  readonly createdAt: string
}

/** Authenticated artifact bytes. Session credentials never become part of this value or a URL. */
export interface ArtifactContent {
  readonly artifactRef: string
  readonly displayName: string
  readonly mediaType: ArtifactMediaType
  readonly byteLength: number
  readonly bytes: Uint8Array
}

export interface SignedUploadTicket {
  readonly signedUrl: string
  readonly path: string
  readonly token: string
  readonly expiresAt: string
}

export type ArtifactReservation =
  | { readonly state: 'available'; readonly artifact: ArtifactRecord }
  | {
      readonly state: 'upload_required'
      readonly artifactRef: string
      readonly upload: SignedUploadTicket
    }

export interface DeviceFile {
  readonly uri: string
  readonly name: string
  readonly mediaType: ArtifactMediaType
  readonly byteLength: number
  /** Unmarked inputs are external; only staged cache copies may be removed. */
  readonly lifecycle?: 'external-source' | 'staged-cache'
}

export interface ApiProblem {
  readonly status: number
  readonly code: string
  readonly retryAfterSeconds?: number
}
