import type { HomesroloApi } from '../api/contract.ts'
import type {
  ArtifactKind,
  ArtifactRecord,
  CreateWorkInput,
  DeviceFile,
  HomeSummary,
  HomeView,
  NativeSessionCredential,
  RoloConversationState,
  RoloReply,
  RoloSelectedPhoto,
  RoloTurn,
  ServerSession,
  UpdateWorkInput,
  WorkRecord,
} from '../api/model.ts'
import { normalizedRoloSelectedPhoto } from '../api/protocol.ts'

const FIXTURE_NOW = '2026-08-26T14:30:00.000Z'

function fixtureRef(prefix: 'hhom' | 'hprj' | 'hart' | 'hcmd' | 'hask', number: number): string {
  return `${prefix}_${`homesrolo-preview-${number}`.padEnd(43, '0').slice(0, 43)}`
}

export const PREVIEW_PRIMARY_HOME_REF = fixtureRef('hhom', 1)
const PREVIEW_SECONDARY_HOME_REF = fixtureRef('hhom', 2)

const PREVIEW_CAPABILITIES = Object.freeze({
  emailCodeSignIn: true,
  magicLinkSignIn: false,
  persistence: true,
  projectQuotes: true,
  homeResearch: true,
  homeAssistant: true,
  homeAssistantVision: true,
  uploads: false,
  photoCheckups: true,
  projectReview: true,
  projectReviewAttachments: true,
  homeRecordHandoffs: true,
  invitations: true,
  sharing: true,
})

export const PREVIEW_SIGNED_IN_SESSION: Extract<ServerSession, { kind: 'signed_in' }> = Object.freeze({
  apiVersion: 'homeowner-api.v1-draft',
  kind: 'signed_in',
  principalRef: fixtureRef('hprj', 999).replace('hprj_', 'hprn_'),
  capabilities: PREVIEW_CAPABILITIES,
})

export const PREVIEW_UPLOAD_NOTICE = 'Preview mode stopped here. No file was selected or uploaded.'

const HOMES: readonly HomeSummary[] = Object.freeze([
  Object.freeze({
    homeRef: PREVIEW_PRIMARY_HOME_REF,
    displayLabel: 'Cedar Ridge Home',
    privateLocationLabel: '1427 Cedar Ridge Lane · Dallas, TX',
    relationshipLabel: 'verified_controller',
  }),
  Object.freeze({
    homeRef: PREVIEW_SECONDARY_HOME_REF,
    displayLabel: 'Lake cabin',
    privateLocationLabel: 'Possum Kingdom Lake · Graford, TX',
    relationshipLabel: 'invited_participant',
  }),
])

function work(
  number: number,
  homeRef: string,
  values: Pick<WorkRecord,
    'title' | 'workKind' | 'category' | 'status' | 'occurredOn' | 'summary' | 'professionalLabel'>,
): WorkRecord {
  return {
    projectRef: fixtureRef('hprj', number),
    homeRef,
    ...values,
    revision: 1,
    archived: false,
    archivedAt: null,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  }
}

