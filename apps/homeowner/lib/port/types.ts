/**
 * THE UI DATA PORT — the single seam between this application shell and the
 * real authenticated runtime.
 *
 * FOR CODEX (integration lane): implement `HomeownerDataPort` against the real
 * authorization and data layer, then swap the provider in
 * `lib/port/provider.tsx`. Nothing else in `apps/homeowner` may talk to a
 * backend, and eslint bans fetch/XMLHttpRequest/WebSocket outside this seam,
 * so this interface is the complete integration surface.
 *
 * Decisions this file deliberately does NOT make (they are runtime authority,
 * not UI): how sign-in actually works, how sessions are stored or expired, how
 * IDs are minted, what authorization checks run per call, and how uploads or
 * sharing would ever work. Where the UI needed a shape for those, the shape is
 * minimal and named `…Input`/`…State` so the real contract can supersede it.
 *
 * Everything in the Phase 1 shell behind this port is SYNTHETIC. See
 * `synthetic.ts` for the mock adapter and `PORT_IMPLEMENTATION_STATUS` below
 * for the flags a test pins to `false` until the real runtime exists.
 */

/** What is actually implemented behind the port today. */
export const PORT_IMPLEMENTATION_STATUS = Object.freeze({
  realAuthenticationImplemented: true,
  realPersistenceImplemented: true,
  uploadsImplemented: true,
  sharingImplemented: false,
  aiAssistantImplemented: true,
  connectedToJobrolo: false,
} as const)

/** Wording every mock surface must carry so a screenshot cannot overclaim. */
export const SYNTHETIC_NOTICE =
  'This demo uses synthetic data only. It creates no account, stores nothing, uploads nothing, and shares nothing.'

// --- session ------------------------------------------------------------------

/**
 * What the server actually offers, reported by GET /api/v1/session — exactly
 * the booleans homeowner-api.v1 defines. The synthetic adapter reports
 * all false: the demo offers no real entry and persists nothing.
 */
export interface SignInCapabilities {
  readonly emailCodeSignIn: boolean
  readonly magicLinkSignIn: boolean
  readonly persistence: boolean
  readonly projectQuotes: boolean
  readonly homeResearch: boolean
  readonly homeAssistant: boolean
  /** Explicitly selected, per-request photo review through Rolo. */
  readonly homeAssistantVision: boolean
  readonly uploads: boolean
  /** Image-only, sanitized seasonal checkups; never enables generic files. */
  readonly photoCheckups: boolean
  readonly projectReview: boolean
  readonly projectReviewAttachments: boolean
  /** Signed contractor completion-record handoffs, copied only after homeowner consent. */
  readonly homeRecordHandoffs: boolean
  readonly invitations: boolean
  readonly sharing: boolean
}

export const NO_CAPABILITIES: SignInCapabilities = Object.freeze({
  emailCodeSignIn: false,
  magicLinkSignIn: false,
  persistence: false,
  projectQuotes: false,
  homeResearch: false,
  homeAssistant: false,
  homeAssistantVision: false,
  uploads: false,
  photoCheckups: false,
  projectReview: false,
  projectReviewAttachments: false,
  homeRecordHandoffs: false,
  invitations: false,
  sharing: false,
})

export type SessionState =
  | { readonly kind: 'signed_out'; readonly capabilities: SignInCapabilities }
  | {
      readonly kind: 'signed_in'
      readonly session: HomeownerSession
      readonly capabilities: SignInCapabilities
    }


export interface HomeownerSession {
  /** Opaque principal reference; hprn_ to match homeowner-runtime.v1. */
  readonly principalRef: string
  /**
   * The server session carries no display name (homeowner-api.v1 exposes only
   * the principal ref); null renders as a neutral "Signed in" label. The
   * synthetic adapter always supplies one.
   */
  readonly displayName: string | null
  /**
   * True for every record the synthetic adapter mints (tests pin this), false
   * only when a real server said so. The browser never invents real data.
   */
  readonly isSynthetic: boolean
}

// --- the home file ------------------------------------------------------------

/** homeowner-runtime.v1 membership labels, rendered verbatim as provenance. */
export type RelationshipLabel = 'claimed_unverified' | 'verified_controller' | 'invited_participant'

