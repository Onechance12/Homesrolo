/**
 * SERVER-ONLY runtime assembly.
 *
 * A complete, validated server configuration attaches the Supabase-backed
 * identity, repository, command, and magic-link providers. Any missing or
 * malformed value leaves every port fail-closed. No synthetic fixture exists
 * on this side of the boundary.
 */

import { HomeownerApiError, HomeownerApiService } from '../../../../src/homeowner/homeowner-api.v1.ts'
import type {
  HomeownerCommandPort, HomeownerIdentityPort, HomeownerRepositoryPort,
} from '../../../../src/homeowner/homeowner-runtime.v1.ts'
import { HomeownerAuthService } from './auth.ts'
import { HomeownerProjectReviewService } from '../../../../src/homeowner/homeowner-project-review.v1.ts'
import {
  readHomeownerRuntimeConfiguration,
  type HomeownerRuntimeConfiguration,
} from './config.ts'
import { createSupabaseClients, SupabaseHomeownerProvider } from './supabase-provider.ts'
import { jobroloIntakeClientForEnvironment } from './jobrolo-intake-client.ts'

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
  magicLinkSignIn: false,
  persistence: false,
  uploads: false,
  projectReview: false,
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

let service: HomeownerApiService | null = null
const jobroloIntakeClient = jobroloIntakeClientForEnvironment(environment)
let projectReviewService: HomeownerProjectReviewService | null = null

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

export function homeownerApiService(): HomeownerApiService {
  if (!service) {
    service = new HomeownerApiService({
      identity: provider ?? unconfiguredIdentity,
      repository: provider ?? unconfiguredRepository,
      commands: provider ?? unconfiguredCommands,
      ...(provider ? { privateObjects: provider } : {}),
      now: () => new Date().toISOString(),
      capabilities: provider ? Object.freeze({
        magicLinkSignIn: true,
        persistence: true,
        uploads: configuration?.privateUploadsEnabled === true,
        projectReview: projectReviewCapabilityEnabled(
          provider !== null,
          jobroloIntakeClient !== null,
        ),
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
  })
  return projectReviewService
}
