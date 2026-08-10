/**
 * GET /api/v1/session — one of exactly three routes this application serves.
 * All policy lives in the merged homeowner-http.v1 handler; this file only
 * delegates. Only GET is exported: every other method 405s at the framework.
 */

import { handleHomeownerRequest } from '../../../../lib/server/adapter.ts'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}
