import type { HomesroloApi } from '../api/contract.ts'
import type {
  AcceptHouseholdInvitationInput,
  ArtifactContent,
  ArtifactKind,
  ArtifactRecord,
  ResolvedArtifactRecord,
  CreateProjectQuoteInput,
  CreateProfessionalOrganizationInput,
  CreateHomeCheckupPhotoInput,
  CreateHouseholdInvitationInput,
  CreateWorkInput,
  CreatedProfessionalOrganization,
  DecideProfessionalProposalInput,
  DeviceFile,
  DeletedHomeCheckupPhoto,
  HomeCheckupPhoto,
  HomeRecordProfile,
  HomeSummary,
  HomeView,
  HouseholdInvitation,
  HouseholdInvitationAcceptance,
  HouseholdMember,
  HouseholdRoster,
  NativeSessionCredential,
  ProfessionalMembership,
  ProfessionalOrganization,
  ProfessionalProfileWorkspace,
  ProfessionalProposal,
  ProfessionalTrade,
  ProjectActivityKind,
  ProjectActivityRecord,
  ProjectItem,
  ProjectInvitation,
  ProjectQuote,
  RespondToProjectInvitationInput,
  RemoveHouseholdMemberInput,
  RevokeHouseholdInvitationInput,
  RevokeProjectInvitationInput,
  ReviseProfessionalProposalInput,
  RoloConversationState,
  RoloReply,
  RoloSelectedPhoto,
  RoloTurn,
  ServerSession,
  SaveProjectItemInput,
  SaveProjectQuoteInput,
  SaveProfessionalProfileInput,
  SetHouseholdMemberRoleInput,
  SubmitProfessionalProposalInput,
  InviteProfessionalInput,
  UpdateWorkInput,
  UpdateHomeRecordInput,
  UpdateArtifactMetadataInput,
  WorkRecord,
} from '../api/model.ts'
import {
  isCalendarDate,
  isHouseholdMembershipRef,
  normalizedRoloSelectedPhoto,
} from '../api/protocol.ts'
import { HOME_SYSTEM_KINDS } from '../api/home-record.ts'
import {
  homeownerProjectQuoteBody,
  projectQuoteCommandIntent,
} from '../api/homeowner-quote.ts'
import { projectItemBody, projectItemIntent } from '../api/project-item.ts'
import { artifactMetadataUpdateBody } from '../api/artifact-metadata.ts'

const FIXTURE_NOW = '2026-08-26T14:30:00.000Z'

function previewPdfBytes(title: string): Uint8Array {
  const escaped = title.replace(/[()\\]/g, value => `\\${value}`)
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${escaped.length + 36} >>\nstream\nBT /F1 18 Tf 72 720 Td (${escaped}) Tj ET\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const [index, body] of objects.entries()) {
    offsets.push(new TextEncoder().encode(pdf).byteLength)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  }
  const xref = new TextEncoder().encode(pdf).byteLength
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

const PREVIEW_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAn//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AUf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AUf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Ah//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IUf/2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z'

function previewArtifactContent(record: ArtifactRecord): ArtifactContent {
  const bytes = record.mediaType === 'application/pdf'
    ? previewPdfBytes(record.displayName)
    : Uint8Array.from(atob(PREVIEW_JPEG_BASE64), value => value.charCodeAt(0))
  return {
    artifactRef: record.artifactRef,
    displayName: record.displayName,
    mediaType: record.mediaType,
    byteLength: bytes.byteLength,
    bytes,
  }
}

function fixtureRef(
  prefix: 'hhom' | 'hprj' | 'hact' | 'hart' | 'hcmd' | 'hask' | 'hprn'
    | 'horg' | 'hpmr' | 'hinv' | 'hquo' | 'hpvr' | 'hpho' | 'hpit' | 'hmbr' | 'hhiv',
  number: number,
): string {
  const serial = Number.isSafeInteger(number) && number >= 0
    ? String(number).padStart(10, '0')
    : '0000000000'
  return `${prefix}_${`homesrolo-preview-${serial}`.padEnd(43, '0').slice(0, 43)}`
}

export const PREVIEW_PRIMARY_HOME_REF = fixtureRef('hhom', 1)
const PREVIEW_SECONDARY_HOME_REF = fixtureRef('hhom', 2)
const PREVIEW_PRIMARY_MEMBERSHIP_REF = fixtureRef('hmbr', 1)
const PREVIEW_SECONDARY_MEMBERSHIP_REF = fixtureRef('hmbr', 2)
const PREVIEW_ALEX_MEMBERSHIP_REF = fixtureRef('hmbr', 3)