/**
 * The server's home summary — exactly HomeownerApiHomeSummary from
 * homeowner-api.v1, no counts, no synthetic marker, nothing guessed.
 */
export interface ServerHomeSummary {
  readonly source: 'server'
  readonly homeRef: string
  readonly displayLabel: string
  readonly privateLocationLabel: string
  readonly relationshipLabel: RelationshipLabel
}

/** The server's home view — the summary plus the counts it actually supplies. */
export interface ServerHomeView extends Omit<ServerHomeSummary, 'source'> {
  readonly source: 'server'
  readonly projectCount: number
  readonly documentCount: number
  readonly warrantyCount: number
  readonly maintenanceCount: number
  readonly updatedAt: string
}

export type HomeListEntry = ({ readonly source: 'synthetic' } & HomeSummary) | ServerHomeSummary
export type HomeViewEntry = ({ readonly source: 'synthetic' } & HomeFile) | ServerHomeView

/** One label per entry, whichever side minted it. */
export const homeLabel = (entry: HomeListEntry | HomeViewEntry): string =>
  entry.source === 'server' ? entry.displayLabel : entry.alias
export const homeLocality = (entry: HomeListEntry | HomeViewEntry): string =>
  entry.source === 'server' ? entry.privateLocationLabel : entry.locality

export interface HomeSummary {
  readonly homeRef: string
  /** A homeowner-chosen alias, never a postal address. */
  readonly alias: string
  readonly locality: string
  readonly projectCount: number
  readonly openMaintenanceCount: number
  readonly isSynthetic: boolean
}

export interface HomeFile extends HomeSummary {
  readonly yearBuilt: number | null
  readonly homeType: 'house' | 'townhouse' | 'condo' | 'other'
  /** Ledger-voice facts shown on the dashboard masthead. */
  readonly keyFacts: readonly { readonly label: string; readonly value: string }[]
}

export interface CreateHomeInput {
  /**
   * Browser-minted opaque idempotency ref (`hcmd_` + 43 base64url chars; see
   * command-ref.ts). Minted ONCE per submission attempt group and reused
   * verbatim on retries so the server can deduplicate; an edited draft is a
   * new group with a fresh ref. It carries no authority — requestedAt and
   * every membership fact are server-derived.
   */
  readonly commandRef: string
  readonly alias: string
  readonly locality: string
  /**
   * The synthetic adapter renders these in the demo. The remote create-home
   * adapter never puts them in the create command; the separate exact-home
   * intake command records the typed values after one homeRef exists.
   */
  readonly homeType: HomeFile['homeType']
  readonly yearBuilt: number | null
}

export type HomeSystemKind =
  | 'roof'
  | 'heating'
  | 'cooling'
  | 'water_heater'
  | 'gutters'
  | 'foundation'

export interface HomeownerApproximateYear {
  readonly value: number
  readonly precision: 'exact' | 'approximate'
}

export interface RecordHomeIntakeInput {
  readonly commandRef: string
  readonly homeType: 'house' | 'townhouse' | 'condo' | 'other' | 'unknown'
  readonly yearBuilt: HomeownerApproximateYear | null
  readonly systems: readonly {
    readonly kind: HomeSystemKind
    readonly present: 'yes' | 'no' | 'unknown'
    readonly installedOrReplacedYear: HomeownerApproximateYear | null
  }[]
}

export interface RecordedHomeIntake {
  readonly homeRef: string
  readonly homeType: RecordHomeIntakeInput['homeType']
  readonly yearBuilt: HomeownerApproximateYear | null
  readonly source: 'homeowner_recollection'
  readonly systems: RecordHomeIntakeInput['systems']
  readonly updatedAt: string
}

export interface HomeRecordAddress {
  readonly line1: string
  readonly line2: string | null
  readonly city: string
  readonly regionCode: string
  readonly postalCode: string
  readonly countryCode: 'US'
}

export interface HomeRecordProfile {
  readonly homeRef: string
  readonly revision: number
  readonly address: HomeRecordAddress | null
  readonly homeType: RecordHomeIntakeInput['homeType']
  readonly yearBuilt: HomeownerApproximateYear | null
  readonly systems: RecordHomeIntakeInput['systems']
  readonly source: 'homeowner_recollection'
  readonly updatedAt: string
}

