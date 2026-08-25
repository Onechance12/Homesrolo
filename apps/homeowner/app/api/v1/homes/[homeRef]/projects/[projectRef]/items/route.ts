import { handleHomeownerRequest } from '../../../../../../../../lib/server/adapter.ts'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}

/** Create or revision-save one material, decision, or wishlist item. */
export async function POST(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}