const PREVIEW_HOUSEHOLD_MEMBERS: Readonly<Record<string, readonly HouseholdMember[]>> = Object.freeze({
  [PREVIEW_PRIMARY_HOME_REF]: [
    Object.freeze({
      recordVersion: 'homeowner-household.v1',
      membershipRef: PREVIEW_PRIMARY_MEMBERSHIP_REF,
      homeRef: PREVIEW_PRIMARY_HOME_REF,
      displayLabel: 'You',
      role: 'workspace_controller',
      state: 'active',
      isCurrentPrincipal: true,
      revision: 1,
      joinedAt: FIXTURE_NOW,
      revokedAt: null,
    }),
    Object.freeze({
      recordVersion: 'homeowner-household.v1',
      membershipRef: PREVIEW_ALEX_MEMBERSHIP_REF,
      homeRef: PREVIEW_PRIMARY_HOME_REF,
      displayLabel: 'Alex',
      role: 'member',
      state: 'active',
      isCurrentPrincipal: false,
      revision: 1,
      joinedAt: FIXTURE_NOW,
      revokedAt: null,
    }),
  ],
  [PREVIEW_SECONDARY_HOME_REF]: [Object.freeze({
    recordVersion: 'homeowner-household.v1',
    membershipRef: PREVIEW_SECONDARY_MEMBERSHIP_REF,
    homeRef: PREVIEW_SECONDARY_HOME_REF,
    displayLabel: 'You',
    role: 'member',
    state: 'active',
    isCurrentPrincipal: true,
    revision: 1,
    joinedAt: FIXTURE_NOW,
    revokedAt: null,
  })],
})

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
  principalRef: fixtureRef('hprn', 999),
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
    'title' | 'workKind' | 'category' | 'status' | 'occurredOn' | 'summary' | 'professionalLabel'>
    & Partial<Pick<WorkRecord, 'assignedMembershipRef' | 'dueOn'>>,
): WorkRecord {
  return {
    projectRef: fixtureRef('hprj', number),
    homeRef,
    assignedMembershipRef: null,
    dueOn: null,
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
  work(7, PREVIEW_PRIMARY_HOME_REF, {
    title: 'Finish the wall patch',
    workKind: 'task',
    category: 'interior',
    status: 'planned',
    occurredOn: null,
    assignedMembershipRef: PREVIEW_PRIMARY_MEMBERSHIP_REF,
    dueOn: '2026-09-05',
    summary: 'Sand the patch, match the wall texture, prime it, and touch up the paint.',
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

function projectActivity(
  number: number,
  homeRef: string,
  projectRef: string,
  kind: ProjectActivityKind,
  body: string,
  createdAt = FIXTURE_NOW,
): ProjectActivityRecord {
  return {
    activityRef: fixtureRef('hact', number),
    homeRef,
    projectRef,
    kind,
    body,
    source: 'homeowner_entry',
    actorDisplayLabel: 'You',
    createdAt,
  }
}

const PRIMARY_ACTIVITY: readonly ProjectActivityRecord[] = Object.freeze([
  projectActivity(
    1,
    PREVIEW_PRIMARY_HOME_REF,
    fixtureRef('hprj', 2),
    'milestone',
    'Home Watch photos saved for comparison.',
    '2026-08-09T16:10:00.000Z',
  ),
  projectActivity(
    2,
    PREVIEW_PRIMARY_HOME_REF,
    fixtureRef('hprj', 2),
    'note',
    'Watch the sidewall flashing after the next heavy rain.',
    '2026-08-09T16:14:00.000Z',
  ),
])

function projectItem(
  number: number,
  projectRef: string,
  values: Pick<ProjectItem, 'kind' | 'label' | 'detail' | 'state'>,
): ProjectItem {
  return {
    itemRef: fixtureRef('hpit', number),
    homeRef: PREVIEW_PRIMARY_HOME_REF,
    projectRef,
    ...values,
    source: 'homeowner_entry',
    revision: 1,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  }
}

const PRIMARY_PROJECT_ITEMS: readonly ProjectItem[] = Object.freeze([
  Object.freeze(projectItem(1, fixtureRef('hprj', 6), {
    kind: 'decision',
    label: 'Drain water away from the back step',
    detail: 'Compare a channel drain with regrading before choosing the final scope.',
    state: 'considering',
  })),
  Object.freeze(projectItem(2, fixtureRef('hprj', 6), {
    kind: 'material',
    label: 'Charcoal permeable paver',
    detail: 'Saved as one finish option for the patio edge.',
    state: 'considering',
  })),
  Object.freeze(projectItem(3, fixtureRef('hprj', 6), {
    kind: 'wishlist',
    label: 'Cedar bench planter',
    detail: '',
    state: 'considering',
  })),
])

function artifact(
  number: number,
  values: Pick<ResolvedArtifactRecord,
    'projectRef' | 'kind' | 'displayName' | 'mediaType' | 'byteLength'>
    & Partial<Pick<ResolvedArtifactRecord,
      'observedOn' | 'phase' | 'areaLabel' | 'geoPin' | 'revision'>>,
): ResolvedArtifactRecord {
  return {
    artifactRef: fixtureRef('hart', number),
    homeRef: PREVIEW_PRIMARY_HOME_REF,
    observedOn: null,
    phase: null,
    areaLabel: null,
    geoPin: null,
    revision: 1,
    ...values,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  }
}

const PRIMARY_ARTIFACTS: readonly ResolvedArtifactRecord[] = Object.freeze([
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
  artifact(5, {
    projectRef: fixtureRef('hprj', 5),
    kind: 'photo',
    displayName: 'Patio ant activity · follow-up.jpg',
    mediaType: 'image/jpeg',
    byteLength: 286_110,
  }),
  artifact(6, {
    projectRef: fixtureRef('hprj', 6),
    kind: 'photo',
    displayName: 'Back step drainage after rain.jpg',
    mediaType: 'image/jpeg',
    byteLength: 334_820,
  }),
])

const PRIMARY_HOME_RECORD: HomeRecordProfile = Object.freeze({
  homeRef: PREVIEW_PRIMARY_HOME_REF,
  revision: 3,
  address: Object.freeze({
    line1: '1427 Cedar Ridge Lane',
    line2: null,
    city: 'Dallas',
    regionCode: 'TX',
    postalCode: '75201',
    countryCode: 'US',
  }),
  homeType: 'house',
  yearBuilt: Object.freeze({ value: 2004, precision: 'exact' }),
  systems: Object.freeze([
    Object.freeze({ kind: 'roof', present: 'yes', installedOrReplacedYear: Object.freeze({ value: 2018, precision: 'approximate' }) }),
    Object.freeze({ kind: 'heating', present: 'yes', installedOrReplacedYear: Object.freeze({ value: 2019, precision: 'exact' }) }),
    Object.freeze({ kind: 'cooling', present: 'yes', installedOrReplacedYear: Object.freeze({ value: 2019, precision: 'exact' }) }),
    Object.freeze({ kind: 'water_heater', present: 'yes', installedOrReplacedYear: Object.freeze({ value: 2025, precision: 'exact' }) }),
    Object.freeze({ kind: 'gutters', present: 'yes', installedOrReplacedYear: null }),
    Object.freeze({ kind: 'foundation', present: 'yes', installedOrReplacedYear: null }),
  ]),
  source: 'homeowner_recollection',
  updatedAt: FIXTURE_NOW,
})

function checkup(
  number: number,
  observedOn: string,
  area: HomeCheckupPhoto['area'],
  viewLabel: string,
  caption: string,
): HomeCheckupPhoto {
  const photoRef = fixtureRef('hpho', number)
  const base = `/api/v1/homes/${PREVIEW_PRIMARY_HOME_REF}/photo-checkups/${photoRef}`
  return {
    photoRef,
    homeRef: PREVIEW_PRIMARY_HOME_REF,
    observedOn,
    area,
    viewLabel,
    caption,
    fullUrl: `${base}/full`,
    thumbnailUrl: `${base}/thumbnail`,
    width: 1600,
    height: 1200,
    createdAt: `${observedOn}T15:00:00.000Z`,
  }
}

const PRIMARY_CHECKUPS: readonly HomeCheckupPhoto[] = Object.freeze([
  Object.freeze(checkup(1, '2026-08-09', 'roofline', 'Garage roofline', 'Sealant near the sidewall is easy to compare from this spot.')),
  Object.freeze(checkup(2, '2026-04-12', 'roofline', 'Garage roofline', 'Spring reference photo.')),
  Object.freeze(checkup(3, '2026-08-09', 'hvac', 'Upstairs return', 'Filter label and return grille saved before seasonal service.')),
])

export const PREVIEW_OWN_ORGANIZATION_REF = fixtureRef('horg', 10)
export const PREVIEW_PENDING_PRO_INVITATION_REF = fixtureRef('hinv', 2)

const PROFESSIONAL_ORGANIZATIONS: readonly ProfessionalOrganization[] = Object.freeze([
  Object.freeze({
    organizationRef: fixtureRef('horg', 1),
    slug: 'clear-sky-roofing',
    displayName: 'ClearSky Roofing',
    description: 'Roof repairs, replacements, and homeowner-readable documentation.',
    publicPhone: '817-555-0141',
    publicEmail: 'hello@clearsky.example',
    websiteUrl: 'https://clearsky.example/',
    trades: ['roofing'] as const,
    serviceAreas: ['Dallas–Fort Worth, TX', 'Southern Oklahoma'],
    publicationState: 'published',
    provenance: 'company_self_reported',
    revision: 2,
    createdAt: '2026-08-20T14:30:00.000Z',
    updatedAt: FIXTURE_NOW,
  }),
  Object.freeze({
    organizationRef: fixtureRef('horg', 2),
    slug: 'north-texas-air',
    displayName: 'North Texas Air',
    description: 'Residential heating, cooling, and seasonal service.',
    publicPhone: '214-555-0196',
    trades: ['hvac'] as const,
    serviceAreas: ['Dallas County, TX', 'Tarrant County, TX'],
    publicationState: 'published',
    provenance: 'company_self_reported',
    revision: 1,
    createdAt: '2026-08-21T14:30:00.000Z',
    updatedAt: FIXTURE_NOW,
  }),
  Object.freeze({
    organizationRef: fixtureRef('horg', 3),
    slug: 'evergreen-outdoor-living',
    displayName: 'Evergreen Outdoor Living',
    description: 'Pools, patios, drainage, and landscape projects.',
    publicPhone: '682-555-0127',
    trades: ['pool', 'landscaping', 'exterior'] as const,
    serviceAreas: ['North Texas', 'Texoma'],
    publicationState: 'published',
    provenance: 'company_self_reported',
    revision: 1,
    createdAt: '2026-08-22T14:30:00.000Z',
    updatedAt: FIXTURE_NOW,
  }),
  Object.freeze({
    organizationRef: PREVIEW_OWN_ORGANIZATION_REF,
    slug: 'pearson-home-services',
    displayName: 'Pearson Home Services',
    description: 'A preview company card owned by the signed-in account.',
    trades: ['pest', 'exterior', 'landscaping'] as const,
    serviceAreas: ['Fort Worth, TX', 'Dallas, TX'],
    publicationState: 'published',
    provenance: 'company_self_reported',
    revision: 1,
    createdAt: '2026-08-24T14:30:00.000Z',
    updatedAt: FIXTURE_NOW,
  }),
])

const PROFESSIONAL_MEMBERSHIPS: readonly ProfessionalMembership[] = Object.freeze([
  Object.freeze({
    membershipRef: fixtureRef('hpmr', 1),
    organizationRef: PREVIEW_OWN_ORGANIZATION_REF,
    role: 'owner',
    state: 'active',
    revision: 1,
    createdAt: '2026-08-24T14:30:00.000Z',
  }),
])

const PROFESSIONAL_INVITATIONS: readonly ProjectInvitation[] = Object.freeze([
  Object.freeze({
    invitationRef: fixtureRef('hinv', 1),
    homeRef: PREVIEW_PRIMARY_HOME_REF,
    projectRef: fixtureRef('hprj', 5),
    professionalOrganizationRef: PREVIEW_OWN_ORGANIZATION_REF,
    status: 'accepted',
    message: 'Please price the patio ant follow-up and exterior sealing separately.',
    disclosure: Object.freeze({
      title: 'Quarterly pest service',
      workKind: 'service',
      category: 'pest',
      trade: 'Pest control',
      status: 'in_progress',
      summary: 'Exterior treatment completed. Technician will recheck ant activity by the patio.',
      selectedArtifactRefs: Object.freeze([fixtureRef('hart', 5)]),
    }),
    expiresAt: '2026-09-20T14:30:00.000Z',
    revision: 2,
    createdAt: '2026-08-25T14:30:00.000Z',
    respondedAt: '2026-08-25T16:00:00.000Z',
  }),
  Object.freeze({
    invitationRef: PREVIEW_PENDING_PRO_INVITATION_REF,
    homeRef: PREVIEW_PRIMARY_HOME_REF,
    projectRef: fixtureRef('hprj', 6),
    professionalOrganizationRef: PREVIEW_OWN_ORGANIZATION_REF,
    status: 'pending',
    message: 'Can you review the drainage concern and explain what you would do first?',
    disclosure: Object.freeze({
      title: 'Improve patio drainage',
      workKind: 'repair',
      category: 'landscaping',
      trade: 'Yard & landscaping',
      status: 'planned',
      summary: 'Water lingers near the back step after heavy rain. Compare grading and drain options.',
      selectedArtifactRefs: Object.freeze([fixtureRef('hart', 6)]),
    }),
    expiresAt: '2026-09-22T14:30:00.000Z',
    revision: 1,
    createdAt: '2026-08-26T14:00:00.000Z',
  }),
  Object.freeze({
    invitationRef: fixtureRef('hinv', 3),
    homeRef: PREVIEW_PRIMARY_HOME_REF,
    projectRef: fixtureRef('hprj', 2),
    professionalOrganizationRef: fixtureRef('horg', 1),
    status: 'pending',
    message: 'Please review the two roof files and put the next step in writing.',
    disclosure: Object.freeze({
      title: 'Watch flashing above the garage',
      workKind: 'issue',
      category: 'roofing',
      trade: 'Roofing',
      status: 'planned',
      summary: 'Home Watch photo shows lifted sealant near the sidewall. No interior moisture observed.',
      selectedArtifactRefs: Object.freeze([fixtureRef('hart', 1), fixtureRef('hart', 3)]),
    }),
    expiresAt: '2026-09-24T14:30:00.000Z',
    revision: 1,
    createdAt: FIXTURE_NOW,
  }),
])

const PROFESSIONAL_PROPOSALS: readonly ProfessionalProposal[] = Object.freeze([
  Object.freeze({
    quoteRef: fixtureRef('hquo', 1),
    versionRef: fixtureRef('hpvr', 1),
    invitationRef: fixtureRef('hinv', 1),
    professionalOrganizationRef: PREVIEW_OWN_ORGANIZATION_REF,
    homeRef: PREVIEW_PRIMARY_HOME_REF,
    projectRef: fixtureRef('hprj', 5),
    contractorLabel: 'Pearson Home Services',
    proposalDate: '2026-08-26',
    totalAmountCents: 34_500,
    currencyCode: 'USD',
    summary: 'Exterior treatment and one documented patio follow-up.',
    scope: Object.freeze({
      project_scope: Object.freeze({
        status: 'included',
        detail: 'Treat the exterior perimeter and recheck the patio ant activity.',
      }),
      schedule: Object.freeze({ status: 'included', detail: 'Return within seven days.' }),
      exclusions: Object.freeze({ status: 'excluded', detail: 'Interior treatment unless approved.' }),
    }),
    state: 'submitted',
    homeownerDecision: 'shortlisted',
    decisionRevision: 2,
    revision: 1,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
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
function cloneHouseholdMember(item: HouseholdMember): HouseholdMember { return { ...item } }
function cloneHouseholdInvitation(item: HouseholdInvitation): HouseholdInvitation { return { ...item } }
function cloneActivity(item: ProjectActivityRecord): ProjectActivityRecord { return { ...item } }
function cloneProjectItem(item: ProjectItem): ProjectItem { return { ...item } }
function cloneArtifact(item: ResolvedArtifactRecord): ResolvedArtifactRecord {
  return { ...item, geoPin: item.geoPin ? { ...item.geoPin } : null }
}
function cloneHomeRecord(item: HomeRecordProfile): HomeRecordProfile {
  return {
    ...item,
    address: item.address ? { ...item.address } : null,
    yearBuilt: item.yearBuilt ? { ...item.yearBuilt } : null,
    systems: item.systems.map(system => ({
      ...system,
      installedOrReplacedYear: system.installedOrReplacedYear
        ? { ...system.installedOrReplacedYear }
        : null,
    })),
  }
}
function cloneCheckup(item: HomeCheckupPhoto): HomeCheckupPhoto { return { ...item } }
function cloneOrganization(item: ProfessionalOrganization): ProfessionalOrganization {
  return { ...item, trades: [...item.trades], serviceAreas: [...item.serviceAreas] }
}
function cloneMembership(item: ProfessionalMembership): ProfessionalMembership { return { ...item } }
function cloneInvitation(item: ProjectInvitation): ProjectInvitation {
  return {
    ...item,
    disclosure: {
      ...item.disclosure,
      selectedArtifactRefs: [...item.disclosure.selectedArtifactRefs],
    },
  }
}
function cloneScope<T extends ProfessionalProposal['scope']>(scope: T): T {
  return Object.fromEntries(Object.entries(scope).map(([key, item]) => [
    key,
    item ? { ...item } : item,
  ])) as T
}
function cloneProposal(item: ProfessionalProposal): ProfessionalProposal {
  return { ...item, scope: cloneScope(item.scope) }
}
function cloneQuote(item: ProjectQuote): ProjectQuote {
  return { ...item, scope: cloneScope(item.scope) }
}
function proposalQuote(item: ProfessionalProposal): ProjectQuote {
  return {
    quoteRef: item.quoteRef,
    homeRef: item.homeRef,
    projectRef: item.projectRef,
    contractorLabel: item.contractorLabel,
    proposalDate: item.proposalDate,
    artifactRef: null,
    scope: cloneScope(item.scope),
    notes: '',
    source: 'professional_submission',
    professionalOrganizationRef: item.professionalOrganizationRef,
    invitationRef: item.invitationRef,
    totalAmountCents: item.totalAmountCents ?? null,
    currencyCode: 'USD',
    professionalSummary: item.summary ?? '',
    proposalState: item.state,
    homeownerDecision: item.homeownerDecision,
    decisionRevision: item.decisionRevision,
    revision: item.revision,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

/** A deterministic, memory-only API. It has no transport and cannot upload. */
export class PreviewHomesroloApi implements HomesroloApi {
  readonly #homes = HOMES.map(cloneHome)
  readonly #householdMembers = new Map<string, HouseholdMember[]>([
    [PREVIEW_PRIMARY_HOME_REF, PREVIEW_HOUSEHOLD_MEMBERS[PREVIEW_PRIMARY_HOME_REF]!.map(cloneHouseholdMember)],
    [PREVIEW_SECONDARY_HOME_REF, PREVIEW_HOUSEHOLD_MEMBERS[PREVIEW_SECONDARY_HOME_REF]!.map(cloneHouseholdMember)],
  ])
  readonly #householdInvitations = new Map<string, HouseholdInvitation[]>([
    [PREVIEW_PRIMARY_HOME_REF, []],
    [PREVIEW_SECONDARY_HOME_REF, []],
  ])
  readonly #work = new Map<string, WorkRecord[]>([
    [PREVIEW_PRIMARY_HOME_REF, PRIMARY_WORK.map(cloneWork)],
    [PREVIEW_SECONDARY_HOME_REF, SECONDARY_WORK.map(cloneWork)],
  ])
  readonly #activity = new Map<string, ProjectActivityRecord[]>([
    [fixtureRef('hprj', 2), PRIMARY_ACTIVITY.map(cloneActivity)],
  ])
  readonly #items = new Map<string, ProjectItem[]>([
    [fixtureRef('hprj', 6), PRIMARY_PROJECT_ITEMS.map(cloneProjectItem)],
  ])
  readonly #itemCommands = new Map<string, {
    readonly intent: string
    readonly item: ProjectItem
  }>()
  readonly #activityCommands = new Map<string, {
    readonly intent: string
    readonly activity: ProjectActivityRecord
  }>()
  readonly #artifacts = new Map<string, ResolvedArtifactRecord[]>([
    [PREVIEW_PRIMARY_HOME_REF, PRIMARY_ARTIFACTS.map(cloneArtifact)],
    [PREVIEW_SECONDARY_HOME_REF, []],
  ])
  readonly #artifactMetadataCommands = new Map<string, {
    readonly intent: string
    readonly artifact: ResolvedArtifactRecord
  }>()
  readonly #homeRecords = new Map<string, HomeRecordProfile>([
    [PREVIEW_PRIMARY_HOME_REF, cloneHomeRecord(PRIMARY_HOME_RECORD)],
  ])
  readonly #checkups = new Map<string, HomeCheckupPhoto[]>([
    [PREVIEW_PRIMARY_HOME_REF, PRIMARY_CHECKUPS.map(cloneCheckup)],
    [PREVIEW_SECONDARY_HOME_REF, []],
  ])
  readonly #organizations = PROFESSIONAL_ORGANIZATIONS.map(cloneOrganization)
  readonly #memberships = PROFESSIONAL_MEMBERSHIPS.map(cloneMembership)
  readonly #invitations = PROFESSIONAL_INVITATIONS.map(cloneInvitation)
  readonly #proposals = PROFESSIONAL_PROPOSALS.map(cloneProposal)
  readonly #quotes = new Map<string, ProjectQuote[]>(PROFESSIONAL_PROPOSALS.map(proposal => [
    proposal.projectRef,
    [proposalQuote(proposal)],
  ]))
  readonly #quoteCommands = new Map<string, {
    readonly intent: string
    readonly quote: ProjectQuote
  }>()
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

  async upgradeLegacyPwaSession(_legacyBearer: string | null): Promise<void> {}

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
    this.#householdMembers.set(created.homeRef, [{
      recordVersion: 'homeowner-household.v1',
      membershipRef: fixtureRef('hmbr', this.#sequence),
      homeRef: created.homeRef,
      displayLabel: 'You',
      role: 'workspace_controller',
      state: 'active',
      isCurrentPrincipal: true,
      revision: 1,
      joinedAt: FIXTURE_NOW,
      revokedAt: null,
    }])
    this.#householdInvitations.set(created.homeRef, [])
    this.#work.set(created.homeRef, [])
    this.#artifacts.set(created.homeRef, [])
    this.#checkups.set(created.homeRef, [])
    this.#homeRecords.set(created.homeRef, {
      homeRef: created.homeRef,
      revision: 1,
      address: null,
      homeType: 'unknown',
      yearBuilt: null,
      systems: HOME_SYSTEM_KINDS.map(kind => ({
        kind, present: 'unknown', installedOrReplacedYear: null,
      })),
      source: 'homeowner_recollection',
      updatedAt: FIXTURE_NOW,
    })
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

  async getHomeRecord(homeRef: string): Promise<HomeRecordProfile> {
    this.#assertSignedIn()
    this.#home(homeRef)
    const profile = this.#homeRecords.get(homeRef)
    if (!profile) throw new Error('forbidden')
    return cloneHomeRecord(profile)
  }

  async updateHomeRecord(
    homeRef: string,
    input: UpdateHomeRecordInput,
  ): Promise<HomeRecordProfile> {
    const current = await this.getHomeRecord(homeRef)
    if (input.expectedRevision !== current.revision) throw new Error('conflict')
    const updated: HomeRecordProfile = {
      homeRef,
      revision: current.revision + 1,
      address: { ...input.address },
      homeType: input.homeType,
      yearBuilt: input.yearBuilt ? { ...input.yearBuilt } : null,
      systems: input.systems.map(system => ({
        ...system,
        installedOrReplacedYear: system.installedOrReplacedYear
          ? { ...system.installedOrReplacedYear }
          : null,
      })),
      source: 'homeowner_recollection',
      updatedAt: FIXTURE_NOW,
    }
    this.#homeRecords.set(homeRef, updated)
    return cloneHomeRecord(updated)
  }

  async listWork(homeRef: string): Promise<readonly WorkRecord[]> {
    this.#assertSignedIn()
    this.#home(homeRef)
    return (this.#work.get(homeRef) ?? []).map(cloneWork)
  }

  async getHousehold(homeRef: string): Promise<HouseholdRoster> {
    this.#assertSignedIn()
    this.#home(homeRef)
    return {
      recordVersion: 'homeowner-household.v1',
      homeRef,
      members: (this.#householdMembers.get(homeRef) ?? []).map(cloneHouseholdMember),
      invitations: (this.#householdInvitations.get(homeRef) ?? []).map(cloneHouseholdInvitation),
    }
  }

  async listHouseholdMembers(homeRef: string): Promise<readonly HouseholdMember[]> {
    return (await this.getHousehold(homeRef)).members
  }

  async createHouseholdInvitation(
    homeRef: string,
    input: CreateHouseholdInvitationInput,
  ): Promise<HouseholdInvitation> {
    this.#assertSignedIn()
    this.#home(homeRef)
    if (!input.inviteeEmail.trim().includes('@') || !input.inviteeDisplayLabel.trim()
      || !['member', 'viewer'].includes(input.desiredRole)
      || input.expiresInDays < 1 || input.expiresInDays > 14) throw new Error('invalid_request')
    this.#sequence += 1
    const createdAt = new Date(FIXTURE_NOW)
    const expiresAt = new Date(createdAt.getTime() + (input.expiresInDays * 86_400_000)).toISOString()
    const invitation: HouseholdInvitation = {
      recordVersion: 'homeowner-household.v1',
      invitationRef: fixtureRef('hhiv', this.#sequence),
      homeRef,
      inviteeDisplayLabel: input.inviteeDisplayLabel.trim(),
      desiredRole: input.desiredRole,
      status: 'pending',
      expiresAt,
      revision: 1,
      createdAt: FIXTURE_NOW,
      acceptedAt: null,
      revokedAt: null,
    }
    this.#householdInvitations.get(homeRef)?.push(invitation)
    return cloneHouseholdInvitation(invitation)
  }

  async acceptHouseholdInvitation(
    invitationRef: string,
    _input: AcceptHouseholdInvitationInput,
  ): Promise<HouseholdInvitationAcceptance> {
    this.#assertSignedIn()
    const found = [...this.#householdInvitations.entries()].flatMap(([homeRef, invitations]) => (
      invitations.map((invitation, index) => ({ homeRef, invitation, index }))
    )).find(item => item.invitation.invitationRef === invitationRef)
    if (!found || found.invitation.status !== 'pending') throw new Error('not_found')
    const accepted: HouseholdInvitation = {
      ...found.invitation,
      status: 'accepted',
      acceptedAt: FIXTURE_NOW,
      revision: found.invitation.revision + 1,
    }
    this.#householdInvitations.get(found.homeRef)![found.index] = accepted
    const members = this.#householdMembers.get(found.homeRef) ?? []
    members.forEach((member, index) => { members[index] = { ...member, isCurrentPrincipal: false } })
    this.#sequence += 1
    const member: HouseholdMember = {
      recordVersion: 'homeowner-household.v1',
      membershipRef: fixtureRef('hmbr', this.#sequence),
      homeRef: found.homeRef,
      displayLabel: accepted.inviteeDisplayLabel,
      role: accepted.desiredRole,
      state: 'active',
      isCurrentPrincipal: true,
      revision: 1,
      joinedAt: FIXTURE_NOW,
      revokedAt: null,
    }
    members.push(member)
    return { member: cloneHouseholdMember(member), invitation: cloneHouseholdInvitation(accepted) }
  }

  async revokeHouseholdInvitation(
    homeRef: string,
    invitationRef: string,
    input: RevokeHouseholdInvitationInput,
  ): Promise<HouseholdInvitation> {
    this.#assertSignedIn()
    const invitations = this.#householdInvitations.get(homeRef) ?? []
    const index = invitations.findIndex(item => item.invitationRef === invitationRef)
    const current = invitations[index]
    if (!current) throw new Error('not_found')
    if (current.revision !== input.expectedRevision || current.status !== 'pending') throw new Error('conflict')
    const revoked: HouseholdInvitation = {
      ...current,
      status: 'revoked',
      revokedAt: FIXTURE_NOW,
      revision: current.revision + 1,
    }
    invitations[index] = revoked
    return cloneHouseholdInvitation(revoked)
  }

  async removeHouseholdMember(
    homeRef: string,
    membershipRef: string,
    input: RemoveHouseholdMemberInput,
  ): Promise<HouseholdMember> {
    this.#assertSignedIn()
    const members = this.#householdMembers.get(homeRef) ?? []
    const index = members.findIndex(item => item.membershipRef === membershipRef)
    const current = members[index]
    if (!current || current.isCurrentPrincipal || current.revision !== input.expectedRevision) {
      throw new Error('conflict')
    }
    const revoked: HouseholdMember = {
      ...current,
      state: 'revoked',
      revision: current.revision + 1,
      revokedAt: FIXTURE_NOW,
    }
    members[index] = revoked
    return cloneHouseholdMember(revoked)
  }

  async setHouseholdMemberRole(
    homeRef: string,
    membershipRef: string,
    input: SetHouseholdMemberRoleInput,
  ): Promise<HouseholdMember> {
    this.#assertSignedIn()
    const members = this.#householdMembers.get(homeRef) ?? []
    const index = members.findIndex(item => item.membershipRef === membershipRef)
    const current = members[index]
    if (!current || current.revision !== input.expectedRevision) throw new Error('conflict')
    const updated: HouseholdMember = {
      ...current,
      role: input.desiredRole,
      revision: current.revision + 1,
    }
    members[index] = updated
    return cloneHouseholdMember(updated)
  }

  async createWork(homeRef: string, input: CreateWorkInput): Promise<WorkRecord> {
    this.#assertSignedIn()
    this.#home(homeRef)
    const assignedMember = input.assignedMembershipRef === undefined
      ? null
      : (this.#householdMembers.get(homeRef) ?? []).find(member => (
          member.membershipRef === input.assignedMembershipRef && member.state === 'active'
        )) ?? null
    if ((input.assignedMembershipRef !== undefined
        && (!isHouseholdMembershipRef(input.assignedMembershipRef) || !assignedMember))
      || (input.dueOn !== undefined && !isCalendarDate(input.dueOn))) {
      throw new Error('preview_work_invalid')
    }
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
    const assignedCreated: WorkRecord = {
      ...created,
      assignedMembershipRef: input.assignedMembershipRef ?? null,
      dueOn: input.dueOn ?? null,
    }
    this.#work.get(homeRef)?.unshift(assignedCreated)
    const activity: ProjectActivityRecord[] = []
    if (input.initialActivity) {
      this.#sequence += 1
      activity.push(projectActivity(
        this.#sequence,
        homeRef,
        assignedCreated.projectRef,
        input.initialActivity.kind,
        input.initialActivity.body.trim(),
      ))
    }
    this.#activity.set(assignedCreated.projectRef, activity)
    this.#items.set(assignedCreated.projectRef, [])
    return cloneWork(assignedCreated)
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
      ...(input.assignedMembershipRef === undefined
        ? {} : { assignedMembershipRef: input.assignedMembershipRef }),
      ...(input.dueOn === undefined ? {} : { dueOn: input.dueOn }),
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

  async listProjectActivity(
    homeRef: string,
    projectRef: string,
  ): Promise<readonly ProjectActivityRecord[]> {
    this.#assertSignedIn()
    this.#project(homeRef, projectRef)
    return (this.#activity.get(projectRef) ?? []).map(cloneActivity)
  }

  async addWorkNote(
    homeRef: string,
    projectRef: string,
    body: string,
    commandRef?: string,
  ): Promise<ProjectActivityRecord> {
    this.#assertSignedIn()
    void commandRef
    this.#project(homeRef, projectRef)
    const cleanBody = body.trim()
    if (cleanBody.length < 1 || cleanBody.length > 2_000) {
      throw new Error('preview_activity_invalid')
    }
    this.#sequence += 1
    const created = projectActivity(
      this.#sequence,
      homeRef,
      projectRef,
      'note',
      cleanBody,
    )
    const activity = this.#activity.get(projectRef) ?? []
    activity.push(created)
    this.#activity.set(projectRef, activity)
    return cloneActivity(created)
  }

  async addWorkMilestone(
    homeRef: string,
    projectRef: string,
    body: string,
    commandRef?: string,
  ): Promise<ProjectActivityRecord> {
    this.#assertSignedIn()
    this.#project(homeRef, projectRef)
    const cleanBody = body.trim()
    if (cleanBody.length < 1 || cleanBody.length > 2_000) {
      throw new Error('preview_activity_invalid')
    }
    const stableCommandRef = commandRef ?? await this.newCommandRef()
    const intent = JSON.stringify({ homeRef, projectRef, kind: 'milestone', body: cleanBody })
    const prior = this.#activityCommands.get(stableCommandRef)
    if (prior) {
      if (prior.intent !== intent) throw new Error('preview_command_conflict')
      return cloneActivity(prior.activity)
    }
    this.#sequence += 1
    const created = projectActivity(
      this.#sequence,
      homeRef,
      projectRef,
      'milestone',
      cleanBody,
    )
    const activity = this.#activity.get(projectRef) ?? []
    activity.push(created)
    this.#activity.set(projectRef, activity)
    this.#activityCommands.set(stableCommandRef, { intent, activity: cloneActivity(created) })
    return cloneActivity(created)
  }

  async listProjectItems(homeRef: string, projectRef: string): Promise<readonly ProjectItem[]> {
    this.#assertSignedIn()
    this.#project(homeRef, projectRef)
    return (this.#items.get(projectRef) ?? []).map(cloneProjectItem)
  }

  async saveProjectItem(
    homeRef: string,
    projectRef: string,
    input: SaveProjectItemInput,
  ): Promise<ProjectItem> {
    this.#assertSignedIn()
    this.#project(homeRef, projectRef)
    const normalized = projectItemBody(input)
    if (!normalized) throw new Error('invalid_request')
    const { commandRef, ...fields } = normalized
    const intent = projectItemIntent(projectRef, fields)
    const prior = this.#itemCommands.get(commandRef)
    if (prior) {
      if (prior.intent !== intent || prior.item.homeRef !== homeRef
        || prior.item.projectRef !== projectRef) throw new Error('preview_command_conflict')
      return cloneProjectItem(prior.item)
    }

    const items = this.#items.get(projectRef) ?? []
    let saved: ProjectItem
    if (normalized.itemRef !== undefined) {
      const index = items.findIndex(item => item.itemRef === normalized.itemRef)
      const current = items[index]
      if (!current) throw new Error('preview_item_not_found')
      if (normalized.expectedRevision !== current.revision) throw new Error('conflict')
      saved = {
        ...current,
        kind: normalized.kind,
        label: normalized.label,
        detail: normalized.detail ?? '',
        state: normalized.state,
        revision: current.revision + 1,
        updatedAt: FIXTURE_NOW,
      }
      items[index] = saved
    } else {
      this.#sequence += 1
      saved = {
        itemRef: fixtureRef('hpit', this.#sequence),
        homeRef,
        projectRef,
        kind: normalized.kind,
        label: normalized.label,
        detail: normalized.detail ?? '',
        state: normalized.state,
        source: 'homeowner_entry',
        revision: 1,
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      }
      items.unshift(saved)
    }
    this.#items.set(projectRef, items)
    this.#itemCommands.set(commandRef, { intent, item: cloneProjectItem(saved) })
    return cloneProjectItem(saved)
  }

  async listProjectQuotes(homeRef: string, projectRef: string): Promise<readonly ProjectQuote[]> {
    this.#assertSignedIn()
    this.#project(homeRef, projectRef)
    return (this.#quotes.get(projectRef) ?? []).map(cloneQuote)
  }

  async createProjectQuote(
    homeRef: string,
    projectRef: string,
    input: CreateProjectQuoteInput,
  ): Promise<ProjectQuote> {
    this.#assertSignedIn()
    this.#project(homeRef, projectRef)
    const body = homeownerProjectQuoteBody(input)
    if (!body || body.expectedRevision !== undefined) throw new Error('invalid_request')
    const intent = projectQuoteCommandIntent(projectRef, null, body)
    const prior = this.#quoteCommands.get(body.commandRef)
    if (prior) {
      if (prior.intent !== intent || prior.quote.homeRef !== homeRef) {
        throw new Error('preview_command_conflict')
      }
      return cloneQuote(prior.quote)
    }
    if (body.artifactRef && !(this.#artifacts.get(homeRef) ?? []).some(artifact => (
      artifact.artifactRef === body.artifactRef && artifact.projectRef === projectRef
        && artifact.kind === 'document' && artifact.mediaType === 'application/pdf'
    ))) throw new Error('preview_artifact_not_found')
    this.#sequence += 1
    const quote: ProjectQuote = {
      quoteRef: fixtureRef('hquo', this.#sequence),
      homeRef,
      projectRef,
      contractorLabel: body.contractorLabel,
      proposalDate: body.proposalDate ?? null,
      artifactRef: body.artifactRef ?? null,
      scope: cloneScope(body.scope),
      notes: body.notes ?? '',
      source: 'homeowner_entry',
      professionalOrganizationRef: null,
      invitationRef: null,
      totalAmountCents: null,
      currencyCode: null,
      professionalSummary: '',
      proposalState: null,
      homeownerDecision: 'undecided',
      decisionRevision: null,
      revision: 1,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    }
    const quotes = this.#quotes.get(projectRef) ?? []
    quotes.unshift(quote)
    this.#quotes.set(projectRef, quotes)
    this.#quoteCommands.set(body.commandRef, { intent, quote: cloneQuote(quote) })
    return cloneQuote(quote)
  }

  async saveProjectQuote(
    homeRef: string,
    projectRef: string,
    quoteRef: string,
    input: SaveProjectQuoteInput,
  ): Promise<ProjectQuote> {
    this.#assertSignedIn()
    this.#project(homeRef, projectRef)
    const body = homeownerProjectQuoteBody(input)
    if (!body || body.expectedRevision === undefined) throw new Error('invalid_request')
    const intent = projectQuoteCommandIntent(projectRef, quoteRef, body)
    const prior = this.#quoteCommands.get(body.commandRef)
    if (prior) {
      if (prior.intent !== intent || prior.quote.homeRef !== homeRef) {
        throw new Error('preview_command_conflict')
      }
      return cloneQuote(prior.quote)
    }
    if (body.artifactRef && !(this.#artifacts.get(homeRef) ?? []).some(artifact => (
      artifact.artifactRef === body.artifactRef && artifact.projectRef === projectRef
        && artifact.kind === 'document' && artifact.mediaType === 'application/pdf'
    ))) throw new Error('preview_artifact_not_found')
    const quotes = this.#quotes.get(projectRef) ?? []
    const index = quotes.findIndex(quote => quote.quoteRef === quoteRef)
    const current = quotes[index]
    if (!current || current.source !== 'homeowner_entry') throw new Error('preview_quote_not_found')
    if (current.revision !== body.expectedRevision) throw new Error('conflict')
    const quote: ProjectQuote = {
      ...current,
      contractorLabel: body.contractorLabel,
      proposalDate: body.proposalDate ?? null,
      artifactRef: body.artifactRef ?? null,
      scope: cloneScope(body.scope),
      notes: body.notes ?? '',
      revision: current.revision + 1,
      updatedAt: FIXTURE_NOW,
    }
    quotes[index] = quote
    this.#quotes.set(projectRef, quotes)
    this.#quoteCommands.set(body.commandRef, { intent, quote: cloneQuote(quote) })
    return cloneQuote(quote)
  }

  async listProfessionals(filters: {
    readonly trade?: ProfessionalTrade
    readonly serviceArea?: string
  } = {}): Promise<readonly ProfessionalOrganization[]> {
    this.#assertSignedIn()
    const area = filters.serviceArea?.trim().toLocaleLowerCase('en-US')
    return this.#organizations
      .filter(organization => organization.publicationState === 'published')
      .filter(organization => !filters.trade || organization.trades.includes(filters.trade))
      .filter(organization => !area || organization.serviceAreas.some(value => (
        value.toLocaleLowerCase('en-US').includes(area)
      )))
      .map(cloneOrganization)
  }

  async getProfessional(slug: string): Promise<ProfessionalOrganization> {
    this.#assertSignedIn()
    const normalized = slug.trim().toLocaleLowerCase('en-US')
    const organization = this.#organizations.find(candidate => (
      candidate.slug === normalized && candidate.publicationState === 'published'
    ))
    if (!organization) throw new Error('preview_professional_not_found')
    return cloneOrganization(organization)
  }

  async getProfessionalProfile(): Promise<ProfessionalProfileWorkspace> {
    this.#assertSignedIn()
    const memberships = this.#memberships.filter(membership => membership.state === 'active')
    const organizationRefs = new Set(memberships.map(membership => membership.organizationRef))
    return {
      organizations: this.#organizations
        .filter(organization => organizationRefs.has(organization.organizationRef))
        .map(cloneOrganization),
      memberships: memberships.map(cloneMembership),
    }
  }

  async createProfessionalOrganization(
    input: CreateProfessionalOrganizationInput,
  ): Promise<CreatedProfessionalOrganization> {
    this.#assertSignedIn()
    const displayName = input.displayName.trim()
    const slug = input.slug.trim().toLocaleLowerCase('en-US')
    if (!displayName || this.#organizations.some(item => item.slug === slug)) {
      throw new Error('preview_professional_conflict')
    }
    this.#sequence += 1
    const organization: ProfessionalOrganization = {
      organizationRef: fixtureRef('horg', this.#sequence),
      slug,
      displayName,
      trades: [],
      serviceAreas: [],
      publicationState: 'draft',
      provenance: 'company_self_reported',
      revision: 1,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    }
    this.#sequence += 1
    const membership: ProfessionalMembership = {
      membershipRef: fixtureRef('hpmr', this.#sequence),
      organizationRef: organization.organizationRef,
      role: 'owner',
      state: 'active',
      revision: 1,
      createdAt: FIXTURE_NOW,
    }
    this.#organizations.push(organization)
    this.#memberships.push(membership)
    return { organization: cloneOrganization(organization), membership: cloneMembership(membership) }
  }

  async saveProfessionalProfile(
    input: SaveProfessionalProfileInput,
  ): Promise<ProfessionalOrganization> {
    this.#assertSignedIn()
    const index = this.#organizations.findIndex(item => item.organizationRef === input.organizationRef)
    const current = this.#organizations[index]
    const membership = this.#memberships.find(item => item.organizationRef === input.organizationRef
      && item.state === 'active' && (item.role === 'owner' || item.role === 'admin'))
    if (!current || !membership || current.revision !== input.expectedRevision) {
      throw new Error('preview_professional_conflict')
    }
    if (input.publicationState === 'published'
      && (input.trades.length === 0 || input.serviceAreas.length === 0)) {
      throw new Error('preview_professional_incomplete')
    }
    const optional = (value: string | null) => value?.trim() || undefined
    const legalName = optional(input.legalName)
    const description = optional(input.description)
    const publicPhone = optional(input.publicPhone)
    const publicEmail = optional(input.publicEmail)?.toLocaleLowerCase('en-US')
    const websiteUrl = optional(input.websiteUrl)
    const logoUrl = optional(input.logoUrl)
    const updated: ProfessionalOrganization = {
      organizationRef: current.organizationRef,
      slug: current.slug,
      displayName: input.displayName.trim(),
      ...(legalName ? { legalName } : {}),
      ...(description ? { description } : {}),
      ...(publicPhone ? { publicPhone } : {}),
      ...(publicEmail ? { publicEmail } : {}),
      ...(websiteUrl ? { websiteUrl } : {}),
      ...(logoUrl ? { logoUrl } : {}),
      trades: [...input.trades],
      serviceAreas: input.serviceAreas.map(area => area.trim()),
      publicationState: input.publicationState,
      provenance: 'company_self_reported',
      revision: current.revision + 1,
      createdAt: current.createdAt,
      updatedAt: FIXTURE_NOW,
    }
    this.#organizations[index] = updated
    return cloneOrganization(updated)
  }

  async listProjectInvitations(
    homeRef: string,
    projectRef: string,
  ): Promise<readonly ProjectInvitation[]> {
    this.#assertSignedIn()
    this.#project(homeRef, projectRef)
    return this.#invitations.filter(invitation => invitation.homeRef === homeRef
      && invitation.projectRef === projectRef).map(cloneInvitation)
  }

  async inviteProfessional(
    homeRef: string,
    projectRef: string,
    input: InviteProfessionalInput,
  ): Promise<ProjectInvitation> {
    this.#assertSignedIn()
    const project = this.#project(homeRef, projectRef)
    const organization = this.#organizations.find(candidate => (
      candidate.organizationRef === input.professionalOrganizationRef
      && candidate.publicationState === 'published'
    ))
    const artifacts = this.#artifacts.get(homeRef) ?? []
    if (!organization || new Set(input.selectedArtifactRefs).size !== input.selectedArtifactRefs.length
      || input.selectedArtifactRefs.some(ref => !artifacts.some(item => (
        item.artifactRef === ref && item.projectRef === projectRef
      )))) {
      throw new Error('preview_invitation_invalid')
    }
    this.#sequence += 1
    const invitation: ProjectInvitation = {
      invitationRef: fixtureRef('hinv', this.#sequence),
      homeRef,
      projectRef,
      professionalOrganizationRef: organization.organizationRef,
      status: 'pending',
      ...(input.message?.trim() ? { message: input.message.trim() } : {}),
      disclosure: {
        title: project.title,
        workKind: project.workKind,
        category: project.category,
        trade: project.category.replaceAll('_', ' '),
        status: project.status,
        summary: project.summary,
        selectedArtifactRefs: [...input.selectedArtifactRefs],
      },
      expiresAt: new Date(new Date(FIXTURE_NOW).getTime()
        + input.expiresInDays * 86_400_000).toISOString(),
      revision: 1,
      createdAt: FIXTURE_NOW,
    }
    this.#invitations.push(invitation)
    return cloneInvitation(invitation)
  }

  async revokeProjectInvitation(
    homeRef: string,
    projectRef: string,
    invitationRef: string,
    input: RevokeProjectInvitationInput,
  ): Promise<ProjectInvitation> {
    this.#assertSignedIn()
    const index = this.#invitations.findIndex(item => item.invitationRef === invitationRef
      && item.homeRef === homeRef && item.projectRef === projectRef)
    const current = this.#invitations[index]
    if (!current || current.revision !== input.expectedRevision
      || (current.status !== 'pending' && current.status !== 'accepted')) {
      throw new Error('preview_invitation_conflict')
    }
    const { respondedAt: _respondedAt, ...withoutResponse } = current
    const updated: ProjectInvitation = {
      ...withoutResponse,
      status: 'revoked',
      revokedAt: FIXTURE_NOW,
      revision: current.revision + 1,
    }
    this.#invitations[index] = updated
    return cloneInvitation(updated)
  }

  async listProfessionalInvitations(): Promise<readonly ProjectInvitation[]> {
    this.#assertSignedIn()
    const organizationRefs = new Set(this.#memberships
      .filter(membership => membership.state === 'active')
      .map(membership => membership.organizationRef))
    return this.#invitations.filter(invitation => (
      organizationRefs.has(invitation.professionalOrganizationRef)
    )).map(cloneInvitation)
  }

  async respondToProjectInvitation(
    invitationRef: string,
    input: RespondToProjectInvitationInput,
  ): Promise<ProjectInvitation> {
    this.#assertSignedIn()
    const organizationRefs = new Set(this.#memberships
      .filter(membership => membership.state === 'active')
      .map(membership => membership.organizationRef))
    const index = this.#invitations.findIndex(item => item.invitationRef === invitationRef
      && organizationRefs.has(item.professionalOrganizationRef))
    const current = this.#invitations[index]
    if (!current || current.status !== 'pending' || current.revision !== input.expectedRevision) {
      throw new Error('preview_invitation_conflict')
    }
    const updated: ProjectInvitation = {
      ...current,
      status: input.response,
      respondedAt: FIXTURE_NOW,
      revision: current.revision + 1,
    }
    this.#invitations[index] = updated
    return cloneInvitation(updated)
  }

  professionalArtifactPreviewSource(invitationRef: string, artifactRef: string): {
    readonly uri: string
    readonly headers: Readonly<Record<string, string>>
  } {
    this.#assertSignedIn()
    const organizationRefs = new Set(this.#memberships
      .filter(membership => membership.state === 'active')
      .map(membership => membership.organizationRef))
    const invitation = this.#invitations.find(item => item.invitationRef === invitationRef
      && item.status === 'accepted' && organizationRefs.has(item.professionalOrganizationRef))
    const selected = invitation?.disclosure.selectedArtifactRefs.includes(artifactRef)
    const exists = invitation && (this.#artifacts.get(invitation.homeRef) ?? [])
      .some(item => item.artifactRef === artifactRef)
    if (!invitation || !selected || !exists) throw new Error('preview_artifact_not_shared')
    return { uri: PHOTO_URI, headers: {} }
  }

  async readProfessionalArtifactContent(
    invitationRef: string,
    artifactRef: string,
  ): Promise<ArtifactContent> {
    this.#assertSignedIn()
    const organizationRefs = new Set(this.#memberships
      .filter(membership => membership.state === 'active')
      .map(membership => membership.organizationRef))
    const invitation = this.#invitations.find(item => item.invitationRef === invitationRef
      && item.status === 'accepted' && organizationRefs.has(item.professionalOrganizationRef))
    const artifact = invitation?.disclosure.selectedArtifactRefs.includes(artifactRef)
      ? (this.#artifacts.get(invitation.homeRef) ?? [])
        .find(item => item.artifactRef === artifactRef)
      : null
    if (!invitation || !artifact) throw new Error('preview_artifact_not_shared')
    return previewArtifactContent(artifact)
  }

  async getProfessionalProposal(invitationRef: string): Promise<ProfessionalProposal | null> {
    this.#assertSignedIn()
    const invitation = (await this.listProfessionalInvitations())
      .find(item => item.invitationRef === invitationRef)
    if (!invitation) throw new Error('preview_invitation_not_found')
    const proposal = this.#proposals.find(item => item.invitationRef === invitationRef)
    return proposal ? cloneProposal(proposal) : null
  }

  async submitProfessionalProposal(
    invitationRef: string,
    input: SubmitProfessionalProposalInput,
  ): Promise<ProfessionalProposal> {
    this.#assertSignedIn()
    const invitation = (await this.listProfessionalInvitations())
      .find(item => item.invitationRef === invitationRef)
    if (!invitation || invitation.status !== 'accepted'
      || this.#proposals.some(item => item.invitationRef === invitationRef)) {
      throw new Error('preview_proposal_conflict')
    }
    const organization = this.#organizations.find(item => (
      item.organizationRef === invitation.professionalOrganizationRef
    ))
    if (!organization) throw new Error('preview_professional_not_found')
    this.#sequence += 1
    const proposal: ProfessionalProposal = {
      quoteRef: fixtureRef('hquo', this.#sequence),
      versionRef: fixtureRef('hpvr', this.#sequence),
      invitationRef,
      professionalOrganizationRef: invitation.professionalOrganizationRef,
      homeRef: invitation.homeRef,
      projectRef: invitation.projectRef,
      contractorLabel: organization.displayName,
      proposalDate: input.proposalDate,
      ...(input.totalAmountCents === undefined ? {} : { totalAmountCents: input.totalAmountCents }),
      currencyCode: 'USD',
      ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
      scope: cloneScope(input.scope),
      state: 'submitted',
      homeownerDecision: 'undecided',
      decisionRevision: 1,
      revision: 1,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    }
    this.#proposals.push(proposal)
    this.#upsertQuote(proposal)
    return cloneProposal(proposal)
  }

  async reviseProfessionalProposal(
    invitationRef: string,
    quoteRef: string,
    input: ReviseProfessionalProposalInput,
  ): Promise<ProfessionalProposal> {
    this.#assertSignedIn()
    const index = this.#proposals.findIndex(item => item.invitationRef === invitationRef
      && item.quoteRef === quoteRef)
    const current = this.#proposals[index]
    if (!current || current.revision !== input.expectedRevision
      || current.homeownerDecision === 'selected') throw new Error('preview_proposal_conflict')
    this.#sequence += 1
    const {
      totalAmountCents: _totalAmountCents,
      summary: _summary,
      ...withoutOptionalProposalFields
    } = current
    const updated: ProfessionalProposal = {
      ...withoutOptionalProposalFields,
      versionRef: fixtureRef('hpvr', this.#sequence),
      proposalDate: input.proposalDate,
      ...(input.totalAmountCents === undefined ? {} : { totalAmountCents: input.totalAmountCents }),
      ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
      scope: cloneScope(input.scope),
      revision: current.revision + 1,
      updatedAt: FIXTURE_NOW,
    }
    this.#proposals[index] = updated
    this.#upsertQuote(updated)
    return cloneProposal(updated)
  }

  async decideProfessionalProposal(
    homeRef: string,
    projectRef: string,
    quoteRef: string,
    input: DecideProfessionalProposalInput,
  ): Promise<ProfessionalProposal> {
    this.#assertSignedIn()
    this.#project(homeRef, projectRef)
    const index = this.#proposals.findIndex(item => item.homeRef === homeRef
      && item.projectRef === projectRef && item.quoteRef === quoteRef)
    const current = this.#proposals[index]
    if (!current || current.decisionRevision !== input.expectedDecisionRevision) {
      throw new Error('preview_proposal_conflict')
    }
    const updated: ProfessionalProposal = {
      ...current,
      homeownerDecision: input.decision,
      decisionRevision: current.decisionRevision + 1,
      updatedAt: FIXTURE_NOW,
    }
    this.#proposals[index] = updated
    this.#upsertQuote(updated)
    return cloneProposal(updated)
  }

  async askRolo(
    homeRef: string,
    message: string,
    history: readonly RoloTurn[],
    conversation: RoloConversationState,
    projectRef?: string,
    selectedPhoto?: RoloSelectedPhoto,
  ): Promise<RoloReply> {
    this.#assertSignedIn()
    this.#home(homeRef)
    const scopedProject = projectRef ? this.#project(homeRef, projectRef) : null
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
    const homeWatch = conversation.pendingWork?.title === 'Seasonal Home Watch checkup'
      || (!conversation.pendingWork && /home watch|checkup|season|maintain|maintenance/i.test(clean))
    const cooling = /\bac\b|air condition|cool/i.test(clean)
      || conversation.pendingWork?.category === 'hvac'
      || history.some(turn => /\bac\b|air condition|cool/i.test(turn.text))
    const poolPlanning = /\bpool\b|swimming|hot tub/i.test(clean)
      || conversation.pendingWork?.category === 'pool'
      || history.some(turn => /\bpool\b|swimming|hot tub/i.test(turn.text))
    const homeHistory = /home history|home record|what (?:was|is) saved|find something|when was|who (?:installed|worked)|warrant(?:y|ies)/i.test(clean)
      && !conversation.pendingWork
    const taskRequest = /\b(?:assign|task|to-do|todo|honey[- ]?do)\b/i.test(clean)
    const requestedAssignee = taskRequest
      ? (this.#householdMembers.get(homeRef) ?? []).find(member => (
          member.state === 'active'
          && clean.toLocaleLowerCase('en-US').includes(member.displayLabel.toLocaleLowerCase('en-US'))
        )) ?? null
      : null
    const proposedWork: RoloReply['proposedWork'] = boundaryRefusal
      ? null
      : homeHistory || scopedProject || (selectedArtifact && !conversation.pendingWork)
      ? null
      : conversation.pendingWork
        ? {
            ...conversation.pendingWork,
            summary: `${conversation.pendingWork.summary} Follow-up: ${clean.slice(0, 240)}`.trim(),
          }
      : taskRequest && requestedAssignee
      ? {
          kind: 'task',
          title: /wall|patch/i.test(clean) ? 'Patch the wall' : 'Household to-do',
          category: /wall|patch/i.test(clean) ? 'interior' : 'other',
          status: 'planned',
          occurredOn: null,
          assignedMembershipRef: requestedAssignee.membershipRef,
          dueOn: /\bfriday\b/i.test(clean) ? '2026-08-28' : null,
          summary: `Assigned household task based on: ${clean.slice(0, 240)}`,
          professionalLabel: null,
          firstUpdate: 'Created from a private Rolo conversation after homeowner review.',
        }
      : homeWatch
      ? {
          kind: 'service',
          title: 'Seasonal Home Watch checkup',
          category: 'other',
          status: 'planned',
          occurredOn: null,
          assignedMembershipRef: null,
          dueOn: null,
          summary: 'Walk the exterior, roofline, plumbing fixtures, HVAC filters, safety devices, and visible electrical areas; save comparable photos and observations.',
          professionalLabel: null,
          firstUpdate: 'Started from the Rolo preview checkup guide.',
        }
      : poolPlanning
      ? {
          kind: 'project',
          title: 'Plan a backyard pool',
          category: 'pool',
          status: 'planned',
          occurredOn: null,
          assignedMembershipRef: null,
          dueOn: null,
          summary: 'Organize how the pool should be used, the yard constraints, a comfortable budget range, finishes, safety needs, and the details companies should price.',
          professionalLabel: null,
          firstUpdate: 'Started with Rolo and saved only after homeowner review.',
        }
      : {
          kind: cooling ? 'issue' : 'repair',
          title: cooling ? 'Upstairs AC is not cooling' : 'Follow up on the home concern',
          category: cooling ? 'hvac' : 'other',
          status: 'planned',
          occurredOn: '2026-08-26',
          assignedMembershipRef: null,
          dueOn: null,
          summary: cooling
            ? 'Homeowner noticed reduced cooling upstairs. Check the thermostat, filter, vents, and outdoor-unit clearance without opening energized equipment.'
            : `Preview draft based on: ${clean.slice(0, 240)}`,
          professionalLabel: null,
          firstUpdate: 'Started in Rolo and added to Work after homeowner review.',
        }

    return {
      requestRef: fixtureRef('hask', this.#sequence),
      answer: boundaryRefusal
        ? 'I cannot decide insurance coverage or provide legal advice. I did not open the attached photo. I can help you organize the facts and questions for a licensed professional.'
        : homeHistory
        ? 'I can help you look through saved work, companies, photos, files, and warranties without creating a new project. Tell me what you remember—even roughly—and we can narrow it down.'
        : selectedArtifact
        ? 'I can describe what is visible in this photo, but I cannot confirm hidden damage or diagnose the cause from one image. I do not see smoke, exposed wiring, or anything obviously displaced in this sample.'
        : scopedProject
        ? `I’m looking at “${scopedProject.title}.” ${scopedProject.summary
            ? `The saved summary says: ${scopedProject.summary}`
            : 'It does not have a summary yet.'} We can work through what is missing without creating another copy of this work.`
        : taskRequest && requestedAssignee
          ? `I made a household to-do for ${requestedAssignee.displayLabel}${/\bfriday\b/i.test(clean) ? ' due Friday' : ''}. Review it before anything is shared in Work.`
        : homeWatch
          ? 'Start with a calm, repeatable walk-through. Compare the same views each season, note only what you can safely observe, and call a qualified professional for anything energized, leaking, unstable, or unsafe.'
          : poolPlanning
            ? conversation.pendingWork
              ? 'Got it. I kept that with the pool plan so the next decision builds on what you already told me. Nothing changes in Work until you approve the draft.'
              : 'Let’s shape the idea before asking anyone to price it. Start with how you want to use the pool, what must fit in the yard, and the budget range you would actually be comfortable with. I made a planning draft for you to review.'
          : cooling
            ? conversation.pendingWork
              ? 'Good—that lowers the immediate urgency. I added when it started and the absence of leaks, sparks, or other safety signs to the draft. If the simple checks do not restore cooling, the next step is an HVAC visit.'
              : 'You can safely confirm the thermostat mode and set point, look at the filter, make sure supply vents are open, and check that the outdoor unit is not blocked. Do not open electrical panels or equipment covers. I made a draft you can review.'
            : 'I organized that into a reviewable Work draft. You can approve it, discard it, or keep talking before anything is saved.',
      proposedWork,
      destination: boundaryRefusal || homeHistory || (!proposedWork && !scopedProject) ? null : 'work',
      projectRef: scopedProject?.projectRef ?? null,
      followUpQuestions: boundaryRefusal || conversation.unansweredFollowUpQuestion
        ? []
        : homeHistory
          ? ['What are you trying to find—a date, company, product, warranty, photo, or past repair?']
          : scopedProject
            ? ['Do you want to work through the scope, the next decision, or who needs to be involved?']
          : taskRequest && requestedAssignee
            ? ['Anything else should be included before this is shared with the household?']
          : poolPlanning
            ? ['What matters most for this pool: family use, entertaining, exercise, low maintenance, or a particular look?']
            : homeWatch
              ? ['Would you rather start outside, inside, or with one system such as HVAC or plumbing?']
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

  async listArtifacts(homeRef: string): Promise<readonly ResolvedArtifactRecord[]> {
    this.#assertSignedIn()
    this.#home(homeRef)
    return (this.#artifacts.get(homeRef) ?? []).map(cloneArtifact)
  }

  artifactPreviewSource(homeRef: string, artifactRef: string): import('../api/image-source.ts').ProtectedImageSource {
    const artifactExists = (this.#artifacts.get(homeRef) ?? [])
      .some(item => item.artifactRef === artifactRef && item.kind === 'photo')
    if (!artifactExists) throw new Error('preview_artifact_not_found')
    return { uri: PHOTO_URI, headers: {} }
  }

  async readArtifactContent(homeRef: string, artifact: ArtifactRecord): Promise<ArtifactContent> {
    this.#assertSignedIn()
    this.#home(homeRef)
    const record = (this.#artifacts.get(homeRef) ?? []).find(item => (
      item.artifactRef === artifact.artifactRef && artifact.homeRef === homeRef
    ))
    if (!record) throw new Error('preview_artifact_not_found')
    return previewArtifactContent(record)
  }

  async uploadArtifact(
    homeRef: string,
    kind: ArtifactKind,
    deviceFile: DeviceFile,
    projectRef?: string,
  ): Promise<ResolvedArtifactRecord> {
    void homeRef
    void kind
    void deviceFile
    void projectRef
    throw new Error('preview_upload_disabled')
  }

  async updateArtifactMetadata(
    homeRef: string,
    artifactRef: string,
    input: UpdateArtifactMetadataInput,
  ): Promise<ResolvedArtifactRecord> {
    this.#assertSignedIn()
    this.#home(homeRef)
    const body = artifactMetadataUpdateBody(input)
    const intent = JSON.stringify({ homeRef, artifactRef, ...body })
    const prior = this.#artifactMetadataCommands.get(body.commandRef)
    if (prior) {
      if (prior.intent !== intent) throw new Error('preview_command_conflict')
      return cloneArtifact(prior.artifact)
    }
    const records = this.#artifacts.get(homeRef) ?? []
    const index = records.findIndex(item => item.artifactRef === artifactRef)
    const current = records[index]
    if (!current) throw new Error('preview_artifact_not_found')
    if (current.revision !== body.expectedRevision) throw new Error('preview_revision_conflict')
    if (body.projectRef !== null
      && !(this.#work.get(homeRef) ?? []).some(item => item.projectRef === body.projectRef)) {
      throw new Error('preview_work_not_found')
    }
    if (current.kind !== 'photo'
      && (body.observedOn !== null || body.phase !== null
        || body.areaLabel !== null || body.geoPin !== null)) {
      throw new Error('preview_photo_metadata_requires_photo')
    }
    const updated: ResolvedArtifactRecord = {
      ...current,
      projectRef: body.projectRef,
      observedOn: body.observedOn,
      phase: body.phase,
      areaLabel: body.areaLabel,
      geoPin: body.geoPin,
      revision: current.revision + 1,
      updatedAt: FIXTURE_NOW,
    }
    records[index] = updated
    this.#artifactMetadataCommands.set(body.commandRef, {
      intent,
      artifact: cloneArtifact(updated),
    })
    return cloneArtifact(updated)
  }

  async listHomeCheckups(homeRef: string): Promise<readonly HomeCheckupPhoto[]> {
    this.#assertSignedIn()
    this.#home(homeRef)
    return (this.#checkups.get(homeRef) ?? []).map(cloneCheckup)
  }

  homeCheckupPhotoSource(
    homeRef: string,
    photoRef: string,
    variant: 'thumbnail' | 'full',
  ): import('../api/image-source.ts').ProtectedImageSource {
    void variant
    const found = (this.#checkups.get(homeRef) ?? []).some(photo => photo.photoRef === photoRef)
    if (!found) throw new Error('preview_checkup_not_found')
    return { uri: PHOTO_URI, headers: {} }
  }

  async uploadHomeCheckup(
    homeRef: string,
    input: CreateHomeCheckupPhotoInput,
  ): Promise<HomeCheckupPhoto> {
    void homeRef
    void input
    throw new Error('preview_upload_disabled')
  }

  async deleteHomeCheckup(
    homeRef: string,
    photoRef: string,
  ): Promise<DeletedHomeCheckupPhoto> {
    void homeRef
    void photoRef
    throw new Error('preview_write_disabled')
  }

  #project(homeRef: string, projectRef: string): WorkRecord {
    this.#home(homeRef)
    const found = (this.#work.get(homeRef) ?? []).find(item => item.projectRef === projectRef)
    if (!found) throw new Error('preview_work_not_found')
    return found
  }

  #upsertQuote(proposal: ProfessionalProposal): void {
    const quotes = this.#quotes.get(proposal.projectRef) ?? []
    const index = quotes.findIndex(item => item.quoteRef === proposal.quoteRef)
    const next = proposalQuote(proposal)
    if (index === -1) quotes.push(next)
    else quotes[index] = next
    this.#quotes.set(proposal.projectRef, quotes)
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
