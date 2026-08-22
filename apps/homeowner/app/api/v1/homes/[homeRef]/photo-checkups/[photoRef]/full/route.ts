import { handleCheckupPhotoContent } from '../../../../../../../../lib/server/checkup-photo-http.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ homeRef: string; photoRef: string }> },
): Promise<Response> {
  const { homeRef, photoRef } = await context.params
  return handleCheckupPhotoContent(request, homeRef, photoRef, 'full')
}
