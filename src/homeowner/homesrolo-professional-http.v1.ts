import {
  HomeownerApiError,
  type HomeownerApiRequestContext,
} from './homeowner-api.v1.ts'
import type { HomesroloProfessionalService } from './homesrolo-professional-service.v1.ts'
import type {
  ProfessionalMembership,
  ProfessionalOrganization,
  ProfessionalProposal,
  ProjectInvitation,
} from './homesrolo-professional.v1.ts'

export interface HomesroloProfessionalHttpRequest {
  readonly method: string
  readonly pathname: string
  readonly search: string
  readonly hasBody: boolean
  readonly jsonBody: unknown
  readonly sessionHandle: string | null
}

export interface HomesroloProfessionalHttpResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
})

const PROFESSIONALS_PATH = '/api/v1/professionals'
const PROFESSIONAL_PROFILE_PATH = '/api/v1/professional/profile'
const PROFESSIONAL_INVITATIONS_PATH = '/api/v1/professional/invitations'
const PROFESSIONAL_PATH = /^\/api\/v1\/professionals\/([a-z0-9]+(?:-[a-z0-9]+)*)$/
const PROFESSIONAL_INVITATION_RESPONSE_PATH =
  /^\/api\/v1\/professional\/invitations\/(hinv_[A-Za-z0-9_-]{43})\/respond$/
const PROFESSIONAL_INVITATION_PROPOSALS_PATH =
  /^\/api\/v1\/professional\/invitations\/(hinv_[A-Za-z0-9_-]{43})\/proposals$/
const PROFESSIONAL_INVITATION_PROPOSAL_PATH =
  /^\/api\/v1\/professional\/invitations\/(hinv_[A-Za-z0-9_-]{43})\/proposals\/(hquo_[A-Za-z0-9_-]{43})$/
const HOME_PROJECT_INVITATIONS_PATH =
  /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/projects\/(hprj_[A-Za-z0-9_-]{43})\/invitations$/
const HOME_PROJECT_INVITATION_REVOKE_PATH =
  /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/projects\/(hprj_[A-Za-z0-9_-]{43})\/invitations\/(hinv_[A-Za-z0-9_-]{43})\/revoke$/
const HOME_PROJECT_PROPOSAL_DECISION_PATH =
  /^\/api\/v1\/homes\/(hhom_[A-Za-z0-9_-]{43})\/projects\/(hprj_[A-Za-z0-9_-]{43})\/proposals\/(hquo_[A-Za-z0-9_-]{43})\/decision$/

function success(data: unknown, status = 200): HomesroloProfessionalHttpResponse {
  return { status, headers: JSON_HEADERS, body: { data } }
}

function problem(status: number, code: string): HomesroloProfessionalHttpResponse {
  return { status, headers: JSON_HEADERS, body: { error: { code } } }
}

function mappedError(error: unknown): HomesroloProfessionalHttpResponse {
  if (!(error instanceof HomeownerApiError)) return problem(503, 'unavailable')
  if (error.code === 'signed_out') return problem(401, 'signed_out')
  if (error.code === 'forbidden') return problem(403, 'forbidden')
  if (error.code === 'not_found') return problem(404, 'not_found')
  if (error.code === 'invalid_request') return problem(400, 'invalid_request')
  if (error.code === 'conflict') return problem(409, 'conflict')
  if (error.code === 'rate_limited') return problem(429, 'rate_limited')
  return problem(503, 'unavailable')
}

function parseDirectorySearch(search: string): { trade?: string; serviceArea?: string } | null {
  const params = new URLSearchParams(search)
  if ([...params.keys()].some(key => key !== 'trade' && key !== 'serviceArea')) return null
  if (params.getAll('trade').length > 1 || params.getAll('serviceArea').length > 1) return null
  const trade = params.get('trade')
  const serviceArea = params.get('serviceArea')
  return {
    ...(trade === null || trade === '' ? {} : { trade }),
    ...(serviceArea === null || serviceArea === '' ? {} : { serviceArea }),
  }
}

function bodyRequired(request: HomesroloProfessionalHttpRequest): boolean {
  return request.search === '' && request.hasBody && request.jsonBody !== undefined
}

function safeOrganization(organization: ProfessionalOrganization) {
  const { recordVersion: _recordVersion, ...view } = organization
  return view
}

function safeMembership(membership: ProfessionalMembership) {
  const {
    recordVersion: _recordVersion,
    principalRef: _principalRef,
    ...view
  } = membership
  return view
}

function safeInvitation(invitation: ProjectInvitation) {
  const {
    recordVersion: _recordVersion,
    controllerPrincipalRef: _controllerPrincipalRef,
    invitedByPrincipalRef: _invitedByPrincipalRef,
    disclosureDigest: _disclosureDigest,
    ...view
  } = invitation
  return view
}

function safeProposal(proposal: ProfessionalProposal) {
  const {
    recordVersion: _recordVersion,
    submittedByPrincipalRef: _submittedByPrincipalRef,
    controllerPrincipalRef: _controllerPrincipalRef,
    contentDigest: _contentDigest,
    ...view
  } = proposal
  return view
}

function routeRecognized(pathname: string): boolean {
  return pathname === PROFESSIONALS_PATH
    || pathname === PROFESSIONAL_PROFILE_PATH
    || pathname === PROFESSIONAL_INVITATIONS_PATH
    || PROFESSIONAL_PATH.test(pathname)
    || PROFESSIONAL_INVITATION_RESPONSE_PATH.test(pathname)
    || PROFESSIONAL_INVITATION_PROPOSALS_PATH.test(pathname)
    || PROFESSIONAL_INVITATION_PROPOSAL_PATH.test(pathname)
    || HOME_PROJECT_INVITATIONS_PATH.test(pathname)
    || HOME_PROJECT_INVITATION_REVOKE_PATH.test(pathname)
    || HOME_PROJECT_PROPOSAL_DECISION_PATH.test(pathname)
}

