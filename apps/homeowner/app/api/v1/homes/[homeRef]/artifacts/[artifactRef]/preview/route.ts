import { handleArtifactPreview } from '../../../../../../../../lib/server/artifact-http.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ homeRef: string; artifactRef: string }> },
) {
  const { homeRef, artifactRef } = await context.params
  return handleArtifactPreview(request, homeRef, artifactRef)
}