const PRIMARY_WORK: readonly WorkRecord[] = Object.freeze([
  work(1, PREVIEW_PRIMARY_HOME_REF, {
    title: 'Upstairs AC seasonal service',
    workKind: 'service',
    category: 'hvac',
    status: 'completed',
    occurredOn: '2026-05-18',
    summary: 'Cleaned the outdoor coil, replaced the return filter, and recorded a 19°F supply-air split.',
    professionalLabel: 'North Texas Air',
  }),
  work(2, PREVIEW_PRIMARY_HOME_REF, {
    title: 'Watch flashing above the garage',
    workKind: 'issue',
    category: 'roofing',
    status: 'planned',
    occurredOn: '2026-08-09',
    summary: 'Home Watch photo shows lifted sealant near the sidewall. No interior moisture observed.',
    professionalLabel: 'ClearSky Roofing',
  }),
  work(3, PREVIEW_PRIMARY_HOME_REF, {
    title: 'Water heater replacement',
    workKind: 'repair',
    category: 'plumbing',
    status: 'completed',
    occurredOn: '2025-11-04',
    summary: 'Replaced the 50-gallon unit and saved the invoice, model number, and warranty.',
    professionalLabel: 'Oak & Pipe Plumbing',
  }),
  work(4, PREVIEW_PRIMARY_HOME_REF, {
    title: 'Electrical panel labeling',
    workKind: 'project',
    category: 'electrical',
    status: 'completed',
    occurredOn: '2026-02-12',
    summary: 'Electrician traced the remaining circuits and installed a clean panel schedule.',
    professionalLabel: 'Brightline Electric',
  }),
  work(5, PREVIEW_PRIMARY_HOME_REF, {
    title: 'Quarterly pest service',
    workKind: 'service',
    category: 'pest',
    status: 'in_progress',
    occurredOn: '2026-08-21',
    summary: 'Exterior treatment completed. Technician will recheck ant activity by the patio.',
    professionalLabel: 'Juniper Pest Care',
  }),
  work(6, PREVIEW_PRIMARY_HOME_REF, {
    title: 'Improve patio drainage',
    workKind: 'repair',
    category: 'landscaping',
    status: 'planned',
    occurredOn: null,
    summary: 'Water lingers near the back step after heavy rain. Compare grading and drain options.',
    professionalLabel: null,
  }),
])

const SECONDARY_WORK: readonly WorkRecord[] = Object.freeze([
  work(20, PREVIEW_SECONDARY_HOME_REF, {
    title: 'Dock stain and fastener check',
    workKind: 'service',
    category: 'exterior',
    status: 'planned',
    occurredOn: '2026-09-15',
    summary: 'Seasonal lake-house checklist item.',
    professionalLabel: 'Brazos Lake Services',
  }),
  work(21, PREVIEW_SECONDARY_HOME_REF, {
    title: 'Replace kitchen faucet',
    workKind: 'repair',
    category: 'plumbing',
    status: 'completed',
    occurredOn: '2026-03-02',
    summary: 'Saved the fixture model for replacement parts.',
    professionalLabel: 'Oak & Pipe Plumbing',
  }),
])

function artifact(
  number: number,
  values: Omit<ArtifactRecord, 'artifactRef' | 'homeRef' | 'createdAt'>,
): ArtifactRecord {
  return {
    artifactRef: fixtureRef('hart', number),
    homeRef: PREVIEW_PRIMARY_HOME_REF,
    ...values,
    createdAt: FIXTURE_NOW,
  }
}

const PRIMARY_ARTIFACTS: readonly ArtifactRecord[] = Object.freeze([
  artifact(1, {
    projectRef: fixtureRef('hprj', 2),
    kind: 'photo',
    displayName: 'August Home Watch · garage roofline.jpg',
    mediaType: 'image/jpeg',
    byteLength: 248_320,
  }),
  artifact(2, {
    projectRef: null,
    kind: 'photo',
    displayName: 'North exterior · summer reference.jpg',
    mediaType: 'image/jpeg',
    byteLength: 312_874,
  }),
  artifact(3, {
    projectRef: fixtureRef('hprj', 2),
    kind: 'document',
    displayName: 'Roof condition notes.pdf',
    mediaType: 'application/pdf',
    byteLength: 184_220,
  }),
  artifact(4, {
    projectRef: fixtureRef('hprj', 3),
    kind: 'warranty',
    displayName: 'Water heater warranty.pdf',
    mediaType: 'application/pdf',
    byteLength: 96_440,
  }),
])

const PHOTO_SVG = encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="760" height="580" viewBox="0 0 760 580">
    <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#5ed1e6"/><stop offset="1" stop-color="#d7f2e5"/></linearGradient></defs>
    <rect width="760" height="580" fill="url(#sky)"/>
    <rect y="430" width="760" height="150" fill="#315a3c"/>
    <path d="M95 300 380 105 665 300v230H95z" fill="#f5f2e8"/>
    <path d="M65 315 380 82l315 233-38 45-277-202-277 202z" fill="#163746"/>
    <rect x="160" y="330" width="145" height="200" fill="#245064"/>
    <rect x="450" y="335" width="120" height="105" rx="8" fill="#5ed1e6"/>
    <circle cx="380" cy="210" r="28" fill="#c9ff31"/>
  </svg>
