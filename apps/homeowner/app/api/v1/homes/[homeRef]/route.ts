/**
 * GET /api/v1/homes/{hhom_…} — one of exactly three routes this application
 * serves. The merged homeowner-http.v1 handler validates the ref shape from
 * the pathname itself; the framework's params are deliberately unused so no
 * second parsing of the ref can drift from the boundary's own.
 */

import { handleHomeownerRequest } from '../../../../../lib/server/adapter.ts'

export async function GET(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}
