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
  aiAssistantImplemented: false,
  connectedToJobrolo: false,
} as const)

/** Wording every mock surface must carry so a screenshot cannot overclaim. */
export const SYNTHETIC_NOTICE =
  'Demo shell with synthetic data. Accounts, saving, uploads, and sharing are not built yet.'

// --- session ------------------------------------------------------------------

/**
 * What the server actually offers, reported by GET /api/v1/session — exactly
 * the six booleans homeowner-api.v1 defines. The synthetic adapter reports
 * all false: the demo offers no real entry and persists nothing.
 */
export interface SignInCapabilities {
  readonly magicLinkSignIn: boolean
  readonly persistence: boolean
  readonly uploads: boolean
  readonly projectReview: boolean
  readonly invitations: boolean
  readonly sharing: boolean
}

export const NO_CAPABILITIES: SignInCapabilities = Object.freeze({
  magicLinkSignIn: false,
  persistence: false,
  uploads: false,
  projectReview: false,
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

// --- projects -----------------------------------------------------------------

/** Mirrors homeownerProjectSchema.status in homeowner-runtime.v1 exactly. */
export type ProjectStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

export interface ProjectSummary {
  readonly projectRef: string
  readonly homeRef: string
  readonly title: string
  readonly trade: string
  readonly performedOn: string
  readonly status: ProjectStatus
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

export type RoofingNeed = 'repair' | 'replacement' | 'inspection' | 'storm_damage' | 'not_sure'
export type RoofingTiming = 'urgent' | 'within_30_days' | 'researching' | 'not_sure'

export interface StartRoofingProjectInput {
  readonly commandRef: string
  readonly need: RoofingNeed
  readonly timing: RoofingTiming
  readonly notes: string
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
  readonly isSynthetic: boolean
}

export type PrivateArtifactKind = 'photo' | 'document' | 'warranty'

export interface UploadPrivateArtifactInput {
  readonly commandRef: string
  readonly kind: PrivateArtifactKind
  readonly file: File
  readonly projectRef?: string
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
  | { readonly ok: false; readonly error: PortError }

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
  ): Promise<PortResult<{ readonly accepted: true }>>
  signOut(): Promise<void>

  listHomes(): Promise<PortResult<readonly HomeListEntry[]>>
  getHome(homeRef: string): Promise<PortResult<HomeViewEntry>>
  createHome(input: CreateHomeInput): Promise<PortResult<HomeListEntry>>
  recordInitialIntake(
    homeRef: string,
    input: RecordHomeIntakeInput,
  ): Promise<PortResult<RecordedHomeIntake>>

  listProjects(homeRef: string): Promise<PortResult<readonly ProjectSummary[]>>
  getProject(homeRef: string, projectRef: string): Promise<PortResult<Project>>
  addProject(homeRef: string, input: AddProjectInput): Promise<PortResult<ProjectSummary>>
  startRoofingProject(
    homeRef: string,
    input: StartRoofingProjectInput,
  ): Promise<PortResult<ProjectSummary>>

  listDocuments(homeRef: string): Promise<PortResult<readonly DocumentSummary[]>>
  uploadPrivateArtifact(
    homeRef: string,
    input: UploadPrivateArtifactInput,
  ): Promise<PortResult<DocumentSummary>>
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
