import type {
  AcceptHouseholdInvitationInput,
  ArtifactContent,
  ArtifactKind,
  ArtifactRecord,
  ResolvedArtifactRecord,
  CreateProjectQuoteInput,
  CreateProfessionalOrganizationInput,
  CreateWorkInput,
  CreatedProfessionalOrganization,
  DecideProfessionalProposalInput,
  DeviceFile,
  DeletedHomeCheckupPhoto,
  CreateHomeCheckupPhotoInput,
  CreateHouseholdInvitationInput,
  HomeCheckupPhoto,
  HomeRecordProfile,
  HomeSummary,
  HomeView,
  HouseholdInvitation,
  HouseholdInvitationAcceptance,
  HouseholdMember,
  HouseholdRoster,
  NativeSessionCredential,
  ProfessionalOrganization,
  ProfessionalProfileWorkspace,
  ProfessionalProposal,
  ProfessionalTrade,
  ProjectActivityRecord,
  ProjectItem,
  ProjectInvitation,
  ProjectQuote,
  RespondToProjectInvitationInput,
  RemoveHouseholdMemberInput,
  RevokeHouseholdInvitationInput,
  RevokeProjectInvitationInput,
  ReviseProfessionalProposalInput,
  RoloReply,
  RoloConversationState,
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
} from './model.ts'
import type { ProtectedImageSource } from './image-source.ts'
import type { HomeRecordAddress, HomePropertySnapshot, PropertyLookupResult } from './model.ts'
import type { SaveHomePropertyInput } from './property.ts'

