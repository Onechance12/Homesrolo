import { submitProjectForHomesroloReview } from '../../../../../../../../lib/server/project-review-http.ts'

export const maxDuration = 150

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ homeRef: string; projectRef: string }> },
) {
  const { homeRef, projectRef } = await context.params
  return submitProjectForHomesroloReview(request, homeRef, projectRef)
}