export interface UpdateHomeRecordInput {
  readonly commandRef: string
  readonly expectedRevision: number
  readonly address: HomeRecordAddress
  readonly homeType: RecordHomeIntakeInput['homeType']
  readonly yearBuilt: HomeownerApproximateYear | null
  readonly systems: RecordHomeIntakeInput['systems']
}

// --- private home research ---------------------------------------------------

/**
 * Public-record fields the research assistant may propose for homeowner
 * review. A proposal is never a saved home fact and carries no authority.
 */
export type HomeResearchFactField =
  | 'year_built'
  | 'property_type'
  | 'square_footage'
  | 'lot_size'
  | 'roof'
  | 'heating'
  | 'cooling'
  | 'water_heater'
  | 'permit'
  | 'tax_record'
  | 'public_record'
  | 'other'

export interface HomeResearchTurn {
  readonly role: 'user' | 'assistant'
  readonly text: string
}

export interface HomeResearchInput {
  readonly address: string
  readonly message: string
  readonly consentToResearchThisAddressOnline: true
  readonly history: readonly HomeResearchTurn[]
}

export interface HomeResearchFact {
  readonly field: HomeResearchFactField
  readonly value: string
  readonly confidence: 'low' | 'medium' | 'high'
  readonly sourceUrls: readonly string[]
}

export interface HomeResearchSource {
  readonly title: string
  readonly url: string
}

export interface HomeResearchResult {
  readonly requestRef: string
  readonly answer: string
  readonly answerSourceUrls: readonly string[]
  readonly proposedFacts: readonly HomeResearchFact[]
  readonly sources: readonly HomeResearchSource[]
  readonly limitations: readonly string[]
  readonly followUpQuestions: readonly string[]
  readonly disclosure: 'Research is a draft. Confirm proposed facts before adding them to your home record.'
}

// --- Rolo assistant ----------------------------------------------------------

/** A short app-owned conversation turn. OpenAI is never the transcript store. */
export interface RoloAssistantTurn {
  readonly role: 'user' | 'assistant'
  readonly text: string
}

export type RoloDestination = 'home' | 'rolo' | 'activity' | 'library' | 'details' | 'work'

/**
 * A reviewable work-record draft. This deliberately maps to the existing
 * project command instead of creating a second chatbot-owned data system.
 */
export interface RoloWorkDraft {
  readonly kind: HomeownerWorkKind
  readonly title: string
  readonly category: ProjectCategory
  readonly status: ProjectStatus
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
  /** Per-request consent; it is never persisted as a blanket permission. */
  readonly consentToAnalyze: true
}

export interface RoloPhotoReview {
  readonly visibleObservations: readonly string[]
  readonly cannotConfirm: readonly string[]
  readonly urgency: 'routine' | 'prompt_attention' | 'urgent'
  readonly suggestedTrade: ProjectCategory | null
  readonly hazardSignal:
    | 'none'
    | 'visible_fire_or_smoke'
    | 'visible_sparking_or_exposed_electrical'
    | 'water_near_electrical'
    | 'major_displacement_or_collapse'
}

export interface AskRoloInput {
  readonly message: string
  readonly history: readonly RoloAssistantTurn[]
  readonly conversation: RoloConversationState
  readonly destination: Exclude<RoloDestination, 'work'>
  readonly projectRef?: string
  readonly selectedPhoto?: RoloSelectedPhoto
}

export interface AskRoloResult {
  readonly requestRef: string
  readonly answer: string
  readonly proposedWork: RoloWorkDraft | null
  readonly destination: RoloDestination | null
  readonly projectRef: string | null
  readonly followUpQuestions: readonly string[]
  readonly photoReview: RoloPhotoReview | null
  readonly disclosure: 'Nothing is saved until you review and approve it.'
}

// --- projects -----------------------------------------------------------------

/** Mirrors homeownerProjectSchema.status in homeowner-runtime.v1 exactly. */
export type ProjectStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

/** One durable work record model, with a homeowner-readable discriminator. */
export type HomeownerWorkKind = 'project' | 'issue' | 'repair' | 'service' | 'incident'

export type ProjectCategory =
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

