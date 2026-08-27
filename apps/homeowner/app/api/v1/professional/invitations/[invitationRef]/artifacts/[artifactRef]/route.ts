import { handleProfessionalInvitationArtifact } from '../../../../../../../../lib/server/professional-artifact-http.ts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ invitationRef: string; artifactRef: string }> },
) {
  const { invitationRef, artifactRef } = await context.params
  return handleProfessionalInvitationArtifact(request, invitationRef, artifactRef)
}
