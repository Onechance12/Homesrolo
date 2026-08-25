import { handleHomeAssistantRequest } from '../../../../../../lib/server/home-assistant-http.ts'

export const maxDuration = 35
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ homeRef: string }> },
) {
  const { homeRef } = await context.params
  return handleHomeAssistantRequest(request, homeRef)
}