export interface ProjectSummary {
  readonly projectRef: string
  readonly homeRef: string
  readonly title: string
  readonly workKind: HomeownerWorkKind
  readonly category: ProjectCategory
  readonly trade: string
  /** Exact work date supplied by the homeowner, or null when it is not known. */
  readonly performedOn: string | null
  readonly status: ProjectStatus
  readonly professionalLabel: string
  readonly revision: number
  readonly archived: boolean
  readonly archivedAt: string | null
  readonly photoCount: number
  readonly documentCount: number
  readonly isSynthetic: boolean
}

export interface Project extends ProjectSummary {
  readonly summary: string
  readonly contractor: string
  readonly materials: readonly { readonly label: string; readonly value: string }[]
  readonly photos: readonly ProjectPhoto[]
  readonly documents: readonly DocumentSummary[]
  readonly warranty: Warranty | null
}

export interface ProjectPhoto {
  readonly photoRef: string
  readonly caption: string
  /** Drawn placeholder kind; the shell renders code-native art, never files. */
  readonly art: 'roof' | 'gutter' | 'window' | 'interior' | 'exterior'
  readonly takenOn: string
  readonly isSynthetic: boolean
}

export interface AddProjectInput {
  readonly title: string
  readonly trade: string
  readonly performedOn: string
  readonly contractor: string
  readonly summary: string
}

/**
 * One bounded record for planned, active, or historical work on the home.
 * The browser supplies no principal, membership, provider, or storage fields.
 */
export interface CreateProjectInput {
  readonly commandRef: string
  readonly title: string
  /** Omitted by older callers; the server canonicalizes omission to project. */
  readonly workKind?: HomeownerWorkKind
  readonly category: ProjectCategory
  readonly status: ProjectStatus
  readonly occurredOn?: string
  readonly summary: string
}

export interface UpdateProjectInput {
  readonly commandRef: string
  readonly expectedRevision: number
  readonly title?: string
  readonly workKind?: HomeownerWorkKind
  readonly category?: ProjectCategory
  readonly status?: ProjectStatus
  /** Null clears the known work date; omission preserves it. */
  readonly occurredOn?: string | null
  /** Null or an empty string clears homeowner-entered notes. */
  readonly summary?: string | null
  /** Null clears the homeowner-entered professional/company label. */
  readonly professionalLabel?: string | null
  readonly archived?: boolean
}

export type ProjectActivityKind = 'note' | 'milestone'

export interface ProjectActivity {
  readonly activityRef: string
  readonly homeRef: string
  readonly projectRef: string
  readonly kind: ProjectActivityKind
  readonly body: string
  readonly source: 'homeowner_entry'
  readonly createdAt: string
}

export interface AddProjectActivityInput {
  readonly commandRef: string
  readonly kind: ProjectActivityKind
  readonly body: string
}

export type ProjectItemKind = 'material' | 'decision' | 'wishlist'
export type ProjectItemState = 'considering' | 'chosen' | 'purchased' | 'declined'

