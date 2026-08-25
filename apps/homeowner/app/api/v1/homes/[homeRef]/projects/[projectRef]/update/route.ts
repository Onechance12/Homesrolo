import { handleHomeownerRequest } from '../../../../../../../../lib/server/adapter.ts'

export const dynamic = 'force-dynamic'

/** Revision-backed bounded update; the route itself carries the exact project. */
export async function POST(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}
