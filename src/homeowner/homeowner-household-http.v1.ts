import {
  HouseholdServiceError,
  type HomeownerHouseholdService,
} from './homeowner-household.v1.ts'

export interface HomeownerHouseholdHttpRequest {
  readonly method: string
  readonly pathname: string
  readonly search: string
  readonly hasBody: boolean
  readonly jsonBody: unknown
  readonly sessionHandle: string | null
}

export interface HomeownerHouseholdHttpResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

const JSON_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})

const HOME_REF = '(hhom_[A-Za-z0-9_-]{43})'
const INVITATION_REF = '(hhiv_[A-Za-z0-9_-]{43})'
const MEMBERSHIP_REF = '(hmbr_[A-Za-z0-9_-]{43})'

const HOUSEHOLD_PATH = new RegExp(`^/api/v1/homes/${HOME_REF}/household$`)
const HOUSEHOLD_INVITATIONS_PATH =
  new RegExp(`^/api/v1/homes/${HOME_REF}/household/invitations$`)
const HOUSEHOLD_INVITATION_REVOKE_PATH =
  new RegExp(`^/api/v1/homes/${HOME_REF}/household/invitations/${INVITATION_REF}/revoke$`)
const HOUSEHOLD_MEMBER_REMOVE_PATH =
  new RegExp(`^/api/v1/homes/${HOME_REF}/household/members/${MEMBERSHIP_REF}/remove$`)
const HOUSEHOLD_MEMBER_ROLE_PATH =
  new RegExp(`^/api/v1/homes/${HOME_REF}/household/members/${MEMBERSHIP_REF}/role$`)
const HOUSEHOLD_INVITATION_ACCEPT_PATH =
  new RegExp(`^/api/v1/household/invitations/${INVITATION_REF}/accept$`)

function success(data: unknown, status = 200): HomeownerHouseholdHttpResponse {
  return { status, headers: JSON_HEADERS, body: { data } }
}

function problem(status: number, code: string): HomeownerHouseholdHttpResponse {
  return { status, headers: JSON_HEADERS, body: { error: { code } } }
}

function mappedError(error: unknown): HomeownerHouseholdHttpResponse {
  if (!(error instanceof HouseholdServiceError)) return problem(503, 'unavailable')
  if (error.code === 'signed_out') return problem(401, 'signed_out')
  if (error.code === 'not_found') return problem(404, 'not_found')
  if (error.code === 'invalid_request') return problem(400, 'invalid_request')
  if (error.code === 'conflict') return problem(409, 'conflict')
  return problem(503, 'unavailable')
}

function bodyRequired(request: HomeownerHouseholdHttpRequest): boolean {
  return request.search === '' && request.hasBody && request.jsonBody !== undefined
}

function objectBody(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null
}

function routeRecognized(pathname: string): boolean {
  return HOUSEHOLD_PATH.test(pathname)
    || HOUSEHOLD_INVITATIONS_PATH.test(pathname)
    || HOUSEHOLD_INVITATION_REVOKE_PATH.test(pathname)
    || HOUSEHOLD_MEMBER_REMOVE_PATH.test(pathname)
    || HOUSEHOLD_MEMBER_ROLE_PATH.test(pathname)
    || HOUSEHOLD_INVITATION_ACCEPT_PATH.test(pathname)
}

/**
 * Exact-home household boundary. Browser input can select an opaque home,
 * invitation, or membership reference, but never supplies identity or
 * authority. The service resolves the signed-in principal and every mutation
 * is re-authorized transactionally by the persistence adapter.
 */
export function createHomeownerHouseholdHttpHandler(
  service: HomeownerHouseholdService | null,
) {
  return async function handle(
    request: HomeownerHouseholdHttpRequest,
  ): Promise<HomeownerHouseholdHttpResponse> {
    if (!routeRecognized(request.pathname)) return problem(404, 'not_found')
    if (!service) return problem(503, 'unavailable')
    const sessionHandle = request.sessionHandle ?? ''

    try {
      if (request.method === 'GET') {
        if (request.search !== '' || request.hasBody || request.jsonBody !== undefined) {
          return problem(400, 'invalid_request')
        }
        const household = HOUSEHOLD_PATH.exec(request.pathname)
        if (!household?.[1]) return problem(405, 'method_not_allowed')
        return success({ household: await service.listHousehold(sessionHandle, household[1]) })
      }

      if (request.method !== 'POST') return problem(405, 'method_not_allowed')
      if (!bodyRequired(request)) return problem(400, 'invalid_request')
      const body = objectBody(request.jsonBody)
      if (!body) return problem(400, 'invalid_request')

      const invitations = HOUSEHOLD_INVITATIONS_PATH.exec(request.pathname)
      if (invitations?.[1]) {
        return success({
          invitation: await service.createInvitation(sessionHandle, invitations[1], body),
        }, 201)
      }

      const accept = HOUSEHOLD_INVITATION_ACCEPT_PATH.exec(request.pathname)
      if (accept?.[1]) {
        return success(await service.acceptInvitation(sessionHandle, {
          ...body,
          invitationRef: accept[1],
        }))
      }

      const revoke = HOUSEHOLD_INVITATION_REVOKE_PATH.exec(request.pathname)
      if (revoke?.[1] && revoke[2]) {
        return success({
          invitation: await service.revokeInvitation(sessionHandle, revoke[1], {
            ...body,
            invitationRef: revoke[2],
          }),
        })
      }

      const remove = HOUSEHOLD_MEMBER_REMOVE_PATH.exec(request.pathname)
      if (remove?.[1] && remove[2]) {
        return success({
          member: await service.removeMember(sessionHandle, remove[1], {
            ...body,
            membershipRef: remove[2],
          }),
        })
      }

      const role = HOUSEHOLD_MEMBER_ROLE_PATH.exec(request.pathname)
      if (role?.[1] && role[2]) {
        return success({
          member: await service.setMemberRole(sessionHandle, role[1], {
            ...body,
            membershipRef: role[2],
          }),
        })
      }

      return problem(405, 'method_not_allowed')
    } catch (error) {
      return mappedError(error)
    }
  }
}
