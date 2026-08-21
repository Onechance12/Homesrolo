import { handleHomeResearchRequest } from '../../../../../../lib/server/home-research-http.ts'

export const maxDuration = 35
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ homeRef: string }> },
) {
  const { homeRef } = await context.params
  return handleHomeResearchRequest(request, homeRef)
}