/** The platform-neutral API surface consumed by the mobile views and session layer. */
export interface HomesroloApi {
  newCommandRef(): Promise<string>
  requestEmailCode(email: string): Promise<void>
  /** Native receives a bearer; web establishes an HttpOnly cookie and returns null. */
  verifyEmailCode(email: string, code: string): Promise<NativeSessionCredential | null>
  /** One-way migration for a bearer persisted by an older PWA release. */
  upgradeLegacyPwaSession(legacyBearer: string | null): Promise<void>
  session(): Promise<ServerSession>
  signOut(): Promise<void>
  listHomes(): Promise<readonly HomeSummary[]>
  createHome(
    displayLabel: string,
    privateLocationLabel: string,
    createCommandRef?: string,
  ): Promise<HomeSummary>
  getHome(homeRef: string): Promise<HomeView>
  getHousehold(homeRef: string): Promise<HouseholdRoster>
  /** Optional presentation roster; work remains usable when this route is unavailable. */
  listHouseholdMembers(homeRef: string): Promise<readonly HouseholdMember[]>
  createHouseholdInvitation(homeRef: string, input: CreateHouseholdInvitationInput): Promise<HouseholdInvitation>
  acceptHouseholdInvitation(
    invitationRef: string,
    input: AcceptHouseholdInvitationInput,
  ): Promise<HouseholdInvitationAcceptance>
  revokeHouseholdInvitation(
    homeRef: string,
    invitationRef: string,
    input: RevokeHouseholdInvitationInput,
  ): Promise<HouseholdInvitation>
  removeHouseholdMember(
    homeRef: string,
    membershipRef: string,
    input: RemoveHouseholdMemberInput,
  ): Promise<HouseholdMember>
  setHouseholdMemberRole(
    homeRef: string,
    membershipRef: string,
    input: SetHouseholdMemberRoleInput,
  ): Promise<HouseholdMember>
  getHomeRecord(homeRef: string): Promise<HomeRecordProfile>
  updateHomeRecord(homeRef: string, input: UpdateHomeRecordInput): Promise<HomeRecordProfile>
  lookupProperty?(address: HomeRecordAddress): Promise<PropertyLookupResult>
  getHomeProperty?(homeRef: string): Promise<HomePropertySnapshot | null>
  saveHomeProperty?(homeRef: string, input: SaveHomePropertyInput): Promise<HomePropertySnapshot>
  listWork(homeRef: string): Promise<readonly WorkRecord[]>
  createWork(homeRef: string, input: CreateWorkInput): Promise<WorkRecord>
  updateWork(homeRef: string, projectRef: string, input: UpdateWorkInput): Promise<WorkRecord>
  listProjectActivity(
    homeRef: string,
    projectRef: string,
  ): Promise<readonly ProjectActivityRecord[]>
  addWorkNote(
    homeRef: string,
    projectRef: string,
    body: string,
    commandRef?: string,
  ): Promise<ProjectActivityRecord>
  addWorkMilestone(
    homeRef: string,
    projectRef: string,
    body: string,
    commandRef?: string,
  ): Promise<ProjectActivityRecord>
  listProjectItems(homeRef: string, projectRef: string): Promise<readonly ProjectItem[]>
  saveProjectItem(
    homeRef: string,
    projectRef: string,
    input: SaveProjectItemInput,
  ): Promise<ProjectItem>
  listProjectQuotes(homeRef: string, projectRef: string): Promise<readonly ProjectQuote[]>
  createProjectQuote(
    homeRef: string,
    projectRef: string,
    input: CreateProjectQuoteInput,
  ): Promise<ProjectQuote>
  saveProjectQuote(
    homeRef: string,
    projectRef: string,
    quoteRef: string,
    input: SaveProjectQuoteInput,
  ): Promise<ProjectQuote>
  listProfessionals(filters?: {
    readonly trade?: ProfessionalTrade
    readonly serviceArea?: string
  }): Promise<readonly ProfessionalOrganization[]>
  getProfessional(slug: string): Promise<ProfessionalOrganization>
  getProfessionalProfile(): Promise<ProfessionalProfileWorkspace>
  createProfessionalOrganization(
    input: CreateProfessionalOrganizationInput,
  ): Promise<CreatedProfessionalOrganization>
  saveProfessionalProfile(input: SaveProfessionalProfileInput): Promise<ProfessionalOrganization>
  listProjectInvitations(homeRef: string, projectRef: string): Promise<readonly ProjectInvitation[]>
  inviteProfessional(
    homeRef: string,
    projectRef: string,
    input: InviteProfessionalInput,
  ): Promise<ProjectInvitation>
  revokeProjectInvitation(
    homeRef: string,
    projectRef: string,
    invitationRef: string,
    input: RevokeProjectInvitationInput,
  ): Promise<ProjectInvitation>
  listProfessionalInvitations(): Promise<readonly ProjectInvitation[]>
  respondToProjectInvitation(
    invitationRef: string,
    input: RespondToProjectInvitationInput,
  ): Promise<ProjectInvitation>
  professionalArtifactPreviewSource(
    invitationRef: string,
    artifactRef: string,
  ): ProtectedImageSource
  readProfessionalArtifactContent(
    invitationRef: string,
    artifactRef: string,
  ): Promise<ArtifactContent>
  getProfessionalProposal(invitationRef: string): Promise<ProfessionalProposal | null>
  submitProfessionalProposal(
    invitationRef: string,
    input: SubmitProfessionalProposalInput,
  ): Promise<ProfessionalProposal>
  reviseProfessionalProposal(
    invitationRef: string,
    quoteRef: string,
    input: ReviseProfessionalProposalInput,
  ): Promise<ProfessionalProposal>
  decideProfessionalProposal(
    homeRef: string,
    projectRef: string,
    quoteRef: string,
    input: DecideProfessionalProposalInput,
  ): Promise<ProfessionalProposal>
  askRolo(
    homeRef: string,
    message: string,
    history: readonly RoloTurn[],
    conversation: RoloConversationState,
    projectRef?: string,
    selectedPhoto?: RoloSelectedPhoto,
  ): Promise<RoloReply>
  listArtifacts(homeRef: string): Promise<readonly ResolvedArtifactRecord[]>
  artifactPreviewSource(homeRef: string, artifactRef: string): ProtectedImageSource
  readArtifactContent(homeRef: string, artifact: ArtifactRecord): Promise<ArtifactContent>
  uploadArtifact(
    homeRef: string,
    kind: ArtifactKind,
    deviceFile: DeviceFile,
    projectRef?: string,
  ): Promise<ResolvedArtifactRecord>
  updateArtifactMetadata(
    homeRef: string,
    artifactRef: string,
    input: UpdateArtifactMetadataInput,
  ): Promise<ResolvedArtifactRecord>
  listHomeCheckups(homeRef: string): Promise<readonly HomeCheckupPhoto[]>
  homeCheckupPhotoSource(
    homeRef: string,
    photoRef: string,
    variant: 'thumbnail' | 'full',
  ): ProtectedImageSource
  uploadHomeCheckup(
    homeRef: string,
    input: CreateHomeCheckupPhotoInput,
  ): Promise<HomeCheckupPhoto>
  deleteHomeCheckup(homeRef: string, photoRef: string): Promise<DeletedHomeCheckupPhoto>
}