export interface ProjectItem {
  readonly itemRef: string
  readonly homeRef: string
  readonly projectRef: string
  readonly kind: ProjectItemKind
  readonly label: string
  readonly detail: string
  readonly state: ProjectItemState
  readonly source: 'homeowner_entry'
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface SaveProjectItemInput {
  readonly commandRef: string
  readonly itemRef?: string
  readonly expectedRevision?: number
  readonly kind: ProjectItemKind
  readonly label: string
  readonly detail?: string
  readonly state: ProjectItemState
}

export type RoofingNeed = 'repair' | 'replacement' | 'inspection' | 'storm_damage' | 'not_sure'
export type RoofingTiming = 'urgent' | 'within_30_days' | 'researching' | 'not_sure'

export interface StartRoofingProjectInput {
  readonly commandRef: string
  readonly need: RoofingNeed
  readonly timing: RoofingTiming
  readonly notes: string
}

export type QuoteScopeKey =
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
  readonly source: 'homeowner_entry'
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateProjectQuoteInput {
  readonly commandRef: string
  readonly contractorLabel: string
  readonly proposalDate?: string
  readonly artifactRef?: string
  readonly scope: QuoteScope
  readonly notes?: string
}

export interface SaveProjectQuoteInput extends CreateProjectQuoteInput {
  readonly expectedRevision: number
}

// --- documents and warranties -------------------------------------------------

export type DocumentKind = 'document' | 'contract' | 'invoice' | 'warranty' | 'photo_set' | 'permit' | 'manual'

export interface DocumentSummary {
  readonly documentRef: string
  readonly homeRef: string
  readonly projectRef: string | null
  readonly title: string
  readonly kind: DocumentKind
  readonly addedOn: string
  readonly pages: number
  readonly mediaType?: 'application/pdf' | 'image/jpeg' | 'image/png'
  readonly byteLength?: number
  readonly downloadHref?: string
  readonly previewHref?: string
  readonly isSynthetic: boolean
}

export type PrivateArtifactKind = 'photo' | 'document' | 'warranty'

export interface UploadPrivateArtifactInput {
  readonly commandRef: string
  readonly kind: PrivateArtifactKind
  readonly file: File
  readonly projectRef?: string
}

export type HomeRecordHandoffState =
  | 'received'
  | 'accepting'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'quarantined'
  | 'reconciliation_required'

export type HomeRecordHandoffProjectionKind = 'work_completion_record'

export const HOME_RECORD_HANDOFF_ACCEPTANCE_TEXT =
  'I accept this contractor-issued project completion record into this private Home Record. Homesrolo will copy this exact PDF into its own private storage.' as const

export interface HomeRecordHandoffItem {
  readonly artifactRef: string
  readonly projectionKind: HomeRecordHandoffProjectionKind
  readonly label: 'Project completion record'
  readonly mediaType: 'application/pdf'
  readonly byteLength: number
  readonly decision: 'pending' | 'accepted' | 'rejected'
  readonly copyState: 'not_started' | 'staged_clean' | 'available' | 'quarantined'
  readonly homeownerArtifactRef?: string
}

/** Browser-safe view: no provider IDs, storage keys, address, or recipient binding. */
export interface HomeRecordHandoffPreview {
  readonly handoffRef: string
  readonly shareId: string
  readonly state: HomeRecordHandoffState
  readonly receivedAt: string
  readonly expiresAt: string
  readonly previewDigest: string
  readonly acceptanceText: string
  readonly items: readonly HomeRecordHandoffItem[]
}

export interface AcceptHomeRecordHandoffInput {
  readonly commandRef: string
  readonly reviewedPreviewDigest: string
  readonly selectedArtifactRefs: readonly [string]
  readonly consentAccepted: true
}

export interface RejectHomeRecordHandoffInput {
  readonly commandRef: string
  readonly reviewedPreviewDigest: string
}

/** Fixed, repeatable views make like-for-like seasonal comparison possible. */
export type PhotoCheckupArea =
  | 'front_exterior'
  | 'rear_exterior'
  | 'roofline'
  | 'attic'
  | 'ceilings'
  | 'hvac'
  | 'water_heater'
  | 'foundation'
  | 'gutters'
  | 'other'

export interface PhotoCheckup {
  readonly photoRef: string
  readonly homeRef: string
  readonly observedOn: string
  readonly area: PhotoCheckupArea
  /** Homeowner-named repeatable spot within an area, such as Hall ceiling by vent. */
  readonly viewLabel: string
  /** Homeowner-written factual context; an empty string means none recorded. */
  readonly caption: string
  /** Same-origin, exact-home routes derived and verified by the client decoder. */
  readonly fullUrl: string
  readonly thumbnailUrl: string
  readonly width: number
  readonly height: number
  readonly createdAt: string
}

export interface UploadPhotoCheckupInput {
  readonly commandRef: string
  readonly observedOn: string
  readonly area: PhotoCheckupArea
  readonly viewLabel: string
  readonly caption: string
  /** The same File object is retained across retries of one attempt group. */
  readonly file: File
}

export interface DeletedPhotoCheckup {
  readonly photoRef: string
  readonly state: 'deleted'
}

export interface SubmitProjectForReviewInput {
  readonly commandRef: string
  readonly reviewedDisclosureDigest: string
  readonly name: string
  readonly phone?: string
  readonly preferredContact: 'email' | 'phone' | 'text'
  readonly selectedArtifactRefs: readonly string[]
  readonly consentAccepted: true
}

export interface PreviewProjectForReviewInput {
  readonly name: string
  readonly phone?: string
  readonly preferredContact: 'email' | 'phone' | 'text'
  readonly selectedArtifactRefs: readonly string[]
}

export interface ProjectReviewPreview {
  readonly projectRef: string
  readonly disclosureDigest: string
  readonly homeowner: {
    readonly name: string
    readonly email: string
    readonly phone?: string
    readonly preferredContact: 'email' | 'phone' | 'text'
  }
  readonly property: { readonly label: string }
  readonly project: {
    readonly title: string
    readonly category: 'roofing'
    readonly status: ProjectStatus
    readonly summary: string
  }
  readonly attachments: readonly {
    readonly artifactRef: string
    readonly displayName: string
    readonly kind: PrivateArtifactKind
    readonly mediaType: 'application/pdf' | 'image/jpeg' | 'image/png'
    readonly byteLength: number
  }[]
  readonly consentText: string
}

export interface ProjectReviewSubmission {
  readonly submissionRef: string
  readonly projectRef: string
  readonly status: 'awaiting_chance_review' | 'reconciliation_required'
  readonly submittedAt: string
  readonly message: string
}

export interface Warranty {
  readonly warrantyRef: string
  readonly homeRef: string
  readonly projectRef: string | null
  readonly coverage: string
  readonly issuedBy: string
  readonly startsOn: string
  readonly endsOn: string
  readonly isSynthetic: boolean
}

// --- timeline -----------------------------------------------------------------

export type TimelineEntryKind = 'project' | 'document' | 'warranty' | 'maintenance' | 'home'

export interface TimelineEntry {
  readonly entryRef: string
  readonly homeRef: string
  readonly kind: TimelineEntryKind
  readonly on: string
  readonly title: string
  readonly detail: string
  /** Route the entry links to inside the app, or null for a plain record. */
  readonly href: string | null
  readonly isSynthetic: boolean
}

export interface MaintenanceItem {
  readonly itemRef: string
  readonly homeRef: string
  readonly title: string
  readonly cadence: string
  readonly dueInSeason: string
  readonly state: 'upcoming' | 'done'
  readonly isSynthetic: boolean
}

// --- the port -----------------------------------------------------------------

/**
 * Every way a port call can fail, as values. The remote adapter maps HTTP onto
 * exactly these: 401 not_signed_in, 403 forbidden, 404 not_found, 409 conflict,
 * 422 invalid, 429 rate_limited, network and 5xx unavailable.
 */
export type PortError =
  | 'not_found'
  | 'not_signed_in'
  | 'forbidden'
  | 'conflict'
  | 'invalid'
  | 'rate_limited'
  | 'unavailable'

export type PortResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PortError; readonly retryAfterSeconds?: number }

