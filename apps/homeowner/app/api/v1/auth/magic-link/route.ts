import { requestHomeownerMagicLink } from '../../../../../lib/server/auth-http.ts'

export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  return requestHomeownerMagicLink(request)
}

