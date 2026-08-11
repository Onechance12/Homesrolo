/**
 * SERVER-ONLY runtime assembly — the port seam where the integration lane
 * attaches real identity and repository providers.
 *
 * Nothing is configured in this lane, and the assembly says so by failing
 * closed: the identity port resolves every handle to null (so the session
 * reads as signed_out and protected reads return 401), the repository refuses
 * to answer (unreachable while identity resolves nothing, and honest if it is
 * ever reached anyway), and every capability is false. NO synthetic fixture
 * exists on this side — the demo lives in the browser's synthetic mode only,
 * and a server must never invent a homeowner.
 *
 * FOR CODEX: replace the unconfigured identity, repository, and command ports
 * with real providers, then enable only independently verified capabilities.
 */

import {
  HomeownerApiService,
} from '../../../../src/homeowner/homeowner-api.v1.ts'
import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import type {
  HomeownerCommandPort, HomeownerIdentityPort, HomeownerRepositoryPort,
} from '../../../../src/homeowner/homeowner-runtime.v1.ts'

/** No identity provider exists: every handle resolves to nobody. */
const unconfiguredIdentity: HomeownerIdentityPort = {
  async resolvePrincipal() {
    return null
  },
}

/**
 * No repository exists. Identity resolves nothing, so these are unreachable
 * through the service — but if a future change ever reached one, refusing
 * loudly beats returning an invented home.
 */
const unconfiguredRepository: HomeownerRepositoryPort = {
  async readMembership() {
    throw new HomeownerApiError('unavailable')
  },
  async listMemberships() {
    throw new HomeownerApiError('unavailable')
  },
  async listWarranties() {
    throw new HomeownerApiError('unavailable')
  },
  async listMaintenance() {
    throw new HomeownerApiError('unavailable')
  },
  async readHome() {
    throw new HomeownerApiError('unavailable')
  },
  async readPropertyFacts() {
    throw new HomeownerApiError('unavailable')
  },
  async listSystems() {
    throw new HomeownerApiError('unavailable')
  },
  async listProjects() {
    throw new HomeownerApiError('unavailable')
  },
  async listArtifactMetadata() {
    throw new HomeownerApiError('unavailable')
  },
}

const unconfiguredCommands: HomeownerCommandPort = {
  async createPrivateHomeWorkspace() {
    throw new HomeownerApiError('unavailable')
  },
  async createProject() {
    throw new HomeownerApiError('unavailable')
  },
  async recordInitialIntake() {
    throw new HomeownerApiError('unavailable')
  },
}

/** Verified server configuration does not exist yet; every capability is false. */
const UNCONFIGURED_CAPABILITIES = Object.freeze({
  magicLinkSignIn: false,
  persistence: false,
  uploads: false,
  invitations: false,
  sharing: false,
})

let service: HomeownerApiService | null = null

export function homeownerApiService(): HomeownerApiService {
  if (!service) {
    service = new HomeownerApiService({
      identity: unconfiguredIdentity,
      repository: unconfiguredRepository,
      commands: unconfiguredCommands,
      now: () => new Date().toISOString(),
      capabilities: UNCONFIGURED_CAPABILITIES,
    })
  }
  return service
}