export interface HomeownerDataPort {
  getSession(): Promise<SessionState>
  /**
   * MOCK-ONLY ENTRY. The real port replaces this with an actual sign-in flow;
   * the UI treats the returned session as opaque either way.
   */
  enterDemoSession(displayName: string): Promise<HomeownerSession>
  /**
   * Ask the server to email a sign-in link. Only offered by the UI when the
   * session capabilities report it live. Acceptance is generic on purpose: the
   * result never reveals whether the address exists.
   */
  requestMagicLink(
    email: string,
    intent?: RoofingNeed | null,
    handoff?: string | null,
  ): Promise<PortResult<{ readonly accepted: true }>>
  /** Ask the server for a six-digit code; acceptance never reveals account state. */
  requestEmailCode(email: string): Promise<PortResult<{ readonly accepted: true }>>
  /** Verify a code server-side and establish the opaque session in this browser. */
  verifyEmailCode(
    email: string,
    code: string,
    intent?: RoofingNeed | null,
    handoff?: string | null,
  ): Promise<PortResult<{ readonly signedIn: true }>>
  signOut(): Promise<void>

  listHomes(): Promise<PortResult<readonly HomeListEntry[]>>
  getHome(homeRef: string): Promise<PortResult<HomeViewEntry>>
  getHomeRecord(homeRef: string): Promise<PortResult<HomeRecordProfile>>
  createHome(input: CreateHomeInput): Promise<PortResult<HomeListEntry>>
  recordInitialIntake(
    homeRef: string,
    input: RecordHomeIntakeInput,
  ): Promise<PortResult<RecordedHomeIntake>>
  updateHomeRecord(
    homeRef: string,
    input: UpdateHomeRecordInput,
  ): Promise<PortResult<HomeRecordProfile>>
  researchHome(
    homeRef: string,
    input: HomeResearchInput,
  ): Promise<PortResult<HomeResearchResult>>
  askRolo(homeRef: string, input: AskRoloInput): Promise<PortResult<AskRoloResult>>

