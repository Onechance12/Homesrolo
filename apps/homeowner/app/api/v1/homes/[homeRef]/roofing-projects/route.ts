import { handleHomeownerRequest } from '../../../../../../lib/server/adapter.ts'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}

