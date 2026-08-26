export type HomeRelationship = 'claimed_unverified' | 'verified_controller' | 'invited_participant'

export interface Capabilities {
  readonly emailCodeSignIn: boolean
  readonly magicLinkSignIn: boolean
  readonly persistence: boolean
  readonly projectQuotes: boolean
  readonly homeResearch: boolean
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

export interface RoloReply {
  readonly requestRef: string
  readonly answer: string
  readonly proposedWork: RoloWorkDraft | null
  readonly destination: 'home' | 'rolo' | 'activity' | 'library' | 'details' | 'work' | null
  readonly projectRef: string | null
  readonly followUpQuestions: readonly string[]
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
