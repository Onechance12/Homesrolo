import { handleArtifactUploadCompletion } from '../../../../../../../../lib/server/artifact-http.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  request: Request,
  context: { params: Promise<{ homeRef: string; artifactRef: string }> },
) {
  const { homeRef, artifactRef } = await context.params
  return handleArtifactUploadCompletion(request, homeRef, artifactRef)
}