/**
 * Narrow HTTP boundary for self-reported professional profiles, exact-project
 * invitations, and structured proposals. It creates no Home Record membership
 * and accepts no browser-provided principal, role, or organization authority.
 */
export function createHomesroloProfessionalHttpHandler(
  service: HomesroloProfessionalService | null,
) {
  return async function handle(
    request: HomesroloProfessionalHttpRequest,
  ): Promise<HomesroloProfessionalHttpResponse> {
    if (!routeRecognized(request.pathname)) return problem(404, 'not_found')
    if (!service) return problem(503, 'unavailable')
    const context: HomeownerApiRequestContext = { sessionHandle: request.sessionHandle }

    try {
      if (request.method === 'GET') {
        if (request.hasBody || request.jsonBody !== undefined) {
          return problem(400, 'invalid_request')
        }
        if (request.pathname === PROFESSIONALS_PATH) {
          const query = parseDirectorySearch(request.search)
          if (!query) return problem(400, 'invalid_request')
          return success((await service.listPublishedOrganizations(query)).map(safeOrganization))
        }
        if (request.search !== '') return problem(400, 'invalid_request')
        const publicProfile = PROFESSIONAL_PATH.exec(request.pathname)
        if (publicProfile?.[1]) {
          return success(safeOrganization(
            await service.readPublishedOrganization(publicProfile[1]),
          ))
        }
        if (request.pathname === PROFESSIONAL_PROFILE_PATH) {
          const [organizations, memberships] = await Promise.all([
            service.listMyOrganizations(context),
            service.listMyMemberships(context),
          ])
          return success({
            organizations: organizations.map(safeOrganization),
            memberships: memberships.map(safeMembership),
          })
        }
        if (request.pathname === PROFESSIONAL_INVITATIONS_PATH) {
          return success((await service.listMyInvitations(context)).map(safeInvitation))
        }
        const proposal = PROFESSIONAL_INVITATION_PROPOSALS_PATH.exec(request.pathname)
        if (proposal?.[1]) {
          const row = await service.readMyProposal(context, proposal[1])
          return success(row ? safeProposal(row) : null)
        }
        const homeownerInvitations = HOME_PROJECT_INVITATIONS_PATH.exec(request.pathname)
        if (homeownerInvitations?.[1] && homeownerInvitations[2]) {
          return success((await service.listHomeownerInvitations(
            context,
            homeownerInvitations[1],
            homeownerInvitations[2],
          )).map(safeInvitation))
        }
        return problem(405, 'method_not_allowed')
      }

      if (request.method === 'POST') {
        if (!bodyRequired(request)) return problem(400, 'invalid_request')
        if (request.pathname === PROFESSIONALS_PATH) {
          const result = await service.createOrganization(context, request.jsonBody)
          return success({
            organization: safeOrganization(result.organization),
            membership: safeMembership(result.membership),
          }, 201)
        }
        if (request.pathname === PROFESSIONAL_PROFILE_PATH) {
          return success(safeOrganization(
            await service.saveProfile(context, request.jsonBody),
          ))
        }
        const response = PROFESSIONAL_INVITATION_RESPONSE_PATH.exec(request.pathname)
        if (response?.[1]) {
          return success(safeInvitation(await service.respondToInvitation(
            context,
            response[1],
            request.jsonBody,
          )))
        }
        const proposal = PROFESSIONAL_INVITATION_PROPOSALS_PATH.exec(request.pathname)
        if (proposal?.[1]) {
          return success(safeProposal(await service.submitProposal(
            context,
            proposal[1],
            request.jsonBody,
          )), 201)
        }
        const proposalRevision = PROFESSIONAL_INVITATION_PROPOSAL_PATH.exec(request.pathname)
        if (proposalRevision?.[1] && proposalRevision[2]) {
          return success(safeProposal(await service.reviseProposal(
            context,
            proposalRevision[1],
            proposalRevision[2],
            request.jsonBody,
          )))
        }
        const homeownerInvitations = HOME_PROJECT_INVITATIONS_PATH.exec(request.pathname)
        if (homeownerInvitations?.[1] && homeownerInvitations[2]) {
          return success(safeInvitation(await service.createInvitation(
            context,
            homeownerInvitations[1],
            homeownerInvitations[2],
            request.jsonBody,
          )), 201)
        }
        const revoke = HOME_PROJECT_INVITATION_REVOKE_PATH.exec(request.pathname)
        if (revoke?.[1] && revoke[2] && revoke[3]) {
          return success(safeInvitation(await service.revokeInvitation(
            context,
            revoke[1],
            revoke[2],
            revoke[3],
            request.jsonBody,
          )))
        }
        const decision = HOME_PROJECT_PROPOSAL_DECISION_PATH.exec(request.pathname)
        if (decision?.[1] && decision[2] && decision[3]) {
          return success(safeProposal(await service.decideProposal(
            context,
            decision[1],
            decision[2],
            decision[3],
            request.jsonBody,
          )))
        }
        return problem(405, 'method_not_allowed')
      }

      return problem(405, 'method_not_allowed')
    } catch (error) {
      return mappedError(error)
    }
  }
}

export const HOMESROLO_PROFESSIONAL_HTTP_WARNING =
  'Professional access is exact-project and selected-evidence only. These routes do not create a Home Record membership, expose an address, run a lead board, rank price, or provide contractor CRM operations.'
