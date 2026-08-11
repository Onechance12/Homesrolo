/**
 * POST /api/v1/homes/{hhom_...}/intake - records the first homeowner-recalled
 * property/system inventory through the exact-home server boundary.
 */

import { handleHomeownerRequest } from '../../../../../../lib/server/adapter.ts'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}
