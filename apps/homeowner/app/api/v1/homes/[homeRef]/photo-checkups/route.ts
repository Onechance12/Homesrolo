import { handleHomeownerRequest } from '../../../../../../lib/server/adapter.ts'
import { handleCheckupPhotoUpload } from '../../../../../../lib/server/checkup-photo-http.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return handleHomeownerRequest(request)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ homeRef: string }> },
): Promise<Response> {
  const { homeRef } = await context.params
  return handleCheckupPhotoUpload(request, homeRef)
}
