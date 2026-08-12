import { completeHomeownerMagicLink } from '../../../../../lib/server/auth-http.ts'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return completeHomeownerMagicLink(request)
}