`)
const PHOTO_URI = `data:image/svg+xml;charset=utf-8,${PHOTO_SVG}`

function cloneHome(home: HomeSummary): HomeSummary { return { ...home } }
function cloneWork(item: WorkRecord): WorkRecord { return { ...item } }
function cloneArtifact(item: ArtifactRecord): ArtifactRecord { return { ...item } }

/** A deterministic, memory-only API. It has no transport and cannot upload. */
export class PreviewHomesroloApi implements HomesroloApi {
  readonly #homes = HOMES.map(cloneHome)
  readonly #work = new Map<string, WorkRecord[]>([
    [PREVIEW_PRIMARY_HOME_REF, PRIMARY_WORK.map(cloneWork)],
    [PREVIEW_SECONDARY_HOME_REF, SECONDARY_WORK.map(cloneWork)],
  ])
  readonly #artifacts = new Map<string, ArtifactRecord[]>([
    [PREVIEW_PRIMARY_HOME_REF, PRIMARY_ARTIFACTS.map(cloneArtifact)],
    [PREVIEW_SECONDARY_HOME_REF, []],
  ])
  #signedIn = true
  #sequence = 100

  async newCommandRef(): Promise<string> {
    this.#sequence += 1
    return fixtureRef('hcmd', this.#sequence)
  }

  async requestEmailCode(email: string): Promise<void> {
    if (!email.trim().includes('@')) throw new Error('invalid_email')
  }

  async verifyEmailCode(email: string, code: string): Promise<NativeSessionCredential> {
    if (!email.trim().includes('@') || !/^\d{6}$/.test(code)) throw new Error('invalid_code')
    this.#signedIn = true
    return { token: 'preview_session_local_only_123456', tokenType: 'Bearer', expiresInSeconds: 3_600 }
  }

  async session(): Promise<ServerSession> {
    return this.#signedIn
      ? PREVIEW_SIGNED_IN_SESSION
      : { apiVersion: 'homeowner-api.v1-draft', kind: 'signed_out', capabilities: PREVIEW_CAPABILITIES }
  }

  async signOut(): Promise<void> { this.#signedIn = false }

  async listHomes(): Promise<readonly HomeSummary[]> {
    this.#assertSignedIn()
    return this.#homes.map(cloneHome)
  }

  async createHome(displayLabel: string, privateLocationLabel: string): Promise<HomeSummary> {
    this.#assertSignedIn()
    this.#sequence += 1
    const created: HomeSummary = {
      homeRef: fixtureRef('hhom', this.#sequence),
      displayLabel: displayLabel.trim(),
      privateLocationLabel: privateLocationLabel.trim(),
      relationshipLabel: 'claimed_unverified',
    }
    this.#homes.push(created)
    this.#work.set(created.homeRef, [])
    this.#artifacts.set(created.homeRef, [])
    return cloneHome(created)
  }

  async getHome(homeRef: string): Promise<HomeView> {
    this.#assertSignedIn()
    const home = this.#home(homeRef)
    const records = this.#work.get(homeRef) ?? []
    const artifacts = this.#artifacts.get(homeRef) ?? []
    return {
      ...cloneHome(home),
      projectCount: records.filter(item => item.workKind === 'project').length,
      documentCount: artifacts.filter(item => item.kind === 'document').length,
      warrantyCount: artifacts.filter(item => item.kind === 'warranty').length,
      maintenanceCount: records.filter(item => ['service', 'repair'].includes(item.workKind)).length,
      updatedAt: FIXTURE_NOW,
    }
  }

  async listWork(homeRef: string): Promise<readonly WorkRecord[]> {
    this.#assertSignedIn()
    this.#home(homeRef)
    return (this.#work.get(homeRef) ?? []).map(cloneWork)
  }

  async createWork(homeRef: string, input: CreateWorkInput): Promise<WorkRecord> {
    this.#assertSignedIn()
    this.#home(homeRef)
    this.#sequence += 1
    const created = work(this.#sequence, homeRef, {
      title: input.title.trim(),
      workKind: input.workKind,
      category: input.category,
      status: input.status,
      occurredOn: input.occurredOn ?? null,
      summary: input.summary ?? '',
      professionalLabel: input.professionalLabel ?? null,
    })
    this.#work.get(homeRef)?.unshift(created)
    return cloneWork(created)
  }

  async updateWork(homeRef: string, projectRef: string, input: UpdateWorkInput): Promise<WorkRecord> {
    this.#assertSignedIn()
    const records = this.#work.get(homeRef) ?? []
    const index = records.findIndex(item => item.projectRef === projectRef)
    const current = records[index]
    if (!current) throw new Error('preview_work_not_found')
    const archived = input.archived ?? current.archived
    const updated: WorkRecord = {
      ...current,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.workKind === undefined ? {} : { workKind: input.workKind }),
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.occurredOn === undefined ? {} : { occurredOn: input.occurredOn }),
      ...(input.summary === undefined ? {} : { summary: input.summary ?? '' }),
      ...(input.professionalLabel === undefined ? {} : { professionalLabel: input.professionalLabel }),
      archived,
      archivedAt: archived ? FIXTURE_NOW : null,
      revision: current.revision + 1,
      updatedAt: FIXTURE_NOW,
    }
    records[index] = updated
    return cloneWork(updated)
  }

  async addWorkNote(
    homeRef: string,
    projectRef: string,
    body: string,
    commandRef?: string,
  ): Promise<void> {
    void commandRef
    const records = this.#work.get(homeRef) ?? []
    const index = records.findIndex(item => item.projectRef === projectRef)
    const current = records[index]
    if (!current) throw new Error('preview_work_not_found')
    records[index] = {
      ...current,
      summary: [current.summary, body.trim()].filter(Boolean).join('\n\n'),
      revision: current.revision + 1,
      updatedAt: FIXTURE_NOW,
    }
  }

  async askRolo(
    homeRef: string,
    message: string,
    history: readonly RoloTurn[],
    conversation: RoloConversationState,
    selectedPhoto?: RoloSelectedPhoto,
  ): Promise<RoloReply> {
    this.#assertSignedIn()
    this.#home(homeRef)
    const clean = message.trim()
    if (!clean) throw new Error('invalid_rolo_message')
    const photoSelection = selectedPhoto === undefined
      ? null
      : normalizedRoloSelectedPhoto(selectedPhoto)
    if (selectedPhoto !== undefined && !photoSelection) throw new Error('invalid_rolo_photo')
    const selectedArtifact = photoSelection
      ? (this.#artifacts.get(homeRef) ?? []).find(item => (
          item.artifactRef === photoSelection.artifactRef && item.kind === 'photo'
        )) ?? null
      : null
    if (photoSelection && !selectedArtifact) throw new Error('preview_artifact_not_found')
    this.#sequence += 1

    const boundaryRefusal = /decide (?:my )?insurance|coverage decision|legal advice/i.test(clean)
    const homeWatch = /home watch|checkup|season/i.test(clean)
    const cooling = /\bac\b|air condition|cool/i.test(clean)
      || conversation.pendingWork?.category === 'hvac'
      || history.some(turn => /\bac\b|air condition|cool/i.test(turn.text))
    const proposedWork: RoloReply['proposedWork'] = boundaryRefusal
      ? null
      : homeWatch
      ? {
          kind: 'service',
          title: 'Seasonal Home Watch checkup',
          category: 'other',
          status: 'planned',
          occurredOn: null,
          summary: 'Walk the exterior, roofline, plumbing fixtures, HVAC filters, safety devices, and visible electrical areas; save comparable photos and observations.',
          professionalLabel: null,
          firstUpdate: 'Started from the Rolo preview checkup guide.',
        }
      : conversation.pendingWork
        ? {
            ...conversation.pendingWork,
            summary: `${conversation.pendingWork.summary} Follow-up: ${clean.slice(0, 240)}`.trim(),
          }
        : {
          kind: cooling ? 'issue' : 'repair',
          title: cooling ? 'Upstairs AC is not cooling' : 'Follow up on the home concern',
          category: cooling ? 'hvac' : 'other',
          status: 'planned',
          occurredOn: '2026-08-26',
          summary: cooling
            ? 'Homeowner noticed reduced cooling upstairs. Check the thermostat, filter, vents, and outdoor-unit clearance without opening energized equipment.'
            : `Preview draft based on: ${clean.slice(0, 240)}`,
          professionalLabel: null,
          firstUpdate: 'Rolo organized this as a reviewable draft; nothing has been saved yet.',
        }

    return {
      requestRef: fixtureRef('hask', this.#sequence),
      answer: boundaryRefusal
        ? 'I cannot decide insurance coverage or provide legal advice. I did not open the attached photo. I can help you organize the facts and questions for a licensed professional.'
        : selectedArtifact
        ? 'I can describe what is visible in this one photo, but I cannot confirm hidden damage or diagnose the cause from an image alone. The exterior and roofline are visible, with no urgent hazard signal in this sample.'
        : homeWatch
          ? 'Start with a calm, repeatable walk-through. Compare the same views each season, note only what you can safely observe, and call a qualified professional for anything energized, leaking, unstable, or unsafe.'
          : cooling
            ? 'You can safely confirm the thermostat mode and set point, look at the filter, make sure supply vents are open, and check that the outdoor unit is not blocked. Do not open electrical panels or equipment covers. I made a draft you can review.'
            : 'I organized that into a reviewable Work draft. You can approve it, discard it, or keep talking before anything is saved.',
      proposedWork,
      destination: boundaryRefusal ? null : 'work',
      projectRef: null,
      followUpQuestions: boundaryRefusal || conversation.unansweredFollowUpQuestion
        ? []
        : ['When did you first notice it, and is anything leaking, sparking, or unsafe right now?'],
      photoReview: selectedArtifact && !boundaryRefusal ? {
        visibleObservations: [
          'The photo shows a daylight exterior view with the roofline and part of the front elevation visible.',
          'No smoke, active fire, exposed wiring, or major displacement is visible in this image.',
        ],
        cannotConfirm: [
          'A single exterior photo cannot confirm hidden leaks, decking condition, installation quality, or remaining service life.',
          'The image does not establish measurements, code compliance, or whether a repair is needed.',
        ],
        urgency: 'routine',
        suggestedTrade: 'exterior',
        hazardSignal: 'none',
      } : null,
      disclosure: 'Local preview response · no network request',
    }
  }

  async listArtifacts(homeRef: string): Promise<readonly ArtifactRecord[]> {
    this.#assertSignedIn()
    this.#home(homeRef)
    return (this.#artifacts.get(homeRef) ?? []).map(cloneArtifact)
  }

  artifactPreviewSource(homeRef: string, artifactRef: string): {
    readonly uri: string
    readonly headers: Readonly<Record<string, string>>
  } {
    const artifactExists = (this.#artifacts.get(homeRef) ?? [])
      .some(item => item.artifactRef === artifactRef && item.kind === 'photo')
    if (!artifactExists) throw new Error('preview_artifact_not_found')
    return { uri: PHOTO_URI, headers: {} }
  }

  async uploadArtifact(
    homeRef: string,
    kind: ArtifactKind,
    deviceFile: DeviceFile,
    projectRef?: string,
  ): Promise<ArtifactRecord> {
    void homeRef
    void kind
    void deviceFile
    void projectRef
    throw new Error('preview_upload_disabled')
  }

  #home(homeRef: string): HomeSummary {
    const found = this.#homes.find(home => home.homeRef === homeRef)
    if (!found) throw new Error('preview_home_not_found')
    return found
  }

  #assertSignedIn(): void {
    if (!this.#signedIn) throw new Error('signed_out')
  }
}
