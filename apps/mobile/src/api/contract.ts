import type {
  ArtifactContent,
  ArtifactKind,
  ArtifactRecord,
  CreateProfessionalOrganizationInput,
  CreateWorkInput,
  CreatedProfessionalOrganization,
  DecideProfessionalProposalInput,
  DeviceFile,
  HomeSummary,
  HomeView,
  NativeSessionCredential,
  ProfessionalOrganization,
  ProfessionalProfileWorkspace,
  ProfessionalProposal,
  ProfessionalTrade,
  ProjectActivityRecord,
  ProjectInvitation,
  ProjectQuote,
  RespondToProjectInvitationInput,
  RevokeProjectInvitationInput,
  ReviseProfessionalProposalInput,
  RoloReply,
  RoloConversationState,
  RoloSelectedPhoto,
  RoloTurn,
  ServerSession,
  SaveProfessionalProfileInput,
  SubmitProfessionalProposalInput,
  InviteProfessionalInput,
  UpdateWorkInput,
  WorkRecord,
} from './model.ts'
import type { ProtectedImageSource } from './image-source.ts'

/** The platform-neutral API surface consumed by the mobile views and session layer. */
export interface HomesroloApi {
  newCommandRef(): Promise<string>
  requestEmailCode(email: string): Promise<void>
  verifyEmailCode(email: string, code: string): Promise<NativeSessionCredential>
  session(): Promise<ServerSession>
  signOut(): Promise<void>
  listHomes(): Promise<readonly HomeSummary[]>
  createHome(
    displayLabel: string,
    privateLocationLabel: string,
    createCommandRef?: string,
  ): Promise<HomeSummary>
  getHome(homeRef: string): Promise<HomeView>
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
  listProjectQuotes(homeRef: string, projectRef: string): Promise<readonly ProjectQuote[]>
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
    selectedPhoto?: RoloSelectedPhoto,
  ): Promise<RoloReply>
  listArtifacts(homeRef: string): Promise<readonly ArtifactRecord[]>
  artifactPreviewSource(homeRef: string, artifactRef: string): ProtectedImageSource
  readArtifactContent(homeRef: string, artifact: ArtifactRecord): Promise<ArtifactContent>
  uploadArtifact(
    homeRef: string,
    kind: ArtifactKind,
    deviceFile: DeviceFile,
    projectRef?: string,
  ): Promise<ArtifactRecord>
}
