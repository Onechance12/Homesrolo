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
import { createHmac } from 'node:crypto'
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
import {
  OpenAIHomeAssistantClient,
  readHomeAssistantConfiguration,
} from './home-assistant.ts'
import { HomesroloProfessionalService } from '../../../../src/homeowner/homesrolo-professional-service.v1.ts'
import { HomeownerHouseholdService } from '../../../../src/homeowner/homeowner-household.v1.ts'

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
const homeAssistantConfiguration = readHomeAssistantConfiguration(environment)
const homeAssistantClient = homeAssistantConfiguration
  ? new OpenAIHomeAssistantClient({ configuration: homeAssistantConfiguration })
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
let professionalService: HomesroloProfessionalService | null = null
let householdService: HomeownerHouseholdService | null = null

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
      ...(provider ? { homeRecordProfile: provider } : {}),
      ...(provider ? { privateObjects: provider } : {}),
      ...(provider ? { artifactMetadata: provider } : {}),
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
        homeAssistant: homeAssistantClient !== null,
        homeAssistantVision: homeAssistantClient !== null
          && configuration?.privateUploadsEnabled === true
          && configuration?.roloVisionEnabled === true,
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
        invitations: configuration?.projectQuotesEnabled === true
          && configuration?.professionalInvitationsEnabled === true,
        sharing: configuration?.emailCodeRateLimitSecret !== null,
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

export function configuredHomesroloProfessionalService(): HomesroloProfessionalService | null {
  if (!provider || configuration?.projectQuotesEnabled !== true
    || configuration?.professionalInvitationsEnabled !== true) return null
  professionalService ??= new HomesroloProfessionalService({
    enabled: true,
    identity: provider,
    homeownerRepository: provider,
    professionals: provider,
    now: () => new Date().toISOString(),
  })
  return professionalService
}

function householdEmailHashKey(secret: string): string {
  return createHmac('sha256', secret)
    .update('homesrolo-household-email-binding-v1')
    .digest('hex')
}

export function configuredHomeownerHouseholdService(): HomeownerHouseholdService | null {
  if (!provider || !configuration?.emailCodeRateLimitSecret) return null
  householdService ??= new HomeownerHouseholdService({
    enabled: true,
    identity: provider,
    households: provider,
    now: () => new Date().toISOString(),
    // Domain separation lets the already-required server HMAC secret back a
    // distinct household email binding without adding a paid service or
    // exposing either key to the browser.
    emailHashKey: householdEmailHashKey(configuration.emailCodeRateLimitSecret),
  })
  return householdService
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

export function configuredHomeAssistantClient(): OpenAIHomeAssistantClient | null {
  return homeAssistantClient
}
