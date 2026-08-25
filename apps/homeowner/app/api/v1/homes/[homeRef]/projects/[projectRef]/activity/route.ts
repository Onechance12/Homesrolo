import { handleHomeownerRequest } from '../../../../../../../../lib/server/adapter.ts'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}

/** Append one homeowner note or milestone; existing entries are immutable. */
export async function POST(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}
