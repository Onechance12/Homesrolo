/**
 * SERVER-ONLY runtime assembly.
 *
 * A complete, validated server configuration attaches the Supabase-backed
 * identity, repository, command, and magic-link providers. Any missing or
 * malformed value leaves every port fail-closed. No synthetic fixture exists
 * on this side of the boundary.
 */

import {
  HomeownerApiError,
  HomeownerApiService,
  type HomeownerApiRequestContext,
} from '../../../../src/homeowner/homeowner-api.v1.ts'
import type {
  HomeownerCommandPort, HomeownerIdentityPort, HomeownerRepositoryPort,
} from '../../../../src/homeowner/homeowner-runtime.v1.ts'
import { HomeownerAuthService } from './auth.ts'
import { EmailCodeRateLimiter } from './email-code-rate-limit.ts'
import { HomeownerProjectReviewService } from '../../../../src/homeowner/homeowner-project-review.v1.ts'
import { HomeRecordHandoffService } from '../../../../src/homeowner/home-record-handoff.v1.ts'
import {
  readHomeownerRuntimeConfiguration,
  type HomeownerRuntimeConfiguration,
} from './config.ts'
import { createSupabaseClients, SupabaseHomeownerProvider } from './supabase-provider.ts'
import {
  SignedJobroloIntakeClient,
  readJobroloIntakeClientConfiguration,
  readJobroloIntakeCredentialResidue,
} from './jobrolo-intake-client.ts'
import {
  SignedJobroloHandoffClient,
  readJobroloHandoffClientConfiguration,
} from './jobrolo-handoff-client.ts'
import { SupabaseHomeRecordHandoffProvider } from './supabase-home-record-handoff-provider.ts'
import {
  homeRecordHandoffActivationCredentialsSeparated,
  homeRecordHandoffReleaseEnvironmentAllowed,
  homeRecordHandoffSecurityProviders,
  readHomeRecordHandoffSecurityConfiguration,
} from './home-record-handoff-security.ts'
import {
  OpenAIHomeResearchClient,
  readHomeResearchConfiguration,
} from './home-research.ts'

const unconfiguredIdentity: HomeownerIdentityPort = {
  async resolvePrincipal() { return null },
}

const unconfiguredRepository: HomeownerRepositoryPort = {
  async readMembership() { throw new HomeownerApiError('unavailable') },
  async listMemberships() { throw new HomeownerApiError('unavailable') },
  async listWarranties() { throw new HomeownerApiError('unavailable') },
  async listMaintenance() { throw new HomeownerApiError('unavailable') },
  async readHome() { throw new HomeownerApiError('unavailable') },
  async readPropertyFacts() { throw new HomeownerApiError('unavailable') },
  async listSystems() { throw new HomeownerApiError('unavailable') },
  async listProjects() { throw new HomeownerApiError('unavailable') },
  async listArtifactMetadata() { throw new HomeownerApiError('unavailable') },
}

const unconfiguredCommands: HomeownerCommandPort = {
  async createPrivateHomeWorkspace() { throw new HomeownerApiError('unavailable') },
  async createProject() { throw new HomeownerApiError('unavailable') },
  async recordInitialIntake() { throw new HomeownerApiError('unavailable') },
}

const UNCONFIGURED_CAPABILITIES = Object.freeze({
  emailCodeSignIn: false,
  magicLinkSignIn: false,
  persistence: false,
  projectQuotes: false,
  homeResearch: false,
  uploads: false,
  photoCheckups: false,
  projectReview: false,
  projectReviewAttachments: false,
  homeRecordHandoffs: false,
  invitations: false,
  sharing: false,
})

const environment = process.env
const configuration = readHomeownerRuntimeConfiguration(environment)
const clients = configuration ? createSupabaseClients(configuration) : null
const provider = clients && configuration
  ? new SupabaseHomeownerProvider(
      clients.service,
      () => new Date().toISOString(),
      configuration.supabaseUrl,
    )
  : null
const auth = configuration && clients
  ? new HomeownerAuthService({ auth: clients.auth, service: clients.service, configuration })
  : null
const emailCodeRateLimiter = configuration?.emailCodeRateLimitSecret
  ? new EmailCodeRateLimiter({ secret: configuration.emailCodeRateLimitSecret })
  : null

let service: HomeownerApiService | null = null
const jobroloIntakeConfiguration = readJobroloIntakeClientConfiguration(environment)
const jobroloIntakeCredentialResidue = readJobroloIntakeCredentialResidue(environment)
const jobroloIntakeClient = jobroloIntakeConfiguration
  ? new SignedJobroloIntakeClient({ configuration: jobroloIntakeConfiguration })
  : null
const homeResearchConfiguration = readHomeResearchConfiguration(environment)
const homeResearchClient = homeResearchConfiguration
  ? new OpenAIHomeResearchClient({ configuration: homeResearchConfiguration })
  : null
let projectReviewService: HomeownerProjectReviewService | null = null
const jobroloHandoffConfiguration = readJobroloHandoffClientConfiguration(environment)
const homeRecordHandoffSecurityConfiguration =
  readHomeRecordHandoffSecurityConfiguration(environment)
const homeRecordHandoffCredentialsSeparated = jobroloHandoffConfiguration
  && homeRecordHandoffSecurityConfiguration
  && jobroloIntakeCredentialResidue.state !== 'invalid'
  && homeRecordHandoffReleaseEnvironmentAllowed(environment.NODE_ENV)
  ? homeRecordHandoffActivationCredentialsSeparated(
      jobroloHandoffConfiguration,
      homeRecordHandoffSecurityConfiguration,
      jobroloIntakeCredentialResidue.credentials,
    )
  : false
