import { handleHomeownerRequest } from '../../../../../../lib/server/adapter.ts'
import { handleArtifactUpload } from '../../../../../../lib/server/artifact-http.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return handleHomeownerRequest(request)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ homeRef: string }> },
) {
  const { homeRef } = await context.params
  return handleArtifactUpload(request, homeRef)
}
