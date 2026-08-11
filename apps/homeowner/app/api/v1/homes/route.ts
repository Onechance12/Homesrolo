/**
 * GET /api/v1/homes — one of exactly three routes this application serves.
 * All policy lives in the merged homeowner-http.v1 handler; this file only
 * delegates. GET lists homes; POST submits the one strict create-home command.
 */

import { handleHomeownerRequest } from '../../../../lib/server/adapter.ts'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}

export async function POST(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}
