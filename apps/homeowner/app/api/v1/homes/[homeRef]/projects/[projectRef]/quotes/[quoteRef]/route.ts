import { handleHomeownerRequest } from '../../../../../../../../../lib/server/adapter.ts'

export const dynamic = 'force-dynamic'

/** Full replacement save with an optimistic revision in the strict body. */
export async function POST(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}
