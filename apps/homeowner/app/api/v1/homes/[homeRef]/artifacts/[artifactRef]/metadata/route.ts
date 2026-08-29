import { handleHomeownerRequest } from '../../../../../../../../lib/server/adapter.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Controller-only, revision-backed organization metadata for one artifact. */
export async function POST(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}