const jobroloHandoffClient = jobroloHandoffConfiguration
  && homeRecordHandoffCredentialsSeparated
  ? new SignedJobroloHandoffClient({ configuration: jobroloHandoffConfiguration })
  : null
const homeRecordHandoffProvider = clients && homeRecordHandoffSecurityConfiguration
  ? new SupabaseHomeRecordHandoffProvider(clients.service)
  : null
const homeRecordHandoffSecurity = homeRecordHandoffSecurityConfiguration
  && homeRecordHandoffCredentialsSeparated
  ? homeRecordHandoffSecurityProviders(homeRecordHandoffSecurityConfiguration)
  : null
let homeRecordHandoffService: HomeRecordHandoffService | null = null

export function projectReviewCapabilityEnabled(
  providerConfigured: boolean,
  jobroloIntakeConfigured: boolean,
): boolean {
  return providerConfigured && jobroloIntakeConfigured
}

export function homeownerRuntimeConfiguration(): HomeownerRuntimeConfiguration | null {
  return configuration
}

export function configuredHomeownerAuthService(): HomeownerAuthService | null {
  return auth
}

export function configuredEmailCodeRateLimiter(): EmailCodeRateLimiter | null {
  return emailCodeRateLimiter
}

export function homeownerApiService(): HomeownerApiService {
  if (!service) {
    service = new HomeownerApiService({
      identity: provider ?? unconfiguredIdentity,
      repository: provider ?? unconfiguredRepository,
      commands: provider ?? unconfiguredCommands,
      ...(provider ? { privateObjects: provider } : {}),
      ...(provider ? { projectWorkspace: provider } : {}),
      ...(provider && configuration?.projectQuotesEnabled === true
        ? { projectQuotes: provider }
        : {}),
      ...(provider && configuration?.photoCheckupsEnabled === true
        ? { checkupPhotos: provider }
        : {}),
      now: () => new Date().toISOString(),
      capabilities: provider ? Object.freeze({
        // This stays false until both Supabase email templates and production
        // SMTP have been verified to deliver a six-digit {{ .Token }}.
        emailCodeSignIn: configuration?.emailCodeSignInEnabled === true,
        magicLinkSignIn: configuration?.emailCodeSignInEnabled !== true,
        persistence: true,
        projectQuotes: configuration?.projectQuotesEnabled === true,
        homeResearch: homeResearchClient !== null,
        uploads: configuration?.privateUploadsEnabled === true,
        photoCheckups: configuration?.photoCheckupsEnabled === true,
        projectReview: projectReviewCapabilityEnabled(
          provider !== null,
          jobroloIntakeClient !== null,
        ),
        projectReviewAttachments: projectReviewCapabilityEnabled(
          provider !== null,
          jobroloIntakeClient !== null,
        ) && configuration?.privateUploadsEnabled === true
          && configuration?.jobroloAttachmentsEnabled === true,
        homeRecordHandoffs: homeRecordHandoffProvider !== null
          && jobroloHandoffClient !== null
          && homeRecordHandoffSecurity !== null
          && homeRecordHandoffSecurityConfiguration !== null,
        invitations: false,
        sharing: false,
      }) : UNCONFIGURED_CAPABILITIES,
    })
  }
  return service
}

export function configuredProjectReviewService(): HomeownerProjectReviewService | null {
  if (!provider || !jobroloIntakeClient) return null
  projectReviewService ??= new HomeownerProjectReviewService({
    identity: provider,
    repository: provider,
    persistence: provider,
    transport: jobroloIntakeClient,
    attachmentsEnabled: configuration?.jobroloAttachmentsEnabled === true,
  })
  return projectReviewService
}

/**
 * The handoff remains unavailable unless the code-owned release-environment
 * interlock, base Supabase runtime, independent handoff gate, signed Jobrolo
 * transport, pinned keys, separated credentials, and local scanner all allow
 * it. Routes must use the returned server-owned recipient ref; a browser must
 * never choose one.
 */
export function configuredHomeRecordHandoffService(): {
  readonly service: HomeRecordHandoffService
  readonly claimExactShare: (
    context: HomeownerApiRequestContext,
    requestedHomeRef: string,
    requestedShareId: string,
  ) => ReturnType<HomeRecordHandoffService['claimForController']>
} | null {
  if (!provider || !homeRecordHandoffProvider || !jobroloHandoffClient
    || !homeRecordHandoffSecurity || !homeRecordHandoffSecurityConfiguration) return null
  homeRecordHandoffService ??= new HomeRecordHandoffService({
    enabled: true,
    identity: provider,
    repository: provider,
    recipients: homeRecordHandoffProvider,
    trust: homeRecordHandoffSecurity.trust,
    source: jobroloHandoffClient,
    signer: homeRecordHandoffSecurity.signer,
    scanner: homeRecordHandoffSecurity.scanner,
    persistence: homeRecordHandoffProvider,
    objects: homeRecordHandoffProvider,
  })
  const configuredService = homeRecordHandoffService
  const configuredRecipientRef = homeRecordHandoffSecurityConfiguration.recipientRef
  return Object.freeze({
    service: configuredService,
    claimExactShare: (context, requestedHomeRef, requestedShareId) =>
      configuredService.claimForController(
        context,
        requestedHomeRef,
        requestedShareId,
        configuredRecipientRef,
      ),
  })
}

export function configuredHomeResearchClient(): OpenAIHomeResearchClient | null {
  return homeResearchClient
}
