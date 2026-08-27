import { HomeownerApiError } from '../../../../src/homeowner/homeowner-api.v1.ts'
import {
  homeownerRequestAuthentication,
  homeownerRequestContext,
} from './request-auth.ts'
import { configuredHomesroloProfessionalService } from './runtime.ts'

const REF = '[A-Za-z0-9_-]{43}'
const INVITATION_REF = new RegExp(`^hinv_${REF}$`)
const ARTIFACT_REF = new RegExp(`^hart_${REF}$`)

const JSON_HEADERS = Object.freeze({
  'cache-control': 'private, no-store, max-age=0',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
})

function problem(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code } }), { status, headers: JSON_HEADERS })
}

function mappedError(error: unknown): Response {
  if (!(error instanceof HomeownerApiError)) return problem(503, 'unavailable')
  if (error.code === 'signed_out') return problem(401, 'signed_out')
  if (error.code === 'forbidden') return problem(403, 'forbidden')
  if (error.code === 'not_found') return problem(404, 'not_found')
  if (error.code === 'invalid_request') return problem(400, 'invalid_request')
  return problem(503, 'unavailable')
}

/** Exact-project evidence read. It is re-authorized after the private object read. */
export async function handleProfessionalInvitationArtifact(
  request: Request,
  requestedInvitationRef: string,
  requestedArtifactRef: string,
): Promise<Response> {
  if (request.method !== 'GET'
    || new URL(request.url).search !== ''
    || !INVITATION_REF.test(requestedInvitationRef)
    || !ARTIFACT_REF.test(requestedArtifactRef)) {
    return problem(400, 'invalid_request')
  }
  const authentication = homeownerRequestAuthentication(request)
  if (authentication.kind === 'invalid') return problem(400, 'invalid_request')
  const service = configuredHomesroloProfessionalService()
  if (!service) return problem(503, 'unavailable')
  try {
    const result = await service.readMyInvitationArtifact(
      homeownerRequestContext(authentication),
      requestedInvitationRef,
      requestedArtifactRef,
    )
    const body = new ArrayBuffer(result.bytes.byteLength)
    new Uint8Array(body).set(result.bytes)
    return new Response(new Blob([body], { type: result.mediaType }), {
      status: 200,
      headers: {
        'cache-control': 'private, no-store, max-age=0',
        'content-disposition': `inline; filename="shared-file"; filename*=UTF-8''${encodeURIComponent(result.displayName)}`,
        'content-length': String(result.byteLength),
        'content-security-policy': "default-src 'none'; sandbox",
        'content-type': result.mediaType,
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    return mappedError(error)
  }
}
