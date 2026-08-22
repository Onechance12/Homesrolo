import { handleCheckupPhotoDelete } from '../../../../../../../lib/server/checkup-photo-http.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function DELETE(
  request: Request,
  context: { params: Promise<{ homeRef: string; photoRef: string }> },
): Promise<Response> {
  const { homeRef, photoRef } = await context.params
  return handleCheckupPhotoDelete(request, homeRef, photoRef)
}