  listProjects(homeRef: string): Promise<PortResult<readonly ProjectSummary[]>>
  getProject(homeRef: string, projectRef: string): Promise<PortResult<Project>>
  addProject(homeRef: string, input: AddProjectInput): Promise<PortResult<ProjectSummary>>
  createProject(
    homeRef: string,
    input: CreateProjectInput,
  ): Promise<PortResult<ProjectSummary>>
  updateProject(
    homeRef: string,
    projectRef: string,
    input: UpdateProjectInput,
  ): Promise<PortResult<Project>>
  listProjectActivity(
    homeRef: string,
    projectRef: string,
  ): Promise<PortResult<readonly ProjectActivity[]>>
  addProjectActivity(
    homeRef: string,
    projectRef: string,
    input: AddProjectActivityInput,
  ): Promise<PortResult<ProjectActivity>>
  listProjectItems(
    homeRef: string,
    projectRef: string,
  ): Promise<PortResult<readonly ProjectItem[]>>
  saveProjectItem(
    homeRef: string,
    projectRef: string,
    input: SaveProjectItemInput,
  ): Promise<PortResult<ProjectItem>>
  startRoofingProject(
    homeRef: string,
    input: StartRoofingProjectInput,
  ): Promise<PortResult<ProjectSummary>>
  listProjectQuotes(
    homeRef: string,
    projectRef: string,
  ): Promise<PortResult<readonly ProjectQuote[]>>
  createProjectQuote(
    homeRef: string,
    projectRef: string,
    input: CreateProjectQuoteInput,
  ): Promise<PortResult<ProjectQuote>>
  saveProjectQuote(
    homeRef: string,
    projectRef: string,
    quoteRef: string,
    input: SaveProjectQuoteInput,
  ): Promise<PortResult<ProjectQuote>>

  listDocuments(homeRef: string): Promise<PortResult<readonly DocumentSummary[]>>
  uploadPrivateArtifact(
    homeRef: string,
    input: UploadPrivateArtifactInput,
  ): Promise<PortResult<DocumentSummary>>
  listHomeRecordHandoffs(
    homeRef: string,
  ): Promise<PortResult<readonly HomeRecordHandoffPreview[]>>
  claimHomeRecordHandoff(
    homeRef: string,
    shareId: string,
  ): Promise<PortResult<HomeRecordHandoffPreview>>
  previewHomeRecordHandoff(
    homeRef: string,
    shareId: string,
  ): Promise<PortResult<HomeRecordHandoffPreview>>
  acceptHomeRecordHandoff(
    homeRef: string,
    shareId: string,
    input: AcceptHomeRecordHandoffInput,
  ): Promise<PortResult<HomeRecordHandoffPreview>>
  rejectHomeRecordHandoff(
    homeRef: string,
    shareId: string,
    input: RejectHomeRecordHandoffInput,
  ): Promise<PortResult<HomeRecordHandoffPreview>>
  listPhotoCheckups(
    homeRef: string,
  ): Promise<PortResult<readonly PhotoCheckup[]>>
  uploadPhotoCheckup(
    homeRef: string,
    input: UploadPhotoCheckupInput,
  ): Promise<PortResult<PhotoCheckup>>
  deletePhotoCheckup(
    homeRef: string,
    photoRef: string,
  ): Promise<PortResult<DeletedPhotoCheckup>>
  previewProjectForReview(
    homeRef: string,
    projectRef: string,
    input: PreviewProjectForReviewInput,
  ): Promise<PortResult<ProjectReviewPreview>>
  submitProjectForReview(
    homeRef: string,
    projectRef: string,
    input: SubmitProjectForReviewInput,
  ): Promise<PortResult<ProjectReviewSubmission>>
  listWarranties(homeRef: string): Promise<PortResult<readonly Warranty[]>>
  listTimeline(homeRef: string): Promise<PortResult<readonly TimelineEntry[]>>
  listMaintenance(homeRef: string): Promise<PortResult<readonly MaintenanceItem[]>>
}
