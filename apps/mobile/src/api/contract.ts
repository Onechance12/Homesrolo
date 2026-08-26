import type {
  ArtifactKind,
  ArtifactRecord,
  CreateWorkInput,
  DeviceFile,
  HomeSummary,
  HomeView,
  NativeSessionCredential,
  RoloReply,
  RoloTurn,
  ServerSession,
  UpdateWorkInput,
  WorkRecord,
} from './model.ts'

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
  addWorkNote(
    homeRef: string,
    projectRef: string,
    body: string,
    commandRef?: string,
  ): Promise<void>
  askRolo(homeRef: string, message: string, history: readonly RoloTurn[]): Promise<RoloReply>
  listArtifacts(homeRef: string): Promise<readonly ArtifactRecord[]>
  artifactPreviewSource(homeRef: string, artifactRef: string): {
    readonly uri: string
    readonly headers: Readonly<Record<string, string>>
  }
  uploadArtifact(
    homeRef: string,
    kind: ArtifactKind,
    deviceFile: DeviceFile,
    projectRef?: string,
  ): Promise<ArtifactRecord>
}
